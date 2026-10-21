import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/** The marketing site (site/) — a second, independent Vite build. It is served at the
 *  root of the Pages URL with the studio itself composed in under /app/ (see
 *  .github/workflows/deploy.yml). It reaches into src/ only for the pure drawing
 *  component (Scene) so every visual on the page is the product's own. */
export default defineConfig({
  root: resolve(__dirname, 'site'),
  base: './',
  // its own dependency cache: sharing node_modules/.vite with the studio's dev server makes the
  // two invalidate each other's optimized deps ("504 Outdated Optimize Dep") when both run
  cacheDir: resolve(__dirname, 'node_modules/.vite-site'),
  publicDir: resolve(__dirname, 'site/public'),
  plugins: [react()],
  server: { port: 5180, fs: { allow: [__dirname] } },
  build: {
    outDir: resolve(__dirname, 'dist-site'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      // the front page, and the privacy page as plain HTML at privacy/
      input: { main: resolve(__dirname, 'site/index.html'), privacy: resolve(__dirname, 'site/privacy/index.html') },
      output: { manualChunks: { react: ['react', 'react-dom'], gsap: ['gsap', 'lenis'] } },
    },
  },
})
