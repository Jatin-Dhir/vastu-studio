import { basename, resolve } from 'node:path'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
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

/** Build only: write the build's hashed JS/CSS and Latin font files into the service worker,
 *  which precaches them at install (every surface that loads on first use must also open
 *  offline) and prunes the files earlier builds left behind. Font subsets for scripts the app
 *  never shows (Cyrillic, Greek, Vietnamese) and the legacy .woff copies are left out. */
/** Build only: preload the Latin Inter file. Fonts were only requested after React rendered,
 *  landing 1.2–1.5 s later and forcing a relayout; one preload of the face every screen uses
 *  moved LCP ~650 ms earlier in the audit's measurements. */
function preloadInter(): Plugin {
  return {
    name: 'vastu-preload-inter',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const file = Object.keys(ctx.bundle ?? {}).find((f) => /^assets\/inter-latin-wght-normal-[\w-]+\.woff2$/.test(f))
        if (!file) return html
        return html.replace('</head>', `    <link rel="preload" as="font" type="font/woff2" crossorigin href="./${file}">\n  </head>`)
      },
    },
  }
}

function swPrecache(): Plugin {
  let outDir = 'dist'
  let files: string[] = []
  return {
    name: 'vastu-sw-precache',
    apply: 'build',
    configResolved(c) { outDir = resolve(c.root, c.build.outDir) },
    generateBundle(_, bundle) {
      files = Object.keys(bundle).filter((f) =>
        /^assets\/.+\.(m?js|css)$/.test(f) || (/^assets\/.+\.woff2$/.test(f) && /latin/.test(f)))
    },
    closeBundle() {
      const p = resolve(outDir, 'sw.js')
      const src = readFileSync(p, 'utf8')
      if (!src.includes('/*__BUILD_ASSETS__*/[]')) throw new Error('sw.js lost its BUILD_ASSETS placeholder')
      writeFileSync(p, src.replace('/*__BUILD_ASSETS__*/[]', JSON.stringify(files.sort())))
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), devSave(), preloadInter(), swPrecache()],
  server: { port: 5173 },
  build: {
    // Safari 15 (iPhone 6s/7 on iOS 15), Chrome/Edge/WebView 99, Firefox 99: syntax newer than
    // these (class static blocks, …) is lowered, so no engine meets a parse error at boot.
    // Capacitor's minWebViewVersion matches the Chrome floor.
    target: ['es2020', 'chrome99', 'edge99', 'firefox99', 'safari15'],
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      input: { main: resolve(__dirname, 'index.html') },
      output: {
        // all of React (react-dom/client and the scheduler were landing in main, so every
        // deploy re-downloaded them), pdf.js and leaflet each in their own long-lived chunk
        manualChunks(id) {
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react'
          if (/[\\/]node_modules[\\/]pdfjs-dist[\\/]/.test(id)) return 'pdfjs'
          if (/[\\/]node_modules[\\/]leaflet[\\/]/.test(id)) return 'leaflet'
        },
      },
    },
  },
})
