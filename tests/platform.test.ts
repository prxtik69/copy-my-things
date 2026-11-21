import { describe, expect, it } from 'vitest'
import { formatShortcut } from '../src/platform'
import { settingsSchema } from '../shared/contracts'

describe('platform shortcuts', () => {
  it('renders Mac symbols and Windows/Linux modifier names', () => {
    expect(formatShortcut('CommandOrControl+Shift+Space', true)).toBe('⌘ ⇧ Space')
    expect(formatShortcut('CommandOrControl+Shift+Space', false)).toBe('Ctrl Shift Space')
    expect(formatShortcut('Alt+Space', true)).toBe('⌥ Space')
  })
  it('migrates existing preferences to the manager while allowing Quick Search', () => {
    expect(settingsSchema.parse({ shortcut: 'Alt+Space' }).shortcutAction).toBe('manager')
    expect(settingsSchema.parse({ shortcutAction: 'launcher' }).shortcutAction).toBe('launcher')
  })
})
