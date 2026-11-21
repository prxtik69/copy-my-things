import {
  app,
  BrowserWindow,
  Menu,
  Tray,
  nativeImage,
  globalShortcut,
  clipboard,
  Notification,
  ipcMain,
  dialog,
  powerMonitor,
  session,
} from 'electron'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { mkdirSync, chmodSync, mkdtempSync } from 'node:fs'
import { readFile, writeFile, stat } from 'node:fs/promises'
import { tmpdir, homedir } from 'node:os'
import { StartupService, initializeStartupDefault } from './startup/service'
import { z, ZodError } from 'zod'
import { Repository } from './storage/repository'
import { Vault, type VaultMetadata } from './security/vault'
import { ClipboardService } from './clipboard/service'
import { createKeyboardAdapter, openPermissionSettings } from './triggers/adapters'
import { TriggerEngine } from './triggers/engine'
import { validateTriggers } from './triggers/matcher'
import { getCapabilities, notificationsAvailable } from './capabilities'
import {
  defaults,
  idSchema,
  settingsSchema,
  snippetInput,
  exportSchema,
  type AppEvent,
  type Settings,
  type Snapshot,
  type Result,
} from '../../shared/contracts'

const here = dirname(fileURLToPath(import.meta.url))
const smoke = process.argv.includes('--smoke-test')
if (smoke) app.setPath('userData', mkdtempSync(join(tmpdir(), 'copy-my-things-smoke-')))
app.setName('Copy My Things')
// Electron uses the compositor portal when available; a failure is reported rather than hidden.
app.commandLine.appendSwitch('enable-features', 'GlobalShortcutsPortal')
let mainWindow: BrowserWindow | undefined,
  launcher: BrowserWindow | undefined,
  tray: Tray | undefined
let quitting = false,
  pendingUnlock: string | undefined
let repository: Repository, vault: Vault, clip: ClipboardService, engine: TriggerEngine
let startup: StartupService
const adapter = createKeyboardAdapter()
let shortcutStatus = { available: false, detail: 'Manager shortcut has not been registered.' }
const rendererFile = join(here, '../renderer/index.html')
const devURL = process.env.ELECTRON_RENDERER_URL
const allowedWindows = new Set<number>()

