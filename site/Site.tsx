import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ZONES16 } from '../src/vastu'
import { APP_URL, ASSET_NAMES, DOWNLOADS, FALLBACK_RELEASE, REPO_API, contactLinks, visitorPlatform } from './config'
import { Instrument, Part, PlanReading } from './Dial'
import {
  armReveals, heroIntro, initSmoothScroll, motionReduced, pastHero, refreshTriggers, scrubWords,
  setMotionReduced, tweenBearing, warmImages,
} from './motion'
import { NORTH_DEG } from './sample'
import shotVerdicts from './shots/desktop-verdicts.webp'
import shotPhoneStudio from './shots/phone-studio.webp'
import shotPhoneAnalysis from './shots/phone-analysis.webp'
import shotPhoneCompass from './shots/phone-compass-ink.webp'
import shotReport1 from './shots/report-1.webp'
import shotReport2 from './shots/report-2.webp'
import shotReport3 from './shots/report-3.webp'
import 'lenis/dist/lenis.css'

/* The page follows a watch house's model page: the instrument alone on a pale field, one
 * statement set large on white, then each part shown on its own with its story, the technical
 * details, the sample report as the brochure, and the download. */

/* ------------------------------------------------------------------ small pieces */

function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="mark">
      <rect x="8.2" y="8.2" width="15.6" height="15.6" rx="1.5" transform="rotate(45 16 16)" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <circle cx="16" cy="16" r="3" fill="currentColor" />
    </svg>
  )
}

