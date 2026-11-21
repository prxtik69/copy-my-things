# Third-party notices

Original Copy My Things code is MIT-licensed. Dependencies retain their licenses. This development repository does not generate or distribute application bundles.

Direct runtime dependencies checked from their installed package metadata:

| Dependency               | License                                                           |
| ------------------------ | ----------------------------------------------------------------- |
| Electron                 | MIT; Chromium/Node and bundled libraries carry additional notices |
| React / React DOM        | MIT                                                               |
| better-sqlite3           | MIT; SQLite is public domain                                      |
| Zod                      | MIT                                                               |
| Lucide React             | ISC                                                               |
| Radix UI Dialog / Slot   | MIT                                                               |
| class-variance-authority | Apache-2.0                                                        |
| clsx / tailwind-merge    | MIT                                                               |
| uiohook-napi             | MIT for wrapper; bundled libuiohook LGPL-3.0-or-later             |

uiohook-napi 1.5.5 incorporates libuiohook (copyright Alexander Barker and contributors). Installed native library source headers explicitly identify LGPL version 3 or later. The upstream submodule points to [libuiohook commit f259ff37e81125f6f91ebac5439e7cde1e78b296](https://github.com/kwhat/libuiohook/tree/f259ff37e81125f6f91ebac5439e7cde1e78b296). Its license includes [COPYING.md](https://github.com/kwhat/libuiohook/blob/f259ff37e81125f6f91ebac5439e7cde1e78b296/COPYING.md) and [COPYING.LESSER.md](https://github.com/kwhat/libuiohook/blob/f259ff37e81125f6f91ebac5439e7cde1e78b296/COPYING.LESSER.md). Before future distribution, preserve notices and provide the required corresponding native-library source and relinking/replacement mechanism under the LGPL. Keep project MIT terms distinct from bundled third-party terms.

Development tools such as Vite, electron-vite, TypeScript, Tailwind, and Vitest also retain their own licenses. Consult installed LICENSE/NOTICE files and Electron's LICENSES.chromium.html for complete third-party terms before any future distribution. This document is an engineering inventory, not a replacement for those licenses.

Lexend is bundled locally under the SIL Open Font License 1.1. The font copyright and full license are preserved in `src/assets/fonts/OFL.txt`. The font file comes from the Google Fonts Lexend family.
