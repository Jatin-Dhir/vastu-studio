let seq = 0

/** A unique id: the platform UUID where there is one (Chrome 92+, Safari 15.4+, secure pages).
 *  Otherwise time, a counter and randomness: the old fallback read a timer that browsers
 *  coarsen to 0.1 ms, so ids made in one loop could collide. */
export function uid(prefix: string): string {
  const c = globalThis.crypto as Crypto | undefined
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  seq = (seq + 1) % 1_679_616
  return `${prefix}${Date.now().toString(36)}${seq.toString(36).padStart(4, '0')}${Math.random().toString(36).slice(2, 8)}`
}
