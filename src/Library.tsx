import { useEffect, useState, type RefObject } from 'react'
import {
  Check,
  Copy,
  Files,
  LockKeyhole,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
  X,
} from 'lucide-react'
import type { Snippet, Snapshot } from '../shared/contracts'
import { api } from './api'
import { Button } from './components/ui/button'

export function Library({
  snapshot,
  snippets,
  title,
  query,
  setQuery,
  search,
  create,
  edit,
  toggle,
  unlock,
  remove,
  toast,
}: {
  snapshot: Snapshot
  snippets: Snippet[]
  title: string
  query: string
  setQuery: (query: string) => void
  search: RefObject<HTMLInputElement | null>
  create: () => void
  edit: (snippet: Snippet) => void
  toggle: (snippet: Snippet, key: 'favorite' | 'enabled') => void
  unlock: () => void
  remove: (snippet: Snippet) => void
  toast: (message: string, error?: boolean) => void
}) {
  const [selectedId, setSelectedId] = useState<string>()
  const selected = snippets.find((s) => s.id === selectedId) ?? snippets[0]
  const [loaded, setLoaded] = useState<{ id: string; version: string; text: string }>()
  const [error, setError] = useState('')
  const [copied, setCopied] = useState<string>()
  const [copying, setCopying] = useState(false)
  const locked = !!selected?.sensitive && !snapshot.vault.unlocked
  useEffect(() => {
    let live = true
    setLoaded(undefined)
    setError('')
    if (selected && !locked) {
      api
        .request('snippet:content', selected.id)
        .then((text) => {
          if (live) setLoaded({ id: selected.id, version: selected.updatedAt, text })
        })
        .catch((e) => {
          if (live) setError(e.message)
        })
    }
    return () => {
      live = false
    }
  }, [selected?.id, selected?.updatedAt, locked])
  useEffect(() => {
    if (!copied) return
    const timeout = setTimeout(() => setCopied(undefined), 1800)
    return () => clearTimeout(timeout)
  }, [copied])
  const text =
    !locked && loaded?.id === selected?.id && loaded?.version === selected?.updatedAt
      ? loaded?.text
      : undefined
  async function copy() {
    if (!selected || copying) return
    setCopying(true)
    try {
      const result = await api.request('snippet:copy', selected.id)
      if (result.copied) setCopied(selected.id)
    } catch (e) {
      toast((e as Error).message, true)
    } finally {
      setCopying(false)
    }
  }
  async function duplicate() {
    if (!selected) return
    try {
      const saved = await api.request('snippet:duplicate', selected.id)
      setSelectedId(saved.id)
    } catch (e) {
      toast((e as Error).message, true)
    }
  }
  return (
    <div className="library-workspace">
      <section className="snippet-list" aria-label={title}>
        <div className="library-list-heading">
          <h1>{title}</h1>
          <Button variant="ghost" size="icon" aria-label="New snippet" onClick={create}>
            <Plus size={18} />
          </Button>
        </div>
        <div className="search-field">
          <Search size={16} />
          <input
            ref={search}
            aria-label="Search library"
            placeholder="Search snippets…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query ? (
            <button aria-label="Clear search" onClick={() => setQuery('')}>
              <X size={14} />
            </button>
          ) : (
            <kbd>{snapshot.capabilities.platform === 'macOS' ? '⌘' : 'Ctrl'} K</kbd>
          )}
        </div>
        <div className="list-summary">
          <span>
            {snippets.length} {snippets.length === 1 ? 'snippet' : 'snippets'}
          </span>
          <span>Name</span>
        </div>
        <div
          className="snippet-list-scroll"
          aria-label="Snippet selection"
          onKeyDown={(e) => {
            const row = (e.target as HTMLElement).closest<HTMLButtonElement>('.library-row')
            if (!row) return
            const index = snippets.findIndex((s) => s.id === row.dataset.id)
            const next =
              e.key === 'ArrowDown'
                ? Math.min(index + 1, snippets.length - 1)
                : e.key === 'ArrowUp'
                  ? Math.max(index - 1, 0)
                  : e.key === 'Home'
                    ? 0
                    : e.key === 'End'
                      ? snippets.length - 1
                      : undefined
            if (next !== undefined && snippets[next]) {
              e.preventDefault()
              setSelectedId(snippets[next].id)
              e.currentTarget.querySelectorAll<HTMLButtonElement>('.library-row')[next]?.focus()
            }
          }}
        >
          {snippets.map((snippet) => (
            <button
              key={snippet.id}
              data-id={snippet.id}
              className={`library-row ${selected?.id === snippet.id ? 'selected' : ''} ${snippet.enabled ? '' : 'is-paused'}`}
              aria-pressed={selected?.id === snippet.id}
              onClick={() => setSelectedId(snippet.id)}
            >
              <span className="library-row-title">
                {snippet.sensitive && <LockKeyhole size={13} />}
                <span>{snippet.name}</span>
                {snippet.favorite && (
                  <Star size={12} fill="currentColor" className="favorite-icon" />
                )}
              </span>
              <span className="library-row-category">
                {snippet.sensitive
                  ? 'Protected snippet'
                  : snapshot.previews[snippet.id] || 'Text snippet'}
              </span>
              <code className="trigger-badge">{snippet.trigger}</code>
            </button>
          ))}
          {!snippets.length && (
            <div className="list-empty">
              <Search size={22} />
              <p>{query ? 'No matching snippets' : 'No snippets here'}</p>
              {!query && (
                <Button variant="secondary" size="sm" onClick={create}>
                  New snippet
                </Button>
              )}
            </div>
          )}
        </div>
      </section>
      {selected ? (
        <section className="snippet-detail" aria-label="Snippet details" key={selected.id}>
          <div className="detail-toolbar">
            <span>
              {snapshot.categories.find((c) => c.id === selected.categoryId)?.name ??
                'Uncategorized'}
            </span>
            <div className="inline">
              <Button
                variant="ghost"
                size="icon"
                aria-label={`${selected.favorite ? 'Unfavorite' : 'Favorite'} ${selected.name}`}
                onClick={() => toggle(selected, 'favorite')}
              >
                <Star
                  size={16}
                  fill={selected.favorite ? 'currentColor' : 'none'}
                  className={selected.favorite ? 'favorite-icon' : ''}
                />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Edit ${selected.name}`}
                onClick={() => edit(selected)}
              >
                <Pencil size={15} />
              </Button>
              <details className="more-menu">
                <summary className="icon-button" aria-label={`More actions for ${selected.name}`}>
                  ···
                </summary>
                <div className="menu-popover">
                  <button
                    onClick={(e) => {
                      e.currentTarget.closest('details')?.removeAttribute('open')
                      void duplicate()
                    }}
                  >
                    <Files size={14} />
                    Duplicate
                  </button>
                  <button
                    className="danger-text"
                    onClick={(e) => {
                      e.currentTarget.closest('details')?.removeAttribute('open')
                      remove(selected)
                    }}
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                </div>
              </details>
            </div>
          </div>
          <div className="detail-scroll">
            <h2>{selected.name}</h2>
            <div className="detail-command">
              <span className="detail-label">Command</span>
              <div className="inline">
                <code className="trigger-badge">{selected.trigger}</code>
                <button
                  className={`enabled-label ${selected.enabled ? 'on' : ''}`}
                  onClick={() => toggle(selected, 'enabled')}
                  aria-label={`${selected.enabled ? 'Disable' : 'Enable'} ${selected.name}`}
                >
                  <span className={`status-dot ${selected.enabled ? '' : 'paused'}`} />
                  {selected.enabled ? 'Enabled' : 'Paused'}
                </button>
              </div>
            </div>
            <div className="detail-content-label">
              <span>Text to copy</span>
              {selected.sensitive && <LockKeyhole size={13} />}
            </div>
            {locked ? (
              <div className="locked-content">
                <LockKeyhole size={25} />
                <p>Unlock to view this snippet.</p>
                <Button variant="secondary" onClick={unlock}>
                  Unlock vault
                </Button>
              </div>
            ) : error ? (
              <p className="error" role="alert">
                {error}
              </p>
            ) : (
              <pre className="snippet-content" aria-label="Snippet text">
                {text ?? 'Loading…'}
              </pre>
            )}
          </div>
          <div className="detail-footer">
            <span>
              Edited{' '}
              {new Date(selected.updatedAt).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              })}
            </span>
            <Button
              disabled={copying}
              aria-label={`Copy ${selected.name}`}
              onClick={() => void copy()}
            >
              {copied === selected.id ? <Check size={15} /> : <Copy size={15} />}
              <span role="status">{copied === selected.id ? 'Copied' : 'Copy snippet'}</span>
            </Button>
          </div>
        </section>
      ) : (
        <section className="detail-empty">
          <Copy size={30} />
          <h2>{query ? 'No results' : 'Your snippets'}</h2>
          <p>{query ? 'Try another name or command.' : 'Create a snippet to get started.'}</p>
          {!query && (
            <Button onClick={create}>
              <Plus size={15} />
              New snippet
            </Button>
          )}
        </section>
      )}
    </div>
  )
}
