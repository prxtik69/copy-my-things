import { useCallback, useEffect, useRef, useState } from 'react'
import { Search, CornerDownLeft, LockKeyhole, Star, Clipboard } from 'lucide-react'
import { api } from './api'
import { useSnapshot, useTheme } from './hooks'
import { searchSnippets } from '../shared/search'
import appIcon from '../resources/copy-my-things-logo-assets/copy-my-things-app-icon-64.png'
import { Button } from './components/ui/button'
export function Launcher() {
  const [query, setQuery] = useState(''),
    [selected, setSelected] = useState(0),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const onEvent = useCallback((event: Parameters<Parameters<typeof api.subscribe>[0]>[0]) => {
    if (event.type === 'feedback' && event.error) setError(event.message)
  }, [])
  const { snapshot, error: loadError } = useSnapshot(onEvent)
  useTheme(snapshot?.settings.theme)
  const results = snapshot
    ? searchSnippets(
        snapshot.snippets.filter((s) => s.enabled),
        snapshot.categories,
        query,
      ).slice(0, 40)
    : []
  useEffect(() => {
    const focus = () => input.current?.focus()
    focus()
    window.addEventListener('focus', focus)
    return () => window.removeEventListener('focus', focus)
  }, [])
  useEffect(() => {
    document.getElementById(`result-${selected}`)?.scrollIntoView({ block: 'nearest' })
  }, [selected])
  async function copy(id: string) {
    if (busy) return
    setBusy(true)
    try {
      const result = await api.request('snippet:copy', id)
      if (result.copied) await api.request('window:hide', undefined)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div
      className="launcher"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          void api.request('window:hide', undefined)
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setSelected((n) => Math.min(n + 1, results.length - 1))
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setSelected((n) => Math.max(0, n - 1))
        }
        if (e.key === 'Enter' && results[selected]) {
          e.preventDefault()
          void copy(results[selected].id)
        }
      }}
    >
      <div className="launcher-search">
        <Search size={21} />
        <input
          ref={input}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setSelected(0)
          }}
          placeholder="Search snippets…"
          aria-label="Search snippets"
          role="combobox"
          aria-expanded="true"
          aria-controls="launcher-results"
          aria-activedescendant={results[selected] ? `result-${selected}` : undefined}
        />
        <kbd>esc</kbd>
      </div>
      <div
        className="launcher-results"
        id="launcher-results"
        role="listbox"
        aria-label="Matching snippets"
      >
        {(error || loadError) && (
          <p role="alert" className="error">
            {error || loadError}
          </p>
        )}
        {!results.length && (
          <div className="empty compact">
            <Clipboard size={26} />
            <p>{snapshot ? 'No matching snippets' : 'Loading your snippets…'}</p>
            <Button variant="ghost" onClick={() => api.request('window:main', undefined)}>
              Open library
            </Button>
          </div>
        )}
        {results.map((snippet, i) => (
          <button
            id={`result-${i}`}
            role="option"
            aria-selected={i === selected}
            key={snippet.id}
            className={`launcher-result ${i === selected ? 'selected' : ''}`}
            onMouseMove={() => setSelected(i)}
            onClick={() => void copy(snippet.id)}
            disabled={busy}
          >
            <span className="snippet-icon">
              {snippet.sensitive ? <LockKeyhole size={17} /> : <Clipboard size={17} />}
            </span>
            <span className="result-text">
              <strong>{snippet.name}</strong>
              <small>
                {snapshot?.categories.find((c) => c.id === snippet.categoryId)?.name ??
                  'Uncategorized'}{' '}
                {snippet.sensitive ? '· Sensitive' : ''}
              </small>
            </span>
            {snippet.favorite && <Star size={13} className="favorite-icon" />}
            <code>{snippet.trigger}</code>
            {i === selected && <CornerDownLeft size={15} />}
          </button>
        ))}
      </div>
      <footer className="launcher-footer">
        <span>
          <img src={appIcon} width={17} height={17} alt="" /> Copy My Things
        </span>
        <span>
          <kbd>↑</kbd>
          <kbd>↓</kbd> navigate <kbd>↵</kbd> copy
        </span>
      </footer>
    </div>
  )
}
