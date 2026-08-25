/**
 * Live canvas-gesture flag. App's undo/redo keys check it so a mid-drag
 * Ctrl+Z can't pop the history entry the drag itself just pushed. Lives
 * outside CanvasStage.tsx so that file keeps exporting only components
 * (mixed exports make Fast Refresh detach the React event root).
 */
let busy = false

export function setGestureBusy(b: boolean): void {
  busy = b
}

export function isGestureActive(): boolean {
  return busy
}
