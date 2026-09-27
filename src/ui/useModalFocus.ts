import { useLayoutEffect, useRef } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from 'react'

const TABBABLE = 'a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]'

/** What Tab can reach inside `root`, in DOM order — no disabled, tabindex=-1 or hidden controls. */
function tabbables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(TABBABLE)).filter((el) => el.tabIndex >= 0 && el.getClientRects().length > 0)
}

/** Open modals, innermost last — only the top one answers Tab and Escape. */
const open: HTMLElement[] = []

/**
 * Modal focus for a dialog or sheet: on open, remember who had focus and move it inside
 * (`initial`, else the first control, else the container); keep Tab and Shift+Tab inside;
 * Escape calls onClose; on close, hand focus back to the opener. `inertSiblings` also makes
 * everything beside the container inert — pointer, Tab and screen reader alike — except live
 * regions (the toasts), which sit above every overlay and keep speaking for it.
 */
export function useModalFocus(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  opts: { active?: boolean; initial?: RefObject<HTMLElement | null>; inertSiblings?: boolean } = {},
): void {
  const { active = true, initial, inertSiblings = false } = opts
  const closeRef = useRef(onClose)
  useLayoutEffect(() => { closeRef.current = onClose })

  useLayoutEffect(() => {
    const root = ref.current
    if (!active || !root) return
    const prev = document.activeElement as HTMLElement | null
    ;(initial?.current ?? tabbables(root)[0] ?? root).focus()
    const inerted = inertSiblings && root.parentElement
      ? Array.from(root.parentElement.children).filter((el): el is HTMLElement =>
        el !== root && el instanceof HTMLElement && !el.inert && !el.hasAttribute('aria-live'))
      : []
    inerted.forEach((el) => { el.inert = true })
    open.push(root)

    const onKey = (e: KeyboardEvent) => {
      // only the innermost modal answers, and a control that handled the key itself wins
      if (open[open.length - 1] !== root || e.defaultPrevented) return
      if (e.key === 'Escape') { if (!e.isComposing) closeRef.current(); return }
      if (e.key !== 'Tab') return
      const items = tabbables(root)
      const at = document.activeElement
      // let the browser step between controls inside; wrap at either end, and pull focus
      // back in if it ever sits outside (on <body> after a click on blank space)
      const onward = !!at && root.contains(at) && items.some((el) => e.shiftKey
        ? el.compareDocumentPosition(at) & Node.DOCUMENT_POSITION_FOLLOWING
        : at.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)
      if (onward) return
      e.preventDefault()
      ;((e.shiftKey ? items[items.length - 1] : items[0]) ?? root).focus()
    }
    window.addEventListener('keydown', onKey)

    return () => {
      window.removeEventListener('keydown', onKey)
      const i = open.indexOf(root)
      if (i >= 0) open.splice(i, 1)
      inerted.forEach((el) => { el.inert = false })
      // back to the opener — unless focus has already moved on to something else
      const now = document.activeElement
      if (prev && prev !== document.body && prev.isConnected && (!now || now === document.body || root.contains(now))) prev.focus()
    }
  }, [active, ref, initial, inertSiblings])
}

/**
 * Arrow keys for a role="radiogroup": step to the neighbouring radio and select it (the
 * APG pattern). Pair with tabIndex={checked ? 0 : -1} so the group is a single Tab stop.
 */
export function radioGroupKeys(e: ReactKeyboardEvent<HTMLElement>): void {
  const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
  if (!step) return
  const radios = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]:not(:disabled)'))
  const i = radios.indexOf(e.target as HTMLElement)
  if (i < 0) return
  e.preventDefault()
  const next = radios[(i + step + radios.length) % radios.length]
  next.focus()
  next.click()
}
