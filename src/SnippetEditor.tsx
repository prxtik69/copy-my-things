import { useEffect, useState } from 'react'
import { Eye, EyeOff, ShieldCheck, LoaderCircle } from 'lucide-react'
import { api } from './api'
import { Dialog } from './components/ui/dialog'
import { Button } from './components/ui/button'
import { snippetInput, type Snippet, type SnippetInput, type Snapshot } from '../shared/contracts'
import { validateTriggers } from '../electron/main/triggers/matcher'
export function SnippetEditor({
  snippet,
  snapshot,
  close,
  onSaved,
  unlock,
}: {
  snippet: Snippet | null
  snapshot: Snapshot
  close: () => void
  onSaved: () => void
  unlock: () => void
}) {
  const [form, setForm] = useState<SnippetInput>(() =>
    snippet
      ? {
          id: snippet.id,
          name: snippet.name,
          trigger: snippet.trigger,
          categoryId: snippet.categoryId,
          sensitive: snippet.sensitive,
          enabled: snippet.enabled,
          favorite: snippet.favorite,
        }
      : {
          name: '',
          trigger: snapshot.settings.prefix,
          content: '',
          categoryId: null,
          sensitive: false,
          enabled: true,
          favorite: false,
        },
  )
  const [loading, setLoading] = useState(!!snippet && !snippet.sensitive),
    [busy, setBusy] = useState(false),
    [revealed, setRevealed] = useState(false),
    [errors, setErrors] = useState<Record<string, string>>({})
  useEffect(() => {
    let live = true
    if (snippet && !snippet.sensitive)
      api
        .request('snippet:content', snippet.id)
        .then((content) => {
          if (live) setForm((f) => ({ ...f, content }))
        })
        .catch((e) => {
          if (live) setErrors({ content: e.message })
        })
        .finally(() => {
          if (live) setLoading(false)
        })
    return () => {
      live = false
    }
  }, [snippet])
  useEffect(() => {
    if (!snapshot.vault.unlocked && form.sensitive) {
      setForm((f) => ({ ...f, content: undefined }))
      setRevealed(false)
    }
  }, [snapshot.vault.unlocked])
  function update<K extends keyof SnippetInput>(key: K, value: SnippetInput[K]) {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => ({ ...e, [key]: '' }))
  }
  async function reveal() {
    if (!snapshot.vault.unlocked) {
      unlock()
      return
    }
    if (revealed) {
      setRevealed(false)
      return
    }
    try {
      if (snippet && form.content === undefined)
        update('content', await api.request('snippet:content', snippet.id))
      setRevealed(true)
    } catch (e) {
      setErrors({ content: (e as Error).message })
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault()
    const parsed = snippetInput.safeParse(form)
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])))
      return
    }
    try {
      validateTriggers(
        [
          ...snapshot.snippets.filter((s) => s.id !== form.id),
          { id: form.id ?? 'new', trigger: form.trigger, enabled: form.enabled },
        ],
        snapshot.settings.prefix,
        snapshot.settings.caseSensitive,
      )
    } catch (e) {
      setErrors({ trigger: (e as Error).message })
      return
    }
    if (!snippet && !form.content) {
      setErrors({ content: 'Content is required' })
      return
    }
    if (form.sensitive && !snapshot.vault.unlocked) {
      setErrors({ content: 'Unlock or create the vault before saving sensitive content' })
      return
    }
    if (snippet?.sensitive && !form.sensitive && !form.content) {
      setErrors({ content: 'Reveal the value before converting it to regular text' })
      return
    }
    setBusy(true)
    try {
      await api.request('snippet:save', form)
      onSaved()
      close()
    } catch (e) {
      setErrors({ save: (e as Error).message })
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
      title={snippet ? 'Edit snippet' : 'New snippet'}
      wide
    >
      <form onSubmit={save} className="editor-form">
        <div className="field">
          <label htmlFor="snippet-name">Name</label>
          <input
            autoFocus
            id="snippet-name"
            value={form.name}
            maxLength={120}
            onChange={(e) => update('name', e.target.value)}
            placeholder="e.g. Work email"
            aria-invalid={!!errors.name}
          />
          {errors.name && <small className="error">{errors.name}</small>}
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="snippet-trigger">Trigger</label>
            <input
              id="snippet-trigger"
              className="mono"
              value={form.trigger}
              onChange={(e) => update('trigger', e.target.value)}
              placeholder={`${snapshot.settings.prefix}email`}
              spellCheck={false}
              aria-invalid={!!errors.trigger}
            />
            <small className={errors.trigger ? 'error' : ''}>
              {errors.trigger ||
                `Start with ${snapshot.settings.prefix}. ${snapshot.settings.triggerAction === 'expand' ? 'Typing it replaces the trigger with your text.' : 'Typing it copies your text.'}`}
            </small>
          </div>
          <div className="field">
            <label htmlFor="snippet-category">Category</label>
            <select
              id="snippet-category"
              value={form.categoryId ?? ''}
              onChange={(e) => update('categoryId', e.target.value || null)}
            >
              <option value="">Uncategorized</option>
              {snapshot.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <div className="label-line">
            <label htmlFor="snippet-content">Content</label>
            {form.sensitive && (
              <Button type="button" variant="ghost" size="sm" onClick={() => void reveal()}>
                {revealed ? <EyeOff size={14} /> : <Eye size={14} />} {revealed ? 'Mask' : 'Reveal'}
              </Button>
            )}
          </div>
          <textarea
            id="snippet-content"
            rows={7}
            className={`mono ${form.sensitive && !revealed ? 'masked' : ''}`}
            value={form.content ?? ''}
            disabled={loading || (form.sensitive && !snapshot.vault.unlocked)}
            placeholder={
              snippet?.sensitive && form.content === undefined
                ? 'Encrypted value unchanged. Reveal to edit, or type a replacement.'
                : 'The text you want on your clipboard…'
            }
            onChange={(e) => update('content', e.target.value)}
            spellCheck={false}
            aria-invalid={!!errors.content}
          />
          {errors.content && <small className="error">{errors.content}</small>}
        </div>
        <div className="editor-options">
          <label className="check">
            <input
              type="checkbox"
              checked={form.sensitive}
              disabled={!!snippet?.sensitive && !snapshot.vault.unlocked}
              onChange={(e) => update('sensitive', e.target.checked)}
            />
            <ShieldCheck size={16} /> Sensitive
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => update('enabled', e.target.checked)}
            />{' '}
            Enabled
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={form.favorite}
              onChange={(e) => update('favorite', e.target.checked)}
            />{' '}
            Favorite
          </label>
        </div>
        {form.sensitive && (
          <p className="notice">
            Encrypted in your local vault. Clipboard managers may retain copied secrets.{' '}
            {!snapshot.vault.unlocked && (
              <Button type="button" size="sm" variant="secondary" onClick={unlock}>
                {snapshot.vault.initialized ? 'Unlock vault' : 'Create vault'}
              </Button>
            )}
          </p>
        )}
        {snippet?.sensitive && !form.sensitive && (
          <p className="error">
            Saving as regular text removes vault protection and allows plaintext exports.
          </p>
        )}
        {errors.save && (
          <p className="error" role="alert">
            {errors.save}
          </p>
        )}
        <div className="dialog-actions">
          <Button type="button" variant="ghost" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || loading}>
            {busy && <LoaderCircle size={15} className="spin" />}
            {snippet ? 'Save changes' : 'Create snippet'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
