import { describe, it, expect } from 'vitest'
import { TriggerMatcher, validateTriggers } from '../electron/main/triggers/matcher'
const items = [
  { id: 'email', trigger: ';email', enabled: true },
  { id: 'off', trigger: ';phone', enabled: false },
]
function type(matcher: TriggerMatcher, text: string) {
  let result: string | undefined
  for (const ch of text) result = matcher.feed({ text: ch })
  return result
}
describe('trigger matcher', () => {
  it('activates an exact complete trigger once and resets', () => {
    const m = new TriggerMatcher()
    m.configure(items)
    expect(type(m, ';email')).toBe('email')
    expect(type(m, 'email')).toBeUndefined()
  })
  it('requires the configured prefix and ignores disabled snippets', () => {
    const m = new TriggerMatcher()
    m.configure(items)
    expect(type(m, 'email')).toBeUndefined()
    expect(type(m, ';phone')).toBeUndefined()
  })
  it('rejects duplicate and ambiguous triggers including disabled ones', () => {
    expect(() =>
      validateTriggers([...items, { id: 'a', trigger: ';email', enabled: true }], ';', true),
    ).toThrow('already')
    expect(() =>
      validateTriggers([...items, { id: 'a', trigger: ';emails', enabled: false }], ';', true),
    ).toThrow('prefixes')
    expect(() =>
      validateTriggers([{ id: 'a', trigger: 'email', enabled: true }], ';', true),
    ).toThrow('start')
  })
  it('handles case sensitivity and prevents case-folded duplicates', () => {
    const m = new TriggerMatcher()
    m.configure(items)
    expect(type(m, ';EMAIL')).toBeUndefined()
    m.configure(items, ';', false)
    expect(type(m, ';EMAIL')).toBe('email')
    expect(() =>
      validateTriggers([...items, { id: 'a', trigger: ';EMAIL', enabled: true }], ';', false),
    ).toThrow()
  })
  it('handles backspace, including correction of a typo', () => {
    const m = new TriggerMatcher()
    m.configure(items)
    type(m, ';emax')
    m.feed({ backspace: true })
    expect(type(m, 'il')).toBe('email')
  })
  it('ignores key repeat without adding repeated characters', () => {
    const m = new TriggerMatcher()
    m.configure(items)
    type(m, ';e')
    m.feed({ text: 'e', repeat: true })
    expect(type(m, 'mail')).toBe('email')
  })
  it('clears on shortcuts, focus resets, unknown input and idle', () => {
    for (const key of [{ modified: true }, { reset: true }, { text: 'あ' }]) {
      const m = new TriggerMatcher()
      m.configure(items)
      type(m, ';ema')
      m.feed(key)
      expect(type(m, 'il')).toBeUndefined()
    }
    const m = new TriggerMatcher()
    m.configure(items)
    m.feed({ text: ';' }, 100)
    expect(m.feed({ text: 'e' }, 3000)).toBeUndefined()
    expect(type(m, 'mail')).toBeUndefined()
  })
  it('supports multi-character prefixes and bounds irrelevant text', () => {
    const m = new TriggerMatcher('::')
    m.configure([{ id: 'a', trigger: '::test', enabled: true }])
    expect(type(m, 'x'.repeat(500) + '::test')).toBe('a')
  })
})
