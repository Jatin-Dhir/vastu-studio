/** Apple keyboards: shortcut hints say ⌘ there (the handlers already accept Cmd), and paste is
 *  ⌘V — "Ctrl+V" on a Mac pastes nothing. iPadOS reports itself as a Mac with touch. */
export const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent)

/** The modifier's name as a Mac or a PC user reads it: "⌘" or "Ctrl". */
export const MOD = IS_MAC ? '⌘' : 'Ctrl'

/** A shortcut written for the current platform: mod('Z') → "⌘Z" or "Ctrl+Z". */
export const mod = (key: string) => (IS_MAC ? `⌘${key}` : `Ctrl+${key}`)
