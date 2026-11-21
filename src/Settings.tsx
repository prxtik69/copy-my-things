import { useEffect, useState, type ReactNode } from 'react'
import {
  Check,
  Download,
  Upload,
  RotateCcw,
  LockKeyhole,
  ShieldCheck,
  Info,
  Keyboard,
  Monitor,
  CircleCheck,
  CircleAlert,
} from 'lucide-react'
import { api } from './api'
import { settingsSchema, type Snapshot, type Settings as Preferences } from '../shared/contracts'
import { Button } from './components/ui/button'
import { Dialog } from './components/ui/dialog'
function SettingRow({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <div className="setting-row">
      <div>
        <label>{title}</label>
        {description && <p>{description}</p>}
      </div>
      <div className="setting-control">{children}</div>
    </div>
  )
}
export function Settings({
  snapshot,
  unlock,
  toast,
  replay,
}: {
  snapshot: Snapshot
  replay: () => void
  unlock: () => void
  toast: (message: string, error?: boolean) => void
}) {
  const [draft, setDraft] = useState(snapshot.settings),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [reset, setReset] = useState(false)
  const [currentPassword, setCurrentPassword] = useState(''),
    [newPassword, setNewPassword] = useState(''),
    [confirmPassword, setConfirmPassword] = useState('')
  const [metrics, setMetrics] = useState('')
  const savedPreferences = JSON.stringify(snapshot.settings)
  useEffect(() => setDraft(snapshot.settings), [savedPreferences])
  const update = <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    setDraft((d) => ({ ...d, [key]: value }))
    setError('')
  }
  const cap = snapshot.capabilities
  const dirty = JSON.stringify(draft) !== JSON.stringify(snapshot.settings)
  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const parsed = settingsSchema.safeParse(draft)
      if (!parsed.success)
        throw new Error(
          parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        )
      await api.request('settings:save', parsed.data)
      toast('Preferences saved')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function transfer(kind: 'data:import' | 'data:export') {
    setBusy(true)
    try {
      const result = await api.request(kind, undefined)
      if (!result.canceled)
        toast(
          `${kind === 'data:import' ? 'Imported' : 'Exported'} ${result.count} snippets${'skipped' in result ? `; ${result.skipped} conflicts skipped` : ''}`,
        )
    } catch (e) {
      toast((e as Error).message, true)
    } finally {
      setBusy(false)
    }
  }
  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      toast('New passwords do not match', true)
      return
    }
    setBusy(true)
    try {
      await api.request('vault:password', { current: currentPassword, next: newPassword })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      toast('Vault password changed')
    } catch (e) {
      toast((e as Error).message, true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="settings-page">
      <form onSubmit={save}>
        <section className="settings-section">
          <h2>
            <Monitor size={17} /> General
          </h2>
          <SettingRow title="Appearance" description="Make yourself at home.">
            <select
              aria-label="Theme"
              value={draft.theme}
              onChange={(e) => update('theme', e.target.value as Preferences['theme'])}
            >
              <option value="system">System</option>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </SettingRow>
          <SettingRow title="Launch at login" description={cap.startup.detail}>
            <input
              type="checkbox"
              aria-label="Launch at login"
              checked={draft.launchAtLogin}
              disabled={!cap.startup.available}
              onChange={(e) => update('launchAtLogin', e.target.checked)}
            />
          </SettingRow>
          <SettingRow title="Keep running when the window closes" description={cap.tray.detail}>
            <input
              type="checkbox"
              aria-label="Keep running when window closes"
              checked={draft.minimizeToTray}
              disabled={!cap.tray.available}
              onChange={(e) => update('minimizeToTray', e.target.checked)}
            />
          </SettingRow>
          <SettingRow
            title="Native copy notifications"
            description={cap.notifications.detail + ' Notifications never include values.'}
          >
            <input
              type="checkbox"
              aria-label="Native copy notifications"
              disabled={!cap.notifications.available}
              checked={draft.notifications}
              onChange={(e) => update('notifications', e.target.checked)}
            />
          </SettingRow>
        </section>
        <section className="settings-section">
          <h2>
            <Keyboard size={17} /> Triggers
          </h2>
          <div className={`capability ${cap.monitoring.available ? '' : 'unavailable'}`}>
            {cap.monitoring.available ? <CircleCheck size={17} /> : <CircleAlert size={17} />}
            <div>
              <strong>
                {cap.platform} · {cap.session}
              </strong>
              <p>{cap.monitoring.detail}</p>
            </div>
          </div>
          <p className="notice">
            Optional global monitoring sees keys in other apps, including password fields. It does
            not store keystrokes or identify secure fields. Use US QWERTY with Caps Lock off;
            disable monitoring before switching layouts or using an IME. Mouse clicks and keyboard
            shortcuts reset matching; application focus changes cannot always be detected.
          </p>
          <SettingRow
            title="US QWERTY layout acknowledgement"
            description="I use US QWERTY and understand the monitoring limitations."
          >
            <input
              type="checkbox"
              aria-label="US QWERTY acknowledgement"
              checked={draft.usLayoutConfirmed}
              disabled={!cap.monitoring.available}
              onChange={(e) => {
                update('usLayoutConfirmed', e.target.checked)
                if (!e.target.checked) update('monitoring', false)
              }}
            />
          </SettingRow>
          <SettingRow
            title="Enable system-wide typed triggers"
            description={
              snapshot.settings.monitoring
                ? 'Monitoring is running. Pause at any time from the tray.'
                : 'Monitoring is paused. Quick Search still works.'
            }
          >
            <input
              type="checkbox"
              aria-label="Enable typed triggers"
              checked={draft.monitoring}
              disabled={!cap.monitoring.available || !draft.usLayoutConfirmed}
              onChange={(e) => update('monitoring', e.target.checked)}
            />
          </SettingRow>
          {cap.platform === 'macOS' && (
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                api.request('permissions:open', undefined).catch((e) => toast(e.message, true))
              }
            >
              Open macOS permission settings
            </Button>
          )}
          <SettingRow
            title="Trigger prefix"
            description="Updates existing triggers to the new prefix."
          >
            <input
              aria-label="Trigger prefix"
              className="short mono"
              value={draft.prefix}
              onChange={(e) => update('prefix', e.target.value)}
              maxLength={4}
            />
          </SettingRow>
          <SettingRow title="Case-sensitive matching">
            <input
              type="checkbox"
              aria-label="Case-sensitive matching"
              checked={draft.caseSensitive}
              onChange={(e) => update('caseSensitive', e.target.checked)}
            />
          </SettingRow>
        </section>
        <section className="settings-section">
          <h2>
            <Keyboard size={17} /> Keyboard
          </h2>
          <SettingRow title="Shortcut opens">
            <select
              aria-label="Shortcut opens"
              value={draft.shortcutAction}
              onChange={(e) =>
                update('shortcutAction', e.target.value as Preferences['shortcutAction'])
              }
            >
              <option value="manager">Manager</option>
              <option value="launcher">Quick Search</option>
            </select>
          </SettingRow>
          <SettingRow title="Manager shortcut" description={cap.shortcut.detail}>
            <input
              aria-label="Manager shortcut"
              className="shortcut-input mono"
              value={draft.shortcut}
              onChange={(e) => update('shortcut', e.target.value)}
            />
          </SettingRow>
          <p className="hint">
            Use Electron accelerator names, e.g. CommandOrControl+Shift+Space or Alt+Space.
            Conflicts are reported when saving.
          </p>
        </section>
        <section className="settings-section">
          <h2>Clipboard</h2>
          <SettingRow
            title="Clear sensitive clipboard after"
            description="0 disables expiration. Only matching clipboard text is cleared."
          >
            <div className="inline">
              <input
                className="short"
                type="number"
                aria-label="Sensitive clipboard timeout"
                min={0}
                max={3600}
                value={draft.secretTimeout}
                onChange={(e) => update('secretTimeout', e.target.valueAsNumber)}
              />
              <span>seconds</span>
            </div>
          </SettingRow>
          <SettingRow title="In-app copy feedback">
            <input
              type="checkbox"
              aria-label="Copy feedback"
              checked={draft.copyFeedback}
              onChange={(e) => update('copyFeedback', e.target.checked)}
            />
          </SettingRow>
          <p className="notice">
            Operating-system clipboard history and third-party clipboard managers may retain secrets
            after expiration. Quitting the app cancels pending expiration.
          </p>
        </section>
        <section className="settings-section">
          <h2>
            <ShieldCheck size={17} /> Security
          </h2>
          <SettingRow
            title="Encrypted local vault"
            description={
              snapshot.vault.initialized
                ? snapshot.vault.unlocked
                  ? 'Unlocked for this session.'
                  : 'Locked. Your secrets stay encrypted.'
                : 'Create a vault before saving sensitive snippets.'
            }
          >
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                snapshot.vault.unlocked
                  ? api.request('vault:lock', undefined).catch((e) => toast(e.message, true))
                  : unlock()
              }
            >
              <LockKeyhole size={14} />
              {snapshot.vault.unlocked
                ? 'Lock vault'
                : snapshot.vault.initialized
                  ? 'Unlock'
                  : 'Create vault'}
            </Button>
          </SettingRow>
          <SettingRow
            title="Auto-lock after vault inactivity"
            description="Secret operations renew the timer. Screen lock and suspend lock immediately."
          >
            <div className="inline">
              <input
                type="number"
                className="short"
                aria-label="Auto-lock minutes"
                min={1}
                max={240}
                value={draft.autoLockMinutes}
                onChange={(e) => update('autoLockMinutes', e.target.valueAsNumber)}
              />
              <span>minutes</span>
            </div>
          </SettingRow>
        </section>
        <div className="settings-save">
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <span>{dirty ? 'You have unsaved changes' : 'Preferences are up to date'}</span>
          <Button type="submit" disabled={!dirty || busy}>
            <Check size={15} />
            Save preferences
          </Button>
        </div>
      </form>
      {snapshot.vault.initialized && (
        <section className="settings-section">
          <h2>Change master password</h2>
          <form className="password-form" onSubmit={changePassword}>
            <div className="field">
              <label htmlFor="current-password">Current password</label>
              <input
                type="password"
                id="current-password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="next-password">New password</label>
                <input
                  type="password"
                  id="next-password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={12}
                />
              </div>
              <div className="field">
                <label htmlFor="confirm-next">Confirm new password</label>
                <input
                  type="password"
                  id="confirm-next"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={12}
                />
              </div>
            </div>
            <Button variant="secondary" disabled={busy}>
              Change password
            </Button>
          </form>
        </section>
      )}
      <section className="settings-section">
        <h2>Getting started</h2>
        <SettingRow title="Interactive tutorial">
          <Button type="button" variant="secondary" size="sm" onClick={replay}>
            Replay tutorial
          </Button>
        </SettingRow>
      </section>
      <section className="settings-section">
        <h2>Data</h2>
        <SettingRow
          title="Import and export"
          description="JSON includes regular snippets and categories. Sensitive snippets are excluded."
        >
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => void transfer('data:import')}
          >
            <Upload size={14} />
            Import
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => void transfer('data:export')}
          >
            <Download size={14} />
            Export
          </Button>
        </SettingRow>
        <SettingRow
          title="Reset preferences"
          description="Keeps your snippets, vault, and current trigger prefix."
        >
          <Button type="button" variant="ghost" size="sm" onClick={() => setReset(true)}>
            <RotateCcw size={14} />
            Reset
          </Button>
        </SettingRow>
      </section>
      <section className="settings-section">
        <h2>
          <Info size={17} /> About
        </h2>
        <p className="about-name">
          Copy My Things <code>v{snapshot.version}</code>
        </p>
        <p className="hint">
          A small, local-first clipboard utility. No account, telemetry, cloud, or automatic paste.
          Original code licensed under MIT. Built for Windows, Linux, and macOS; native platform
          validation is documented in README.md.
        </p>
        <SettingRow
          title="Current resource snapshot"
          description={metrics || 'An on-demand sample; no background polling.'}
        >
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              api
                .request('app:metrics', undefined)
                .then((m) =>
                  setMetrics(
                    `${m.workingSetMB} MB working set · ${m.processes} processes · ${m.cpuPercent}% sampled CPU`,
                  ),
                )
                .catch((e) => toast(e.message, true))
            }
          >
            Measure now
          </Button>
        </SettingRow>
      </section>
      <Dialog
        open={reset}
        onOpenChange={setReset}
        title="Reset preferences?"
        description="Your snippets and encrypted vault will be kept. Monitoring will be paused."
      >
        <div className="dialog-actions">
          <Button variant="ghost" onClick={() => setReset(false)}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              api
                .request('settings:reset', undefined)
                .then(() => {
                  setReset(false)
                  toast('Preferences reset')
                })
                .catch((e) => toast(e.message, true))
            }
          >
            Reset preferences
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
