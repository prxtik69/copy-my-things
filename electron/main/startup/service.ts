import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, win32 } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Capability, Settings } from '../../../shared/contracts'

interface LoginOptions {
  path?: string
  args?: string[]
}
interface NativeLogin {
  setLoginItemSettings(settings: LoginOptions & { openAtLogin: boolean }): void
  getLoginItemSettings(options?: LoginOptions): {
    openAtLogin: boolean
    executableWillLaunchAtLogin?: boolean
  }
}
interface StartupOptions {
  platform: NodeJS.Platform
  packaged: boolean
  executable: string
  appPath: string
  home: string
  configHome?: string
  appImage?: string
  native: NativeLogin
}

// Desktop Entry string escaping happens before Exec argument parsing.
export function desktopArgument(value: string): string {
  return `"${value.replace(/%/g, '%%').replace(/[\\"`$]/g, '\\$&')}"`.replace(/\\/g, '\\\\')
}
function xml(value: string): string {
  return value.replace(
    /[<>&"']/g,
    (character) =>
      ({
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        '"': '&quot;',
        "'": '&apos;',
      })[character]!,
  )
}

export class StartupService {
  private error: string | undefined
  readonly file: string | undefined
  private readonly command: string[]
  constructor(private readonly options: StartupOptions) {
    this.command = options.packaged
      ? [options.platform === 'linux' && options.appImage ? options.appImage : options.executable]
      : [options.executable, options.appPath]
    if (options.platform === 'linux') {
      const config =
        options.configHome && isAbsolute(options.configHome)
          ? options.configHome
          : join(options.home, '.config')
      this.file = join(config, 'autostart', 'copy-my-things.desktop')
    } else if (options.platform === 'darwin' && !options.packaged) {
      this.file = join(options.home, 'Library', 'LaunchAgents', 'app.copy-my-things.plist')
    }
  }
  capability(): Capability {
    return {
      available: true,
      detail: this.error
        ? `Could not update launch at login: ${this.error}. Save Settings to retry.`
        : 'Open Copy My Things automatically when you sign in.',
    }
  }
  needsRetry(): boolean {
    return !!this.error
  }
  apply(enabled: boolean): void {
    try {
      const absolute = this.options.platform === 'win32' ? win32.isAbsolute : isAbsolute
      for (const argument of this.command) {
        if (!absolute(argument) || /[\x00-\x1f\x7f]/.test(argument))
          throw new Error('Launch at login requires absolute paths without control characters')
      }
      if (this.file) {
        if (enabled) this.writeRegistration()
        else rmSync(this.file, { force: true })
      } else {
        const nativeOptions: LoginOptions =
          this.options.platform === 'win32'
            ? { path: this.command[0], args: this.command.slice(1) }
            : {}
        this.options.native.setLoginItemSettings({ ...nativeOptions, openAtLogin: enabled })
        const actual = this.options.native.getLoginItemSettings(nativeOptions)
        if (actual.openAtLogin !== enabled)
          throw new Error('The operating system did not save the login item')
        if (enabled && actual.executableWillLaunchAtLogin === false)
          throw new Error('Enable Copy My Things in Windows Startup apps')
      }
      this.error = undefined
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error)
      throw error
    }
  }
  private writeRegistration(): void {
    const file = this.file!
    const content =
      this.options.platform === 'linux'
        ? `[Desktop Entry]\nType=Application\nVersion=1.0\nName=Copy My Things\nExec=${this.command.map(desktopArgument).join(' ')}\nTerminal=false\nStartupNotify=false\n`
        : `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Label</key><string>app.copy-my-things</string><key>ProgramArguments</key><array>${this.command.map((arg) => `<string>${xml(arg)}</string>`).join('')}</array><key>RunAtLoad</key><true/></dict></plist>\n`
    if (existsSync(file) && readFileSync(file, 'utf8') === content) return
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
    const temporary = `${file}.${randomUUID()}.tmp`
    try {
      writeFileSync(temporary, content, { mode: 0o600, flag: 'wx' })
      renameSync(temporary, file)
    } finally {
      rmSync(temporary, { force: true })
    }
  }
}

interface PreferenceStore {
  getSetting<T>(key: string): T | undefined
  setSetting(key: string, value: unknown): void
  settings(): Settings
  saveSettings(settings: Settings): Settings
}
export function initializeStartupDefault(
  store: PreferenceStore,
  previouslyUnsupported: boolean,
): void {
  if (store.getSetting('startupDefaultApplied')) return
  // The old Linux/development toggle was disabled, so its false value was not a user choice.
  if (previouslyUnsupported) store.saveSettings({ ...store.settings(), launchAtLogin: true })
  store.setSetting('startupDefaultApplied', true)
}
