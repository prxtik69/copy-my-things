import { createHash } from 'node:crypto'
export interface ClipboardPort {
  writeText(text: string): void | Promise<void>
  readText(): string | Promise<string>
  clear(): void
}
const digest = (value: string): string => createHash('sha256').update(value).digest('hex')
export class ClipboardService {
  private timer?: ReturnType<typeof setTimeout>
  private queue: Promise<unknown> = Promise.resolve()
  private generation = 0
  private disposed = false
  constructor(
    private clipboard: ClipboardPort,
    private onError: () => void = () => {},
  ) {}
  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation)
    this.queue = result.catch(() => {})
    return result
  }
  copy(text: string, sensitive: boolean, seconds: number): Promise<void> {
    return this.serial(async () => {
      await this.clipboard.writeText(text)
      clearTimeout(this.timer)
      const generation = ++this.generation
      if (sensitive && seconds > 0 && !this.disposed) {
        const fingerprint = digest(text)
        this.timer = setTimeout(() => {
          void this.serial(async () => {
            if (generation !== this.generation || this.disposed) return
            const current = await this.clipboard.readText()
            if (generation === this.generation && !this.disposed && digest(current) === fingerprint)
              this.clipboard.clear()
          }).catch(this.onError)
        }, seconds * 1000)
        this.timer.unref?.()
      }
    })
  }
  dispose(): void {
    this.disposed = true
    this.generation++
    clearTimeout(this.timer)
  }
}
