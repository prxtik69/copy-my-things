import { contextBridge, ipcRenderer } from 'electron'
import type { Bridge, AppEvent, Result } from '../../shared/contracts'
const methods = new Set([
  'snapshot',
  'snippet:save',
  'snippet:delete',
  'snippet:duplicate',
  'snippet:copy',
  'snippet:content',
  'category:save',
  'category:delete',
  'settings:save',
  'settings:reset',
  'vault:setup',
  'vault:unlock',
  'vault:lock',
  'vault:cancel',
  'vault:password',
  'data:export',
  'data:import',
  'window:hide',
  'window:main',
  'window:settings',
  'window:launcher',
  'app:quit',
  'permissions:open',
  'app:metrics',
])
const bridge: Bridge = {
  async request(method, input) {
    if (!methods.has(method)) throw new Error('Unknown operation')
    const result: Result<never> = await ipcRenderer.invoke('cmt:request', method, input)
    if (!result.ok) throw new Error(result.error)
    return result.value
  },
  subscribe(listener) {
    const handler = (_event: Electron.IpcRendererEvent, event: AppEvent): void => listener(event)
    ipcRenderer.on('cmt:event', handler)
    return () => {
      ipcRenderer.removeListener('cmt:event', handler)
    }
  },
}
contextBridge.exposeInMainWorld('copyMyThings', bridge)
