import React from 'react'
import { createRoot } from 'react-dom/client'
import './styles/globals.css'
import { api } from './api'
const Surface = React.lazy(() =>
  location.hash === '#launcher'
    ? import('./Launcher').then((m) => ({ default: m.Launcher }))
    : import('./App').then((m) => ({ default: m.App })),
)
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? (
      <div className="fatal">
        <h1>Something went wrong</h1>
        <p>Close and reopen Copy My Things. Your saved snippets remain on disk.</p>
        <button onClick={() => location.reload()}>Reload window</button>
      </div>
    ) : (
      this.props.children
    )
  }
}
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      {api ? (
        <React.Suspense fallback={<div className="fatal">Opening your library…</div>}>
          <Surface />
        </React.Suspense>
      ) : (
        <div className="fatal">
          Open this application through Electron using <code>bun run dev</code>.
        </div>
      )}
    </ErrorBoundary>
  </React.StrictMode>,
)
