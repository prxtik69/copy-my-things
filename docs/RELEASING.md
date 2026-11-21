# Desktop releases

The GitHub Actions workflow in `.github/workflows/release.yml` builds six variants: Windows x64/ARM64, Linux x64/ARM64, and macOS Intel/Apple Silicon. It produces Windows NSIS installers, macOS DMG/ZIP files, and Linux AppImage/DEB packages. Linux and macOS builds use matching native runners; Windows ARM64 is packaged on x64 using the included ARM64 Node-API prebuilds.

## Build locally

```sh
bun install --frozen-lockfile
bun run package
```

Use `bun run package --x64` or `bun run package --arm64` to select an architecture. Build macOS on macOS and Windows on Windows. Linux packaging needs binutils (`ar`), rpm, and the normal Electron desktop dependencies. `bun run package:dir` creates an unpacked app for inspection. Output goes to the ignored `dist/` directory. Native hook source and licenses are prepared automatically and included in each package.

## Create a release

1. Update `package.json` to the intended version and commit changes to `master`.
2. Use GitHub Actions → **Release desktop app** → **Run workflow**, enter the matching version, and leave **Create a draft release** enabled for review. Alternatively, push a matching `vX.Y.Z` tag to publish automatically after all builds succeed.
3. Test the installers on each operating system, review the draft's notes and checksums, and publish it. Published stable releases automatically appear on the showcase site within five minutes. The repository must be public for visitors to download assets.

The workflow validates the version, TypeScript, tests, and formatting before packaging. Packaged Linux builds run the Electron smoke test inside Xvfb. Installer files are collected only after all matrix builds pass, then `SHA256SUMS.txt` is generated and uploaded with them. Each release also includes corresponding native-hook source. Draft builds do not appear in the website's latest-release API.

Stable filenames are `Copy-My-Things-windows-<arch>-setup.exe`, `Copy-My-Things-macos-<arch>.dmg` / `.zip`, and `Copy-My-Things-linux-<arch>.AppImage` / `.deb`, where `<arch>` is `x64` or `arm64`. The website and terminal commands depend on these names.

## Signing

Builds work without signing secrets and must be identified as unsigned. To sign macOS releases, configure repository Actions secrets `CSC_LINK` (certificate or base64 certificate) and `CSC_KEY_PASSWORD`. For Apple notarization also configure `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`. For Windows signing configure `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD`. Keep these values in Actions secrets, never in source files. Unsigned apps can trigger Windows SmartScreen or macOS Gatekeeper; installation instructions mention the required OS approval without disabling platform security.

## Native libraries

Native modules use Node-API prebuilds. Packaging retains their prebuilds and unpacks `.node` files from ASAR so the hook can be replaced independently. `scripts/prepare-release.ts` copies the exact installed uiohook-napi C sources, its vendored libuiohook sources, build files, licenses, and rebuilding instructions. These ship under `resources/native-source` (inside Contents/Resources on macOS) and in the release source archive. Application data is outside the installation directory; reinstalling or uninstalling does not erase snippets.
