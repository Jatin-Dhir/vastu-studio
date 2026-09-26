import { useEffect, useRef, useState } from 'react'
import { ArrowRight, ArrowUpRight, Check, Download, Globe, MessageCircle, Mail, Monitor, Smartphone } from 'lucide-react'
import { Act } from './Act'
import { DialDemo } from './DialDemo'
import { armReveals, fanPages, heroIntro, initSmoothScroll, navTheme, refreshTriggers, reducedMotion, scrubSection } from './motion'
import { APP_URL, ASSET_NAMES, CONTACT, DOWNLOADS, FALLBACK_RELEASE, REPO, REPO_API } from './config'
import { ZONES16 } from '../src/vastu'
import shotVerdicts from './shots/desktop-verdicts.webp'
import shotInk from './shots/desktop-ink.webp'
import shotPhoneStudio from './shots/phone-studio.webp'
import shotPhoneAnalysis from './shots/phone-analysis.webp'
import shotPhoneCompass from './shots/phone-compass-ink.webp'
import shotPhonePlans from './shots/phone-plans.webp'
import shotReport1 from './shots/report-1.webp'
import shotReport2 from './shots/report-2.webp'
import shotReport3 from './shots/report-3.webp'
import 'lenis/dist/lenis.css'

/* ------------------------------------------------------------------ small pieces */

function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="mark">
      <rect x="8.2" y="8.2" width="15.6" height="15.6" rx="1.5" transform="rotate(45 16 16)" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <circle cx="16" cy="16" r="3" fill="currentColor" />
    </svg>
  )
}

const fmtMB = (bytes: number) => `${(bytes / 1e6).toFixed(1)} MB`
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })

interface Release { version: string; publishedAt: string; sizes: { windows: number; android: number }; live: boolean }

/** The latest release, from GitHub's feed — the fallback is what shipped when this page was built. */
function useRelease(): Release {
  const [rel, setRel] = useState<Release>({ ...FALLBACK_RELEASE, live: false })
  useEffect(() => {
    const ctrl = new AbortController()
    fetch(REPO_API, { headers: { Accept: 'application/vnd.github+json' }, signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { tag_name?: string; published_at?: string; assets?: { name: string; size: number }[] } | null) => {
        if (!j || !j.tag_name) return
        const sizes = { ...FALLBACK_RELEASE.sizes }
        for (const a of j.assets ?? []) {
          if (a.name === ASSET_NAMES.windows) sizes.windows = a.size
          if (a.name === ASSET_NAMES.android) sizes.android = a.size
        }
        setRel({ version: j.tag_name.replace(/^v/, ''), publishedAt: j.published_at ?? FALLBACK_RELEASE.publishedAt, sizes, live: true })
      })
      .catch(() => {})
    return () => ctrl.abort()
  }, [])
  return rel
}

function ChapterHead({ title, lede }: { title: string; lede: string }) {
  return (
    <header className="ch-head">
      <h2 data-split>{title}</h2>
      <p className="ch-lede">{lede}</p>
    </header>
  )
}

function Facts({ items }: { items: string[] }) {
  return (
    <ul className="facts">
      {items.map((t) => <li key={t}><Check size={15} strokeWidth={2.5} aria-hidden="true" /><span>{t}</span></li>)}
    </ul>
  )
}

/** The sixteen zones and what each governs, straight from the studio's table, drifting past. */
function ZoneStrip() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    return scrubSection(el, (p) => { el.style.setProperty('--shift', `${(-p * 18).toFixed(2)}%`) })
  }, [])
  return (
    <div className="zone-strip" ref={ref} aria-label="The sixteen zones and what each governs" data-nav="paper">
      <div className="zone-track">
        {ZONES16.map((z) => (
          <div className="zone" key={z.key}>
            <span className="zone-swatch" style={{ background: z.color }} aria-hidden="true" />
            <b>{z.key}</b>
            <span className="zone-name">{z.name}</span>
            <small>{z.theme}</small>
          </div>
        ))}
      </div>
    </div>
  )
}

const FAQ = [
  { q: 'Which system does it read?', a: 'The sixteen-zone reading with the thirty-two entrance gates and the 81-pada mandala. The charts that turn geometry into verdicts come with your seat and stay on the server; the studio downloads them when you sign in.' },
  { q: 'What can I import?', a: 'A PDF, an AutoCAD DXF, a photo or scan of a blueprint, or a plot captured from satellite view. Scale comes from any known length, or from the drawing’s own units.' },
  { q: 'How is north set?', a: 'Tap the tail and tip of the drawing’s north arrow, type a bearing, or take it from the phone compass, which corrects the magnetic heading to true north for your location.' },
  { q: 'Does it work on site without signal?', a: 'Yes. Once loaded the studio works offline, and a seat stays valid for several days without reaching the server. Plans and reports never leave the device.' },
  { q: 'Can I use it on my laptop and my phone?', a: 'One seat opens the studio on one device at a time, on every platform. Sign out on one, sign in on the other — or move the seat from the sign-in screen.' },
  { q: 'How do I get a seat?', a: 'Seats are issued by the studio, per practitioner, per year. Ask the practitioner who introduced you, or write to the studio.' },
]

