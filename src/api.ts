import type { Bridge } from '../shared/contracts'
declare global {
  interface Window {
    copyMyThings: Bridge
  }
}
export const api = window.copyMyThings
