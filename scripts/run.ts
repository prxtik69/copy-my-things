import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
const requireForTool = createRequire(import.meta.url)
const mode = process.argv[2]
const environment = { ...process.env }
// Editor hosts sometimes inherit this variable. Electron must run as a desktop app.
delete environment.ELECTRON_RUN_AS_NODE
const child =
  mode === 'smoke'
    ? spawn(requireForTool('electron') as string, ['.', '--smoke-test'], {
        env: environment,
        stdio: 'inherit',
      })
    : spawn(
        process.execPath,
        [
          resolve('node_modules/electron-vite/bin/electron-vite.js'),
          mode === 'start' ? 'preview' : 'dev',
          ...process.argv.slice(3),
        ],
        { env: environment, stdio: 'inherit' },
      )
child.on('error', (error) => {
  console.error(error.message)
  process.exitCode = 1
})
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exitCode = code ?? 1
})
process.on('SIGINT', () => child.kill('SIGINT'))
process.on('SIGTERM', () => child.kill('SIGTERM'))
