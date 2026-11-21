# Testing

## Automated checks

`bun run test` uses Vitest under Node and temporary SQLite databases. It covers exact/prefix/case matching, duplicate and prefix collisions, disabled triggers, backspace typo correction, repeats, timeout/reset, synthetic adapter opt-in/lifecycle, fuzzy search, asynchronous clipboard expiration, clipboard replacement preservation, CRUD, categories, duplication, prefix migration, import conflicts, settings persistence, on-disk encryption, locked vault access, incorrect passwords, ciphertext tampering, password rotation, and auto-lock renewal.

`bun run test:electron` builds and launches Electron with an isolated temporary userData directory. It checks native SQLite and keyboard-module loading, sandbox/preload bridge availability, regular and sensitive clipboard operations, denied locked reads, IPC allowlisting, launcher input focus, tray creation, global shortcut registration, and destroying the management renderer while SQLite stays available. The smoke run never starts the native keyboard hook. It emits an `ELECTRON_SMOKE_PASS` record containing actual capabilities and resource snapshots. It captures library screenshots under its temporary profile for local visual review. Test profiles contain only harmless values and may be removed afterward.

## Development verification performed

On 2026-11-21, Linux x64 / X11, Electron 45.4.1 (Node 24.22.3), host Node 26.13.0 and Bun 1.4.4:

- Strict TypeScript check and production build passed.
- Vitest suite passed (see command output for current count).
- Electron smoke test passed, including clipboard, encrypted vault, quick launcher focus, shortcut registration, tray creation, and close-to-tray destruction.
- The native uiohook-napi module loaded in both Node and Electron. Monitoring stayed disabled.
- Actual library UI was visually inspected in the Electron capture.
- MESA/portal diagnostic messages were emitted by the host desktop; they did not prevent these checks from passing.

No Windows, macOS, live X11 hook, or Wayland end-to-end test is claimed.

## Manual common checklist

Use harmless values and a temporary profile. Do not use a real token during keyboard or clipboard testing.

1. First launch: complete onboarding, inspect examples, create `;email` with a harmless address, edit it, duplicate it, search it, favorite it, and move it into a renamed category. Delete a category and confirm the snippets remain uncategorized. Confirm destructive prompts can be canceled.
2. Quit and reopen. Check snippets, preferences, and categories persist; vault starts locked. Closing the management window should destroy it and preserve background operation when tray support is available. Test actual Quit and a second application launch.
3. Test multiline/large ordinary text with manual copy and paste. Type a trigger and confirm the app does not paste, erase, or replace text.
4. Use the global shortcut to open the manager. Select Quick Search as the shortcut target in Settings and test it again; also open Quick Search from the tray and main window. Search by trigger/name/category, use arrows/Enter, Escape, and mouse selection. Confirm sensitive values never appear. Confirm another app regains focus where supported. Reserve a conflicting shortcut externally and verify a failed preference change leaves the previous shortcut working.
5. Create a vault with a disposable password. Save a harmless sensitive value. Lock it and verify copying opens authorization, Cancel copies nothing, and Unlock and copy copies only the requested snippet. Verify reveal authorization, masking, manual lock, auto-lock, screen lock, suspend, password change, and restart.
6. Set clipboard expiration to one second. Copy a sensitive value and wait for it to clear. Copy a different value in another app before expiration and confirm it remains. Test expiration disabled. Clipboard history may retain the earlier value; that is an OS limitation.
7. Export regular snippets. Inspect the JSON: no sensitive snippet names, triggers, or values should be present. Import it twice; confirm conflicts are skipped and existing content is untouched. Test invalid, oversized, and wrongly prefixed JSON. Imported categories merge by name.
8. Test system/light/dark appearance, tab focus, input validation, password-manager paste, and a smaller supported window. All controls should have labels and clear disabled explanations.
9. In Settings, explicitly opt in to US QWERTY monitoring only on a supported desktop. Use harmless text in another app: full match, incorrect prefix, case sensitivity, disabled snippet, Backspace correction, held-key repeat, mouse click, Ctrl/Command shortcuts, and idle timeout. Pause and confirm no trigger activation. Close the management window and repeat with the tray running.
10. Turn monitoring off before changing layouts, enabling an IME, or entering sensitive information. Do not assume password fields are excluded. Caps Lock must be off when monitoring starts.

## Windows 10 / 11

Test on a normal user account without elevation. Check clipboard and global shortcut conflicts, tray menu/window lifecycle, native x64/ARM64 dependency loading where applicable, US QWERTY monitoring after consent, and focus return. Verify launch at login is enabled for a new profile, then sign out/in and confirm the app opens. Turn it off, restart the app, and repeat sign-in to confirm the opt-out persists. Check Windows Startup apps reports this app; an OS-disabled entry must produce an actionable error instead of silently claiming success. Repeat with paths containing spaces and with a packaged executable when available. Repeat screen-lock/suspend tests.

## Linux X11

Check the actual session type rather than assuming DISPLAY implies X11. Verify desktop tray visibility (some shells need an indicator extension), ordinary-user native hook loading, global shortcuts, clipboard manager interactions, and the common monitoring checklist. Never collect raw key traces. The smoke test verifies module loading but does not constitute live hook validation.

## Linux Wayland

Verify Settings reports typed monitoring unavailable even when XWayland exposes DISPLAY. There must be no fallback hook that bypasses the compositor. Test the launcher shortcut via the compositor/portal; if rejected, check truthful conflict feedback and tray/library fallback. Test GNOME/KDE tray variations and clipboard behavior. Verify the XDG autostart entry and sign-in behavior using the Linux startup checklist below.

## macOS Intel / Apple Silicon

Test the native prebuild matching the architecture and Command+Shift+Space. Before granting permissions, verify monitoring stays off and Settings explains Accessibility/Input Monitoring. Enable only through explicit opt-in; grant access to the actual Electron development executable, restart as needed, and repeat the US QWERTY checklist. Revoke permissions while running and inspect behavior. Check secure-input limitations without entering any real secret. Test menu-bar/tray behavior, Dock activation, closing and reopening the management window, and focus return.

The Electron smoke test also walks through onboarding: creates a real snippet, reloads to check progress, types its command using Electron key events, checks the OS clipboard, rejects an incorrect paste, accepts the correct native paste, and invokes the registered shortcut handler to verify manager routing. This handler check does not claim an OS-level shortcut keystroke was delivered. It confirms that onboarding leaves global monitoring disabled.

## Launch at login

Automated unit tests cover Linux registration/removal, XDG paths, AppImage commands, Desktop Entry escaping, macOS LaunchAgent XML, Windows/native macOS API calls and readback, registration errors, and preference migration/persistence. Electron smoke tests exercise the real Settings IPC and registration/removal using temporary profile folders; native login APIs are faked on Windows and packaged macOS so tests never modify real OS startup settings.

On Linux, inspect `$XDG_CONFIG_HOME/autostart/copy-my-things.desktop` (or `~/.config/autostart`) and run `desktop-file-validate` against it. Sign out and in on a desktop that processes XDG autostart, verify one app instance, disable launch at login, restart the app, and repeat. Test XDG_CONFIG_HOME with spaces and non-ASCII characters. On macOS development builds, run `plutil -lint` on `~/Library/LaunchAgents/app.copy-my-things.plist`; confirm a sign-in starts the compiled project without a Vite server. Test packaged macOS Login Items separately, including OS approval/denial. On all platforms verify enabled, disabled, and failure states; retain the development executable/project paths or rebuild and reopen the app after moving them. Actual Windows/macOS login cycles remain manual checks on those operating systems.
