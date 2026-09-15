import { basename, resolve } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/** Dev server only: lets a scripted browser check hand a generated file (a PDF, a PNG)
 *  back to disk under .artifacts/ so it can be inspected, since the preview sandbox
 *  swallows downloads. Never part of a build. */
function devSave(): Plugin {
  return {
    name: 'vastu-dev-save',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__dev/save', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
        const name = basename(new URL(req.url ?? '/', 'http://x').searchParams.get('name') ?? 'file.bin').replace(/[^\w.\-]+/g, '_')
        const chunks: Buffer[] = []
        req.on('data', (ch: Buffer) => chunks.push(ch))
        req.on('end', () => {
          const dir = resolve(__dirname, '.artifacts')
          mkdirSync(dir, { recursive: true })
          writeFileSync(resolve(dir, name), Buffer.concat(chunks))
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ ok: true, path: `.artifacts/${name}`, bytes: chunks.reduce((n, ch) => n + ch.length, 0) }))
        })
      })
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), devSave()],
  server: { port: 5173 },
  build: {
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        landing: resolve(__dirname, 'landing.html'),
      },
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          pdfjs: ['pdfjs-dist'],
          leaflet: ['leaflet'],
        },
      },
    },
  },
})
