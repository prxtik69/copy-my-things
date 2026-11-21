const releaseArch =
  process.env.RELEASE_ARCH ||
  (process.argv.includes('--arm64')
    ? 'arm64'
    : process.argv.includes('--x64')
      ? 'x64'
      : process.arch)

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'app.copymythings.desktop',
  productName: 'Copy My Things',
  directories: { output: 'dist', buildResources: 'resources/build' },
  files: [
    'out/**/*',
    'resources/copy-my-things-logo-assets/**/*',
    'resources/tray.png',
    'package.json',
    'LICENSE',
    'THIRD_PARTY_NOTICES.md',
  ],
  extraResources: [
    { from: 'resources/legal', to: 'licenses' },
    { from: 'release-support/native-source', to: 'native-source' },
  ],
  asar: true,
  asarUnpack: ['**/*.node'],
  // Both native modules ship Node-API prebuilds, shared by Node and Electron.
  npmRebuild: false,
  publish: [{ provider: 'github', owner: 'prxtik69', repo: 'copy-my-things' }],
  mac: {
    category: 'public.app-category.productivity',
    icon: 'resources/build/icon.icns',
    target: ['dmg', 'zip'],
    artifactName: `Copy-My-Things-macos-${releaseArch}.\${ext}`,
    hardenedRuntime: true,
    entitlements: 'resources/build/entitlements.mac.plist',
    entitlementsInherit: 'resources/build/entitlements.mac.plist',
    notarize: Boolean(
      process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID,
    ),
    extendInfo: {
      NSInputMonitoringUsageDescription:
        'Copy My Things uses keyboard monitoring only when you enable typed triggers.',
    },
  },
  dmg: { title: 'Copy My Things', window: { width: 540, height: 380 } },
  win: {
    icon: 'resources/build/icon.ico',
    target: ['nsis'],
    artifactName: `Copy-My-Things-windows-${releaseArch}-setup.\${ext}`,
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: false,
    createStartMenuShortcut: true,
    runAfterFinish: true,
    deleteAppDataOnUninstall: false,
    include: 'resources/build/installer.nsh',
  },
  linux: {
    icon: 'resources/copy-my-things-logo-assets/copy-my-things-app-icon-512.png',
    category: 'Utility',
    syncDesktopName: true,
    executableName: 'copy-my-things',
    maintainer: 'Pratik <pratikdeshpande007pvd@gmail.com>',
    target: ['AppImage', 'deb'],
    artifactName: `Copy-My-Things-linux-${releaseArch}.\${ext}`,
    desktop: {
      entry: { StartupWMClass: 'copy-my-things', Keywords: 'clipboard;snippets;productivity;' },
    },
  },
  deb: {
    depends: [
      'libgtk-3-0',
      'libnotify4',
      'libnss3',
      'libxss1',
      'libxtst6',
      'xdg-utils',
      'libatspi2.0-0',
      'libdrm2',
      'libgbm1',
      'libxkbcommon0',
      'libasound2',
    ],
  },
}
