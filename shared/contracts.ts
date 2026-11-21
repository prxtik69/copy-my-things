import { z } from 'zod'

export const idSchema = z.string().uuid()
export const snippetInput = z
  .object({
    id: idSchema.optional(),
    name: z.string().trim().min(1, 'Name is required').max(120),
    trigger: z
      .string()
      .trim()
      .min(2)
      .max(64)
      .regex(/^[\x21-\x7e]+$/, 'Use printable ASCII without spaces'),
    content: z.string().min(1, 'Content is required').max(2_000_000).optional(),
    categoryId: idSchema.nullable(),
    sensitive: z.boolean(),
    enabled: z.boolean(),
    favorite: z.boolean(),
  })
  .strict()
export type SnippetInput = z.infer<typeof snippetInput>
export interface Snippet extends Omit<SnippetInput, 'content' | 'id'> {
  id: string
  createdAt: string
  updatedAt: string
}
export interface Category {
  id: string
  name: string
}
export const settingsSchema = z
  .object({
    theme: z.enum(['system', 'light', 'dark']).default('system'),
    launchAtLogin: z.boolean().default(true),
    minimizeToTray: z.boolean().default(true),
    notifications: z.boolean().default(false),
    copyFeedback: z.boolean().default(true),
    monitoring: z.boolean().default(false),
    usLayoutConfirmed: z.boolean().default(false),
    prefix: z
      .string()
      .min(1)
      .max(4)
      .regex(/^[;!:#~^/]+$/, 'Use 1–4 characters from ; ! : # ~ ^ /')
      .default(';'),
    caseSensitive: z.boolean().default(true),
    shortcut: z.string().trim().min(3).max(100).default('CommandOrControl+Shift+Space'),
    shortcutAction: z.enum(['manager', 'launcher']).default('manager'),
    secretTimeout: z.number().int().min(0).max(3600).default(30),
    autoLockMinutes: z.number().int().min(1).max(240).default(5),
    onboardingDone: z.boolean().default(false),
  })
  .strict()
export type Settings = z.infer<typeof settingsSchema>
export const defaults: Settings = settingsSchema.parse({})
export interface Capability {
  available: boolean
  detail: string
}
export interface Capabilities {
  platform: string
  session: string
  clipboard: Capability
  notifications: Capability
  shortcut: Capability
  monitoring: Capability
  tray: Capability
  startup: Capability
  permissions: string[]
}
export interface VaultStatus {
  initialized: boolean
  unlocked: boolean
}
export interface Snapshot {
  snippets: Snippet[]
  previews: Record<string, string>
  categories: Category[]
  settings: Settings
  vault: VaultStatus
  capabilities: Capabilities
  version: string
  pendingUnlock?: string
}
export type AppEvent =
  | { type: 'changed' }
  | { type: 'shortcut-activated'; action: 'manager' | 'launcher' }
  | { type: 'unlock-required'; snippetId: string }
  | { type: 'feedback'; message: string; error?: boolean }
export const exportSchema = z
  .object({
    format: z.literal('copy-my-things'),
    version: z.literal(1),
    categories: z
      .array(z.object({ id: idSchema, name: z.string().trim().min(1).max(80) }).strict())
      .max(1000),
    snippets: z
      .array(
        snippetInput.extend({
          id: idSchema,
          content: z.string().min(1).max(2_000_000),
          sensitive: z.literal(false),
        }),
      )
      .max(10000),
  })
  .strict()
export type ExportData = z.infer<typeof exportSchema>
export interface Requests {
  snapshot: undefined
  'snippet:save': SnippetInput
  'snippet:delete': string
  'snippet:duplicate': string
  'snippet:copy': string
  'snippet:content': string
  'category:save': { id?: string; name: string }
  'category:delete': string
  'settings:save': Settings
  'settings:reset': undefined
  'vault:setup': string
  'vault:unlock': string
  'vault:cancel': undefined
  'vault:lock': undefined
  'vault:password': { current: string; next: string }
  'data:export': undefined
  'data:import': undefined
  'window:hide': undefined
  'window:main': undefined
  'window:settings': undefined
  'window:launcher': undefined
  'app:quit': undefined
  'permissions:open': undefined
  'app:metrics': undefined
}
export interface Responses {
  snapshot: Snapshot
  'snippet:save': Snippet
  'snippet:delete': void
  'snippet:duplicate': Snippet
  'snippet:copy': { copied: boolean }
  'snippet:content': string
  'category:save': Category
  'category:delete': void
  'settings:save': Settings
  'settings:reset': Settings
  'vault:setup': VaultStatus
  'vault:unlock': VaultStatus
  'vault:cancel': void
  'vault:lock': VaultStatus
  'vault:password': VaultStatus
  'data:export': { count: number; canceled: boolean }
  'data:import': { count: number; skipped: number; canceled: boolean }
  'window:hide': void
  'window:main': void
  'window:settings': void
  'window:launcher': void
  'app:quit': void
  'permissions:open': void
  'app:metrics': { processes: number; workingSetMB: number; cpuPercent: number }
}
export interface Bridge {
  request<K extends keyof Requests>(method: K, input: Requests[K]): Promise<Responses[K]>
  subscribe(listener: (event: AppEvent) => void): () => void
}
export type Result<T> = { ok: true; value: T } | { ok: false; error: string }
