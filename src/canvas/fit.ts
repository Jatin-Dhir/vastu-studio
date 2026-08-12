/** Ask the canvas to re-fit the view to the current content. */
export function requestFit() {
  window.dispatchEvent(new CustomEvent('vastu:fit'))
}
