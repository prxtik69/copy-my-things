import { createRequire } from 'node:module'
import { systemPreferences, shell } from 'electron'
import type { KeyInput } from '../matcher'
import type { Capability } from '../../../../shared/contracts'
import type { UiohookKeyboardEvent } from 'uiohook-napi'
type HookModule = typeof import('uiohook-napi')
export interface KeyboardAdapter {
  availability(): Capability
  start(consume: (key: KeyInput) => void): void
  stop(): void
}
const nativeRequire = createRequire(import.meta.url)
/** Native physical keys are mapped ONLY after explicit US-layout acknowledgement. No text events are retained. */
class NativeAdapter implements KeyboardAdapter {
  private hook?: HookModule
  private cleanup?: () => void
  constructor(private platform: NodeJS.Platform) {}
  availability(): Capability {
    if (this.platform === 'darwin' && !systemPreferences.isTrustedAccessibilityClient(false))
      return {
        available: false,
        detail:
          'Grant Accessibility and Input Monitoring access in macOS Privacy & Security, then restart.',
      }
    try {
      this.hook ??= nativeRequire('uiohook-napi') as HookModule
      return {
        available: true,
        detail:
          'Native hook loaded. US QWERTY only; other layouts, IMEs, dead keys and secure input detection are unsupported. OS validation is still required.',
      }
    } catch {
      return {
        available: false,
        detail: 'Native keyboard module could not load. Use Quick Search.',
      }
    }
  }
  start(consume: (key: KeyInput) => void): void {
    if (this.cleanup) return
    const capability = this.availability()
    if (!capability.available || !this.hook) throw new Error(capability.detail)
    const { uIOhook, UiohookKey: K } = this.hook
    const down = new Set<number>()
    let caps = false
    const map = new Map<number, [string, string]>()
    for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
      map.set(K[ch as keyof typeof K], [ch.toLowerCase(), ch])
    for (let n = 0; n <= 9; n++)
      map.set(K[String(n) as keyof typeof K], [String(n), ')!@#$%^&*('[n]])
    const punctuation = [
      'Minus',
      'Equal',
      'BracketLeft',
      'BracketRight',
      'Backslash',
      'Semicolon',
      'Quote',
      'Backquote',
      'Comma',
      'Period',
      'Slash',
    ]
    const pairs = ['-_', '=+', '[{', ']}', '\\|', ';:', '\'"', '`~', ',<', '.>', '/?']
    punctuation.forEach((name, i) => {
      const code = K[name as keyof typeof K]
      if (code) map.set(code, [pairs[i][0], pairs[i][1]])
    })
    const keydown = (event: UiohookKeyboardEvent): void => {
      const repeat = down.has(event.keycode)
      down.add(event.keycode)
      if (event.keycode === K.CapsLock) {
        if (!repeat) caps = !caps
        consume({ reset: true })
        return
      }
      if (event.ctrlKey || event.altKey || event.metaKey || caps) {
        consume({ modified: true })
        return
      }
      if (event.keycode === K.Shift || event.keycode === K.ShiftRight) return
      if (event.keycode === K.Backspace) {
        consume({ backspace: true, repeat })
        return
      }
      const pair = map.get(event.keycode)
      consume(pair ? { text: pair[event.shiftKey ? 1 : 0], repeat } : { reset: true })
    }
    const keyup = (event: UiohookKeyboardEvent): void => {
      down.delete(event.keycode)
    }
    const mouse = (): void => {
      down.clear()
      consume({ reset: true })
    }
    uIOhook.on('keydown', keydown)
    uIOhook.on('keyup', keyup)
    uIOhook.on('mousedown', mouse)
    this.cleanup = () => {
      uIOhook.removeListener('keydown', keydown)
      uIOhook.removeListener('keyup', keyup)
      uIOhook.removeListener('mousedown', mouse)
      down.clear()
      consume({ reset: true })
    }
    try {
      uIOhook.start()
    } catch (error) {
      this.cleanup()
      this.cleanup = undefined
      throw error
    }
  }
  stop(): void {
    if (this.cleanup) {
      this.hook?.uIOhook.stop()
      this.cleanup()
      this.cleanup = undefined
    }
  }
}
export class WindowsAdapter extends NativeAdapter {
  constructor() {
    super('win32')
  }
}
export class LinuxX11Adapter extends NativeAdapter {
  constructor() {
    super('linux')
  }
}
export class MacOSAdapter extends NativeAdapter {
  constructor() {
    super('darwin')
  }
}
export class LinuxWaylandAdapter implements KeyboardAdapter {
  availability(): Capability {
    return {
      available: false,
      detail:
        'Wayland restricts global keyboard monitoring. Quick Search remains available if your compositor accepts its shortcut.',
    }
  }
  start(): never {
    throw new Error(this.availability().detail)
  }
  stop(): void {}
}
class UnsupportedAdapter extends LinuxWaylandAdapter {
  override availability(): Capability {
    return {
      available: false,
      detail: 'Typed triggers are not supported on this desktop. Use Quick Search.',
    }
  }
}
export function createKeyboardAdapter(): KeyboardAdapter {
  if (process.platform === 'win32') return new WindowsAdapter()
  if (process.platform === 'darwin') return new MacOSAdapter()
  if (process.platform === 'linux') {
    if (process.env.XDG_SESSION_TYPE === 'wayland' || process.env.WAYLAND_DISPLAY)
      return new LinuxWaylandAdapter()
    if (process.env.DISPLAY) return new LinuxX11Adapter()
  }
  return new UnsupportedAdapter()
}
export async function openPermissionSettings(): Promise<void> {
  if (process.platform === 'darwin')
    await shell.openExternal(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
    )
  else throw new Error('No additional permission settings are required on this platform')
}
