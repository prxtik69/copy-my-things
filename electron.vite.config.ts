import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: resolve('electron/main/index.ts') } },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: resolve('electron/preload/index.ts'),
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    root: '.',
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'cmt-content-security-policy',
        transformIndexHtml(html, context) {
          return context.server
            ? html.replace("script-src 'self';", "script-src 'self' 'unsafe-inline';")
            : html.replace(/connect-src [^;]+;/, "connect-src 'none';")
        },
      },
    ],
    build: { minify: true, rollupOptions: { input: resolve('index.html') } },
  },
})
