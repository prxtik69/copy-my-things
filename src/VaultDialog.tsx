import { useState } from 'react'
import { ShieldCheck, LoaderCircle } from 'lucide-react'
import { api } from './api'
import { Dialog } from './components/ui/dialog'
import { Button } from './components/ui/button'
export function VaultDialog({
  initialized,
  pendingCopy,
  close,
}: {
  initialized: boolean
  pendingCopy: boolean
  close: () => void
}) {
  const [password, setPassword] = useState(''),
    [confirm, setConfirm] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!initialized && password !== confirm) {
      setError('Passwords do not match')
      return
    }
    setBusy(true)
    setError('')
    try {
      await api.request(initialized ? 'vault:unlock' : 'vault:setup', password)
      setPassword('')
      setConfirm('')
      close()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) close()
      }}
      title={initialized ? 'Unlock your vault' : 'Create your local vault'}
      description={
        initialized
          ? pendingCopy
            ? 'Authorize copying the requested sensitive snippet.'
            : 'Your password stays on this device.'
          : 'Sensitive snippets are encrypted with your master password.'
      }
    >
      <form onSubmit={submit} className="editor-form">
        <div className="vault-emblem">
          <ShieldCheck size={28} />
        </div>
        <div className="field">
          <label htmlFor="vault-password">Master password</label>
          <input
            autoFocus
            type="password"
            autoComplete={initialized ? 'current-password' : 'new-password'}
            id="vault-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={initialized ? 1 : 12}
            maxLength={1024}
          />
        </div>
        {!initialized && (
          <>
            <div className="field">
              <label htmlFor="vault-confirm">Confirm password</label>
              <input
                type="password"
                autoComplete="new-password"
                id="vault-confirm"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={12}
              />
            </div>
            <p className="notice">
              Use at least 12 characters. There is no password recovery. Keep a secure record of
              your master password.
            </p>
          </>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <Button type="button" variant="ghost" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy && <LoaderCircle size={15} className="spin" />}
            {initialized ? (pendingCopy ? 'Unlock and copy' : 'Unlock vault') : 'Create vault'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
