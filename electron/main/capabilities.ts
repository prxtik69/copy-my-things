import { Notification } from 'electron'
import type { Capabilities, Capability } from '../../shared/contracts'
import type { KeyboardAdapter } from './triggers/adapters'
export function getCapabilities(
  adapter: KeyboardAdapter,
  shortcut: Capability,
  tray: boolean,
  startup: Capability,
): Capabilities {
  return {
    platform:
      process.platform === 'darwin' ? 'macOS' : process.platform === 'win32' ? 'Windows' : 'Linux',
    session:
      process.platform === 'linux'
        ? process.env.XDG_SESSION_TYPE ||
          (process.env.WAYLAND_DISPLAY ? 'wayland' : process.env.DISPLAY ? 'x11' : 'headless')
        : process.arch,
    clipboard: {
      available: true,
      detail: 'System clipboard for copying and typed-trigger expansion.',
    },
    notifications: {
      available: Notification.isSupported(),
      detail: Notification.isSupported()
        ? 'Native notifications available.'
        : 'Native notifications unavailable on this desktop.',
    },
    shortcut,
    monitoring: adapter.availability(),
    tray: {
      available: tray,
      detail: tray
        ? 'System tray created; desktop visibility depends on your shell.'
        : 'System tray unavailable. Closing the window quits the app.',
    },
    startup,
    permissions: process.platform === 'darwin' ? ['Accessibility', 'Input Monitoring'] : [],
  }
}
export const notificationsAvailable = (): boolean => Notification.isSupported()
