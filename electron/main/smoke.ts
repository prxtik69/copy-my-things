import { app, clipboard, type BrowserWindow } from 'electron'
import { writeFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Repository } from './storage/repository'
import type { Vault } from './security/vault'
import type { Snapshot } from '../../shared/contracts'
import assert from 'node:assert/strict'
interface SmokeContext {
  window: BrowserWindow
  repository: Repository
  vault: Vault
  activateShortcut: () => void
  openLauncher: () => void
  getLauncher: () => BrowserWindow | undefined
  closeMain: () => void
  metrics: () => Electron.ProcessMetric[]
}
async function loaded(window: BrowserWindow): Promise<void> {
  if (window.webContents.isLoading())
    await new Promise<void>((resolve, reject) => {
      window.webContents.once('did-finish-load', () => resolve())
      window.webContents.once('did-fail-load', () => reject(new Error('Renderer failed to load')))
    })
  // Let React effects attach before interacting with the sandboxed bridge.
  await new Promise((resolve) => setTimeout(resolve, 300))
}
async function launcherFocused(window: BrowserWindow): Promise<void> {
  for (let i = 0; i < 40; i++) {
    const active = await window.webContents.executeJavaScript(
      'document.activeElement?.getAttribute("aria-label")',
    )
    if (active === 'Search snippets') return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  assert.fail('Launcher search input should receive focus')
}
async function waitForUI(window: BrowserWindow, expression: string): Promise<void> {
  for (let i = 0; i < 60; i++) {
    if (await window.webContents.executeJavaScript(expression)) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  assert.fail(`UI condition did not become true: ${expression}`)
}
export async function runSmoke(context: SmokeContext): Promise<void> {
  const { window, repository, vault } = context
  // Electron otherwise displays a native error dialog and can let the test keep
  // running, falsely passing despite an uncaught lifecycle exception.
  const mainProcessErrors: Error[] = []
  const failOnMainProcessError = (error: Error): void => {
    mainProcessErrors.push(error)
  }
  process.on('uncaughtException', failOnMainProcessError)
  const originalClipboard = await clipboard.readText()
  const deadline = setTimeout(() => {
    console.error('Electron smoke test timed out')
    app.exit(1)
  }, 30_000)
  try {
    await loaded(window)
    const errors: string[] = []
    window.webContents.on('console-message', (event) => {
      if (event.level === 'error') errors.push(event.message)
    })
    const request = <T = unknown>(method: string, input?: unknown): Promise<T> =>
      window.webContents.executeJavaScript(
        `window.copyMyThings.request(${JSON.stringify(method)}, ${JSON.stringify(input) ?? 'undefined'})`,
      )
    let state = await request<Snapshot>('snapshot')
    assert.equal(state.vault.unlocked, false)
    assert.equal(state.settings.monitoring, false)
    assert.equal(state.settings.launchAtLogin, true)
    assert.equal(state.capabilities.startup.available, true)
    const startupFile =
      process.platform === 'linux'
        ? join(app.getPath('userData'), 'config/autostart/copy-my-things.desktop')
        : process.platform === 'darwin' && !app.isPackaged
          ? join(app.getPath('userData'), 'Library/LaunchAgents/app.copy-my-things.plist')
          : undefined
    if (startupFile) {
      assert.equal(existsSync(startupFile), true)
      assert.equal(readFileSync(startupFile, 'utf8').includes('--smoke-test'), false)
    }
    await request('settings:save', { ...state.settings, launchAtLogin: false })
    assert.equal(repository.settings().launchAtLogin, false)
    if (startupFile) assert.equal(existsSync(startupFile), false)
    await request('settings:save', { ...state.settings, launchAtLogin: true })
    assert.equal(repository.settings().launchAtLogin, true)
    if (startupFile) assert.equal(existsSync(startupFile), true)

    // Exercise the actual first-run UI, copy path, paste event, and resumable progress.
    await waitForUI(window, '!!document.getElementById("tutorial-trigger")')
    await new Promise((resolve) => setTimeout(resolve, 300))
    await writeFile(
      join(app.getPath('userData'), 'onboarding-create.png'),
      (await window.webContents.capturePage()).toPNG(),
    )
    const tutorialTrigger = await window.webContents.executeJavaScript(
      'document.getElementById("tutorial-trigger").value',
    )
    await window.webContents.executeJavaScript(
      'document.querySelector("#tutorial-create").requestSubmit()',
    )
    await waitForUI(window, '!!document.getElementById("tutorial-practice")')
    const afterTutorialCreate = (await request<Snapshot>('snapshot')).snippets.length
    window.webContents.reload()
    await loaded(window)
    await waitForUI(window, 'document.activeElement?.id === "tutorial-practice"')
    assert.equal(
      (await request<Snapshot>('snapshot')).snippets.length,
      afterTutorialCreate,
      'Resume must not duplicate the tutorial snippet',
    )
    for (const key of tutorialTrigger) {
      window.webContents.sendInputEvent({ type: 'keyDown', keyCode: key })
      window.webContents.sendInputEvent({ type: 'char', keyCode: key })
      window.webContents.sendInputEvent({ type: 'keyUp', keyCode: key })
    }
    await waitForUI(window, '!!document.querySelector(".tutorial-success")')
    const tutorialText = 'https://github.com/your-username'
    assert.equal(
      await window.webContents.executeJavaScript(
        'document.getElementById("tutorial-practice").value',
      ),
      tutorialText,
      'Typed tutorial command must expand in place',
    )
    assert.equal(
      await clipboard.readText(),
      tutorialText,
      'Typed tutorial command must really copy',
    )
    await clipboard.writeText('Incorrect paste')
    await window.webContents.executeJavaScript('document.getElementById("tutorial-paste").focus()')
    window.webContents.paste()
    await waitForUI(window, 'document.getElementById("tutorial-paste").value === "Incorrect paste"')
    assert.equal(
      await window.webContents.executeJavaScript('!!document.querySelector(".paste-success")'),
      false,
      'Incorrect paste must not pass',
    )
    await clipboard.writeText(tutorialText)
    window.webContents.paste()
    await waitForUI(window, '!!document.querySelector(".paste-success")')
    await new Promise((resolve) => setTimeout(resolve, 300))
    await writeFile(
      join(app.getPath('userData'), 'onboarding-paste.png'),
      (await window.webContents.capturePage()).toPNG(),
    )
    await window.webContents.executeJavaScript(
      'document.querySelector(".tutorial-actions .button-primary").click()',
    )
    await waitForUI(window, '!!document.querySelector(".shortcut-keycaps")')
    assert.equal(
      await window.webContents.executeJavaScript(
        'document.querySelector(".tutorial-success")?.textContent ?? ""',
      ),
      '',
    )
    await new Promise((resolve) => setTimeout(resolve, 300))
    await writeFile(
      join(app.getPath('userData'), 'onboarding-shortcut.png'),
      (await window.webContents.capturePage()).toPNG(),
    )
    context.activateShortcut()
    await waitForUI(
      window,
      'document.querySelector(".tutorial-success")?.textContent === "Shortcut verified"',
    )
    assert.equal(
      context.getLauncher(),
      undefined,
      'Default shortcut should open manager, not launcher',
    )
    await window.webContents.executeJavaScript(
      'document.querySelector(".tutorial-actions .button-primary").click()',
    )
    await waitForUI(window, '!document.querySelector(".tutorial-dialog")')
    state = await request<Snapshot>('snapshot')
    assert.equal(state.settings.onboardingDone, true)
    assert.equal(state.settings.monitoring, false, 'Tutorial must not enable global monitoring')
    await waitForUI(window, 'document.querySelector(".library-row") !== null')
    assert.equal(
      await window.webContents.executeJavaScript(`document.fonts.check('13px "Lexend"')`),
      true,
    )
    // Replaying edits the same practice snippet rather than adding another example.
    await window.webContents.executeJavaScript('document.querySelector(".settings-nav").click()')
    await waitForUI(
      window,
      'Array.from(document.querySelectorAll("button")).some(b => b.textContent === "Replay tutorial")',
    )
    await window.webContents.executeJavaScript(
      'Array.from(document.querySelectorAll("button")).find(b => b.textContent === "Replay tutorial").click()',
    )
    await waitForUI(
      window,
      'document.getElementById("tutorial-trigger")?.value === ' + JSON.stringify(tutorialTrigger),
    )
    await window.webContents.executeJavaScript(
      'document.querySelector("#tutorial-create").requestSubmit()',
    )
    await waitForUI(window, '!!document.getElementById("tutorial-practice")')
    assert.equal((await request<Snapshot>('snapshot')).snippets.length, afterTutorialCreate)
    await window.webContents.executeJavaScript(
      'document.querySelector(".tutorial-actions .button-ghost").click()',
    )
    await waitForUI(window, '!!document.getElementById("tutorial-create")')
    await window.webContents.executeJavaScript(
      'document.querySelector(".tutorial-actions .button-ghost").click()',
    )
    await waitForUI(window, '!document.querySelector(".tutorial-dialog")')
    await window.webContents.executeJavaScript('document.querySelector(".new-snippet").click()')
    await new Promise((resolve) => setTimeout(resolve, 100))
    for (const [id, text] of [
      ['snippet-name', 'UI created'],
      ['snippet-trigger', ';ui-created'],
      ['snippet-content', 'Created through the rendered editor'],
    ]) {
      await window.webContents.executeJavaScript(
        'document.getElementById(' +
          JSON.stringify(id) +
          ').focus(); document.getElementById(' +
          JSON.stringify(id) +
          ').select()',
      )
      await window.webContents.insertText(text)
    }
    await window.webContents.executeJavaScript(
      'document.querySelector(".editor-form button[type=submit]").click()',
    )
    await new Promise((resolve) => setTimeout(resolve, 200))
    assert(
      (await request<Snapshot>('snapshot')).snippets.some((s) => s.name === 'UI created'),
      'Rendered snippet editor did not save',
    )
    // Verify selection, keyboard navigation, and the new manager's copy button.
    const createdUI = (await request<Snapshot>('snapshot')).snippets.find(
      (s) => s.name === 'UI created',
    )!
    await waitForUI(window, `!!document.querySelector('[data-id="${createdUI.id}"]')`)
    await window.webContents.executeJavaScript(
      `document.querySelector('[data-id="${createdUI.id}"]').click()`,
    )
    await waitForUI(
      window,
      'document.querySelector(".snippet-content")?.textContent === "Created through the rendered editor"',
    )
    await window.webContents.executeJavaScript(
      `document.querySelector('[aria-label="Copy UI created"]').click()`,
    )
    await waitForUI(
      window,
      'document.querySelector(".detail-footer [role=status]")?.textContent === "Copied"',
    )
    assert.equal(await clipboard.readText(), 'Created through the rendered editor')
    await window.webContents.executeJavaScript('document.querySelector(".library-row").focus()')
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Down' })
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Down' })
    await waitForUI(
      window,
      'document.querySelectorAll(".library-row")[1]?.getAttribute("aria-pressed") === "true"',
    )
    const regular = await request<{ id: string }>('snippet:save', {
      name: 'Smoke snippet',
      trigger: ';smoke',
      content: 'Verified clipboard\nMultiline',
      categoryId: null,
      sensitive: false,
      enabled: true,
      favorite: false,
    })
    await request('snippet:copy', regular.id)
    assert.equal(await clipboard.readText(), 'Verified clipboard\nMultiline')
    await request('vault:setup', 'smoke-test-password-only')
    const secret = await request<{ id: string }>('snippet:save', {
      name: 'Smoke sensitive',
      trigger: ';private',
      content: 'harmless smoke secret',
      categoryId: null,
      sensitive: true,
      enabled: true,
      favorite: false,
    })
    assert.equal(repository.row(secret.id).regular_content, null)
    assert(!(await request<Snapshot>('snapshot')).previews[secret.id])
    await waitForUI(window, `!!document.querySelector('[data-id="${secret.id}"]')`)
    await window.webContents.executeJavaScript(
      `document.querySelector('[data-id="${secret.id}"]').click()`,
    )
    await waitForUI(
      window,
      'document.querySelector(".snippet-content")?.textContent === "harmless smoke secret"',
    )
    await request('vault:lock')
    await waitForUI(
      window,
      '!document.querySelector(".snippet-content") && !!document.querySelector(".locked-content")',
    )
    await assert.rejects(request('snippet:content', secret.id), /Unlock/)
    assert.equal(vault.status().unlocked, false)
    await request('vault:unlock', 'smoke-test-password-only')
    await request('snippet:copy', secret.id)
    assert.equal(await clipboard.readText(), 'harmless smoke secret')
    await request('snippet:delete', secret.id)
    state = await request<Snapshot>('snapshot')
    assert(!JSON.stringify(state).includes('harmless smoke secret'))
    assert.equal(await window.webContents.executeJavaScript('typeof window.require'), 'undefined')
    await assert.rejects(request('not:allowed'), /Unknown operation/)
    // Capture actual Electron rendering for local visual QA; no browser/server is involved.
    await new Promise((resolve) => setTimeout(resolve, 200))
    await writeFile(
      join(app.getPath('userData'), 'library.png'),
      (await window.webContents.capturePage()).toPNG(),
    )
    state = await request<Snapshot>('snapshot')
    await request('settings:save', { ...state.settings, theme: 'light' })
    await new Promise((resolve) => setTimeout(resolve, 100))
    await writeFile(
      join(app.getPath('userData'), 'library-light.png'),
      (await window.webContents.capturePage()).toPNG(),
    )
    window.setSize(760, 520)
    await new Promise((resolve) => setTimeout(resolve, 100))
    assert.equal(
      await window.webContents.executeJavaScript(
        'document.documentElement.scrollWidth <= innerWidth',
      ),
      true,
      'Minimum window must not overflow horizontally',
    )
    await writeFile(
      join(app.getPath('userData'), 'library-compact.png'),
      (await window.webContents.capturePage()).toPNG(),
    )
    window.setSize(1080, 720)
    await window.webContents.executeJavaScript('document.querySelector(".settings-nav").click()')
    await new Promise((resolve) => setTimeout(resolve, 100))
    assert.equal(
      await window.webContents.executeJavaScript('document.querySelector("h1").textContent'),
      'Settings',
    )
    await writeFile(
      join(app.getPath('userData'), 'settings.png'),
      (await window.webContents.capturePage()).toPNG(),
    )
    const withWindow = context.metrics()
    state = await request<Snapshot>('snapshot')
    await request('settings:save', { ...state.settings, shortcutAction: 'launcher' })
    context.activateShortcut()
    const launcher = context.getLauncher()!
    await loaded(launcher)
    await launcherFocused(launcher)
    let launcherTheme: string | undefined
    for (let i = 0; i < 40; i++) {
      launcherTheme = await launcher.webContents.executeJavaScript(
        'document.documentElement.dataset.theme',
      )
      if (launcherTheme === 'light') break
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    assert.equal(launcherTheme, 'light', 'Launcher should use the saved theme')
    await writeFile(
      join(app.getPath('userData'), 'launcher.png'),
      (await launcher.webContents.capturePage()).toPNG(),
    )
    await launcher.webContents.insertText('UI created')
    await new Promise((resolve) => setTimeout(resolve, 100))
    launcher.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' })
    launcher.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' })
    await new Promise((resolve) => setTimeout(resolve, 200))
    assert.equal(await clipboard.readText(), 'Created through the rendered editor')
    assert(launcher.isDestroyed(), 'Launcher should close after copying')
    assert.equal(context.getLauncher(), undefined, 'Closed launcher reference must be cleared')
    // Reopening must create a fresh window, and Escape must clean it up too.
    context.openLauncher()
    const reopenedLauncher = context.getLauncher()!
    assert.notEqual(reopenedLauncher, launcher)
    await loaded(reopenedLauncher)
    await launcherFocused(reopenedLauncher)
    reopenedLauncher.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
    reopenedLauncher.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
    await new Promise((resolve) => setTimeout(resolve, 200))
    assert(reopenedLauncher.isDestroyed(), 'Escape should close the reopened launcher')
    assert.equal(context.getLauncher(), undefined)
    if (state.capabilities.tray.available) {
      context.closeMain()
      await new Promise((resolve) => setTimeout(resolve, 300))
      assert.equal(window.isDestroyed(), true)
      assert(repository.list().some((s) => s.id === regular.id))
    }
    const background = context.metrics()
    const summarize = (metrics: Electron.ProcessMetric[]) => ({
      processes: metrics.length,
      workingSetMB: Math.round(metrics.reduce((n, p) => n + p.memory.workingSetSize, 0) / 1024),
      cpuPercent: Number(metrics.reduce((n, p) => n + p.cpu.percentCPUUsage, 0).toFixed(2)),
    })
    const report = {
      electron: process.versions.electron,
      node: process.versions.node,
      platform: process.platform,
      arch: process.arch,
      capabilities: state.capabilities,
      withWindow: summarize(withWindow),
      background: summarize(background),
      rendererErrors: errors,
      screenshot: join(app.getPath('userData'), 'library.png'),
    }
    assert.equal(errors.length, 0, 'Renderer emitted errors')
    assert.equal(
      mainProcessErrors.length,
      0,
      `Uncaught main-process exception: ${mainProcessErrors[0]?.stack ?? ''}`,
    )
    console.log('ELECTRON_SMOKE_PASS', JSON.stringify(report))
  } finally {
    process.removeListener('uncaughtException', failOnMainProcessError)
    clearTimeout(deadline)
    const current = await clipboard.readText()
    if (
      [
        'https://github.com/your-username',
        'Incorrect paste',
        'harmless smoke secret',
        'Verified clipboard\nMultiline',
        'Created through the rendered editor',
      ].includes(current)
    )
      await clipboard.writeText(originalClipboard)
  }
}
