import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Repository } from '../electron/main/storage/repository'
import { Vault, type VaultMetadata } from '../electron/main/security/vault'
let directory: string, repository: Repository, vault: Vault
function open() {
  repository = new Repository(join(directory, 'test.sqlite'))
  vault = new Vault(
    () => repository.getSetting<VaultMetadata>('vault'),
    (meta) => repository.setSetting('vault', meta),
    () => repository.settings().autoLockMinutes,
  )
  repository.vault = vault
}
const snippet = (trigger = ';email', content = 'hello\nworld') => ({
  name: 'Example',
  trigger,
  content,
  categoryId: null,
  sensitive: false,
  enabled: true,
  favorite: false,
})
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'cmt-test-'))
  open()
})
afterEach(() => {
  vi.useRealTimers()
  vault.lock()
  if (repository.db.open) repository.close()
  rmSync(directory, { recursive: true, force: true })
})
describe('SQLite repository', () => {
  it('bounds regular previews and never exposes sensitive values', async () => {
    const regular = repository.save(snippet(';regular', 'x'.repeat(200)))
    await vault.setup('a-secure-test-password')
    const secret = repository.save({ ...snippet(';secret', 'never preview this'), sensitive: true })
    expect(repository.previews()[regular.id]).toHaveLength(100)
    expect(repository.previews()).not.toHaveProperty(secret.id)
    vault.lock()
    expect(repository.previews()).not.toHaveProperty(secret.id)
  })
  it('persists snippets, categories and preferences across restart', () => {
    const category = repository.saveCategory('Work'),
      saved = repository.save({ ...snippet(), categoryId: category.id })
    repository.saveSettings({ ...repository.settings(), theme: 'dark' })
    repository.close()
    vault.lock()
    open()
    expect(repository.list()[0].id).toBe(saved.id)
    expect(repository.content(saved.id)).toBe('hello\nworld')
    expect(repository.categories()[0].name).toBe('Work')
    expect(repository.settings().theme).toBe('dark')
    repository.deleteCategory(category.id)
    expect(repository.list()[0].categoryId).toBeNull()
    repository.delete(saved.id)
    expect(repository.list()).toHaveLength(0)
  })
  it('validates CRUD and duplicates without prefix collisions', () => {
    const saved = repository.save(snippet())
    expect(() => repository.save(snippet())).toThrow('already')
    expect(() => repository.save(snippet(';emails'))).toThrow('prefixes')
    const duplicated = repository.duplicate(saved.id)
    expect(duplicated.id).not.toBe(saved.id)
    expect(repository.content(duplicated.id)).toBe('hello\nworld')
    repository.save({ ...snippet(';new'), id: saved.id, favorite: true })
    expect(repository.list().find((s) => s.id === saved.id)?.favorite).toBe(true)
  })
  it('migrates prefixes atomically and rejects case-fold collisions', () => {
    repository.save(snippet())
    repository.saveSettings({ ...repository.settings(), prefix: '::' })
    expect(repository.list()[0].trigger).toBe('::email')
    repository.save(snippet('::EMAIL'))
    expect(() =>
      repository.saveSettings({ ...repository.settings(), caseSensitive: false }),
    ).toThrow()
    expect(repository.settings().caseSensitive).toBe(true)
  })
  it('rejects prefix migrations that exceed the trigger buffer limit', () => {
    repository.save(snippet(';' + 'x'.repeat(63)))
    expect(() => repository.saveSettings({ ...repository.settings(), prefix: '::' })).toThrow(
      '64 characters',
    )
    expect(repository.settings().prefix).toBe(';')
    expect(repository.list()[0].trigger.length).toBe(64)
  })
  it('validates imports, merges categories, and skips conflicts without overwriting', () => {
    const saved = repository.save(snippet())
    const exported = repository.export()
    const imported = repository.import(exported)
    expect(imported).toEqual({ count: 0, skipped: 1 })
    expect(repository.content(saved.id)).toBe('hello\nworld')
    expect(() =>
      repository.import({ ...exported, snippets: [{ ...exported.snippets[0], sensitive: true }] }),
    ).toThrow()
  })
})
describe('authenticated encrypted vault', () => {
  it('requires initialization and authorization, encrypts on disk, and starts locked', async () => {
    expect(() => repository.save({ ...snippet(), sensitive: true })).toThrow('Unlock')
    await vault.setup('a-long-master-password')
    const saved = repository.save({
      ...snippet(';private', 'unique-sensitive-contents'),
      sensitive: true,
    })
    expect(repository.row(saved.id).regular_content).toBeNull()
    expect(repository.row(saved.id).encrypted_content).not.toContain('unique-sensitive-contents')
    expect(repository.content(saved.id)).toBe('unique-sensitive-contents')
    expect(repository.export().snippets).toHaveLength(0)
    repository.close()
    expect(
      readFileSync(join(directory, 'test.sqlite')).includes(
        Buffer.from('unique-sensitive-contents'),
      ),
    ).toBe(false)
    vault.lock()
    open()
    expect(vault.status()).toEqual({ initialized: true, unlocked: false })
    expect(() => repository.content(saved.id)).toThrow('Unlock')
    await vault.unlock('a-long-master-password')
    expect(repository.content(saved.id)).toBe('unique-sensitive-contents')
  })
  it('rejects wrong passwords and tampered ciphertext', async () => {
    await vault.setup('a-long-master-password')
    const saved = repository.save({ ...snippet(), sensitive: true })
    vault.lock()
    await expect(vault.unlock('wrong-password')).rejects.toThrow('Incorrect')
    expect(vault.status().unlocked).toBe(false)
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 2000)
    await vault.unlock('a-long-master-password')
    vi.restoreAllMocks()
    const encrypted = JSON.parse(repository.row(saved.id).encrypted_content!)
    encrypted.tag = Buffer.alloc(16).toString('base64')
    repository.db
      .prepare('UPDATE snippets SET encrypted_content=? WHERE id=?')
      .run(JSON.stringify(encrypted), saved.id)
    expect(() => repository.content(saved.id)).toThrow()
  })
  it('rotates all encrypted entries transactionally', async () => {
    await vault.setup('a-long-master-password')
    const saved = repository.save({ ...snippet(), sensitive: true })
    const previous = repository.row(saved.id).encrypted_content
    await vault.changePassword('a-long-master-password', 'another-long-password', (rekey, meta) =>
      repository.rekey(rekey, meta),
    )
    expect(repository.row(saved.id).encrypted_content).not.toBe(previous)
    vault.lock()
    await vault.unlock('another-long-password')
    expect(repository.content(saved.id)).toBe('hello\nworld')
  })
  it('does not reopen after a lock races with password derivation', async () => {
    await vault.setup('a-long-master-password')
    vault.lock()
    const unlocking = vault.unlock('a-long-master-password')
    vault.lock()
    await expect(unlocking).rejects.toThrow('canceled')
    expect(vault.status().unlocked).toBe(false)
  })
  it('rolls back a failed password rotation without changing ciphertext or password', async () => {
    await vault.setup('a-long-master-password')
    const saved = repository.save({ ...snippet(), sensitive: true })
    const previous = repository.row(saved.id).encrypted_content
    await expect(
      vault.changePassword('a-long-master-password', 'another-long-password', () => {
        throw new Error('write failed')
      }),
    ).rejects.toThrow('write failed')
    expect(repository.row(saved.id).encrypted_content).toBe(previous)
    vault.lock()
    await vault.unlock('a-long-master-password')
    expect(repository.content(saved.id)).toBe('hello\nworld')
  })
  it('auto-locks after inactivity and renews on secret access', async () => {
    await vault.setup('a-long-master-password')
    vi.useFakeTimers()
    vault.refreshTimeout()
    const encrypted = vault.encrypt('value', 'id')
    await vi.advanceTimersByTimeAsync(4 * 60_000)
    expect(vault.decrypt(encrypted, 'id')).toBe('value')
    await vi.advanceTimersByTimeAsync(4 * 60_000)
    expect(vault.status().unlocked).toBe(true)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(vault.status().unlocked).toBe(false)
  })
})
