import { describe, it, expect, vi, afterEach } from 'vitest'
import { ClipboardService } from '../electron/main/clipboard/service'
afterEach(() => vi.useRealTimers())
function setup() {
  let text = ''
  const clear = vi.fn(() => {
    text = ''
  })
  const service = new ClipboardService({
    writeText: async (t) => {
      text = t
    },
    readText: async () => text,
    clear,
  })
  return {
    service,
    clear,
    get: () => text,
    manual: (t: string) => {
      text = t
    },
  }
}
describe('clipboard expiration', () => {
  it('clears unchanged secrets at the deadline', async () => {
    vi.useFakeTimers()
    const s = setup()
    await s.service.copy('secret', true, 30)
    await vi.advanceTimersByTimeAsync(29_999)
    expect(s.get()).toBe('secret')
    await vi.advanceTimersByTimeAsync(1)
    expect(s.get()).toBe('')
    s.service.dispose()
  })
  it('preserves text copied later by another app', async () => {
    vi.useFakeTimers()
    const s = setup()
    await s.service.copy('secret', true, 30)
    s.manual('other')
    await vi.advanceTimersByTimeAsync(30_000)
    expect(s.get()).toBe('other')
    expect(s.clear).not.toHaveBeenCalled()
    s.service.dispose()
  })
  it('cancels earlier expiration when copying another snippet', async () => {
    vi.useFakeTimers()
    const s = setup()
    await s.service.copy('secret', true, 30)
    await s.service.copy('ordinary', false, 30)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(s.get()).toBe('ordinary')
    s.service.dispose()
  })
  it('supports disabled expiration and propagates write errors', async () => {
    vi.useFakeTimers()
    const s = setup()
    await s.service.copy('secret', true, 0)
    await vi.advanceTimersByTimeAsync(100_000)
    expect(s.get()).toBe('secret')
    s.service.dispose()
    const bad = new ClipboardService({
      writeText: async () => {
        throw new Error('denied')
      },
      readText: () => '',
      clear() {},
    })
    await expect(bad.copy('text', false, 30)).rejects.toThrow('denied')
  })
  it('serializes asynchronous writes and retires pending timers on shutdown', async () => {
    vi.useFakeTimers()
    const s = setup()
    await Promise.all([s.service.copy('first', true, 1), s.service.copy('second', true, 2)])
    await vi.advanceTimersByTimeAsync(1000)
    expect(s.get()).toBe('second')
    s.service.dispose()
    await vi.advanceTimersByTimeAsync(5000)
    expect(s.get()).toBe('second')
  })
})
