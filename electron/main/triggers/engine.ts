import { TriggerMatcher } from './matcher'
import type { KeyboardAdapter } from './adapters'
import type { Settings, Snippet } from '../../../shared/contracts'
export class TriggerEngine {
  private matcher = new TriggerMatcher()
  private active = false
  private inFlight = new Set<string>()
  private idle?: ReturnType<typeof setTimeout>
  constructor(
    private adapter: KeyboardAdapter,
    private activate: (id: string) => Promise<unknown>,
    private report: (message: string) => void,
  ) {}
  configure(snippets: Snippet[], settings: Settings): void {
    this.stop()
    this.matcher.configure(snippets, settings.prefix, settings.caseSensitive)
    if (!settings.monitoring) return
    if (!settings.usLayoutConfirmed)
      throw new Error('Confirm US QWERTY layout before enabling monitoring')
    this.adapter.start((key) => {
      clearTimeout(this.idle)
      const id = this.matcher.feed(key)
      this.idle = setTimeout(() => this.matcher.reset(), 2000)
      this.idle.unref?.()
      if (id && !this.inFlight.has(id)) {
        this.inFlight.add(id)
        this.activate(id)
          .catch(() => this.report('Could not copy snippet. Open the app to check its status.'))
          .finally(() => this.inFlight.delete(id))
      }
    })
    this.active = true
  }
  reset(): void {
    this.matcher.reset()
    clearTimeout(this.idle)
  }
  stop(): void {
    if (this.active) this.adapter.stop()
    this.active = false
    this.reset()
  }
}
