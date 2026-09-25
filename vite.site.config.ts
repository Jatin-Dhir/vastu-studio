import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/** The marketing site (site/) — a second, independent Vite build. It is served at the
 *  root of the Pages URL with the studio itself composed in under /app/ (see
 *  .github/workflows/deploy.yml). It reaches into src/ only for the pure drawing
 *  components (Scene, CompassDial) so every visual on the page is the product's own. */
export default defineConfig({
  root: resolve(__dirname, 'site'),
  base: './',
  publicDir: resolve(__dirname, 'site/public'),
  plugins: [react()],
  // CompassDial's haptic tick reaches into the app store through src/native.ts; the site has
  // no store and no shell, so that one import lands on a no-op instead.
  resolve: { alias: [{ find: /^\.\.\/native$/, replacement: resolve(__dirname, 'site/stubs/native.ts') }] },
  server: { port: 5180, fs: { allow: [__dirname] } },
  build: {
    outDir: resolve(__dirname, 'dist-site'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: { manualChunks: { react: ['react', 'react-dom'], gsap: ['gsap'] } },
    },
  },
})
