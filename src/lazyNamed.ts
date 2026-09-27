import { lazy, type ComponentType } from 'react'

const RELOAD_KEY = 'vastu-studio.chunk-reload'

/** React.lazy for a named export. Surfaces that most sessions never open (the map, the report,
 *  the projects list, the phone shell, admin) load on first use instead of on every start.
 *  If the chunk is gone — a deploy replaced the hashed files this open tab expects — reload
 *  once onto the new build rather than fail. */
export function lazyNamed<M extends Record<string, unknown>, K extends keyof M>(load: () => Promise<M>, name: K) {
  return lazy(() =>
    load().then(
      (m) => {
        try { sessionStorage.removeItem(RELOAD_KEY) } catch { /* storage blocked */ }
        return { default: m[name] as unknown as ComponentType<any> }
      },
      (err) => {
        try {
          if (!sessionStorage.getItem(RELOAD_KEY)) {
            sessionStorage.setItem(RELOAD_KEY, '1')
            location.reload()
          }
        } catch { /* storage blocked */ }
        throw err
      },
    ),
  )
}