/* ------------------------------------------------------------------ the page */

export function Site({ returning }: { returning: boolean }) {
  const root = useRef<HTMLDivElement>(null)
  const nav = useRef<HTMLElement>(null)
  const compassSec = useRef<HTMLElement>(null)
  const pages = useRef<HTMLDivElement>(null)
  const rel = useRelease()

  useEffect(() => {
    const r = root.current
    if (!r) return
    const offScroll = initSmoothScroll()
    const offHero = heroIntro(r)
    const offReveals = armReveals(r)
    const offFan = pages.current ? fanPages(pages.current) : () => {}
    const offNav = nav.current ? navTheme(nav.current, Array.from(r.querySelectorAll<HTMLElement>('[data-nav]'))) : () => {}
    document.fonts?.ready.then(refreshTriggers).catch(() => {})
    r.querySelectorAll('img').forEach((im) => im.addEventListener('load', refreshTriggers, { once: true }))
    window.addEventListener('load', refreshTriggers, { once: true })
    return () => { offHero(); offReveals(); offFan(); offNav(); offScroll() }
  }, [])

  const whatsapp = CONTACT.whatsapp ? `https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent('Hello — I would like a Vastu Studio seat.')}` : ''
  const mail = CONTACT.email ? `mailto:${CONTACT.email}?subject=${encodeURIComponent('Vastu Studio seat')}` : ''

  return (
    <div ref={root} className="site">
      <a className="skip" href="#read">Skip to content</a>

      <header className="nav" ref={nav} data-on="ink" data-hero-nav>
        <a className="nav-brand" href="#top" aria-label="Vastu Studio, top of page"><Mark /> Vastu <em>Studio</em></a>
        <nav className="nav-links" aria-label="Sections">
          <a href="#read">Verdicts</a><a href="#compass">Compass</a><a href="#report">Report</a><a href="#why">Why</a><a href="#faq">Questions</a>
        </nav>
        <div className="nav-cta">
          <a className="btn-line" href={APP_URL}>{returning ? 'Back to the studio' : 'Open the studio'}</a>
          <a className="btn-gold" href="#get"><Download size={15} aria-hidden="true" /> Download</a>
        </div>
      </header>

      <Act version={rel.version} returning={returning} />

      <ZoneStrip />

      {/* ———— verdicts ———— */}
      <section className="chapter" id="read" data-nav="paper">
        <div className="wrap">
          <ChapterHead title="What the studio says."
            lede="These are the studio's own sentences for the plan above: how much of each room sits in which zone, judged against the charts, with the move that fixes it in your units and your direction." />
          <div className="verdicts">
            <article className="vcard v-avoid">
              <header><b>Bath</b><i>avoid</i></header>
              <p className="v-where">19% in NE · 18% in ENE · on the Brahmasthan</p>
              <p>The most serious seat: health, memory and wisdom drain away. Move it about 2′ 5″ south-south-east, into ESE, three zones clockwise.</p>
            </article>
            <article className="vcard v-ideal">
              <header><b>Kitchen</b><i>ideal</i></header>
              <p className="v-where">37% in SSE · 29% in S</p>
              <p>The fire seat: strength, confidence and delicious, healthy food. Right where it should be.</p>
            </article>
            <article className="vcard v-avoid">
              <header><b>Main door</b><i>N2 · Naga</i></header>
              <p className="v-where">an inauspicious gate</p>
              <p>Naga breeds enmity and jealousy. Favourable gates on this wall: N3 Mukhya, N4 Bhallata.</p>
            </article>
          </div>
          <figure className="frame-desktop">
            <img src={shotVerdicts} alt="The Windows studio: the plan with the sixteen-zone wheel, and the Rooms & objects panel listing each room with its zone shares and verdict." width={2880} height={1800} loading="lazy" decoding="async" />
            <figcaption>The Windows studio. Tap a row for the why and the move.</figcaption>
          </figure>
        </div>
      </section>

      {/* ———— compass ———— */}
      <section className="chapter ink compass" id="compass" ref={compassSec} data-nav="ink">
        <div className="wrap">
          <ChapterHead title="The compass, in your hand."
            lede="Point the phone at a wall and read its zone, corrected to true north for where you stand, with the ruler, deity, colour, best use and remedy of that direction and the pada under the needle." />
          <DialDemo sectionRef={compassSec} />
          <p className="compass-hint">{reducedMotion ? 'On a phone the rose follows where you point.' : 'Keep scrolling and the rose turns. On a phone it follows where you point.'}</p>
          <div className="compass-facts">
            <Facts items={[
              'True north: the magnetic heading corrected by the declination for your location (WMM 2025), or magnetic if you prefer.',
              'Eight zones with ruler, deity, colour and shape, best use, entrance verdict, remedy and sleep direction.',
              'The thirty-two padas by name and lean; readings you save stay with the phone.',
            ]} />
            <figure className="frame-phone small">
              <img src={shotPhoneCompass} alt="The compass screen of the Android app: the dial reading 047°, NE Ishan, with the zone's rules, colour, best use and entrance verdict below." width={1170} height={2532} loading="lazy" decoding="async" />
            </figure>
          </div>
        </div>
      </section>

      {/* ———— report ———— */}
      <section className="chapter" id="report" data-nav="paper">
        <div className="wrap">
          <ChapterHead title="A report your client can hold."
            lede="One tap builds a PDF set in the studio's own faces: the plan with its zones, the room-by-room verdicts, the entrance reading, the zone balance and the written assessment, ready for WhatsApp or print." />
          <div className="pages" ref={pages}>
            <figure><img src={shotReport1} alt="Report page 1: the title page with the plan drawn to scale under the sixteen-zone wheel." width={1241} height={1754} loading="lazy" decoding="async" /><figcaption>Cover and plan</figcaption></figure>
            <figure><img src={shotReport2} alt="Report page 2: the placement verdicts, one row per room, with zone shares and moves." width={1241} height={1754} loading="lazy" decoding="async" /><figcaption>Placements</figcaption></figure>
            <figure><img src={shotReport3} alt="Report page 3: the zone balance and the written assessment." width={1241} height={1754} loading="lazy" decoding="async" /><figcaption>Balance and assessment</figcaption></figure>
          </div>
          <Facts items={[
            'Client name, address and your practice on the cover; your notes where you wrote them.',
            'Share straight from the phone, or Save as PDF on the desktop. PNG export of the drawing alone.',
          ]} />
        </div>
      </section>

      {/* ———— everywhere ———— */}
      <section className="chapter ink desk" id="everywhere" data-nav="ink">
        <div className="wrap">
          <ChapterHead title="On the desk, on site, in the browser."
            lede="One seat opens the same studio on every platform. Plans live on the device they were drawn on; the charts, the compass tables and the reports come with the seat." />
        </div>
        <figure className="desk-shot">
          <img src={shotInk} alt="The Windows studio in the Ink theme, the sample residence traced with its zones." width={2880} height={1800} loading="lazy" decoding="async" data-parallax="0.06" />
        </figure>
        <div className="wrap">
          <div className="platforms">
            <article className="platform">
              <h3><Monitor size={18} aria-hidden="true" /> Windows</h3>
              <p>A native app with the whole studio: a big canvas, keyboard shortcuts, Paper or Ink, PNG and PDF export.</p>
            </article>
            <article className="platform">
              <h3><Smartphone size={18} aria-hidden="true" /> Android</h3>
              <p>Built for site visits: photograph a plan, trace it step by step, read it, and point the compass at the walls.</p>
            </article>
            <article className="platform">
              <h3><Globe size={18} aria-hidden="true" /> Browser</h3>
              <p>The same studio at this address, on any modern browser. Add it to the Home Screen on an iPhone and it opens like an app.</p>
            </article>
          </div>
          <div className="phones">
            <figure className="frame-phone"><img src={shotPhoneStudio} alt="The Android studio: the plan on a phone with the step strip along the bottom." width={1170} height={2532} loading="lazy" decoding="async" /></figure>
            <figure className="frame-phone"><img src={shotPhoneAnalysis} alt="The Android studio with the Zones read sheet open, listing every room's verdict." width={1170} height={2532} loading="lazy" decoding="async" /></figure>
            <figure className="frame-phone"><img src={shotPhonePlans} alt="The Plans tab listing saved plans." width={1170} height={2532} loading="lazy" decoding="async" /></figure>
          </div>
        </div>
      </section>

      {/* ———— why ———— */}
      <section className="chapter why" id="why" data-nav="paper">
        <div className="wrap">
          <ChapterHead title="Not a calculator."
            lede="Upload-and-score tools give a number and no way to argue with it. Vastu Studio is an instrument: it measures, shows its geometry, and leaves the judgement to the practitioner." />
          <dl className="why-list">
            <div><dt>Measured, never guessed</dt><dd>Every zone share comes from the outline you traced and the north you set, to the degree. Nothing is read off a picture.</dd></div>
            <div><dt>A verdict you can defend</dt><dd>Each room names its zone, its percentage, the chart it was judged by and the move that fixes it, in your units.</dd></div>
            <div><dt>Your name on the report</dt><dd>The PDF carries your practice, your notes and your reading. There is no generated score to explain away.</dd></div>
            <div><dt>Your plans stay yours</dt><dd>Drawings and reports live on your device. The server holds an account, a seat and the charts, nothing else.</dd></div>
          </dl>
        </div>
      </section>

      {/* ———— questions ———— */}
      <section className="chapter faq" id="faq" data-nav="paper">
        <div className="wrap">
          <ChapterHead title="Questions practitioners ask." lede="" />
          <div className="faq-list">
            {FAQ.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ———— get ———— */}
      <section className="chapter get" id="get" data-nav="paper">
        <div className="wrap">
          <ChapterHead title="Get Vastu Studio."
            lede={`Version ${rel.version}${rel.live ? `, released ${fmtDate(rel.publishedAt)}` : ''}. Install it, then sign in with the seat your studio issued.`} />
          <div className="downloads">
            <a className="dl" href={DOWNLOADS.windows}>
              <span className="dl-icon"><Monitor size={22} aria-hidden="true" /></span>
              <span className="dl-body">
                <b>Windows</b>
                <span>{ASSET_NAMES.windows} · {fmtMB(rel.sizes.windows)} · Windows 10 and 11, 64-bit</span>
                <small>Windows may show a SmartScreen notice for a new publisher. Choose <i>More info</i>, then <i>Run anyway</i>.</small>
              </span>
              <Download size={18} aria-hidden="true" className="dl-arrow" />
            </a>
            <a className="dl" href={DOWNLOADS.android}>
              <span className="dl-icon"><Smartphone size={22} aria-hidden="true" /></span>
              <span className="dl-body">
                <b>Android</b>
                <span>{ASSET_NAMES.android} · {fmtMB(rel.sizes.android)} · Android 8 and up</span>
                <small>Allow installs from your browser when Android asks. Camera is for importing plans, location for true north.</small>
              </span>
              <Download size={18} aria-hidden="true" className="dl-arrow" />
            </a>
            <a className="dl" href={APP_URL}>
              <span className="dl-icon"><Globe size={22} aria-hidden="true" /></span>
              <span className="dl-body">
                <b>Browser</b>
                <span>Nothing to install. Open the studio here.</span>
                <small>On an iPhone, use Share, then Add to Home Screen, for the app-like studio.</small>
              </span>
              <ArrowUpRight size={18} aria-hidden="true" className="dl-arrow" />
            </a>
          </div>

          <div className="seat">
            <div className="seat-copy">
              <h3>One seat, the whole studio.</h3>
              <p>Vastu Studio is sold per practitioner, per year. A seat opens the app on one device at a time, on every platform, with the charts, the compass tables, the readings and the reports, and every update while it runs.</p>
            </div>
            <div className="seat-ctas">
              {whatsapp && <a className="btn-gold lg" href={whatsapp} target="_blank" rel="noopener noreferrer"><MessageCircle size={17} aria-hidden="true" /> Ask for a seat on WhatsApp</a>}
              {!whatsapp && mail && <a className="btn-gold lg" href={mail}><Mail size={17} aria-hidden="true" /> Ask for a seat</a>}
              <a className={whatsapp || mail ? 'btn-line lg' : 'btn-gold lg'} href={APP_URL}>{returning ? 'Back to the studio' : 'Already have a seat? Sign in'} <ArrowRight size={16} aria-hidden="true" /></a>
            </div>
            {!whatsapp && !mail && <p className="seat-note">Seats are issued by the studio. Ask the practitioner who introduced you to Vastu Studio.</p>}
          </div>
        </div>
      </section>

      <footer className="foot" data-nav="ink">
        <div className="wrap">
          <div className="foot-brand"><Mark size={20} /> Vastu <em>Studio</em></div>
          <p className="foot-line">The instrument for Vastu practitioners. Made in India.</p>
          <nav className="foot-links" aria-label="Footer">
            <a href={APP_URL}>Open the studio</a>
            <a href={DOWNLOADS.releases}>All releases</a>
            <a href={REPO}>Source on GitHub</a>
          </nav>
          <p className="foot-fine">Plans and reports stay on your device. Your account is a phone number and a password; the server keeps that, your seat, and the charts.</p>
        </div>
      </footer>
    </div>
  )
}
