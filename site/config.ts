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

/** Shown until the live release feed answers (or when it can't). */
export const FALLBACK_RELEASE = { version: '1.2.0', publishedAt: '2026-09-25', sizes: { windows: 6.4e6, android: 9.7e6 } }

/** How a practitioner asks for a seat. Leave both empty and the page offers sign-in only.
 *  whatsapp: digits with the country code, no plus — e.g. '91xxxxxxxxxx'. */
export const CONTACT = { whatsapp: '', email: '' }
