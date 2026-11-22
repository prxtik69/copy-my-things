export interface ReplacementPort {
  keysReleased(): boolean
  backspace(): void
  paste(): void
}

/** Never retain content here. Cancel before editing if the user moves on. */
export class TriggerReplacement {
  private revision = 0
  private busy = false
  private injecting = false

  constructor(private port: ReplacementPort) {}

  input(): boolean {
    if (this.injecting) return false
    this.cancel()
    return true
  }

  cancel(): void {
    this.revision++
  }

  async replace(length: number, prepareClipboard: () => Promise<void>): Promise<boolean> {
    if (this.busy) return false
    this.busy = true
    const revision = this.revision
    try {
      // The hook runs before the target processes the final character. Wait for
      // its key-up and a short settling interval, including released Shift.
      const deadline = Date.now() + 500
      let releasedAt: number | undefined
      while (true) {
        if (revision !== this.revision) return false
        if (this.port.keysReleased()) releasedAt ??= Date.now()
        else releasedAt = undefined
        if (releasedAt !== undefined && Date.now() - releasedAt >= 40) break
        if (Date.now() >= deadline) return false
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
      await prepareClipboard()
      if (revision !== this.revision || !this.port.keysReleased()) return false
      this.injecting = true
      for (let i = 0; i < length; i++) this.port.backspace()
      this.port.paste()
      return true
    } finally {
      // Native hook callbacks for injected keys arrive asynchronously. Keep
      // them out of the matcher until the output queue has drained.
      if (this.injecting) await new Promise((resolve) => setTimeout(resolve, 150))
      this.injecting = false
      this.busy = false
    }
  }
}
