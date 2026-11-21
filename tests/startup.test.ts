import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  StartupService,
  desktopArgument,
  initializeStartupDefault,
} from '../electron/main/startup/service'
import { Repository } from '../electron/main/storage/repository'
import { defaults, settingsSchema } from '../shared/contracts'

let directory: string
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'cmt-startup-'))
})
afterEach(() => {
  rmSync(directory, { recursive: true, force: true })
})
function native() {
  let enabled = false
  return {
    setLoginItemSettings: vi.fn(({ openAtLogin }: { openAtLogin: boolean }) => {
      enabled = openAtLogin
    }),
    getLoginItemSettings: vi.fn(() => ({ openAtLogin: enabled })),
  }
}
function service(overrides: Partial<ConstructorParameters<typeof StartupService>[0]> = {}) {
  return new StartupService({
    platform: 'linux',
    packaged: false,
    executable: '/opt/Electron App/electron',
    appPath: '/projects/Copy My Things',
    home: directory,
    native: native(),
    ...overrides,
  })
}
describe('launch at login', () => {
  it('defaults to enabled without enabling typed monitoring', () => {
    expect(defaults.launchAtLogin).toBe(true)
    expect(defaults.monitoring).toBe(false)
    expect(settingsSchema.parse({ launchAtLogin: false }).launchAtLogin).toBe(false)
  })
  it('registers and removes the Linux development command idempotently', () => {
    const integration = service()
    integration.apply(true)
    expect(integration.file).toBe(join(directory, '.config/autostart/copy-my-things.desktop'))
    const content = readFileSync(integration.file!, 'utf8')
    expect(content).toContain('Exec="/opt/Electron App/electron" "/projects/Copy My Things"\n')
    expect(content).toContain('Type=Application\n')
    expect(content).not.toContain('--smoke-test')
    expect(statSync(integration.file!).mode & 0o777).toBe(0o600)
    const modified = statSync(integration.file!).mtimeMs
    integration.apply(true)
    expect(statSync(integration.file!).mtimeMs).toBe(modified)
    const neighbor = join(directory, '.config/autostart/other.desktop')
    writeFileSync(neighbor, 'another app')
    integration.apply(false)
    integration.apply(false)
    expect(existsSync(integration.file!)).toBe(false)
    expect(readFileSync(neighbor, 'utf8')).toBe('another app')
  })
  it('uses absolute XDG_CONFIG_HOME and ignores relative overrides', () => {
    expect(service({ configHome: join(directory, 'custom') }).file).toBe(
      join(directory, 'custom/autostart/copy-my-things.desktop'),
    )
    expect(service({ configHome: 'relative' }).file).toBe(
      join(directory, '.config/autostart/copy-my-things.desktop'),
    )
  })
  it('starts packaged Linux executables and AppImages without a project argument', () => {
    const integration = service({ packaged: true, appImage: '/opt/Copy My Things.AppImage' })
    integration.apply(true)
    expect(readFileSync(integration.file!, 'utf8')).toContain(
      'Exec="/opt/Copy My Things.AppImage"\n',
    )
    const executable = service({ packaged: true })
    executable.apply(true)
    expect(readFileSync(executable.file!, 'utf8')).toContain('Exec="/opt/Electron App/electron"\n')
  })
  it('escapes Desktop Entry and Exec syntax, including literal field codes', () => {
    expect(desktopArgument('/a b/%f')).toBe('"/a b/%%f"')
    expect(desktopArgument('/a"$`\\b')).toBe('"/a\\\\"\\\\$\\\\`\\\\\\\\b"')
  })
  it('reports write failures and allows retry without crashing startup', () => {
    const blocked = join(directory, 'blocked')
    writeFileSync(blocked, 'file')
    const integration = service({ configHome: blocked })
    expect(() => integration.apply(true)).toThrow()
    expect(integration.needsRetry()).toBe(true)
    expect(integration.capability().available).toBe(true)
    expect(integration.capability().detail).toContain('Save Settings to retry')
    rmSync(blocked)
    integration.apply(true)
    expect(integration.needsRetry()).toBe(false)
  })
  it('rejects malformed commands before writing a registration', () => {
    const integration = service({ executable: '/bad\ncommand' })
    expect(() => integration.apply(true)).toThrow('control characters')
    expect(existsSync(integration.file!)).toBe(false)
  })
  it('registers the Windows executable and project arguments with matching readback', () => {
    const api = native()
    const integration = service({
      platform: 'win32',
      executable: 'C:\\Electron App\\electron.exe',
      appPath: 'C:\\Copy My Things',
      native: api,
    })
    integration.apply(true)
    expect(api.setLoginItemSettings).toHaveBeenLastCalledWith({
      openAtLogin: true,
      path: 'C:\\Electron App\\electron.exe',
      args: ['C:\\Copy My Things'],
    })
    expect(api.getLoginItemSettings).toHaveBeenLastCalledWith({
      path: 'C:\\Electron App\\electron.exe',
      args: ['C:\\Copy My Things'],
    })
    integration.apply(false)
    expect(api.setLoginItemSettings.mock.lastCall?.[0].openAtLogin).toBe(false)
  })
  it('uses no development arguments for packaged Windows apps', () => {
    const api = native()
    service({
      platform: 'win32',
      packaged: true,
      executable: 'C:\\Apps\\cmt.exe',
      native: api,
    }).apply(true)
    expect(api.setLoginItemSettings).toHaveBeenCalledWith({
      openAtLogin: true,
      path: 'C:\\Apps\\cmt.exe',
      args: [],
    })
  })
  it('reports native registration failures and Windows startup blocks', () => {
    const integration = service({
      platform: 'darwin',
      packaged: true,
      native: {
        setLoginItemSettings: () => {},
        getLoginItemSettings: () => ({ openAtLogin: false }),
      },
    })
    expect(() => integration.apply(true)).toThrow('did not save')
    const windows = service({
      platform: 'win32',
      executable: 'C:\\cmt.exe',
      appPath: 'C:\\project',
      native: {
        setLoginItemSettings: () => {},
        getLoginItemSettings: () => ({ openAtLogin: true, executableWillLaunchAtLogin: false }),
      },
    })
    expect(() => windows.apply(true)).toThrow('Windows Startup apps')
  })
  it('uses native login items for packaged macOS apps', () => {
    const api = native()
    const integration = service({ platform: 'darwin', packaged: true, native: api })
    integration.apply(true)
    expect(integration.file).toBeUndefined()
    expect(api.setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: true })
    integration.apply(false)
    expect(api.setLoginItemSettings).toHaveBeenLastCalledWith({ openAtLogin: false })
  })
  it('registers an escaped LaunchAgent for macOS development and removes it', () => {
    const api = native()
    const integration = service({
      platform: 'darwin',
      appPath: '/Projects/Copy & <Things>',
      native: api,
    })
    integration.apply(true)
    expect(integration.file).toBe(join(directory, 'Library/LaunchAgents/app.copy-my-things.plist'))
    const plist = readFileSync(integration.file!, 'utf8')
    expect(plist).toContain(
      '<key>ProgramArguments</key><array><string>/opt/Electron App/electron</string><string>/Projects/Copy &amp; &lt;Things&gt;</string></array>',
    )
    expect(plist).toContain('<key>RunAtLoad</key><true/>')
    expect(api.setLoginItemSettings).not.toHaveBeenCalled()
    integration.apply(false)
    expect(existsSync(integration.file!)).toBe(false)
  })
})
describe('startup preference migration', () => {
  it('upgrades the unavailable default once and persists a later opt-out across restarts', () => {
    const file = join(directory, 'test.sqlite')
    let repository = new Repository(file)
    repository.saveSettings({ ...defaults, launchAtLogin: false })
    initializeStartupDefault(repository, true)
    expect(repository.settings().launchAtLogin).toBe(true)
    repository.saveSettings({ ...repository.settings(), launchAtLogin: false })
    repository.close()
    repository = new Repository(file)
    initializeStartupDefault(repository, true)
    expect(repository.settings().launchAtLogin).toBe(false)
    repository.close()
  })
  it('preserves existing choices where login integration was already available', () => {
    const repository = new Repository(join(directory, 'test.sqlite'))
    try {
      repository.saveSettings({ ...defaults, launchAtLogin: false })
      initializeStartupDefault(repository, false)
      expect(repository.settings().launchAtLogin).toBe(false)
    } finally {
      repository.close()
    }
  })
})
