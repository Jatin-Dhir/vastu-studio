import { useEffect, useRef, useState } from 'react'
import { ArrowRight, ArrowUpRight, Check, Download, Globe, MessageCircle, Mail, Monitor, Smartphone } from 'lucide-react'
import { HeroPlan, PlanStill } from './HeroPlan'
import { DialDemo } from './DialDemo'
import { armReveals, heroIntro, refreshTriggers, reducedMotion, scrubSection } from './motion'
import { APP_URL, ASSET_NAMES, CONTACT, DOWNLOADS, FALLBACK_RELEASE, REPO, REPO_API } from './config'
import { ZONES16 } from '../src/vastu'
import shotZones from './shots/desktop-zones.webp'
import shotVerdicts from './shots/desktop-verdicts.webp'
import shotInk from './shots/desktop-ink.webp'
import shotPhoneStudio from './shots/phone-studio.webp'
import shotPhoneAnalysis from './shots/phone-analysis.webp'
import shotPhoneCompass from './shots/phone-compass-ink.webp'
import shotPhoneReport from './shots/phone-report.webp'
import shotPhonePlans from './shots/phone-plans.webp'
import shotReport1 from './shots/report-1.webp'
import shotReport2 from './shots/report-2.webp'
import shotReport3 from './shots/report-3.webp'

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

function ChapterHead({ n, title, lede }: { n: string; title: React.ReactNode; lede: string }) {
  return (
    <header className="ch-head">
      <span className="ch-num" aria-hidden="true">{n}</span>
      <h2 data-split>{title}</h2>
      <p className="ch-lede" data-reveal>{lede}</p>
    </header>
  )
}

function Facts({ items }: { items: string[] }) {
  return (
    <ul className="facts" data-reveal-group>
      {items.map((t) => <li key={t}><Check size={15} strokeWidth={2.5} aria-hidden="true" /><span>{t}</span></li>)}
    </ul>
  )
}

