import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import '@fontsource/cormorant-garamond/600.css'
import '@fontsource/cormorant-garamond/600-italic.css'
import './site.css'
import { Site } from './Site'

/** A browser that has used the studio before (its theme choice, an account session) gets a
 *  "back to the studio" door rather than the first-time pitch. Same origin, so we can look. */
function hasUsedStudio(): boolean {
  try {
    return Object.keys(localStorage).some((k) => k.startsWith('vastu-studio.') || k.startsWith('sb-'))
  } catch { return false }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Site returning={hasUsedStudio()} />
  </StrictMode>,
)
