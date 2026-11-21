export interface TriggerItem {
  id: string
  trigger: string
  enabled: boolean
}
export interface KeyInput {
  text?: string
  backspace?: boolean
  reset?: boolean
  repeat?: boolean
  modified?: boolean
}
export function validateTriggers(
  items: TriggerItem[],
  prefix: string,
  caseSensitive: boolean,
): void {
  const normalized = items.map((item) =>
    caseSensitive ? item.trigger : item.trigger.toLowerCase(),
  )
  for (let i = 0; i < items.length; i++) {
    if (items[i].trigger.length > 64)
      throw new Error(
        'Triggers cannot exceed 64 characters; shorten them before changing the prefix',
      )
    if (!items[i].trigger.startsWith(prefix) || items[i].trigger.length <= prefix.length)
      throw new Error(`Trigger must start with ${prefix} and include a name`)
    for (let j = 0; j < i; j++) {
      if (normalized[i] === normalized[j]) throw new Error('This trigger is already in use')
      if (normalized[i].startsWith(normalized[j]) || normalized[j].startsWith(normalized[i]))
        throw new Error('Triggers cannot be prefixes of one another')
    }
  }
}
/** No input history: only a bounded candidate, cleared after 2s, shortcuts, or activation. */
export class TriggerMatcher {
  private buffer = ''
  private lastAt = 0
  private items: TriggerItem[] = []
  constructor(
    private prefix = ';',
    private caseSensitive = true,
  ) {}
  configure(items: TriggerItem[], prefix = this.prefix, caseSensitive = this.caseSensitive): void {
    validateTriggers(items, prefix, caseSensitive)
    this.items = items.filter((s) => s.enabled)
    this.prefix = prefix
    this.caseSensitive = caseSensitive
    this.reset()
  }
  reset(): void {
    this.buffer = ''
    this.lastAt = 0
  }
  feed(key: KeyInput, now = Date.now()): string | undefined {
    if (key.reset || key.modified) {
      this.reset()
      return
    }
    if (key.repeat) return
    if (now - this.lastAt > 2000) this.buffer = ''
    this.lastAt = now
    if (key.backspace) {
      this.buffer = this.buffer.slice(0, -1)
      return
    }
    if (!key.text || key.text.length !== 1 || !/^[\x21-\x7e]$/.test(key.text)) {
      this.reset()
      return
    }
    this.buffer = (this.buffer + key.text).slice(-64)
    const normalize = (s: string): string => (this.caseSensitive ? s : s.toLowerCase())
    const value = normalize(this.buffer)
    const match = this.items.find((item) => value.endsWith(normalize(item.trigger)))
    if (match) {
      this.reset()
      return match.id
    }
    // Keep a bounded candidate even after a typo so Backspace can repair it.
    const prefixIndex = this.buffer.indexOf(this.prefix)
    if (prefixIndex >= 0) {
      this.buffer = this.buffer.slice(prefixIndex)
      return
    }
    for (let length = Math.min(this.prefix.length - 1, this.buffer.length); length > 0; length--) {
      if (this.prefix.startsWith(this.buffer.slice(-length))) {
        this.buffer = this.buffer.slice(-length)
        return
      }
    }
    this.buffer = ''
  }
}
