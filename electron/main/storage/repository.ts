import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import {
  defaults,
  settingsSchema,
  snippetInput,
  exportSchema,
  type Snippet,
  type SnippetInput,
  type Settings,
  type Category,
  type ExportData,
} from '../../../shared/contracts'
import { validateTriggers } from '../triggers/matcher'
import type { Vault, VaultMetadata } from '../security/vault'
interface Row {
  id: string
  name: string
  trigger: string
  regular_content: string | null
  encrypted_content: string | null
  category_id: string | null
  sensitive: number
  enabled: number
  favorite: number
  created_at: string
  updated_at: string
}
function metadata(row: Row): Snippet {
  return {
    id: row.id,
    name: row.name,
    trigger: row.trigger,
    categoryId: row.category_id,
    sensitive: !!row.sensitive,
    enabled: !!row.enabled,
    favorite: !!row.favorite,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
export class Repository {
  readonly db: Database.Database
  vault!: Vault
  constructor(path: string) {
    this.db = new Database(path)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.db.pragma('secure_delete = ON')
    const version = this.db.pragma('user_version', { simple: true }) as number
    if (version > 1) throw new Error('This database requires a newer version of Copy My Things')
    if (version < 1)
      this.db.transaction(() => {
        this.db
          .exec(`CREATE TABLE categories(id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, created_at TEXT NOT NULL);
        CREATE TABLE settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE snippets(id TEXT PRIMARY KEY, name TEXT NOT NULL, trigger TEXT NOT NULL UNIQUE,
          regular_content TEXT, encrypted_content TEXT, category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
          sensitive INTEGER NOT NULL, enabled INTEGER NOT NULL, favorite INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
          CHECK ((sensitive = 0 AND regular_content IS NOT NULL AND encrypted_content IS NULL) OR (sensitive = 1 AND regular_content IS NULL AND encrypted_content IS NOT NULL)));
        CREATE INDEX snippets_category ON snippets(category_id); CREATE INDEX snippets_favorite ON snippets(favorite);
        PRAGMA user_version = 1;`)
      })()
  }
  close(): void {
    this.db.close()
  }
  getSetting<T>(key: string): T | undefined {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      { value: string } | undefined
    return row ? (JSON.parse(row.value) as T) : undefined
  }
  setSetting(key: string, value: unknown): void {
    this.db
      .prepare(
        'INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      )
      .run(key, JSON.stringify(value))
  }
  settings(): Settings {
    return settingsSchema.parse(this.getSetting('preferences') ?? defaults)
  }
  saveSettings(value: Settings): Settings {
    const parsed = settingsSchema.parse(value)
    const snippets = this.forSettings(parsed)
    validateTriggers(snippets, parsed.prefix, parsed.caseSensitive)
    this.db.transaction(() => {
      if (parsed.prefix !== this.settings().prefix) {
        this.db.prepare("UPDATE snippets SET trigger='__migration__' || id").run()
        const update = this.db.prepare('UPDATE snippets SET trigger=?,updated_at=? WHERE id=?')
        for (const snippet of snippets)
          update.run(snippet.trigger, new Date().toISOString(), snippet.id)
      }
      this.setSetting('preferences', parsed)
    })()
    return parsed
  }
  forSettings(settings: Settings): Snippet[] {
    const previous = this.settings()
    return this.list().map((s) => ({
      ...s,
      trigger:
        previous.prefix === settings.prefix
          ? s.trigger
          : settings.prefix + s.trigger.slice(previous.prefix.length),
    }))
  }
  list(): Snippet[] {
    return (
      this.db.prepare('SELECT * FROM snippets ORDER BY name COLLATE NOCASE').all() as Row[]
    ).map(metadata)
  }
  row(id: string): Row {
    const row = this.db.prepare('SELECT * FROM snippets WHERE id=?').get(id) as Row | undefined
    if (!row) throw new Error('Snippet no longer exists')
    return row
  }
  previews(): Record<string, string> {
    const rows = this.db
      .prepare(
        'SELECT id, substr(regular_content, 1, 100) AS preview FROM snippets WHERE sensitive = 0',
      )
      .all() as { id: string; preview: string }[]
    return Object.fromEntries(rows.map((row) => [row.id, row.preview.replace(/\s+/g, ' ')]))
  }
  content(id: string): string {
    const row = this.row(id)
    return row.sensitive ? this.vault.decrypt(row.encrypted_content!, id) : row.regular_content!
  }
  save(input: SnippetInput): Snippet {
    const data = snippetInput.parse(input),
      id = data.id ?? randomUUID()
    const previous = data.id ? this.row(data.id) : undefined
    if ((data.sensitive || previous?.sensitive) && !this.vault.status().unlocked)
      throw new Error('Unlock the vault first')
    const settings = this.settings()
    validateTriggers(
      [
        ...this.list().filter((s) => s.id !== id),
        { id, trigger: data.trigger, enabled: data.enabled },
      ],
      settings.prefix,
      settings.caseSensitive,
    )
    if (data.categoryId && !this.categories().some((c) => c.id === data.categoryId))
      throw new Error('Category no longer exists')
    const content = data.content ?? (previous ? this.content(id) : '')
    if (!content.length) throw new Error('Content is required')
    const now = new Date().toISOString()
    this.db
      .prepare(
        `INSERT INTO snippets VALUES(@id,@name,@trigger,@regular,@encrypted,@category,@sensitive,@enabled,@favorite,@created,@updated)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name,trigger=excluded.trigger,regular_content=excluded.regular_content,encrypted_content=excluded.encrypted_content,
      category_id=excluded.category_id,sensitive=excluded.sensitive,enabled=excluded.enabled,favorite=excluded.favorite,updated_at=excluded.updated_at`,
      )
      .run({
        id,
        name: data.name,
        trigger: data.trigger,
        regular: data.sensitive ? null : content,
        encrypted: data.sensitive ? this.vault.encrypt(content, id) : null,
        category: data.categoryId,
        sensitive: +data.sensitive,
        enabled: +data.enabled,
        favorite: +data.favorite,
        created: previous?.created_at ?? now,
        updated: now,
      })
    return metadata(this.row(id))
  }
  delete(id: string): void {
    this.db.prepare('DELETE FROM snippets WHERE id=?').run(id)
  }
  duplicate(id: string): Snippet {
    const old = metadata(this.row(id)),
      existing = this.list()
    // A new prefix branch is necessary; appending to the old trigger would collide with it.
    let trigger = `${this.settings().prefix}copy1`,
      n = 1
    for (;;) {
      try {
        validateTriggers(
          [...existing, { id: 'new', trigger, enabled: true }],
          this.settings().prefix,
          this.settings().caseSensitive,
        )
        break
      } catch {
        trigger = `${this.settings().prefix}copy${++n}`
        if (n > 10000) throw new Error('Choose a new trigger manually')
      }
    }
    const { createdAt: _created, updatedAt: _updated, ...input } = old
    return this.save({
      ...input,
      id: undefined,
      name: `${old.name} copy`.slice(0, 120),
      trigger,
      content: this.content(id),
    })
  }
  categories(): Category[] {
    return this.db
      .prepare('SELECT id,name FROM categories ORDER BY name COLLATE NOCASE')
      .all() as Category[]
  }
  saveCategory(name: string, id: string = randomUUID()): Category {
    if (!name.trim() || name.trim().length > 80) throw new Error('Category needs 1–80 characters')
    if (
      this.categories().some(
        (c) => c.id !== id && c.name.toLowerCase() === name.trim().toLowerCase(),
      )
    )
      throw new Error('Category already exists')
    this.db
      .prepare(
        'INSERT INTO categories VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name',
      )
      .run(id, name.trim(), new Date().toISOString())
    return { id, name: name.trim() }
  }
  deleteCategory(id: string): void {
    this.db.prepare('DELETE FROM categories WHERE id=?').run(id)
  }
  export(): ExportData {
    return {
      format: 'copy-my-things',
      version: 1,
      categories: this.categories(),
      snippets: this.list()
        .filter((s) => !s.sensitive)
        .map(({ createdAt: _c, updatedAt: _u, ...s }) => ({
          ...s,
          sensitive: false as const,
          content: this.content(s.id),
        })),
    }
  }
  import(value: unknown): { count: number; skipped: number } {
    const data = exportSchema.parse(value)
    return this.db.transaction(() => {
      let count = 0,
        skipped = 0
      const categoryMap = new Map<string, string>()
      for (const category of data.categories) {
        const old = this.categories().find(
          (c) => c.name.toLowerCase() === category.name.toLowerCase(),
        )
        categoryMap.set(category.id, old?.id ?? this.saveCategory(category.name).id)
      }
      for (const snippet of data.snippets) {
        try {
          validateTriggers(
            [...this.list(), { ...snippet, id: 'import' }],
            this.settings().prefix,
            this.settings().caseSensitive,
          )
        } catch {
          skipped++
          continue
        }
        this.save({
          ...snippet,
          id: undefined,
          categoryId: snippet.categoryId ? (categoryMap.get(snippet.categoryId) ?? null) : null,
        })
        count++
      }
      return { count, skipped }
    })()
  }
  rekey(rekey: (value: string, id: string) => string, meta: VaultMetadata): void {
    this.db.transaction(() => {
      const rows = this.db
        .prepare('SELECT id,encrypted_content FROM snippets WHERE sensitive=1')
        .all() as { id: string; encrypted_content: string }[]
      for (const row of rows)
        this.db
          .prepare('UPDATE snippets SET encrypted_content=? WHERE id=?')
          .run(rekey(row.encrypted_content, row.id), row.id)
      this.setSetting('vault', meta)
    })()
  }
}
