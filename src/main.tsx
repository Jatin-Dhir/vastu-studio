import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import '@fontsource/cormorant-garamond/600.css'
import './index.css'
import './theme.css'
import App from './App'
import { ErrorBoundary } from './ui/ErrorBoundary'
import { initNative, isNative } from './native'
import { useStore } from './store'
import { rememberForcedPhone } from './mobile/phone'

rememberForcedPhone()

// dev-only handle for scripted UI checks (the map exposes itself the same way)
if (import.meta.env.DEV) (window as unknown as { __vastu: typeof useStore }).__vastu = useStore

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

void initNative()

// offline shell — the whole workflow except live map tiles works with no signal.
// The native shell IS the offline cache, so no service worker there.
if (import.meta.env.PROD && !isNative() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => { /* http or blocked */ })
  })
}
