# Copy My Things

A local-first desktop clipboard utility built with Electron, React, and TypeScript. Save text once, find it from a compact launcher, and reuse it wherever you work. Optional typed triggers replace the shortcut you type with its saved text. Choose **Copy to clipboard** in Settings → Triggers if you prefer to paste manually.

Expansion backspaces the trigger, then sends the app’s paste shortcut (⌘V on macOS, Ctrl+V on Windows/Linux). It supports Unicode and multiline values through the clipboard, which retains the inserted text; sensitive clipboard expiration still applies. Unlock sensitive snippets before typing their triggers. Locked triggers leave your text untouched and ask you to unlock and retry. Further keystrokes, mouse clicks, pausing monitoring, or opening the manager cancel a pending expansion before deletion. Trigger matching is disabled inside the manager and launcher; onboarding uses a local practice field.

Expansion requires native typed-trigger support on Windows, macOS (with permissions), or Linux X11. Wayland remains unsupported. The target must accept the standard paste shortcut; terminals using Ctrl+Shift+V and applications that block simulated input should use clipboard mode. Focus changes without input cannot always be detected, so finish typing in the same field. The app cannot confirm whether another application accepted a paste; use Undo and manual copy if the target rejects it.

A free, open-source desktop app for Windows, Linux, and macOS. Download installers from [GitHub Releases](https://github.com/prxtik69/copy-my-things/releases), or run it from source. There are no accounts, telemetry, remote fonts, or cloud services.

Release builds and signing setup are documented in [docs/RELEASING.md](docs/RELEASING.md).

## Run locally

Install [Bun](https://bun.sh/) 1.4+ and Node.js 22.12+ (Node 26 used for development), then:

```sh
bun install
bun run dev
```

For a production-mode local build:

```sh
bun run build
bun run start
```

Other commands:

```sh
bun run typecheck
bun run test
bun run test:watch
bun run test:electron
bun run test:electron:dev
bun run rebuild
```

`test:electron` opens real Electron windows in a temporary profile and tests SQLite, the sandboxed IPC bridge, clipboard access, vault access, launcher focus, and close-to-tray behavior. It does not turn on global keyboard monitoring. It requires a desktop display. It briefly uses the system clipboard; do not copy sensitive information during the test. The test restores the original clipboard text if its own test text is still present.

The launch wrapper clears `ELECTRON_RUN_AS_NODE`, which can be inherited from an editor host. It does not disable Chromium sandboxing. On Linux, Electron needs the normal desktop libraries (GTK, NSS, X11/Wayland, ALSA, GBM). Resolve missing libraries or your distribution's sandbox configuration instead of running the application as root or disabling sandboxing.

## Features

- SQLite-backed snippet creation, editing, deletion, duplication, categories, favorites, enable/disable, and fuzzy search.
- Compact library with system, light, and dark appearances, keyboard navigation, and accessible dialogs.
- Onboarding with harmless sample snippets.
- Quick Search in an independent, lazily loaded window; arrow keys navigate, Enter copies, Escape closes.
- Global manager shortcut with registration/conflict reporting and a tray fallback; Quick Search can be selected in Settings.
- Opt-in native typed-trigger adapter with a bounded, short-lived matcher; no keystroke logging.
- Exact matching, optional case-insensitive matching, duplicate/prefix-conflict detection, backspace, repeat suppression, shortcut/mouse reset, and idle reset.
- Prefix settings migrate existing triggers atomically.
- Background operation with no hidden management window, a single-instance lock, tray menu, pause/resume, and clean shutdown.
- Sensitive snippets encrypted using scrypt and AES-256-GCM. Vault setup, unlock, lock, inactivity timeout, screen-lock/suspend locking, and transactional password changes.
- Secret clipboard expiration defaults to 30 seconds; only unchanged text is cleared.
- Regular-snippet JSON import/export. Imports validate data, merge categories, skip duplicate/conflicting triggers, and never overwrite existing snippets. Secrets and their metadata are excluded from snippet exports.
- On-demand resource measurements in Settings; no polling loop.

## Shortcuts

| Action                  | Windows / Linux      | macOS                     |
| ----------------------- | -------------------- | ------------------------- |
| Open manager            | Ctrl + Shift + Space | Command + Shift + Space   |
| New snippet (library)   | Ctrl + N             | Command + N               |
| Search library          | Ctrl + K / Ctrl + F  | Command + K / Command + F |
| Select launcher result  | Up / Down            | Up / Down                 |
| Copy selected result    | Enter                | Enter                     |
| Dismiss launcher/dialog | Escape               | Escape                    |

Choose Manager or Quick Search and customize the global shortcut in Settings using Electron accelerator syntax, for example `Alt+Space`. A failed registration does not silently replace your previous working shortcut. You can always open Quick Search from the library or tray. Only enabled snippets appear in Quick Search; paused snippets can still be manually copied from the library.

## Platform status

| Platform                    | Clipboard / library / vault                        | Launcher and tray                                                                 | Typed triggers                                                                                                                                                  |
| --------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Linux X11 x64               | Electron smoke-tested on development machine       | Shortcut registered, launcher focus and close-to-tray tested                      | Native module loads in Electron; matching and adapter lifecycle tested with synthetic input. Live global detection still requires manual validation and opt-in. |
| Linux Wayland               | Designed to use Electron APIs; not manually tested | Depends on compositor/portal and tray shell support; registration result is shown | Deliberately unavailable; no security bypass or XWayland hook fallback                                                                                          |
| Windows 10/11               | Implemented, not tested here                       | Implemented, not tested here                                                      | Windows adapter implemented, not tested here                                                                                                                    |
| macOS Intel / Apple Silicon | Implemented, not tested here                       | Implemented, not tested here                                                      | macOS adapter implemented, not tested here; Accessibility and Input Monitoring permissions needed                                                               |

Typed monitoring is **off by default**. Enable it only in Settings after reading the privacy notice and acknowledging a **US QWERTY** layout. Physical keycodes do not reliably identify text on other layouts. Caps Lock must be off at startup. Pressing Caps Lock while monitoring pauses character matching until it is toggled back. IMEs, dead keys, non-US layouts, and automatic layout changes are unsupported; disable monitoring before using them. Secure fields cannot be reliably distinguished, so monitoring can observe keys typed in password fields. No exclusion claim is made.

The matcher keeps only a candidate of at most 64 characters, discards it after two seconds of inactivity, and clears it on activation, pause/stop, mouse clicks, keyboard shortcuts, and app focus where observable. Global focus changes without keyboard/mouse activity are not reliably detectable. No raw events are persisted or transmitted.

Launch at login is enabled by default on Windows, Linux, and macOS. Turn it off in Settings to remove this app's startup registration. Windows and packaged macOS builds use Electron login items; Linux uses `$XDG_CONFIG_HOME/autostart/copy-my-things.desktop` (falling back to `~/.config/autostart`), and macOS development builds use `~/Library/LaunchAgents/app.copy-my-things.plist`. Linux requires a desktop session that processes XDG autostart entries. Development registrations start the Electron executable with this project's absolute path and load the compiled app, so run `bun run build` at least once and retain the project and its dependencies. Packaged Linux AppImages register their persistent AppImage path. On the first upgrade, the previously unavailable Linux/development default is enabled; subsequent explicit opt-outs persist. Existing packaged Windows/macOS choices are preserved. Startup registration failures appear in Settings and can be retried by saving; Windows Startup apps or macOS Login Items may also require OS approval. Tray visibility on Linux depends on the desktop shell; a successfully created tray object does not guarantee a visible shell indicator. If tray creation fails, closing the management window quits. Turn off “Keep running when the window closes” to quit on close.

## Privacy and security

All privileged operations run in Electron's main process. Renderers are sandboxed, have no Node access, and use a narrow typed preload bridge. IPC validates method inputs, the originating window, its main frame, and its URL. Navigation, new windows, permissions, and application network requests are restricted. Development permits only the local Vite server. Production CSP disables network connections.

SQLite lives in Electron's per-user `userData` directory as `copy-my-things.sqlite`. Snippet names, triggers, category names, and flags are plaintext metadata. Ordinary snippet values are plaintext; mark a snippet Sensitive **before** entering a secret. Sensitive values are encrypted before database writes. Converting a previously regular snippet to sensitive cannot retract earlier plaintext from old backups, filesystem snapshots, or SQLite pages/WAL left from its regular life.

The vault derives a 256-bit key using Node's scrypt (`N=65536`, `r=8`, `p=1`, random 32-byte salt, 128 MiB memory limit). Each value uses a random 12-byte AES-256-GCM nonce, a 16-byte authentication tag, and its snippet ID as authenticated additional data. A separately authenticated verifier checks the password. Master passwords must contain at least 12 characters. Keys are cleared on lock; JavaScript strings and runtime-managed memory cannot be reliably zeroed. This is application-level protection, not protection against a compromised logged-in session, process debugger, malware, or a forensic memory capture. The vault has not received an independent cryptographic audit.

Sensitive content is absent from library snapshots, launcher results, event channels, and exports. Revealing it explicitly sends the selected plaintext value to the authorized editor; it remains only while editing and is discarded when the editor closes or vault locks. Copying a locked secret opens an authorization dialog; “Unlock and copy” authorizes that request. Cancel discards the pending copy. There is no password recovery or encrypted backup/restore yet.

Clipboard history and third-party clipboard managers can retain secrets after expiration. If another app copies identical text, its origin cannot be distinguished; expiration checks text equality. Quitting cancels expiration timers. OS clipboard access is not an atomic compare-and-clear operation, so another application's simultaneous writes cannot be completely guarded against. The app never records clipboard history.

## Architecture

- `electron/main`: lifecycle, SQLite repository, clipboard, vault, capabilities, typed-trigger engine/adapters, IPC validation.
- `electron/preload`: allowlisted typed bridge with disposable event subscriptions.
- `shared`: Zod contracts, metadata types, and fuzzy search.
- `src`: React management UI, lightweight launcher, settings, and shadcn-style Radix UI primitives.
- `tests`: OS-independent matcher, clipboard timing, storage, vault, and service tests.
- `resources`: local tray icon.

Database migration version 1 is transactional. Newer unknown database versions are rejected. Imports are transactional and limited to 20 MB, 10,000 snippets, and 1,000 categories. Snippet values may contain up to two million characters.

## Dependencies and compatibility

Versions are pinned by `bun.lock`. The initial implementation checked current npm stable versions, peer requirements, the Electron security guidance, and the upstream projects on 2026-11-21. The selected set includes Electron 45.4.1 (embedded Node 24.22.3), electron-vite 6, Vite 8, React 19.3, Tailwind 4, Zod 4, Vitest 5, better-sqlite3 13.2, and uiohook-napi 1.5.5.

better-sqlite3 13 uses Node-API prebuilds, so ABI-specific `electron-rebuild` is unnecessary for this selected version. Both Node and the actual Electron process loaded and queried the native module. `bun run rebuild` checks the installed SQLite binding; the Electron smoke test verifies the desktop runtime. Do not blindly apply this to older better-sqlite3 versions, which require ABI rebuilding. A missing prebuild on a different OS/architecture needs investigation rather than disabling persistence.

Upstream references:

- [Electron security](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron clipboard](https://www.electronjs.org/docs/latest/api/clipboard) — selected runtime has asynchronous text APIs
- [electron-vite](https://electron-vite.org/guide/)
- [Vite guide](https://vite.dev/guide/)
- [React](https://react.dev/)
- [Tailwind Vite integration](https://tailwindcss.com/docs/installation/using-vite)
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
- [uiohook-napi](https://github.com/SnosMe/uiohook-napi) — active, non-archived; upstream last push checked as 2026-03-21. Native module loading was tested; live cross-platform hooks were not.

Original code is MIT. Third-party licenses remain applicable; in particular, uiohook-napi's wrapper is MIT but its bundled libuiohook is **LGPL-3.0-or-later**. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md); future distribution must satisfy the native library's notices, source/relinking obligations, and all bundled dependency licenses. No claim is made that an eventual binary bundle is solely MIT.

## Validation and remaining work

See [docs/TESTING.md](docs/TESTING.md) for repeatable automated and platform-specific manual checks, and [docs/PERFORMANCE.md](docs/PERFORMANCE.md) for measured snapshots and their limitations.

Remaining work: live X11 native trigger validation, Windows/macOS testing including permissions and focus restoration, Wayland launcher testing across compositors, real login-cycle validation on each supported OS, independent security review, and encrypted backup/restore. A launcher closes to return focus through the window manager; restoring the exact previous application's focus is best effort.

Contributions are welcome; start with [CONTRIBUTING.md](CONTRIBUTING.md). Report security issues privately as described in [SECURITY.md](SECURITY.md).

### Interactive first run

Create a snippet, type its command in the practice field, paste the real clipboard value, and try the global manager shortcut. The tutorial uses the same trigger matcher as global monitoring and never enables the native hook. Progress resumes after reopening; replay is available in Settings and reuses the tutorial snippet. System-wide monitoring remains an explicit opt-in under Triggers.

The interface uses bundled Lexend fonts (SIL Open Font License; see `src/assets/fonts/OFL.txt`) and the supplied app logo assets. No font network request is needed. The macOS interface shows Command/Shift symbols; native window controls are provided by Electron on each platform.
