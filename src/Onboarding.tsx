import { useEffect, useRef, useState } from 'react'
import { Check, ChevronRight, Keyboard } from 'lucide-react'
import { idSchema, type Snapshot, type Snippet } from '../shared/contracts'
import { TriggerMatcher, validateTriggers } from '../electron/main/triggers/matcher'
import { api } from './api'
import { Button } from './components/ui/button'
import { Dialog } from './components/ui/dialog'
import { formatShortcut } from './platform'
import appIcon from '../resources/copy-my-things-logo-assets/copy-my-things-app-icon-128.png'

const progressKey = 'cmt-tutorial'
function resume() {
  try {
    const progress = localStorage.getItem(progressKey)
    const data = JSON.parse(progress ?? localStorage.getItem('cmt-tutorial-last') ?? 'null')
    if (data && idSchema.safeParse(data.id).success && [0, 1, 2].includes(data.step))
      return { id: data.id as string, step: progress ? (data.step as number) : 0 }
  } catch {
    /* An unavailable or old progress record must not block first run. */
  }
  return { id: undefined, step: 0 }
}
function suggestTrigger(snapshot: Snapshot) {
  for (const word of [
    'github',
    'demo',
    'hello',
    'sample',
    ...'abcdefghijklmnopqrstuvwxyz'.split('').map((c) => `${c}-demo`),
  ]) {
    const trigger = snapshot.settings.prefix + word
    try {
      validateTriggers(
        [...snapshot.snippets, { id: 'tutorial', trigger, enabled: true }],
        snapshot.settings.prefix,
        snapshot.settings.caseSensitive,
      )
      return trigger
    } catch {
      /* Try a command that does not overlap an existing one. */
    }
  }
  return snapshot.settings.prefix + 'my-command'
}
export function Onboarding({
  snapshot,
  done,
  settings,
  toast,
}: {
  snapshot: Snapshot
  done: () => void
  settings: () => void
  toast: (message: string, error?: boolean) => void
}) {
  const [initial] = useState(resume)
  const [step, setStep] = useState(initial.step)
  const [restoring, setRestoring] = useState(!!initial.id)
  const [snippetId, setSnippetId] = useState<string | undefined>(initial.id)
  const [name, setName] = useState('My GitHub')
  const [trigger, setTrigger] = useState(() => suggestTrigger(snapshot))
  const [content, setContent] = useState('https://github.com/your-username')
  const [saved, setSaved] = useState<Snippet>()
  const [practice, setPractice] = useState('')
  const [pasted, setPasted] = useState('')
  const [copied, setCopied] = useState(false)
  const [verifiedPaste, setVerifiedPaste] = useState(false)
  const [shortcutSeen, setShortcutSeen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const matcher = useRef(new TriggerMatcher())
  const copyInFlight = useRef(false)
  const practiceInput = useRef<HTMLInputElement>(null)
  const mac = snapshot.capabilities.platform === 'macOS'
  const modifier = mac ? '⌘' : 'Ctrl'
  const shortcut = formatShortcut(snapshot.settings.shortcut, mac)
  const target = snapshot.settings.shortcutAction === 'manager' ? 'manager' : 'Quick Search'
  const titles = ['Create a snippet', 'Try your command', 'Open from anywhere']
  const effectiveSnippet = snapshot.snippets.find((s) => s.id === snippetId) ?? saved
  useEffect(() => {
    let live = true
    if (!initial.id) return
    const item = snapshot.snippets.find((s) => s.id === initial.id)
    if (!item || item.sensitive || !item.enabled) {
      setStep(0)
      setSnippetId(undefined)
      setRestoring(false)
      return
    }
    setSaved(item)
    api
      .request('snippet:content', item.id)
      .then((text) => {
        if (live) {
          setContent(text)
          setTrigger(item.trigger)
          setName(item.name)
        }
      })
      .catch(() => {
        if (live) {
          setStep(0)
          setSnippetId(undefined)
        }
      })
      .finally(() => {
        if (live) setRestoring(false)
      })
    return () => {
      live = false
    }
  }, [])
  useEffect(() => {
    if (effectiveSnippet) {
      try {
        matcher.current.configure(
          [effectiveSnippet],
          snapshot.settings.prefix,
          snapshot.settings.caseSensitive,
        )
      } catch (e) {
        matcher.current.reset()
        setError((e as Error).message)
      }
    }
  }, [
    effectiveSnippet?.id,
    effectiveSnippet?.trigger,
    snapshot.settings.prefix,
    snapshot.settings.caseSensitive,
  ])
  useEffect(() => {
    try {
      if (snippetId && step > 0)
        localStorage.setItem(progressKey, JSON.stringify({ id: snippetId, step }))
    } catch {
      /* Progress is optional when storage is unavailable. */
    }
  }, [step, snippetId])
  useEffect(() => {
    if (step === 1) practiceInput.current?.focus()
  }, [step])
  useEffect(
    () =>
      api.subscribe((event) => {
        if (
          event.type === 'shortcut-activated' &&
          step === 2 &&
          event.action === snapshot.settings.shortcutAction
        )
          setShortcutSeen(true)
      }),
    [step, snapshot.settings.shortcutAction],
  )
  async function create() {
    setBusy(true)
    setError('')
    try {
      const snippet = await api.request('snippet:save', {
        ...(saved ? { id: saved.id } : {}),
        name,
        trigger,
        content,
        categoryId: saved?.categoryId ?? null,
        sensitive: false,
        enabled: true,
        favorite: saved?.favorite ?? false,
      })
      setSaved(snippet)
      setSnippetId(snippet.id)
      setPractice('')
      setCopied(false)
      setPasted('')
      setVerifiedPaste(false)
      setStep(1)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function activate() {
    if (!snippetId || copyInFlight.current) return
    copyInFlight.current = true
    setError('')
    try {
      const result = await api.request('snippet:copy', snippetId)
      if (!result.copied) throw new Error('This snippet could not be copied. Try again.')
      setCopied(true)
      if (snapshot.settings.triggerAction === 'expand') setPractice(content)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      copyInFlight.current = false
    }
  }
  async function finish(openSettings = false) {
    setBusy(true)
    setError('')
    try {
      const latest = await api.request('snapshot', undefined)
      await api.request('settings:save', { ...latest.settings, onboardingDone: true })
      try {
        if (snippetId)
          localStorage.setItem('cmt-tutorial-last', JSON.stringify({ id: snippetId, step: 0 }))
        localStorage.removeItem(progressKey)
      } catch {
        /* optional */
      }
      if (openSettings) settings()
      else done()
    } catch (e) {
      setError((e as Error).message)
      toast((e as Error).message, true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      open
      closable={false}
      onOpenChange={() => {}}
      title={titles[step]}
      className="tutorial-dialog"
    >
      <div className="tutorial-meta">
        <span>STEP {step + 1} OF 3</span>
        <div className="step-dots">
          {[0, 1, 2].map((i) => (
            <span key={i} className={i <= step ? 'current' : ''} />
          ))}
        </div>
      </div>
      <div className="tutorial-step" key={step}>
        {step === 0 && (
          <form
            id="tutorial-create"
            className="editor-form"
            onSubmit={(e) => {
              e.preventDefault()
              if (restoring || busy) return
              void create()
            }}
          >
            <img className="tutorial-logo" src={appIcon} alt="Copy My Things" />
            <p>Choose a command and the text it should copy.</p>
            <div className="field">
              <label htmlFor="tutorial-name">Name</label>
              <input
                id="tutorial-name"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={120}
              />
            </div>
            <div className="field">
              <label htmlFor="tutorial-trigger">Command</label>
              <input
                id="tutorial-trigger"
                className="mono"
                value={trigger}
                onChange={(e) => setTrigger(e.target.value)}
                required
                maxLength={64}
                spellCheck={false}
              />
              <small>Starts with {snapshot.settings.prefix}</small>
            </div>
            <div className="field">
              <label htmlFor="tutorial-content">Text to copy</label>
              <input
                id="tutorial-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                required
              />
            </div>
          </form>
        )}
        {step === 1 && (
          <div className="tutorial-practice">
            <p>
              Type <code>{effectiveSnippet?.trigger ?? trigger}</code>
              {snapshot.settings.triggerAction === 'expand'
                ? ' to expand your text. You can also paste it below.'
                : ', then paste below.'}
            </p>
            <div className="field">
              <label htmlFor="tutorial-practice">Try your command</label>
              <input
                id="tutorial-practice"
                ref={practiceInput}
                value={practice}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => setPractice(e.target.value)}
                onBlur={() => matcher.current.reset()}
                onPaste={() => matcher.current.reset()}
                onKeyDown={(e) => {
                  const match = matcher.current.feed({
                    text: e.key.length === 1 ? e.key : undefined,
                    backspace: e.key === 'Backspace',
                    repeat: e.repeat,
                    modified: e.ctrlKey || e.metaKey || e.altKey,
                    reset: ['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Delete'].includes(e.key),
                  })
                  if (match) {
                    if (snapshot.settings.triggerAction === 'expand') e.preventDefault()
                    void activate()
                  }
                }}
              />
            </div>
            {copied && (
              <div className="tutorial-success" role="status">
                <span className="success-tick">
                  <Check size={15} />
                </span>
                {snapshot.settings.triggerAction === 'expand'
                  ? 'Text expanded · also on your clipboard'
                  : 'Copied to clipboard'}
              </div>
            )}
            <div className="field">
              <label htmlFor="tutorial-paste">
                Now press <kbd>{modifier}</kbd> + <kbd>V</kbd>
              </label>
              <input
                id="tutorial-paste"
                disabled={!copied}
                placeholder="Paste here"
                value={pasted}
                onChange={(e) => {
                  setPasted(e.target.value)
                  setVerifiedPaste(false)
                }}
                onPaste={(e) => {
                  e.preventDefault()
                  const text = e.clipboardData.getData('text/plain')
                  setPasted(text)
                  setVerifiedPaste(copied && text === content)
                  setError(
                    text === content
                      ? ''
                      : 'The pasted text is different. Type your command and try again.',
                  )
                }}
              />
            </div>
            {verifiedPaste && (
              <div className="paste-success" role="status">
                <Check size={14} />
                Text pasted
              </div>
            )}
            <p className="tutorial-note">
              This practice works inside the app. Enable system-wide triggers in Settings.
            </p>
          </div>
        )}
        {step === 2 && (
          <div className="tutorial-shortcut">
            <img className="tutorial-logo" src={appIcon} alt="" />
            <p>Press this shortcut to open your {target}.</p>
            <div className="shortcut-keycaps" aria-label={shortcut}>
              {shortcut.split(' ').map((key, i) => (
                <kbd key={i}>{key}</kbd>
              ))}
            </div>
            {shortcutSeen ? (
              <div className="tutorial-success" role="status">
                <span className="success-tick">
                  <Check size={15} />
                </span>
                Shortcut verified
              </div>
            ) : !snapshot.capabilities.shortcut.available ? (
              <div className="notice" role="status">
                {snapshot.capabilities.shortcut.detail}
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy || restoring}
                  onClick={() => void finish(true)}
                >
                  Change shortcut
                </Button>
              </div>
            ) : (
              <div className="shortcut-waiting">
                <Keyboard size={16} />
                Waiting for your shortcut…
              </div>
            )}
            <button
              className="tutorial-settings"
              disabled={busy || restoring}
              onClick={() => void finish(true)}
            >
              Set up system-wide triggers
            </button>
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="tutorial-actions">
        <Button
          variant="ghost"
          disabled={busy || restoring}
          onClick={() => (step === 0 ? void finish() : setStep(step - 1))}
        >
          {step === 0 ? 'Set up later' : 'Back'}
        </Button>
        {step === 0 ? (
          <Button form="tutorial-create" type="submit" disabled={busy || restoring}>
            Create snippet
            <ChevronRight size={15} />
          </Button>
        ) : step === 1 ? (
          <Button
            disabled={!verifiedPaste || busy}
            onClick={() => {
              setStep(2)
              setError('')
            }}
          >
            Continue
            <ChevronRight size={15} />
          </Button>
        ) : (
          <Button disabled={busy || restoring} onClick={() => void finish()}>
            {shortcutSeen ? 'Done' : 'Finish for now'}
          </Button>
        )}
      </div>
    </Dialog>
  )
}
