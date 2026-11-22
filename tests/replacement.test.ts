import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TriggerReplacement } from '../electron/main/triggers/replacement'
import { settingsSchema } from '../shared/contracts'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())
function setup() {
  const port = { keysReleased: vi.fn(() => true), backspace: vi.fn(), paste: vi.fn() }
  const replacement = new TriggerReplacement(port)
  const prepare = vi.fn(async () => {})
  return { port, replacement, prepare }
}

describe('typed text replacement', () => {
  it('defaults old settings to expansion and preserves explicit clipboard mode', () => {
    expect(settingsSchema.parse({ monitoring: true }).triggerAction).toBe('expand')
    expect(settingsSchema.parse({ triggerAction: 'copy' }).triggerAction).toBe('copy')
  })
  it('prepares clipboard before deleting exactly the ASCII trigger and pasting once', async () => {
    const { port, replacement, prepare } = setup()
    prepare.mockImplementation(async () => {
      expect(port.backspace).not.toHaveBeenCalled()
    })
    const result = replacement.replace(6, prepare)
    await vi.runAllTimersAsync()
    expect(await result).toBe(true)
    expect(prepare).toHaveBeenCalledOnce()
    expect(port.backspace).toHaveBeenCalledTimes(6)
    expect(port.paste).toHaveBeenCalledOnce()
  })
  it('waits for held keys to be released', async () => {
    const { port, replacement, prepare } = setup()
    port.keysReleased.mockReturnValue(false)
    const result = replacement.replace(2, prepare)
    await vi.advanceTimersByTimeAsync(200)
    expect(prepare).not.toHaveBeenCalled()
    port.keysReleased.mockReturnValue(true)
    await vi.runAllTimersAsync()
    expect(await result).toBe(true)
  })
  it.each(['input', 'cancel'] as const)(
    'cancels on %s without deleting or copying',
    async (method) => {
      const { port, replacement, prepare } = setup()
      const result = replacement.replace(2, prepare)
      replacement[method]()
      await vi.runAllTimersAsync()
      expect(await result).toBe(false)
      expect(prepare).not.toHaveBeenCalled()
      expect(port.backspace).not.toHaveBeenCalled()
    },
  )
  it('times out while a key is held without editing', async () => {
    const { port, replacement, prepare } = setup()
    port.keysReleased.mockReturnValue(false)
    const result = replacement.replace(2, prepare)
    await vi.runAllTimersAsync()
    expect(await result).toBe(false)
    expect(prepare).not.toHaveBeenCalled()
    expect(port.backspace).not.toHaveBeenCalled()
  })
  it('cancels if input changes during asynchronous clipboard preparation', async () => {
    const { port, replacement, prepare } = setup()
    prepare.mockImplementation(async () => {
      replacement.input()
    })
    const result = replacement.replace(2, prepare)
    await vi.runAllTimersAsync()
    expect(await result).toBe(false)
    expect(port.backspace).not.toHaveBeenCalled()
  })
  it('does not delete on clipboard failure and allows retry', async () => {
    const { port, replacement, prepare } = setup()
    prepare.mockRejectedValueOnce(new Error('clipboard unavailable'))
    const failed = expect(replacement.replace(2, prepare)).rejects.toThrow('clipboard unavailable')
    await vi.runAllTimersAsync()
    await failed
    expect(port.backspace).not.toHaveBeenCalled()
    const retry = replacement.replace(2, prepare)
    await vi.runAllTimersAsync()
    expect(await retry).toBe(true)
  })
  it('ignores injected events, blocks overlapping replacements, and resumes matching', async () => {
    const { port, replacement, prepare } = setup()
    port.backspace.mockImplementation(() => {
      expect(replacement.input()).toBe(false)
    })
    port.paste.mockImplementation(() => {
      expect(replacement.input()).toBe(false)
    })
    const result = replacement.replace(2, prepare)
    expect(await replacement.replace(2, prepare)).toBe(false)
    await vi.advanceTimersByTimeAsync(50)
    expect(replacement.input()).toBe(false)
    await vi.runAllTimersAsync()
    expect(await result).toBe(true)
    expect(replacement.input()).toBe(true)
  })
})
