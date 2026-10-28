/** The few facts the site needs that aren't drawn from the product itself. */

export const REPO = 'https://github.com/Jatin-Dhir/vastu-studio'
export const REPO_API = 'https://api.github.com/repos/Jatin-Dhir/vastu-studio/releases/latest'

/** The studio, composed in under this page by the deploy workflow. */
export const APP_URL = './app/'

/** Stable "latest" links — every release attaches its installers under these exact names. */
export const DOWNLOADS = {
  windows: `${REPO}/releases/latest/download/VastuStudio-Setup-x64.exe`,
  android: `${REPO}/releases/latest/download/VastuStudio-android.apk`,
  releases: `${REPO}/releases`,
}
export const ASSET_NAMES = { windows: 'VastuStudio-Setup-x64.exe', android: 'VastuStudio-android.apk' }

/** What the visitor is on, so the page can offer their own download first. iPadOS reports
 *  itself as a Mac, so a Mac with a touch screen counts as iOS. */
export type Platform = 'windows' | 'android' | 'ios' | 'other'
export function visitorPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'windows'
  const ua = navigator.userAgent
  if (/Android/i.test(ua)) return 'android'
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios'
  if (/Windows/i.test(ua)) return 'windows'
  return 'other'
}

/** Shown until the live release feed answers (or when it can't). */
export const FALLBACK_RELEASE = { version: '1.3.3', publishedAt: '2026-10-28', sizes: { windows: 7.5e6, android: 9.3e6 } }

/** How a practitioner asks for a seat. Leave both empty and the page offers sign-in only.
 *  whatsapp: digits with the country code, no plus — e.g. '91xxxxxxxxxx'. The address is kept
 *  in two halves, joined only when the page runs, so it never sits whole in the shipped script
 *  for an address harvester to find. */
export const CONTACT = { whatsapp: '', email: ['jatindhir.dev', 'gmail.com'].join('@') }

/** The links the page offers for asking — empty strings until CONTACT names a way. `write` is a
 *  plain mailto for general contact; `mail` opens a seat request. */
export function contactLinks(): { whatsapp: string; mail: string; write: string; email: string } {
  const hello = 'Hello — I would like a Vastu Studio seat.'
  return {
    whatsapp: CONTACT.whatsapp ? `https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent(hello)}` : '',
    mail: CONTACT.email ? `mailto:${CONTACT.email}?subject=${encodeURIComponent('Vastu Studio seat')}&body=${encodeURIComponent(hello)}` : '',
    write: CONTACT.email ? `mailto:${CONTACT.email}` : '',
    email: CONTACT.email,
  }
}
