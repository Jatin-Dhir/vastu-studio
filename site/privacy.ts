// The privacy page is static HTML. This brings the site's faces and styles, and, once config.ts
// names a way to reach the studio, turns the closing line into those links.
import '@fontsource-variable/inter'
import '@fontsource/cormorant-garamond/600.css'
import './site.css'
import { contactLinks } from './config'

const { whatsapp, mail } = contactLinks()
const line = document.querySelector<HTMLElement>('[data-contact]')
if (line && (whatsapp || mail)) {
  const link = (href: string, text: string, external: boolean) => {
    const a = document.createElement('a')
    a.href = href
    a.textContent = text
    if (external) { a.target = '_blank'; a.rel = 'noopener noreferrer' }
    return a
  }
  line.replaceChildren('Write to the studio ')
  if (whatsapp) line.append(link(whatsapp, 'on WhatsApp', true))
  if (whatsapp && mail) line.append(' or ')
  if (mail) line.append(link(mail, 'by email', false))
  line.append('.')
}
