import { describe, it, expect, vi } from 'vitest'
import { TriggerEngine } from '../electron/main/triggers/engine'
import type { KeyboardAdapter } from '../electron/main/triggers/adapters'
import type { KeyInput } from '../electron/main/triggers/matcher'
import { defaults, type Snippet } from '../shared/contracts'
import { searchSnippets } from '../shared/search'
const snippet: Snippet = {
  id: 'one',
  name: 'Example email',
  trigger: ';email',
  categoryId: null,
  sensitive: false,
  enabled: true,
  favorite: false,
  createdAt: '',
  updatedAt: '',
}
describe('trigger service and search', () => {
  it('never starts monitoring without opt-in and clears on stop', async () => {
    let consume: (key: KeyInput) => void = () => {}
    const adapter: KeyboardAdapter = {
      availability: () => ({ available: true, detail: 'test adapter' }),
      start: vi.fn((listener) => {
        consume = listener
      }),
      stop: vi.fn(),
    }
    const activate = vi.fn(async () => {}),
      engine = new TriggerEngine(adapter, activate, vi.fn())
    engine.configure([snippet], defaults)
    expect(adapter.start).not.toHaveBeenCalled()
    expect(() => engine.configure([snippet], { ...defaults, monitoring: true })).toThrow('Confirm')
    engine.configure([snippet], { ...defaults, monitoring: true, usLayoutConfirmed: true })
    for (const text of ';email') consume({ text })
    await Promise.resolve()
    expect(activate).toHaveBeenCalledWith('one')
    engine.stop()
    expect(adapter.stop).toHaveBeenCalledOnce()
  })
  it('matches names, triggers and fuzzy subsequences without searching values', () => {
    expect(searchSnippets([snippet], [], 'exeml')[0]).toBe(snippet)
    expect(searchSnippets([snippet], [], ';email')[0]).toBe(snippet)
    expect(searchSnippets([snippet], [], 'unknown')).toEqual([])
  })
})
