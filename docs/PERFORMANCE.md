# Development resource observations

These are observations, not resource guarantees or a benchmark. The Electron smoke test samples `app.getAppMetrics()` once with the management window and once 300 ms after its destruction. The sample followed several scrypt derivations and clipboard/vault operations, so it includes startup/KDF transients. Working-set sums can count shared pages multiple times and are not unique physical memory. CPU samples are short cumulative Electron samples, not a sustained idle study.

Observed on 2026-11-21, Linux x64 X11, Electron 45.4.1, development smoke test:

| Sample                              | Electron processes | Summed working set | Reported CPU |
| ----------------------------------- | -----------------: | -----------------: | -----------: |
| Library open after vault operations |                  4 |             649 MB |           0% |
| Management renderer destroyed       |                  3 |             543 MB |        0.34% |

This confirms renderer removal, not a low-memory target. Memory is higher than the intended lightweight goal, particularly around the memory-hard KDF; further sustained measurements and profiling are needed. No artificial Chromium memory flags or forced garbage collection were used.

The launcher loads its own React chunk and does not import management, editor, settings, vault UI, or Zod validation code. Windows are created on demand and destroyed on close. Background work uses native events and expiration/inactivity timers, without periodic network requests or polling loops.

To measure repeatably:

1. Run a production-mode local build with `bun run build` and `bun run start`.
2. Use a consistent desktop session, snippet count, and monitoring state. Allow startup activity to settle.
3. Use Settings → About → Measure now for an on-demand snapshot. Record its limitations; do not compare one sample to a different machine/session as if controlled.
4. Close management to tray and use the OS process monitor for a sustained background CPU/memory observation. Reopen the library afterward to check state.
5. Measure startup, shortcut-to-focused-launcher, and trigger-to-clipboard latency separately, with harmless content and explicit monitoring consent. These latency measurements have not yet been collected here.

Future targets are near-zero sustained idle CPU, quick startup/launcher activation, and lower background memory while preserving vault security and reliability. Windows/macOS resource behavior remains unmeasured.
