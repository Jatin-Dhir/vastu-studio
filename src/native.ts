// Native shell glue (Capacitor). Every entry point no-ops on the plain web,
// so the site keeps working untouched — the app just gains platform manners:
// a styled status bar, a sane Android back button, and share-sheet exports.
import { useStore } from './store'

let native: boolean | null = null

export function isNative(): boolean {
  if (native === null) {
    const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }
    native = !!w.Capacitor?.isNativePlatform?.()
  }
  return native
}

export async function initNative(): Promise<void> {
  if (!isNative()) return
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar')
    await StatusBar.setStyle({ style: Style.Dark })
    await StatusBar.setBackgroundColor({ color: '#0B0C10' }).catch(() => { /* iOS has no bg */ })
  } catch { /* plugin missing */ }
  try {
    const { App } = await import('@capacitor/app')
    await App.addListener('backButton', () => {
      // peel one layer per press: dialogs → modals → selections → armed tool → home
      const s = useStore.getState()
      if (s.calDialogOpen) return s.setCalDialogOpen(false)
      if (s.shortcutsOpen) return s.setShortcutsOpen(false)
      if (s.reportOpen) return s.setReportOpen(false)
      if (s.projectsOpen) return s.setProjectsOpen(false)
      if (s.mapOpen) return s.setMapOpen(false)
      if (s.markerEditing) return s.setMarkerEditing(false)
      if (s.selectedMarker) return s.setSelectedMarker(null)
      if (s.selectedStroke) return s.setSelectedStroke(null)
      if (s.selectedVertex != null || s.selectedEdge != null) return s.setSelection({ vertex: null, edge: null })
      if (s.tool !== 'select') return s.setTool('select')
      void App.minimizeApp()
    })
  } catch { /* plugin missing */ }
}

/**
 * On native, blob downloads are dead ends — write to cache and open the share
 * sheet instead (save to Files/Drive/WhatsApp, exactly what practitioners do
 * with client deliverables). Returns false on the web so callers fall back.
 */
export async function shareBlobNative(blob: Blob, filename: string): Promise<boolean> {
  if (!isNative()) return false
  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem')
    const { Share } = await import('@capacitor/share')
    const data = await new Promise<string>((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
      r.onerror = () => reject(r.error)
      r.readAsDataURL(blob)
    })
    const res = await Filesystem.writeFile({ path: filename, data, directory: Directory.Cache })
    await Share.share({ title: filename, files: [res.uri] })
    return true
  } catch (e) {
    const msg = e instanceof Error ? e.message.toLowerCase() : ''
    if (!msg.includes('cancel')) useStore.getState().toast("Couldn't open the share sheet", 'warn')
    return true // still native — never fall through to a dead anchor click
  }
}