function broadcast(event: AppEvent): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue
    const contents = window.webContents
    if (!contents.isDestroyed() && allowedWindows.has(contents.id))
      contents.send('cmt:event', event)
  }
}
function feedback(message: string, error = false): void {
  broadcast({ type: 'feedback', message, error })
}
function changed(): void {
  broadcast({ type: 'changed' })
  rebuildTray()
}
function capabilities() {
  return getCapabilities(
    adapter,
    shortcutStatus,
    !!tray && !tray.isDestroyed(),
    startup.capability(),
  )
}
function snapshot(): Snapshot {
  return {
    snippets: repository.list(),
    previews: repository.previews(),
    categories: repository.categories(),
    settings: repository.settings(),
    vault: vault.status(),
    capabilities: capabilities(),
    version: app.getVersion(),
    pendingUnlock,
  }
}
function trustedURL(value: string): boolean {
  try {
    const actual = new URL(value),
      expected = new URL(devURL ?? pathToFileURL(rendererFile).href)
    return (
      actual.origin === expected.origin &&
      actual.protocol === expected.protocol &&
      actual.pathname === expected.pathname &&
      actual.search === expected.search
    )
  } catch {
    return false
  }
}
function createWindow(kind: 'main' | 'launcher', settings = false): BrowserWindow {
  const window = new BrowserWindow({
    title: kind === 'main' ? 'Copy My Things' : 'Quick Search',
    width: kind === 'main' ? 1080 : 640,
    height: kind === 'main' ? 720 : 460,
    minWidth: kind === 'main' ? 760 : 480,
    minHeight: kind === 'main' ? 520 : 360,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#202126',
    icon: join(here, '../../resources/copy-my-things-logo-assets/copy-my-things-app-icon-256.png'),
    resizable: kind === 'main',
    maximizable: kind === 'main',
    alwaysOnTop: kind === 'launcher',
    webPreferences: {
      preload: join(here, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      devTools: !app.isPackaged,
    },
  })
  // BrowserWindow.webContents is no longer accessible in the 'closed' event.
  const contentsId = window.webContents.id
  allowedWindows.add(contentsId)
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event, url) => {
    if (!trustedURL(url)) event.preventDefault()
  })
  window.webContents.on('will-attach-webview', (event) => event.preventDefault())
  window.on('focus', () => engine?.reset())
  window.once('ready-to-show', () => {
    if (window.isDestroyed()) return
    window.show()
    window.focus()
  })
  window.on('closed', () => {
    allowedWindows.delete(contentsId)
    if (mainWindow === window) mainWindow = undefined
    if (launcher === window) launcher = undefined
  })
  if (kind === 'main')
    window.on('close', () => {
      if (!quitting && (!repository.settings().minimizeToTray || !tray)) {
        quitting = true
        app.quit()
      }
    })
  else
    window.on('blur', () => {
      if (!window.isDestroyed()) window.close()
    })
  const hash = kind === 'launcher' ? 'launcher' : settings ? 'settings' : ''
  if (devURL) void window.loadURL(`${devURL}#${hash}`)
  else void window.loadFile(rendererFile, { hash })
  return window
}
function openMain(settings = false): void {
  if (launcher && !launcher.isDestroyed()) launcher.close()
  if (!mainWindow || mainWindow.isDestroyed()) mainWindow = createWindow('main', settings)
  else {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
    void mainWindow.webContents
      .executeJavaScript(settings ? "location.hash = 'settings'" : "location.hash = 'manager'")
      .catch(() => {
        /* The window may have closed while the route was loading. */
      })
  }
}
function openLauncher(): void {
  if (launcher && !launcher.isDestroyed()) {
    launcher.show()
    launcher.focus()
    return
  }
  launcher = createWindow('launcher')
}
function activateShortcut(): void {
  const action = repository.settings().shortcutAction
  if (action === 'manager') openMain()
  else openLauncher()
  broadcast({ type: 'shortcut-activated', action })
}
function registerShortcut(accelerator: string): boolean {
  try {
    return globalShortcut.register(accelerator, activateShortcut)
  } catch {
    return false
  }
}
function applySettings(value: Settings): Settings {
  const previous = repository.settings()
  validateTriggers(repository.forSettings(value), value.prefix, value.caseSensitive)
  if (value.monitoring && !value.usLayoutConfirmed)
    throw new Error('Confirm the US keyboard layout and monitoring notice first')
  if (value.monitoring && !adapter.availability().available)
    throw new Error(adapter.availability().detail)
  const shortcutChanged = previous.shortcut !== value.shortcut
  if (shortcutChanged && !registerShortcut(value.shortcut))
    throw new Error('That shortcut is unavailable or already used by another application')
  let startupAttempted = false
  try {
    engine.configure(repository.forSettings(value), value)
    if (value.launchAtLogin !== previous.launchAtLogin || startup.needsRetry()) {
      startupAttempted = true
      startup.apply(value.launchAtLogin)
    }
    repository.saveSettings(value)
    if (shortcutChanged) globalShortcut.unregister(previous.shortcut)
    if (shortcutChanged || !shortcutStatus.available)
      shortcutStatus = {
        available: globalShortcut.isRegistered(value.shortcut),
        detail: globalShortcut.isRegistered(value.shortcut)
          ? `Registered ${value.shortcut}.`
          : 'Shortcut unavailable. Open the manager or Quick Search from the tray.',
      }
    vault.refreshTimeout()
    changed()
    return value
  } catch (error) {
    if (startupAttempted && value.launchAtLogin !== previous.launchAtLogin) {
      try {
        startup.apply(previous.launchAtLogin)
      } catch {
        /* Report through startup capability. */
      }
    }
    if (shortcutChanged) globalShortcut.unregister(value.shortcut)
    try {
      engine.configure(repository.list(), previous)
    } catch {
      repository.saveSettings({ ...previous, monitoring: false })
    }
    throw error
  }
}
async function copySnippet(id: string): Promise<{ copied: boolean }> {
  const snippet = repository.row(id)
  if (snippet.sensitive && !vault.status().unlocked) {
    pendingUnlock = id
    openMain()
    broadcast({ type: 'unlock-required', snippetId: id })
    changed()
    return { copied: false }
  }
  const settings = repository.settings()
  await clip.copy(repository.content(id), !!snippet.sensitive, settings.secretTimeout)
  if (pendingUnlock === id) pendingUnlock = undefined
  if (settings.copyFeedback) feedback(`Copied ${snippet.name}`)
  if (settings.notifications && notificationsAvailable())
    new Notification({ title: 'Copy My Things', body: 'Snippet copied to clipboard.' }).show()
  return { copied: true }
}
function rebuildTray(): void {
  if (!tray || tray.isDestroyed() || !repository) return
  const settings = repository.settings(),
    monitoring = capabilities().monitoring
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Copy My Things', click: () => openMain() },
      { label: 'Quick Search', click: openLauncher },
      {
        label: settings.monitoring ? 'Pause Triggers' : 'Resume Triggers',
        enabled: monitoring.available && settings.usLayoutConfirmed,
        click: () => {
          try {
            applySettings({ ...settings, monitoring: !settings.monitoring })
          } catch (error) {
            feedback(error instanceof Error ? error.message : 'Could not change monitoring', true)
            openMain(true)
          }
        },
      },
      { type: 'separator' },
      { label: 'Settings', click: () => openMain(true) },
      {
        label: 'Quit',
        click: () => {
          quitting = true
          app.quit()
        },
      },
    ]),
  )
}
function makeTray(): void {
  try {
    const image = nativeImage.createFromPath(join(here, '../../resources/tray.png'))
    if (image.isEmpty()) throw new Error('Tray icon missing')
    tray = new Tray(image.resize({ width: 22, height: 22 }))
    tray.setToolTip('Copy My Things')
    tray.on('click', () => openMain())
    rebuildTray()
  } catch {
    tray = undefined
  }
}

