import { basename, resolve } from 'node:path'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import type { Declaration, Plugin as PostcssPlugin } from 'postcss'
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

/** color-mix() arrived in Chrome 111, Safari 16.2 and Firefox 113, after this build's floor
 *  (Chrome/WebView 99, Safari 15). With a var() inside, an engine that lacks it does not fall
 *  back to an earlier declaration: the property resets, so badges lose their tint and some
 *  borders turn the text colour. Every colour token gets a channel twin (--gold: #D9B45B adds
 *  --gold-rgb: 217 180 91), and every rule that mixes gets a twin rule inside
 *  @supports not (color: color-mix(...)) saying the same with rgb(var(--gold-rgb) / 35%).
 *  Engines that have color-mix never apply it. */
function colorMixFallback(): PostcssPlugin {
  const MIX = /color-mix\(\s*in\s+srgb\s*,\s*var\(\s*(--[\w-]+)\s*\)\s+([\d.]+)%\s*,\s*(?:transparent|var\(\s*(--[\w-]+)\s*\))\s*\)/g
  const channels = (value: string): string | null => {
    const v = value.trim()
    let m = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(v)
    if (m) {
      const h = m[1].length <= 4 ? [...m[1]].map((c) => c + c).join('') : m[1]
      return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(' ')
    }
    m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(v)
    if (m) return `${m[1]} ${m[2]} ${m[3]}`
    m = /^var\(\s*(--[\w-]+)\s*\)$/.exec(v)
    return m ? `var(${m[1]}-rgb)` : null
  }
  return {
    postcssPlugin: 'color-mix-fallback',
    Once(root, { AtRule, result }) {
      root.walkDecls(/^--/, (d) => {
        if (d.prop.endsWith('-rgb')) return
        const c = channels(d.value)
        if (c) d.cloneAfter({ prop: `${d.prop}-rgb`, value: c })
      })
      root.walkRules((rule) => {
        const parent = rule.parent as { type?: string; name?: string } | undefined
        if (parent?.type === 'atrule' && /keyframes$/i.test(parent.name ?? '')) return
        const twins: Declaration[] = []
        rule.each((n) => {
          if (n.type !== 'decl' || !n.value.includes('color-mix(')) return
          if (n.prop.startsWith('--')) { n.warn(result, 'color-mix() in a custom property has no fallback'); return }
          const whole = n.value.trim()
          const value = n.value.replace(MIX, (all: string, a: string, pct: string, b?: string) => {
            const tint = `rgb(var(${a}-rgb) / ${pct}%)`
            if (!b) return tint
            // an opaque mix is the tint laid over its base colour — exact when it is the whole
            // background; anywhere else the base alone is the nearest honest stand-in
            if (n.prop === 'background' && all.trim() === whole) return `linear-gradient(${tint}, ${tint}), var(${b})`
            return `var(${b})`
          })
          if (value.includes('color-mix(')) { n.warn(result, `no color-mix fallback for: ${n.value}`); return }
          twins.push(n.clone({ value }))
        })
        if (!twins.length) return
        const twin = rule.clone()
        twin.removeAll()
        twin.append(...twins)
        const at = new AtRule({ name: 'supports', params: 'not (color: color-mix(in srgb, red 50%, blue))' })
        at.append(twin)
        rule.after(at)
      })
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), devSave(), preloadInter(), swPrecache()],
  css: { postcss: { plugins: [colorMixFallback()] } },
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
