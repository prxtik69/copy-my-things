# Contributing

Use Bun 1.4+ and a supported Node.js version. Run `bun install`, then `bun run dev`. Keep changes in TypeScript and preserve the main/preload/renderer boundary. Add migrations rather than modifying an existing user's schema in place.

Before submitting changes, run:

```sh
bun run typecheck
bun run test
bun run build
bun run test:electron
```

The Electron check needs a desktop session and briefly uses the clipboard. Follow the platform checklist in docs/TESTING.md for native changes. Do not enable monitoring without the operator's opt-in. Never commit personal databases, tokens, passwords, clipboard captures, or keystroke traces. Use temporary profiles and harmless test values.

Document tested OS/architecture/session combinations honestly. Changes to native dependencies need maintenance, license, prebuild, and Electron compatibility checks. Keep startup/background work event-driven; keep telemetry and polling out of the desktop app. Packaging and release changes should follow docs/RELEASING.md.

UI changes should retain keyboard operation, visible focus indicators, readable light/dark themes, and truthful disabled-feature explanations. All visible controls must perform their stated action.