const schemas: Record<string, z.ZodType> = {
  snapshot: z.undefined(),
  'snippet:save': snippetInput,
  'snippet:delete': idSchema,
  'snippet:duplicate': idSchema,
  'snippet:copy': idSchema,
  'snippet:content': idSchema,
  'category:save': z
    .object({ id: idSchema.optional(), name: z.string().trim().min(1).max(80) })
    .strict(),
  'category:delete': idSchema,
  'settings:save': settingsSchema,
  'settings:reset': z.undefined(),
  'vault:setup': z.string().min(12).max(1024),
  'vault:unlock': z.string().max(1024),
  'vault:lock': z.undefined(),
  'vault:cancel': z.undefined(),
  'vault:password': z
    .object({ current: z.string().max(1024), next: z.string().min(12).max(1024) })
    .strict(),
  'data:export': z.undefined(),
  'data:import': z.undefined(),
  'window:hide': z.undefined(),
  'window:main': z.undefined(),
  'window:settings': z.undefined(),
  'window:launcher': z.undefined(),
  'app:quit': z.undefined(),
  'permissions:open': z.undefined(),
  'app:metrics': z.undefined(),
}
function installIPC(): void {
  ipcMain.handle(
    'cmt:request',
    async (event, method: unknown, raw: unknown): Promise<Result<unknown>> => {
      try {
        if (
          !allowedWindows.has(event.sender.id) ||
          event.senderFrame !== event.sender.mainFrame ||
          !trustedURL(event.senderFrame.url)
        )
          throw new Error('Untrusted IPC sender')
        if (typeof method !== 'string' || !Object.hasOwn(schemas, method))
          throw new Error('Unknown operation')
        const input = schemas[method].parse(raw)
        let value: unknown
        switch (method) {
          case 'snapshot':
            value = snapshot()
            break
          case 'snippet:save':
            value = repository.save(input as z.infer<typeof snippetInput>)
            engine.configure(repository.list(), repository.settings())
            changed()
            break
          case 'snippet:delete':
            if (pendingUnlock === input) pendingUnlock = undefined
            repository.delete(input as string)
            engine.configure(repository.list(), repository.settings())
            changed()
            break
          case 'snippet:duplicate':
            value = repository.duplicate(input as string)
            engine.configure(repository.list(), repository.settings())
            changed()
            break
          case 'snippet:content':
            value = repository.content(input as string)
            break
          case 'snippet:copy':
            value = await copySnippet(input as string)
            break
          case 'category:save': {
            const data = input as { name: string; id?: string }
            value = repository.saveCategory(data.name, data.id)
            changed()
            break
          }
          case 'category:delete':
            repository.deleteCategory(input as string)
            changed()
            break
          case 'settings:save':
            value = applySettings(input as Settings)
            break
          case 'settings:reset': {
            // Preserve the prefix to avoid invalidating every existing trigger, and keep onboarding complete.
            value = applySettings({
              ...defaults,
              prefix: repository.settings().prefix,
              onboardingDone: repository.settings().onboardingDone,
            })
            break
          }
          case 'vault:setup':
            await vault.setup(input as string)
            value = vault.status()
            break
          case 'vault:unlock':
            await vault.unlock(input as string)
            if (pendingUnlock) await copySnippet(pendingUnlock)
            value = vault.status()
            changed()
            break
          case 'vault:cancel':
            pendingUnlock = undefined
            changed()
            break
          case 'vault:lock':
            pendingUnlock = undefined
            vault.lock()
            value = vault.status()
            break
          case 'vault:password': {
            const data = input as { current: string; next: string }
            await vault.changePassword(data.current, data.next, (rekey, meta) =>
              repository.rekey(rekey, meta),
            )
            value = vault.status()
            break
          }
          case 'data:export': {
            const result = await dialog.showSaveDialog({
              title: 'Export regular snippets',
              defaultPath: 'copy-my-things.json',
              filters: [{ name: 'JSON', extensions: ['json'] }],
            })
            if (result.canceled || !result.filePath) value = { count: 0, canceled: true }
            else {
              const data = repository.export()
              await writeFile(result.filePath, JSON.stringify(data, null, 2), { mode: 0o600 })
              value = { count: data.snippets.length, canceled: false }
            }
            break
          }
          case 'data:import': {
            const result = await dialog.showOpenDialog({
              title: 'Import regular snippets',
              properties: ['openFile'],
              filters: [{ name: 'JSON', extensions: ['json'] }],
            })
            if (result.canceled || !result.filePaths[0]) {
              value = { count: 0, skipped: 0, canceled: true }
              break
            }
            const path = result.filePaths[0]
            if ((await stat(path)).size > 20_000_000) throw new Error('Import file exceeds 20 MB')
            const data = exportSchema.parse(JSON.parse(await readFile(path, 'utf8')))
            const confirm = await dialog.showMessageBox({
              type: 'question',
              title: 'Import snippets?',
              message: `Import up to ${data.snippets.length} regular snippets?`,
              detail:
                'Existing snippets are never overwritten. Duplicate and conflicting triggers will be skipped. Categories are merged by name.',
              buttons: ['Cancel', 'Import'],
              defaultId: 1,
              cancelId: 0,
            })
            if (confirm.response !== 1) value = { count: 0, skipped: 0, canceled: true }
            else {
              value = { ...repository.import(data), canceled: false }
              engine.configure(repository.list(), repository.settings())
              changed()
            }
            break
          }
          case 'window:hide':
            BrowserWindow.fromWebContents(event.sender)?.close()
            break
          case 'window:main':
            openMain()
            break
          case 'window:settings':
            openMain(true)
            break
          case 'window:launcher':
            openLauncher()
            break
          case 'app:quit':
            quitting = true
            app.quit()
            break
          case 'permissions:open':
            await openPermissionSettings()
            break
          case 'app:metrics': {
            const metrics = app.getAppMetrics()
            value = {
              processes: metrics.length,
              workingSetMB: Math.round(
                metrics.reduce((sum, p) => sum + p.memory.workingSetSize, 0) / 1024,
              ),
              cpuPercent: Number(
                metrics.reduce((sum, p) => sum + p.cpu.percentCPUUsage, 0).toFixed(2),
              ),
            }
            break
          }
        }
        return { ok: true, value }
      } catch (error) {
        // Zod messages only; never serialize rejected input, paths, or SQLite internals to the renderer.
        const message =
          error instanceof ZodError
            ? error.issues.map((i) => `${i.path.join('.') || 'Input'}: ${i.message}`).join('; ')
            : error instanceof SyntaxError
              ? 'Invalid JSON file'
              : error instanceof Error && !('code' in error)
                ? error.message
                : 'Operation failed. Check file permissions and try again.'
        return { ok: false, error: message }
      }
    },
  )
}
if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => {
    if (repository) openMain()
  })
  app
    .whenReady()
    .then(async () => {
      session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
        callback(false),
      )
      session.defaultSession.setPermissionCheckHandler(() => false)
      // No application network traffic. Vite HTTP/WebSocket is allowed only in development.
      session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
        const url = new URL(details.url)
        const localDev =
          !!devURL &&
          ['http:', 'ws:'].includes(url.protocol) &&
          url.hostname === new URL(devURL).hostname &&
          url.port === new URL(devURL).port
        callback({ cancel: !['file:', 'devtools:', 'data:'].includes(url.protocol) && !localDev })
      })
      const directory = app.getPath('userData')
      mkdirSync(directory, { recursive: true, mode: 0o700 })
      if (process.platform !== 'win32') chmodSync(directory, 0o700)
      repository = new Repository(join(directory, 'copy-my-things.sqlite'))
      if (process.platform !== 'win32') chmodSync(join(directory, 'copy-my-things.sqlite'), 0o600)
      initializeStartupDefault(repository, process.platform === 'linux' || !app.isPackaged)
      // Smoke tests use only their temporary profile, never the real OS login settings.
      let smokeLoginEnabled = false
      startup = new StartupService({
        platform: process.platform,
        packaged: app.isPackaged,
        executable: process.execPath,
        appPath: app.getAppPath(),
        home: smoke ? directory : homedir(),
        configHome: smoke ? join(directory, 'config') : process.env.XDG_CONFIG_HOME,
        appImage: process.env.APPIMAGE,
        native: smoke
          ? {
              setLoginItemSettings: ({ openAtLogin }) => {
                smokeLoginEnabled = openAtLogin
              },
              getLoginItemSettings: () => ({ openAtLogin: smokeLoginEnabled }),
            }
          : app,
      })
      try {
        startup.apply(repository.settings().launchAtLogin)
      } catch (error) {
        console.error('Launch at login:', error instanceof Error ? error.message : String(error))
      }
      vault = new Vault(
        () => repository.getSetting<VaultMetadata>('vault'),
        (meta) => repository.setSetting('vault', meta),
        () => repository.settings().autoLockMinutes,
        changed,
      )
      repository.vault = vault
      if (!repository.getSetting('examplesCreated')) {
        if (repository.list().length === 0) {
          const personal = repository.saveCategory('Everyday')
          const samples = [
            ['A friendly hello', ';hello', 'Hello! Hope you are having a good day.'],
            [
              'A quick thank you',
              ';thanks',
              'Thank you for your time.\nI really appreciate your help.',
            ],
            ['Meeting agenda', ';agenda', 'Agenda\n1. Updates\n2. Questions\n3. Next steps'],
          ]
          for (const [name, trigger, content] of samples)
            repository.save({
              name,
              trigger,
              content,
              categoryId: personal.id,
              sensitive: false,
              enabled: true,
              favorite: name === 'A friendly hello',
            })
        }
        repository.setSetting('examplesCreated', true)
      }
      clip = new ClipboardService(clipboard, () =>
        feedback('Could not clear the expired clipboard', true),
      )
      engine = new TriggerEngine(adapter, copySnippet, (message) => feedback(message, true))
      try {
        engine.configure(repository.list(), repository.settings())
      } catch {
        repository.saveSettings({ ...repository.settings(), monitoring: false })
      }
      const registered = registerShortcut(repository.settings().shortcut)
      shortcutStatus = {
        available: registered,
        detail: registered
          ? `Registered ${repository.settings().shortcut}.`
          : 'Shortcut unavailable or already taken. Open the manager or Quick Search from the tray.',
      }
      makeTray()
      installIPC()
      openMain()
      powerMonitor.on('lock-screen', () => {
        vault.lock()
        engine.reset()
      })
      powerMonitor.on('suspend', () => {
        vault.lock()
        engine.reset()
      })
      app.on('activate', () => openMain())
      if (smoke) {
        const { runSmoke } = await import('./smoke')
        await runSmoke({
          window: mainWindow!,
          repository,
          vault,
          openLauncher,
          activateShortcut,
          getLauncher: () => launcher,
          closeMain: () => mainWindow?.close(),
          metrics: () => app.getAppMetrics(),
        })
        quitting = true
        app.quit()
      }
    })
    .catch((error) => {
      console.error(
        'Application startup failed:',
        error instanceof Error ? error.message : 'Unknown error',
      )
      quitting = true
      app.exit(1)
    })
}
app.on('window-all-closed', () => {
  if (!tray && !quitting) {
    quitting = true
    app.quit()
  }
})
app.on('before-quit', () => {
  quitting = true
})
app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  engine?.stop()
  clip?.dispose()
  vault?.lock()
  tray?.destroy()
  if (repository?.db.open) repository.close()
  ipcMain.removeHandler('cmt:request')
})
