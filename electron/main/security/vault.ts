import { randomBytes, scrypt, createCipheriv, createDecipheriv, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
export interface VaultMetadata {
  version: 1
  salt: string
  verifier: string
}
const envelope = z
  .object({ v: z.literal(1), iv: z.string(), tag: z.string(), data: z.string() })
  .strict()
const passwordSchema = z.string().min(12, 'Use a password of at least 12 characters').max(1024)
async function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(
      password,
      Buffer.from(salt, 'base64'),
      32,
      { N: 65536, r: 8, p: 1, maxmem: 128 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  )
}
function encrypt(key: Buffer, text: string, aad: string): string {
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(Buffer.from(aad))
  const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  return JSON.stringify({
    v: 1,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
  })
}
function decrypt(key: Buffer, value: string, aad: string): string {
  const e = envelope.parse(JSON.parse(value))
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(e.iv, 'base64'))
  decipher.setAAD(Buffer.from(aad))
  decipher.setAuthTag(Buffer.from(e.tag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(e.data, 'base64')), decipher.final()]).toString(
    'utf8',
  )
}
export class Vault {
  private key?: Buffer
  private timer?: ReturnType<typeof setTimeout>
  private busy = false
  private epoch = 0
  private nextUnlockAt = 0
  constructor(
    private read: () => VaultMetadata | undefined,
    private write: (meta: VaultMetadata) => void,
    private minutes: () => number,
    private onChange: () => void = () => {},
  ) {}
  status(): { initialized: boolean; unlocked: boolean } {
    return { initialized: !!this.read(), unlocked: !!this.key }
  }
  private touch(): void {
    clearTimeout(this.timer)
    this.timer = setTimeout(() => this.lock(), this.minutes() * 60_000)
    this.timer.unref?.()
  }
  refreshTimeout(): void {
    if (this.key) this.touch()
  }
  async setup(password: string): Promise<void> {
    if (this.busy || this.read()) throw new Error('Vault already initialized or busy')
    passwordSchema.parse(password)
    this.busy = true
    const epoch = this.epoch
    let key: Buffer | undefined
    try {
      const salt = randomBytes(32).toString('base64')
      key = await derive(password, salt)
      if (this.epoch !== epoch) throw new Error('Vault operation canceled because it was locked')
      this.write({
        version: 1,
        salt,
        verifier: encrypt(key, 'copy-my-things-vault-v1', 'verifier'),
      })
      this.key = key
      key = undefined
      this.touch()
      this.onChange()
    } finally {
      key?.fill(0)
      this.busy = false
    }
  }
  async unlock(password: string): Promise<void> {
    const metadata = this.read()
    if (!metadata) throw new Error('Create a vault first')
    if (this.busy || Date.now() < this.nextUnlockAt)
      throw new Error('Please wait before trying again')
    z.string().max(1024).parse(password)
    this.busy = true
    const epoch = this.epoch
    let key: Buffer | undefined
    try {
      key = await derive(password, metadata.salt)
      let value: string
      try {
        value = decrypt(key, metadata.verifier, 'verifier')
      } catch {
        throw new Error('Incorrect password or damaged vault')
      }
      if (!timingSafeEqual(Buffer.from(value), Buffer.from('copy-my-things-vault-v1')))
        throw new Error('Incorrect password')
      if (this.epoch !== epoch) throw new Error('Vault operation canceled because it was locked')
      this.key?.fill(0)
      this.key = key
      key = undefined
      this.touch()
      this.onChange()
    } catch (error) {
      this.nextUnlockAt = Date.now() + 1500
      throw error
    } finally {
      key?.fill(0)
      this.busy = false
    }
  }
  lock(): void {
    this.epoch++
    clearTimeout(this.timer)
    this.key?.fill(0)
    this.key = undefined
    this.onChange()
  }
  encrypt(text: string, id: string): string {
    if (!this.key) throw new Error('Unlock the vault first')
    this.touch()
    return encrypt(this.key, text, id)
  }
  decrypt(value: string, id: string): string {
    if (!this.key) throw new Error('Unlock the vault first')
    this.touch()
    return decrypt(this.key, value, id)
  }
  async changePassword(
    current: string,
    next: string,
    replace: (rekey: (value: string, id: string) => string, meta: VaultMetadata) => void,
  ): Promise<void> {
    passwordSchema.parse(next)
    await this.unlock(current)
    this.busy = true
    // Hold a separate key through the asynchronous KDF even if the vault is locked meanwhile.
    const previous = Buffer.from(this.key!)
    const epoch = this.epoch
    let key: Buffer | undefined
    try {
      const salt = randomBytes(32).toString('base64')
      key = await derive(next, salt)
      const newKey = key
      const metadata: VaultMetadata = {
        version: 1,
        salt,
        verifier: encrypt(newKey, 'copy-my-things-vault-v1', 'verifier'),
      }
      if (this.epoch !== epoch) throw new Error('Vault operation canceled because it was locked')
      replace((value, id) => encrypt(newKey, decrypt(previous, value, id), id), metadata)
      this.key?.fill(0)
      this.key = key
      key = undefined
      this.touch()
      this.onChange()
    } finally {
      previous.fill(0)
      key?.fill(0)
      this.busy = false
    }
  }
}