const Icon = {
  down: <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 4v12m0 0-5-5m5 5 5-5M5 20h14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  arrow: <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M5 12h14m0 0-6-6m6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  up: <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="m6 15 6-6 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  menu: <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 8h16M4 16h16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>,
  close: <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>,
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

type Way = 'windows' | 'android' | 'browser'
/** The ways in, the visitor's own first: the hero offers that one, and the download list leads
 *  with it. iPhones, Macs and Linux have no app to install, so the browser studio leads there. */
const WAYS: Way[] = (() => {
  const p = visitorPlatform()
  return p === 'android' ? ['android', 'windows', 'browser'] : p === 'windows' ? ['windows', 'android', 'browser'] : ['browser', 'windows', 'android']
})()
const OTHER_WAYS = WAYS[0] === 'browser' ? 'Windows and Android apps' : `${WAYS[1] === 'windows' ? 'Windows' : 'Android'} and browser`

const SECTIONS = [
  { id: 'zones', label: 'Sixteen zones' },
  { id: 'gates', label: 'Thirty-two gates' },
  { id: 'mandala', label: 'The centre' },
  { id: 'verdicts', label: 'Verdicts' },
  { id: 'studio', label: 'In the studio' },
  { id: 'details', label: 'Technical details' },
  { id: 'report', label: 'Sample report' },
  { id: 'download', label: 'Download' },
]

/** One part of the instrument and its story: the part on the left, the words on the right. */
function Chapter({ id, eyebrow, title, art, children, tone }: { id: string; eyebrow: string; title: string; art: ReactNode; children: ReactNode; tone?: string }) {
  return (
    <section className="chapter" id={id} aria-labelledby={`${id}-h`}>
      <div className="chapter-art" data-rise>{art}</div>
      <div className="chapter-copy">
        <p className="eyebrow">{eyebrow}</p>
        <h2 id={`${id}-h`} className="chapter-h" data-heading style={tone ? { color: tone } : undefined}>{title}</h2>
        <div className="chapter-body" data-stagger>{children}</div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ content */

const DETAILS: { h: string; rows: [string, ReactNode][] }[] = [
  { h: 'Plans in', rows: [
    ['Formats', 'PDF, AutoCAD DXF, a photo or scan of a blueprint, or a plot captured from satellite view'],
    ['Scale', 'From any known length, or from the drawing’s own units'],
    ['Tracing', 'Corners snap to the drawing; curved walls; lengths in feet or metres as you draw'],
  ] },
  { h: 'The compass', rows: [
    ['Sixteen zones', '22.5° each, clipped to the plot, in the colours the practitioner sets'],
    ['Thirty-two gates', 'Entrance padas of 11.25° with their devtas'],
    ['Mandala', 'The nine-by-nine Vastu Purusha Mandala with all forty-five devtas'],
    ['Your own chakra', 'Load a chakra image, size and turn it over any plan'],
  ] },
  { h: 'North', rows: [
    ['From the drawing', 'Tap the tail and tip of the plan’s north arrow'],
    ['By bearing', 'Type it to the degree, then lock it'],
    ['On site', 'The phone’s compass, corrected to true north by the World Magnetic Model 2025'],
  ] },
  { h: 'The reading', rows: [
    ['Zone balance', 'Every zone’s share of the plot by area, with cuts and extensions flagged'],
    ['Rooms and objects', 'How much of each room sits in which zone, judged against your charts, with the move that fixes it'],
    ['Doors', 'The pada each entrance falls in, and the favourable padas on the same wall'],
    ['The centre', 'The Brahmasthan found by area, and what sits on it'],
  ] },
  { h: 'The report', rows: [
    ['Cover', 'Client, site and your practice'],
    ['Inside', 'The plan with its zones, findings, entrances, rooms and objects, zone balance and a written assessment'],
    ['Out', 'PDF to save or share on WhatsApp, print, or the drawing alone as PNG'],
  ] },
  { h: 'Platforms', rows: [
    ['Windows', 'Windows 10 and 11, 64-bit; installs its own signed updates'],
    ['Android', 'Android 8 and later; tells you when a new version is out'],
    ['Browser', 'Any current browser at this address, always the newest version; works offline once loaded'],
  ] },
  { h: 'Your data', rows: [
    ['Plans and reports', 'Stay on the device you made them on; never uploaded'],
    ['The server', <>Keeps your account and your seat, and sends the charts. <a href="./privacy/">Privacy</a></>],
  ] },
  { h: 'The method', rows: [
    ['Geometry', 'Areas from the traced outline; zone shares by clipping each zone’s wedge to the plot; bearings measured clockwise from true north'],
    ['Charts', 'Verdicts come from the charts that come with your seat; the reasoning for each is shown beside it'],
  ] },
]

interface Faq { q: string; a: string; rich?: ReactNode }

function faqs(contact: { whatsapp: string; mail: string }): Faq[] {
  const ask = contact.whatsapp || contact.mail
  return [
    { q: 'Which system does it read?', a: 'The sixteen-zone reading with the thirty-two entrance gates and the 81-pada mandala. The charts that turn geometry into verdicts come with your seat and stay on the server; the studio downloads them when you sign in.' },
    { q: 'What can I import?', a: 'A PDF, an AutoCAD DXF, a photo or scan of a blueprint, or a plot captured from satellite view. Scale comes from any known length, or from the drawing’s own units.' },
    { q: 'How is north set?', a: 'Tap the tail and tip of the drawing’s north arrow, type a bearing, or take it from the phone compass, which corrects the magnetic heading to true north for your location.' },
    { q: 'Does it work on site without signal?', a: 'Yes. Once loaded the studio works offline, and a seat stays valid for several days without reaching the server. Plans and reports never leave the device.' },
    {
      q: 'Who can see my clients’ plans?',
      a: 'Only you. Plans, notes and reports are stored on the device you made them on and are never uploaded. The server keeps your account and your seat, nothing from a plan. The privacy page lists every detail.',
      rich: <>Only you. Plans, notes and reports are stored on the device you made them on and are never uploaded. The server keeps your account and your seat, nothing from a plan. The <a href="./privacy/">privacy page</a> lists every detail.</>,
    },
    { q: 'Can I use it on my laptop and my phone?', a: 'One seat opens the studio on one device at a time, on every platform. Sign out on one, sign in on the other — or move the seat from the sign-in screen.' },
    { q: 'How do updates arrive?', a: 'The Windows app looks for a new version each time it opens, checks its signature and installs it with one click. The Android app tells you when one is out and opens the download. The studio in the browser is always the newest.' },
    ask
      ? {
          q: 'How do I get a seat?',
          a: 'Seats are issued by Vastu Studio, per practitioner, per year. Write to Vastu Studio and it will set one up for you.',
          rich: <>Seats are issued by Vastu Studio, per practitioner, per year. <a href={ask} {...(contact.whatsapp ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{contact.whatsapp ? 'Message Vastu Studio on WhatsApp' : 'Write to Vastu Studio'}</a> and it will set one up for you.</>,
        }
      : { q: 'How do I get a seat?', a: 'Seats are issued by Vastu Studio, per practitioner, per year. Ask the practitioner who introduced you to Vastu Studio.' },
  ]
}

/** FAQ data for search and answer engines, from the same list the page shows. */
function FaqData({ items }: { items: Faq[] }) {
  const json = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  }).replace(/</g, '\\u003c')
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
}

/* ------------------------------------------------------------------ the page */

export function Site({ returning }: { returning: boolean }) {
  const root = useRef<HTMLDivElement>(null)
  const hero = useRef<HTMLElement>(null)
  const statement = useRef<HTMLParagraphElement>(null)
  const rel = useRelease()
  const contact = contactLinks()
  const faq = faqs(contact)

  const [north, setNorth] = useState(NORTH_DEG)
  const [paper, setPaper] = useState(true)
  const [zone, setZone] = useState<number | null>(null)
  const [menu, setMenu] = useState(false)
  const [pill, setPill] = useState(false)
  const [pillOpen, setPillOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [reduced, setReduced] = useState(motionReduced)
  const stopTurn = useRef<() => void>(() => {})
  const menuOpener = useRef<HTMLButtonElement>(null)
  const menuCloser = useRef<HTMLButtonElement>(null)
  const menuWasOpen = useRef(false)

  // the menu is a dialog: focus goes into it on open and back to its button on close
  useEffect(() => {
    if (menu) menuCloser.current?.focus()
    else if (menuWasOpen.current) menuOpener.current?.focus()
    menuWasOpen.current = menu
  }, [menu])

  // the chakra turns from an offset back to the plan's north
  const turn = useCallback((offset: number) => {
    stopTurn.current()
    stopTurn.current = tweenBearing(NORTH_DEG + offset, NORTH_DEG, setNorth)
  }, [])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => (hero.current ? pastHero(hero.current, setPill) : undefined), [])

  // motion, re-armed when the footer switch changes; reduced motion leaves every final state
  useEffect(() => {
    const r = root.current
    if (!r) return
    document.documentElement.classList.toggle('reduce-motion', reduced)
    const offScroll = initSmoothScroll()
    const offIntro = heroIntro(r, turn)
    const offReveals = armReveals(r)
    const offWords = statement.current ? scrubWords(statement.current) : () => {}
    const offWarm = warmImages(r)
    document.fonts?.ready.then(refreshTriggers).catch(() => {})
    window.addEventListener('load', refreshTriggers, { once: true })
    return () => { offIntro(); offReveals(); offWords(); offWarm(); offScroll(); stopTurn.current() }
  }, [reduced, turn])

  // Escape closes whichever overlay is open
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMenu(false); setPillOpen(false) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const z = ZONES16[zone ?? 2]
  const { whatsapp, mail } = contact
  const dl: Record<Way, { name: string; sub: string; meta: string; note: string; href: string; act: ReactNode }> = {
    windows: {
      name: 'Windows', sub: 'Windows 10 and 11, 64-bit', meta: `${ASSET_NAMES.windows} · ${fmtMB(rel.sizes.windows)}`,
      note: 'Windows may show a SmartScreen notice for a new publisher: choose More info, then Run anyway.',
      href: DOWNLOADS.windows, act: <>{Icon.down} Download</>,
    },
    android: {
      name: 'Android', sub: 'Android 8 and later', meta: `${ASSET_NAMES.android} · ${fmtMB(rel.sizes.android)}`,
      note: 'Allow installs from your browser when Android asks. Camera is for importing plans, location for true north.',
      href: DOWNLOADS.android, act: <>{Icon.down} Download</>,
    },
    browser: {
      name: 'Browser', sub: 'Any current browser', meta: 'Nothing to install',
      note: 'On an iPhone, use Share, then Add to Home Screen, for the app-like studio.',
      href: APP_URL, act: <>{returning ? 'Back to the studio' : 'Open the studio'} {Icon.arrow}</>,
    },
  }

  return (
    <div ref={root} className="site">
      <a className="skip" href="#zones">Skip to content</a>

      <header className={`hd ${scrolled ? 'scrolled' : ''}`} data-intro="head">
        <button ref={menuOpener} className="hd-menu" type="button" aria-expanded={menu} aria-controls="menu" onClick={() => setMenu(true)}>
          {Icon.menu}<span>Menu</span>
        </button>
        <a className="hd-brand" href="#top" aria-label="Vastu Studio, top of page"><Mark /><span>Vastu Studio</span></a>
        <div className="hd-end">
          <a className="hd-link" href={APP_URL}>{returning ? 'Back to the studio' : 'Open the studio'}</a>
        </div>
      </header>

      <div id="menu" className={`menu ${menu ? 'open' : ''}`} role="dialog" aria-modal="true" aria-label="Menu" hidden={!menu}>
        <div className="menu-top">
          <button ref={menuCloser} className="hd-menu" type="button" onClick={() => setMenu(false)}>{Icon.close}<span>Close</span></button>
        </div>
        <nav aria-label="Sections" className="menu-nav">
          {SECTIONS.map((s, i) => (
            <a key={s.id} href={`#${s.id}`} onClick={() => setMenu(false)}><small>{String(i + 1).padStart(2, '0')}</small>{s.label}</a>
          ))}
        </nav>
        <div className="menu-foot">
          <a className="btn btn-dark" href="#download" onClick={() => setMenu(false)}>{Icon.down} Download</a>
          <a className="link" href={APP_URL}>Open the studio in your browser</a>
        </div>
      </div>

      <main>
        {/* ———— the instrument ———— */}
        <section className="hero" id="top" ref={hero} aria-label="Vastu Studio">
          <div className="hero-name" data-intro="copy">
            <h1>Vastu Studio</h1>
            <p className="hero-line">Floor-plan analysis for Vastu practitioners</p>
            <p>Version {rel.version}</p>
            <div className="hero-ctas">
              {WAYS[0] === 'browser'
                ? <a className="btn btn-dark" href={APP_URL}>{returning ? 'Back to the studio' : 'Open the studio'} {Icon.arrow}</a>
                : <a className="btn btn-dark" href={DOWNLOADS[WAYS[0]]}>{Icon.down} Download for {WAYS[0] === 'windows' ? 'Windows' : 'Android'}</a>}
              <a className="link" href="#download">{OTHER_WAYS}</a>
            </div>
          </div>
          <figure className="hero-object" data-intro="object">
            <Instrument north={north} paper={paper} />
          </figure>
          <div className="hero-controls" data-intro="foot">
            <button type="button" className="ctl" aria-pressed={!paper} onClick={() => setPaper((p) => !p)}>
              <span className={`ctl-dot ${paper ? '' : 'on'}`} aria-hidden="true" />{paper ? 'Night view' : 'Day view'}
            </button>
            <button type="button" className="ctl" onClick={() => turn(Math.random() < 0.5 ? -54 : 61)}>
              <span className="ctl-needle" aria-hidden="true" />Find north
            </button>
            <span className="ctl-read" aria-live="polite">N {north.toFixed(0)}°</span>
          </div>
        </section>

        {/* ———— the statement ———— */}
        <section className="statement" aria-label="What it does">
          <p ref={statement} className="statement-text">
            Vastu Studio lays the <span className="nw">sixteen-zone</span> chakra over any floor plan, turns it to <strong>true north</strong>, and reads
            every room, every door and the centre <strong>to <span className="nw">the degree</span></strong>.
          </p>
        </section>

        {/* ———— the parts ———— */}
        <Chapter id="zones" eyebrow="Sixteen-zone chakra" title="Every direction, in its own colour."
          art={<Part id="zones16" highlight={zone} onZone={setZone} label="The sixteen-zone chakra on its own: sixteen coloured zones of 22.5 degrees, north at the top. The arrow keys step through the zones." />}>
          <p>Sixteen zones of 22.5°, each with what it governs, laid over the plot around its centre. Each zone’s share of the plot is measured from the outline you trace, so a cut or an extended corner shows the moment it happens.</p>
          <div className="zone-read" aria-live="polite">
            <span className="zone-swatch" style={{ background: z.color }} aria-hidden="true" />
            <span><b>{z.name}</b><small>{z.theme}</small></span>
          </div>
          <p className="hint">Tap or point at a zone to read it. Arrow keys work too.</p>
        </Chapter>

        <Chapter id="gates" eyebrow="Thirty-two entrance padas" title="Every door, read by its pada."
          art={<Part id="gates32" label="The thirty-two entrance padas on their own, each 11.25 degrees, with their devtas." />}>
          <p>The perimeter divides into thirty-two padas of 11.25°, each with its devta. Mark a door and the studio names its pada and its zone, and the favourable padas on the same wall.</p>
          <ul className="facts">
            <li><b>32</b><span>padas of 11.25°, eight on each wall</span></li>
            <li><b>N2 Naga</b><span>the sample’s main door, read in the north-north-west</span></li>
            <li><b>N3 · N4</b><span>Mukhya and Bhallata, named as better seats on the same wall</span></li>
          </ul>
        </Chapter>

        <Chapter id="mandala" eyebrow="Brahmasthan · 81-pada mandala" title="The centre, found by area."
          art={<Part id="grid9" label="The nine-by-nine Vastu Purusha Mandala with its forty-five devtas and the Brahmasthan at the centre." />}>
          <p>The Brahmasthan is found by area, and the nine-by-nine mandala is laid over the plot in its own orientation, with all forty-five devtas in place. That orientation is true north: from the drawing’s own arrow, a typed bearing, or the phone’s compass corrected for where you stand.</p>
        </Chapter>

        <Chapter id="verdicts" eyebrow="Rooms and verdicts" title="A verdict for every room."
          art={<PlanReading />}>
          <p>Draw a room or drop a marker and the studio reads how much of it sits in which zone, judged against your charts, with the move that would fix it, in your units and your direction.</p>
          <ul className="verdict-list">
            <li><i className="v v-ideal">Ideal</i>Kitchen, 37% in SSE</li>
            <li><i className="v v-neutral">Neutral</i>Bedroom, 30% in ESE</li>
            <li><i className="v v-avoid">Avoid</i>Bath, on the Brahmasthan</li>
          </ul>
        </Chapter>

        {/* ———— at work ———— */}
        <section className="studio" id="studio" aria-labelledby="studio-h">
          <div className="studio-head">
            <p className="eyebrow">On Windows, Android and the browser</p>
            <h2 id="studio-h" className="section-h" data-heading>The same instrument, wherever you work.</h2>
            <p className="lede">A big canvas with keyboard shortcuts on the desk. A step-by-step studio and a <span className="nw">true-north</span> compass on site. The same studio in any browser. One seat, one device at a time.</p>
          </div>
          <figure className="studio-desk" data-rise>
            <img src={shotVerdicts} alt="The Windows studio: the sample residence under the sixteen-zone chakra, with the Rooms and objects panel listing each room with its zone shares and verdict." width={2880} height={1800} loading="lazy" decoding="async" />
          </figure>
          <div className="studio-phones" data-stagger>
            <figure><img src={shotPhoneStudio} alt="The Android studio: the plan with the step strip along the bottom." width={1170} height={2532} loading="lazy" decoding="async" /><figcaption>Trace on site</figcaption></figure>
            <figure><img src={shotPhoneAnalysis} alt="The Android studio with the Zones read sheet, listing every room's verdict." width={1170} height={2532} loading="lazy" decoding="async" /><figcaption>Read the zones</figcaption></figure>
            <figure><img src={shotPhoneCompass} alt="The Android compass reading 047 degrees, north-east, with the zone's rules." width={1170} height={2532} loading="lazy" decoding="async" /><figcaption>Point the compass</figcaption></figure>
          </div>
        </section>

        {/* ———— technical details ———— */}
        <section className="details" id="details" aria-labelledby="details-h">
          <h2 id="details-h" className="section-h">Vastu Studio technical details</h2>
          <div className="details-list">
            {DETAILS.map((d, i) => (
              <details key={d.h} open={i === 0}>
                <summary>{d.h}<span className="sum-icon" aria-hidden="true" /></summary>
                <dl>
                  {d.rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
                </dl>
              </details>
            ))}
          </div>
        </section>

        {/* ———— the brochure ———— */}
        <section className="report" id="report" aria-labelledby="report-h">
          <h2 id="report-h" className="display" data-heading>Sample report</h2>
          <p className="lede center">The PDF your client keeps, set in the studio’s own typefaces: the plan with its zones, every room’s verdict, the entrances, the zone balance and a written assessment, with the client and your practice on the cover.</p>
          <div className="report-pages" data-stagger>
            <img src={shotReport1} alt="Report page 1: the cover with the client, the site, the counts and the plan under the sixteen-zone chakra." width={1241} height={1754} loading="lazy" decoding="async" />
            <img src={shotReport2} alt="Report page 2: the findings, one per room, with zone shares and moves." width={1241} height={1754} loading="lazy" decoding="async" />
            <img src={shotReport3} alt="Report page 3: the entrances and the rooms and objects table." width={1241} height={1754} loading="lazy" decoding="async" />
          </div>
          <a className="btn btn-line" href="./sample-report.pdf" download>{Icon.down} Download the sample report (PDF)</a>
        </section>

        {/* ———— download ———— */}
        <section className="download" id="download" aria-labelledby="download-h">
          <div className="download-head">
            <h2 id="download-h" className="section-h" data-heading>Download Vastu Studio</h2>
            <p className="lede">Version {rel.version}{rel.live ? `, released ${fmtDate(rel.publishedAt)}` : ''}. Install it, then sign in with your seat.</p>
          </div>
          <ul className="dl-list">
            {WAYS.map((w, i) => (
              <li key={w}>
                <div className="dl-name"><b>{dl[w].name}</b><span>{dl[w].sub}</span></div>
                <div className="dl-meta">{dl[w].meta}<small>{dl[w].note}</small></div>
                <a className={`btn ${i === 0 ? 'btn-dark' : 'btn-line'}`} href={dl[w].href}>{dl[w].act}</a>
              </li>
            ))}
          </ul>
          <div className="seat">
            <h3>One seat, the whole studio.</h3>
            <p>Vastu Studio is sold per practitioner, per year. A seat opens the studio on one device at a time, on every platform, with the charts, the compass tables, the readings and the reports, and every update while it runs.</p>
            <div className="seat-ctas">
              {whatsapp && <a className="btn btn-dark" href={whatsapp} target="_blank" rel="noopener noreferrer">Ask for a seat on WhatsApp</a>}
              {!whatsapp && mail && <a className="btn btn-dark" href={mail}>Ask for a seat</a>}
              <a className="btn btn-line" href={APP_URL}>{returning ? 'Back to the studio' : 'Already have a seat? Sign in'} {Icon.arrow}</a>
            </div>
            {!whatsapp && !mail && <p className="fine">Seats are issued by Vastu Studio. Ask the practitioner who introduced you to it.</p>}
          </div>
        </section>

        {/* ———— questions ———— */}
        <section className="faq" id="faq" aria-labelledby="faq-h">
          <h2 id="faq-h" className="section-h">Questions practitioners ask</h2>
          <div className="details-list">
            {faq.map((f) => (
              <details key={f.q}>
                <summary>{f.q}<span className="sum-icon" aria-hidden="true" /></summary>
                <p>{f.rich ?? f.a}</p>
              </details>
            ))}
          </div>
          <FaqData items={faq} />
        </section>
      </main>

      {/* the privacy page (static HTML) repeats this footer — keep the two in step */}
      <footer className="foot">
        <div className="foot-top">
          <a className="foot-brand" href="#top"><Mark size={20} /><span>Vastu Studio</span></a>
          <nav className="foot-links" aria-label="Footer">
            <a href={APP_URL}>Open the studio</a>
            <a href={DOWNLOADS.releases}>All releases</a>
            <a href="./privacy/">Privacy</a>
          </nav>
        </div>
        <div className="foot-bottom">
          <p>Plans and reports stay on your device. The server keeps your account and your seat, and sends the charts. Made in India. © 2026 Vastu Studio.</p>
          <label className="switch">
            <input type="checkbox" checked={reduced} onChange={(e) => { setMotionReduced(e.target.checked); setReduced(e.target.checked) }} />
            <span aria-hidden="true" />Reduce motion
          </label>
        </div>
      </footer>

      {/* the model pill: always within reach once the instrument has scrolled away */}
      <div className={`pill ${pill ? 'show' : ''} ${pillOpen ? 'open' : ''}`}>
        {pillOpen && (
          <nav className="pill-menu" aria-label="Jump to">
            {SECTIONS.map((s) => <a key={s.id} href={`#${s.id}`} onClick={() => setPillOpen(false)}>{s.label}</a>)}
          </nav>
        )}
        <div className="pill-bar">
          <button type="button" className="pill-name" aria-expanded={pillOpen} onClick={() => setPillOpen((o) => !o)} tabIndex={pill ? 0 : -1}>
            Vastu Studio <span className={`pill-chev ${pillOpen ? 'up' : ''}`}>{Icon.up}</span>
          </button>
          <a className="btn btn-dark btn-sm" href="#download" tabIndex={pill ? 0 : -1}>Download</a>
        </div>
      </div>
    </div>
  )
}