/** The sixteen zones and what each governs, straight from the studio's table. */
function ZoneStrip() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    return scrubSection(el, (p) => { el.style.setProperty('--shift', `${(-p * 14).toFixed(2)}%`) })
  }, [])
  return (
    <div className="zone-strip" ref={ref} aria-label="The sixteen zones and what each governs">
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

/* ------------------------------------------------------------------ the page */

export function Site({ returning }: { returning: boolean }) {
  const root = useRef<HTMLDivElement>(null)
  const hero = useRef<HTMLElement>(null)
  const compassSec = useRef<HTMLElement>(null)
  const [scrolled, setScrolled] = useState(false)
  const rel = useRelease()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!root.current || !hero.current) return
    const offHero = heroIntro(root.current)
    const offReveals = armReveals(root.current)
    // fonts and lazy images change the measurements the scroll triggers were made with
    document.fonts?.ready.then(refreshTriggers).catch(() => {})
    const imgs = Array.from(root.current.querySelectorAll('img'))
    imgs.forEach((im) => im.addEventListener('load', refreshTriggers, { once: true }))
    return () => { offHero(); offReveals() }
  }, [])

  const openLabel = returning ? 'Back to the studio' : 'Open the studio'
  const whatsapp = CONTACT.whatsapp ? `https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent('Hello — I would like a Vastu Studio seat.')}` : ''
  const mail = CONTACT.email ? `mailto:${CONTACT.email}?subject=${encodeURIComponent('Vastu Studio seat')}` : ''

  return (
    <div ref={root} className="site">
      <a className="skip" href="#draw">Skip to content</a>

      <header className={`nav ${scrolled ? 'scrolled' : ''}`} data-hero-nav>
        <a className="nav-brand" href="#top" aria-label="Vastu Studio, top of page"><Mark /> Vastu <em>Studio</em></a>
        <nav className="nav-links" aria-label="Chapters">
          <a href="#draw">Draw</a><a href="#read">Read</a><a href="#compass">Compass</a><a href="#report">Report</a><a href="#everywhere">Everywhere</a>
        </nav>
        <div className="nav-cta">
          <a className="btn-gold" href="#get"><Download size={15} aria-hidden="true" /> Download</a>
          <a className="btn-line" href={APP_URL}>{openLabel} <ArrowRight size={15} aria-hidden="true" /></a>
        </div>
      </header>

      {/* ———— hero ———— */}
      <section className="hero" id="top" ref={hero}>
        <div className="hero-copy" data-hero-copy>
          <p className="eyebrow" data-hero-eyebrow>For Vastu practitioners · Windows · Android · the browser</p>
          <h1 data-hero-title>The drawing board <em>for Vastu.</em></h1>
          <p className="hero-sub">Import a floor plan, trace its boundary, and Vastu Studio lays the sixteen zones, thirty-two gates and the Brahmasthan over it to scale — with a verdict, in percentages, for every room you mark.</p>
          <div className="hero-ctas">
            <a className="btn-gold lg" href={DOWNLOADS.windows}><Monitor size={17} aria-hidden="true" /> Download for Windows</a>
            <a className="btn-line lg" href={DOWNLOADS.android}><Smartphone size={17} aria-hidden="true" /> Get it on Android</a>
          </div>
          <p className="hero-note">or <a href={APP_URL}>open the studio in your browser</a> · version {rel.version}</p>
        </div>
        <div className="hero-stage" data-hero-stage>
          <HeroPlan />
          <p className="hero-caption">Drawn live by the studio's own renderer: the sample residence, traced, read, and judged.</p>
        </div>
      </section>

      <ZoneStrip />

      {/* ———— 01 draw ———— */}
      <section className="chapter" id="draw">
        <ChapterHead n="01" title={<>Any plan becomes <em>a drawing.</em></>}
          lede="Bring a PDF, an AutoCAD DXF, a photo of a blueprint, or capture the plot straight from satellite view. Set the scale from one known wall, tap the corners, and the outline snaps true — curved walls included." />
        <figure className="frame-desktop" data-rise>
          <img src={shotZones} alt="The Windows studio with the sample residence traced and the sixteen-zone wheel laid over it; the plan panel shows area, perimeter and scale." width={2880} height={1800} loading="lazy" decoding="async" />
          <figcaption>Paper theme · the sample residence, 945 sq ft, north at 8°</figcaption>
        </figure>
        <div className="two-col">
          <Facts items={[
            'Scale from any known length — feet, metres, inches, or the drawing’s own CAD units.',
            'Corner snapping at 15°, curved walls by drag, the centre found by area — never by eye.',
            'Room labels are read off the plan on the device itself; nothing is uploaded.',
            'Several drawings open at once, each a tab; every plan saves itself as you work.',
          ]} />
          <figure className="frame-phone small" data-rise>
            <img src={shotPhoneStudio} alt="The Android studio: the same plan on a phone, with the step strip — Outline, Scale, North, Rooms, Read — along the bottom." width={1170} height={2532} loading="lazy" decoding="async" />
          </figure>
        </div>
      </section>

      {/* ———— 02 read ———— */}
      <section className="chapter" id="read">
        <ChapterHead n="02" title={<>A verdict for every room, <em>in percentages.</em></>}
          lede="Mark a room and the studio measures how much of it falls in each of the sixteen zones, judges the seat against the charts, and tells you the move that fixes it — in your units, in your direction." />
        <div className="verdicts" data-reveal-group>
          <article className="vcard v-avoid">
            <header><b>Bath</b><i>avoid</i></header>
            <p className="v-where">19% in NE · 18% in ENE · on the Brahmasthan</p>
            <p>The most serious seat — health, memory and wisdom drain away. Move it about 2′ 5″ south-south-east, into ESE, three zones clockwise.</p>
          </article>
          <article className="vcard v-ideal">
            <header><b>Kitchen</b><i>ideal</i></header>
            <p className="v-where">37% in SSE · 29% in S</p>
            <p>The fire seat — strength, confidence and delicious, healthy food. Right where it should be.</p>
          </article>
          <article className="vcard v-avoid">
            <header><b>Main door</b><i>N2 · Naga</i></header>
            <p className="v-where">an inauspicious gate</p>
            <p>Naga breeds enmity and jealousy. Favourable gates on this wall: N3 Mukhya, N4 Bhallata.</p>
          </article>
        </div>
        <div className="triptych" data-reveal-group>
          <figure><PlanStill overlay="zones16" /><figcaption><b>16 zones</b> clipped to the plot, the Brahmasthan at the centre</figcaption></figure>
          <figure><PlanStill overlay="gates32" /><figcaption><b>32 gates</b> N1–W8 with their devtas, the entrance tied to its pada</figcaption></figure>
          <figure><PlanStill overlay="grid9" /><figcaption><b>9 × 9 mandala</b> fitted to the plot, all forty-five devtas</figcaption></figure>
        </div>
        <figure className="frame-desktop" data-rise>
          <img src={shotVerdicts} alt="The Rooms & objects card listing each room with its zone shares and verdict: Bath avoid, Kitchen ideal, Pooja ideal, Bore well good." width={2880} height={1800} loading="lazy" decoding="async" />
          <figcaption>Rooms &amp; objects · tap a row for the why and the move</figcaption>
        </figure>
      </section>

      {/* ———— 03 compass ———— */}
      <section className="chapter ink" id="compass" ref={compassSec}>
        <ChapterHead n="03" title={<>The compass, <em>in your hand.</em></>}
          lede="Point the phone at a wall and read its zone — corrected to true north for where you stand — with the ruler, deity, colour, best use and remedy of that direction, and the pada under the needle." />
        <div className="compass-row">
          <DialDemo sectionRef={compassSec} />
          <figure className="frame-phone" data-rise>
            <img src={shotPhoneCompass} alt="The compass screen of the Android app in Ink: the dial reading 047°, NE Ishan, with the zone's rules, colour, best use and entrance verdict below." width={1170} height={2532} loading="lazy" decoding="async" />
          </figure>
        </div>
        <p className="compass-hint" data-reveal>{reducedMotion ? 'The dial above reads north-east; on a phone it follows where you point.' : 'Scroll, and the rose turns — on a phone it follows where you point.'}</p>
        <Facts items={[
          'True north: the magnetic heading corrected by the declination for your location (WMM 2025), or magnetic if you prefer.',
          'Eight zones with ruler, deity, colour and shape, best use, entrance verdict, remedy and sleep direction.',
          'The thirty-two padas by name and lean, so a door’s gate reads on site.',
          'Save labelled readings as you walk the plot; they stay with the phone.',
        ]} />
      </section>

      {/* ———— 04 report ———— */}
      <section className="chapter" id="report">
        <ChapterHead n="04" title={<>A report your client <em>can hold.</em></>}
          lede="One tap builds a PDF set in the studio's own faces: the plan with its zones, the room-by-room verdicts, the entrance reading, the zone balance and the written assessment — ready for WhatsApp or print." />
        <div className="pages" data-reveal-group>
          <figure><img src={shotReport1} alt="Report page 1: the title page with the plan drawn to scale under the sixteen-zone wheel." width={1241} height={1754} loading="lazy" decoding="async" /><figcaption>Cover and plan</figcaption></figure>
          <figure><img src={shotReport2} alt="Report page 2: the placement verdicts, one row per room, with zone shares and moves." width={1241} height={1754} loading="lazy" decoding="async" /><figcaption>Placements</figcaption></figure>
          <figure><img src={shotReport3} alt="Report page 3: the zone balance and the written assessment." width={1241} height={1754} loading="lazy" decoding="async" /><figcaption>Balance and assessment</figcaption></figure>
        </div>
        <div className="two-col rev">
          <figure className="frame-phone small" data-rise>
            <img src={shotPhoneReport} alt="The Report tab on the phone: counters for favourable, caution and to-address findings, then the room list." width={1170} height={2532} loading="lazy" decoding="async" />
          </figure>
          <Facts items={[
            'Client name, address and your practice on the cover; your notes where you wrote them.',
            'Share straight from the phone, or Save as PDF on the desktop.',
            'PNG export of the drawing alone, for a presentation or a message.',
          ]} />
        </div>
      </section>

      {/* ———— 05 everywhere ———— */}
      <section className="chapter" id="everywhere">
        <ChapterHead n="05" title={<>On the desk, on site, <em>in the browser.</em></>}
          lede="One account opens the same studio on every platform. Plans live on the device they were drawn on; the charts, the compass tables and the reports come with your seat." />
        <div className="platforms" data-reveal-group>
          <article className="platform">
            <figure className="frame-desktop tight"><img src={shotInk} alt="The Windows studio in the Ink theme." width={2880} height={1800} loading="lazy" decoding="async" /></figure>
            <h3><Monitor size={18} aria-hidden="true" /> Windows</h3>
            <p>A native app with the whole studio: a big canvas, keyboard shortcuts, Paper or Ink, PNG and PDF export.</p>
          </article>
          <article className="platform">
            <figure className="frame-phone tight"><img src={shotPhoneAnalysis} alt="The Android studio with the Zones read sheet open." width={1170} height={2532} loading="lazy" decoding="async" /></figure>
            <h3><Smartphone size={18} aria-hidden="true" /> Android</h3>
            <p>Built for site visits: photograph a plan, trace it step by step, read it, and point the compass at the walls.</p>
          </article>
          <article className="platform">
            <figure className="frame-phone tight"><img src={shotPhonePlans} alt="The Plans tab listing saved plans." width={1170} height={2532} loading="lazy" decoding="async" /></figure>
            <h3><Globe size={18} aria-hidden="true" /> Browser</h3>
            <p>The same studio at this address, on any modern browser. Add it to the Home Screen on an iPhone and it opens like an app.</p>
          </article>
        </div>
        <Facts items={[
          'Works offline once loaded — plots in basements and low-signal sites included.',
          'Plans and reports stay on your device. The server holds your account and the charts.',
          'One seat, one device at a time — move between them whenever you like.',
        ]} />
      </section>

      {/* ———— 06 get ———— */}
      <section className="chapter get" id="get">
        <ChapterHead n="06" title={<>Get <em>Vastu Studio.</em></>}
          lede={`Version ${rel.version}${rel.live ? `, released ${fmtDate(rel.publishedAt)}` : ''}. Install it, then sign in with the seat your studio issued.`} />
        <div className="downloads" data-reveal-group>
          <a className="dl" href={DOWNLOADS.windows}>
            <span className="dl-icon"><Monitor size={22} aria-hidden="true" /></span>
            <span className="dl-body">
              <b>Windows</b>
              <span>{ASSET_NAMES.windows} · {fmtMB(rel.sizes.windows)} · Windows 10 and 11, 64-bit</span>
              <small>Windows may show a SmartScreen notice for a new publisher — choose <i>More info</i>, then <i>Run anyway</i>.</small>
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
              <span>Nothing to install — open the studio here</span>
              <small>On an iPhone, use Share → Add to Home Screen for the app-like studio.</small>
            </span>
            <ArrowUpRight size={18} aria-hidden="true" className="dl-arrow" />
          </a>
        </div>

        <div className="seat" data-reveal>
          <div className="seat-copy">
            <h3>One seat, the whole studio.</h3>
            <p>Vastu Studio is sold per practitioner, per year. A seat opens the app on one device at a time, on every platform, with the charts, the compass tables, the readings and the reports — and every update while it runs.</p>
          </div>
          <div className="seat-ctas">
            {whatsapp && <a className="btn-gold lg" href={whatsapp} target="_blank" rel="noopener noreferrer"><MessageCircle size={17} aria-hidden="true" /> Ask for a seat on WhatsApp</a>}
            {!whatsapp && mail && <a className="btn-gold lg" href={mail}><Mail size={17} aria-hidden="true" /> Ask for a seat</a>}
            <a className={whatsapp || mail ? 'btn-line lg' : 'btn-gold lg'} href={APP_URL}>{returning ? 'Back to the studio' : 'Already have a seat? Sign in'} <ArrowRight size={16} aria-hidden="true" /></a>
          </div>
          {!whatsapp && !mail && <p className="seat-note">Seats are issued by the studio — ask the practitioner who introduced you to Vastu Studio.</p>}
        </div>
      </section>

      <footer className="foot">
        <div className="foot-brand"><Mark size={20} /> Vastu <em>Studio</em></div>
        <p className="foot-line">The drawing board for Vastu practitioners. Made in India.</p>
        <nav className="foot-links" aria-label="Footer">
          <a href={APP_URL}>Open the studio</a>
          <a href={DOWNLOADS.releases}>All releases</a>
          <a href={REPO}>Source on GitHub</a>
        </nav>
        <p className="foot-fine">Plans and reports stay on your device. Your account is a phone number and a password; the server keeps that, your seat, and the charts.</p>
      </footer>
    </div>
  )
}
