import { useEffect, useState } from 'react'
import type { Snapshot, Settings } from '../shared/contracts'
import { api } from './api'
export function useSnapshot(onEvent?: Parameters<typeof api.subscribe>[0]) {
  const [snapshot, setSnapshot] = useState<Snapshot>()
  const [error, setError] = useState('')
  useEffect(() => {
    let live = true
    const refresh = () =>
      api
        .request('snapshot', undefined)
        .then((s) => {
          if (live) setSnapshot(s)
        })
        .catch((e) => {
          if (live) setError(e.message)
        })
    const unsubscribe = api.subscribe((event) => {
      if (event.type === 'changed') void refresh()
      onEvent?.(event)
    })
    void refresh()
    return () => {
      live = false
      unsubscribe()
    }
  }, [onEvent])
  return { snapshot, error }
}
export function useTheme(theme: Settings['theme'] | undefined): void {
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      document.documentElement.dataset.theme =
        theme === 'system' || !theme ? (media.matches ? 'dark' : 'light') : theme
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])
}
