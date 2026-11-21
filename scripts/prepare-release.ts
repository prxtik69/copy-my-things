import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const destination = 'release-support/native-source'
rmSync(destination, { recursive: true, force: true })
mkdirSync(destination, { recursive: true })
// Include the corresponding C sources and build files for the native hook shipped
// inside each installer, so it can be rebuilt and replaced independently.
for (const file of ['src', 'libuiohook', 'binding.gyp', 'package.json', 'LICENSE']) {
  cpSync(join('node_modules/uiohook-napi', file), join(destination, 'uiohook-napi', file), {
    recursive: true,
  })
}
cpSync('resources/legal', join(destination, 'licenses'), { recursive: true })
const version = JSON.parse(readFileSync('node_modules/uiohook-napi/package.json', 'utf8')).version
writeFileSync(
  join(destination, 'README.md'),
  `# Native hook source\n\nuiohook-napi ${version} and its vendored libuiohook sources correspond to the native module included in Copy My Things. The wrapper is MIT licensed; libuiohook is LGPL-3.0-or-later. Full licenses are in licenses/.\n\n## Rebuild and replace\n\nInstall Node.js, Python, and your platform's C/C++ build tools. On Linux also install libx11-dev, libxtst-dev, libxrandr-dev and libxt-dev. From uiohook-napi/, run:\n\n\`\`\`sh\nnpm install --ignore-scripts\nnpx node-gyp rebuild\n\`\`\`\n\nClose Copy My Things. Back up and replace the matching native binary under resources/app.asar.unpacked/node_modules/uiohook-napi/prebuilds/<platform>-<arch>/ with build/Release/uiohook_napi.node, retaining the original installed filename. macOS places resources under Copy My Things.app/Contents/Resources. For an AppImage, extract it with --appimage-extract and use the extracted application. Modifying a signed bundle invalidates its signature; use a local source build or re-sign your local copy. No application source changes or secret keys are required to replace the hook.\n\nThe original application source is available from https://github.com/prxtik69/copy-my-things.\n`,
)
console.log(`Prepared native source and license notices for uiohook-napi ${version}`)
