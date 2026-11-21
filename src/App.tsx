import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Clipboard,
  Plus,
  Star,
  Settings2,
  Folder,
  ChevronRight,
  LockKeyhole,
  Pencil,
  Trash2,
  Circle,
  Keyboard,
  Check,
  X,
} from 'lucide-react'
import type { AppEvent, Category, Snippet, Snapshot } from '../shared/contracts'
import { api } from './api'
import { useSnapshot, useTheme } from './hooks'
import { searchSnippets } from '../shared/search'
import { Button } from './components/ui/button'
import { Dialog } from './components/ui/dialog'
import { SnippetEditor } from './SnippetEditor'
import { VaultDialog } from './VaultDialog'
import { Settings } from './Settings'
import { Library } from './Library'
import { Onboarding } from './Onboarding'
import { formatShortcut } from './platform'
import appIcon from '../resources/copy-my-things-logo-assets/copy-my-things-app-icon-128.png'

type Page = 'all' | 'vault' | 'favorites' | 'categories' | 'settings' | `category:${string}`
export function App() {
  const [page, setPage] = useState<Page>(location.hash === '#settings' ? 'settings' : 'all'),
    [query, setQuery] = useState('')
  const [replayTutorial, setReplayTutorial] = useState(false)
  const [editor, setEditor] = useState<Snippet | null | undefined>(undefined),
    [vaultOpen, setVaultOpen] = useState(false)
  const [toast, setToast] = useState<{ message: string; error: boolean }>(),
    [confirm, setConfirm] = useState<{
      title: string
      description: string
      action: () => Promise<unknown>
    }>()
  const [categoryEditor, setCategoryEditor] = useState<Category | null | undefined>(undefined),
    [categoryName, setCategoryName] = useState(''),
    [categoryError, setCategoryError] = useState(''),
    [busy, setBusy] = useState(false)
  const search = useRef<HTMLInputElement>(null)
  const notify = useCallback((message: string, error = false) => setToast({ message, error }), [])
  const onEvent = useCallback(
    (event: AppEvent) => {
      if (event.type === 'feedback') notify(event.message, event.error)
      if (event.type === 'shortcut-activated' && event.action === 'manager') {
        setPage('all')
        setQuery('')
        requestAnimationFrame(() => {
          if (!document.querySelector('[role="dialog"]')) search.current?.focus()
        })
      }
      if (event.type === 'unlock-required') setVaultOpen(true)
    },
    [notify],
  )
  const { snapshot, error } = useSnapshot(onEvent)
  useTheme(snapshot?.settings.theme)
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(undefined), 4000)
    return () => clearTimeout(timer)
  }, [toast])
  useEffect(() => {
    const hash = () => {
      if (location.hash === '#settings') setPage('settings')
      else if (location.hash === '#manager') {
        setPage('all')
        setQuery('')
      }
    }
    addEventListener('hashchange', hash)
    return () => removeEventListener('hashchange', hash)
  }, [])
  useEffect(() => {
    const shortcut = (e: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"]')) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        setEditor(null)
      }
      if ((e.ctrlKey || e.metaKey) && ['f', 'k'].includes(e.key.toLowerCase())) {
        e.preventDefault()
        search.current?.focus()
      }
    }
    addEventListener('keydown', shortcut)
    return () => removeEventListener('keydown', shortcut)
  }, [])
  useEffect(() => {
    if (snapshot?.pendingUnlock && !snapshot.vault.unlocked) setVaultOpen(true)
  }, [snapshot?.pendingUnlock, snapshot?.vault.unlocked])
  useEffect(() => {
    if (!snapshot?.vault.unlocked && editor?.sensitive) setEditor(undefined)
  }, [snapshot?.vault.unlocked])
  async function act(action: () => Promise<unknown>) {
    try {
      await action()
    } catch (e) {
      notify((e as Error).message, true)
    }
  }
  function navigate(next: Page) {
    setPage(next)
    setQuery('')
    if (location.hash) history.replaceState(null, '', location.pathname + location.search)
  }
  async function edit(snippet: Snippet) {
    if (snippet.sensitive && !snapshot?.vault.unlocked) {
      setVaultOpen(true)
      notify('Unlock the vault, then open the snippet again')
      return
    }
    setEditor(snippet)
  }
  async function toggle(snippet: Snippet, key: 'favorite' | 'enabled') {
    if (snippet.sensitive && !snapshot?.vault.unlocked) {
      setVaultOpen(true)
      return
    }
    const { createdAt: _c, updatedAt: _u, ...input } = snippet
    await act(() => api.request('snippet:save', { ...input, [key]: !input[key] }))
  }
  if (!snapshot)
    return (
      <div className="fatal">
        <img className="tutorial-logo" src={appIcon} alt="" />
        <h1>Copy My Things</h1>
        <p role={error ? 'alert' : undefined}>{error || 'Opening your local library…'}</p>
        {error && <Button onClick={() => location.reload()}>Try again</Button>}
      </div>
    )
  const category = page.startsWith('category:')
    ? snapshot.categories.find((c) => c.id === page.slice(9))
    : undefined
  const title =
    page === 'all'
      ? 'All snippets'
      : page === 'vault'
        ? 'Vault'
        : page === 'favorites'
          ? 'Favorites'
          : page === 'categories'
            ? 'Categories'
            : page === 'settings'
              ? 'Settings'
              : (category?.name ?? 'Category')
  const filtered = searchSnippets(
    snapshot.snippets.filter((s) =>
      page === 'favorites'
        ? s.favorite
        : page === 'vault'
          ? s.sensitive
          : category
            ? s.categoryId === category.id
            : true,
    ),
    snapshot.categories,
    query,
  )
  const shortcut = formatShortcut(
    snapshot.settings.shortcut,
    snapshot.capabilities.platform === 'macOS',
  )
  const openCategory = (category: Category | null) => {
    setCategoryEditor(category)
    setCategoryName(category?.name ?? '')
    setCategoryError('')
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-logo" src={appIcon} alt="" />
          <span>Copy My Things</span>
        </div>
        <Button className="new-snippet" onClick={() => setEditor(null)}>
          <Plus size={16} />
          New snippet<kbd>{snapshot.capabilities.platform === 'macOS' ? '⌘' : 'Ctrl'} N</kbd>
        </Button>
        <div className="nav-label">LIBRARY</div>
        <nav aria-label="Library navigation">
          <button className={page === 'all' ? 'active' : ''} onClick={() => navigate('all')}>
            <Clipboard size={17} />
            All snippets<span>{snapshot.snippets.length}</span>
          </button>
          <button
            className={page === 'favorites' ? 'active' : ''}
            onClick={() => navigate('favorites')}
          >
            <Star size={17} />
            Favorites<span>{snapshot.snippets.filter((s) => s.favorite).length}</span>
          </button>
          <button className={page === 'vault' ? 'active' : ''} onClick={() => navigate('vault')}>
            <LockKeyhole size={17} />
            Vault<span>{snapshot.snippets.filter((s) => s.sensitive).length}</span>
          </button>
          <button
            className={page === 'categories' ? 'active' : ''}
            onClick={() => navigate('categories')}
          >
            <Folder size={17} />
            Categories
            <ChevronRight size={14} className="nav-end" />
          </button>
        </nav>
        <div className="nav-label category-label">
          CATEGORIES
          <button aria-label="Add category" onClick={() => openCategory(null)}>
            <Plus size={14} />
          </button>
        </div>
        <nav className="category-nav" aria-label="Categories">
          {snapshot.categories.map((c) => (
            <button
              key={c.id}
              className={category?.id === c.id ? 'active' : ''}
              onClick={() => navigate(`category:${c.id}`)}
            >
              <span className="category-dot" />
              {c.name}
              <span>{snapshot.snippets.filter((s) => s.categoryId === c.id).length}</span>
            </button>
          ))}
          {!snapshot.categories.length && <span className="nav-empty">No categories</span>}
        </nav>
        <div className="sidebar-bottom">
          <button
            className={`settings-nav ${page === 'settings' ? 'active' : ''}`}
            onClick={() => navigate('settings')}
          >
            <Settings2 size={17} />
            Settings
          </button>
          <div className="local-status">
            <span className="status-dot" />v{snapshot.version}
          </div>
        </div>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            Library
            <ChevronRight size={13} />
            <strong>{title}</strong>
          </div>
          <div className="topbar-actions">
            <button
              className={`vault-status ${snapshot.vault.unlocked ? 'unlocked' : ''}`}
              onClick={() =>
                snapshot.vault.unlocked
                  ? void act(() => api.request('vault:lock', undefined))
                  : setVaultOpen(true)
              }
            >
              <LockKeyhole size={13} />
              {snapshot.vault.unlocked
                ? 'Vault unlocked'
                : snapshot.vault.initialized
                  ? 'Vault locked'
                  : 'Set up vault'}
            </button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Open Quick Search"
              onClick={() => void act(() => api.request('window:launcher', undefined))}
            >
              <Keyboard size={17} />
            </Button>
          </div>
        </header>
        {['settings', 'categories'].includes(page) && (
          <div className="page-heading">
            <h1>{title}</h1>
            {page === 'categories' && (
              <Button onClick={() => openCategory(null)}>
                <Plus size={15} />
                New category
              </Button>
            )}
          </div>
        )}
        <div
          className={`page-scroll ${!['settings', 'categories'].includes(page) ? 'library-page' : ''}`}
        >
          {page === 'settings' ? (
            <Settings
              snapshot={snapshot}
              unlock={() => setVaultOpen(true)}
              toast={notify}
              replay={() => {
                try {
                  localStorage.removeItem('cmt-tutorial')
                } catch {}
                setReplayTutorial(true)
              }}
            />
          ) : page === 'categories' ? (
            <div className="categories-page">
              {snapshot.categories.length ? (
                snapshot.categories.map((c) => (
                  <div className="category-row" key={c.id}>
                    <Folder size={18} />
                    <button className="category-title" onClick={() => navigate(`category:${c.id}`)}>
                      {c.name}
                      <small>
                        {snapshot.snippets.filter((s) => s.categoryId === c.id).length} snippets
                      </small>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Rename ${c.name}`}
                      onClick={() => openCategory(c)}
                    >
                      <Pencil size={15} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${c.name}`}
                      onClick={() =>
                        setConfirm({
                          title: `Delete ${c.name}?`,
                          description:
                            'Its snippets will become uncategorized. The snippets themselves will be kept.',
                          action: () => api.request('category:delete', c.id),
                        })
                      }
                    >
                      <Trash2 size={15} />
                    </Button>
                  </div>
                ))
              ) : (
                <div className="empty">
                  <Folder size={32} />
                  <h2>No categories yet</h2>
                  <p>Create a category to organize your snippets.</p>
                  <Button onClick={() => openCategory(null)}>
                    <Plus size={15} />
                    Create a category
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <Library
              snapshot={snapshot}
              snippets={filtered}
              title={title}
              query={query}
              setQuery={setQuery}
              search={search}
              create={() => setEditor(null)}
              edit={(s) => void edit(s)}
              toggle={(s, key) => void toggle(s, key)}
              unlock={() => setVaultOpen(true)}
              toast={notify}
              remove={(snippet) =>
                setConfirm({
                  title: `Delete ${snippet.name}?`,
                  description: 'This permanently removes the snippet.',
                  action: () => api.request('snippet:delete', snippet.id),
                })
              }
            />
          )}
        </div>
        <footer className="app-footer">
          <button onClick={() => navigate('settings')}>
            <span className={`status-dot ${snapshot.settings.monitoring ? '' : 'paused'}`} />
            {snapshot.settings.monitoring ? 'Typed triggers active' : 'Typed triggers paused'}
          </button>
          <span>
            Open {snapshot.settings.shortcutAction === 'manager' ? 'manager' : 'Quick Search'}{' '}
            <kbd>{shortcut}</kbd>
          </span>
        </footer>
      </main>
      {toast && (
        <div
          className={`toast ${toast.error ? 'toast-error' : ''}`}
          role={toast.error ? 'alert' : 'status'}
        >
          {toast.error ? <InfoIcon /> : <Check size={16} />}
          <span>{toast.message}</span>
          <button aria-label="Dismiss message" onClick={() => setToast(undefined)}>
            <X size={14} />
          </button>
        </div>
      )}
      {editor !== undefined && (
        <SnippetEditor
          snippet={editor}
          snapshot={snapshot}
          close={() => setEditor(undefined)}
          onSaved={() => notify(editor ? 'Snippet updated' : 'Snippet created')}
          unlock={() => setVaultOpen(true)}
        />
      )}
      {vaultOpen && (
        <VaultDialog
          initialized={snapshot.vault.initialized}
          pendingCopy={!!snapshot.pendingUnlock}
          close={() => {
            setVaultOpen(false)
            void act(() => api.request('vault:cancel', undefined))
          }}
        />
      )}
      <Dialog
        open={!!confirm}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirm(undefined)
        }}
        title={confirm?.title ?? 'Confirm'}
        description={confirm?.description}
      >
        <div className="dialog-actions">
          <Button variant="ghost" disabled={busy} onClick={() => setConfirm(undefined)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={async () => {
              if (!confirm) return
              setBusy(true)
              try {
                await confirm.action()
                setConfirm(undefined)
                notify('Deleted')
              } catch (e) {
                notify((e as Error).message, true)
              } finally {
                setBusy(false)
              }
            }}
          >
            Delete
          </Button>
        </div>
      </Dialog>
      <Dialog
        open={categoryEditor !== undefined}
        onOpenChange={(open) => {
          if (!open) setCategoryEditor(undefined)
        }}
        title={categoryEditor ? 'Rename category' : 'New category'}
      >
        <form
          className="editor-form"
          onSubmit={async (e) => {
            e.preventDefault()
            setBusy(true)
            try {
              await api.request('category:save', { id: categoryEditor?.id, name: categoryName })
              setCategoryEditor(undefined)
              notify('Category saved')
            } catch (e) {
              setCategoryError((e as Error).message)
            } finally {
              setBusy(false)
            }
          }}
        >
          <div className="field">
            <label htmlFor="category-name">Category name</label>
            <input
              autoFocus
              id="category-name"
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
              required
              maxLength={80}
            />
            {categoryError && <small className="error">{categoryError}</small>}
          </div>
          <div className="dialog-actions">
            <Button type="button" variant="ghost" onClick={() => setCategoryEditor(undefined)}>
              Cancel
            </Button>
            <Button disabled={busy}>Save category</Button>
          </div>
        </form>
      </Dialog>
      {(!snapshot.settings.onboardingDone || replayTutorial) && (
        <Onboarding
          snapshot={snapshot}
          done={() => {
            setReplayTutorial(false)
            navigate('all')
          }}
          settings={() => {
            setReplayTutorial(false)
            navigate('settings')
          }}
          toast={notify}
        />
      )}
    </div>
  )
}
function InfoIcon() {
  return <Circle size={16} />
}
