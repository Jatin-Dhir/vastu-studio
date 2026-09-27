import { useRef } from 'react'
import { useStore, type VastuStore } from '../store'

/**
 * Live canvas-gesture flag. App's undo/redo keys check it so a mid-drag
 * Ctrl+Z can't pop the history entry the drag itself just pushed. Lives
 * outside CanvasStage.tsx so that file keeps exporting only components
 * (mixed exports make Fast Refresh detach the React event root).
 */
let busy = false

export function setGestureBusy(b: boolean): void {
  const was = busy
  busy = b
  // readers of a settled snapshot (useSettled) catch up once, when the gesture ends
  if (was && !b) useStore.setState({})
}

export function isGestureActive(): boolean {
  return busy
}

/** A store selector that holds its last value while a canvas gesture runs. The side panel
 *  re-rendered its whole analysis (~600 DOM nodes) on every frame of a corner, marker or room
 *  drag — ~80 ms per move on a mid phone — for numbers nobody can read mid-drag. */
export function useSettled<T>(sel: (s: VastuStore) => T): T {
  const last = useRef<{ v: T } | null>(null)
  return useStore((s) => {
    if (busy && last.current) return last.current.v
    const v = sel(s)
    last.current = { v }
    return v
  })
}
