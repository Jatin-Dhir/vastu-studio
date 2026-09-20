import { useEffect, useMemo, useState } from 'react'
import { Bookmark, Compass, LocateFixed, Trash2 } from 'lucide-react'
import { useStore } from '../store'
import { CompassDial } from './CompassDial'
import { useHeading } from './useHeading'
import { LIFE_ASPECTS_16, PADAS32, ZONES8 } from './data'
import { compassPointLabel, normalizeDeg, padaIndexFor, point16IndexFor, zone8IndexFor } from './math'
import { haptic } from '../native'

/* The live compass: face a wall, read the zone. True north by default (magnetic heading
 * corrected with the WMM declination for the phone's position); magnetic on request.
 * Readings can be saved with a label so a site visit leaves a record. */

const TRUE_KEY = 'vastu-studio.compass.true-north'
const READINGS_KEY = 'vastu-studio.compass.readings.v1'
const TILT_WARN_DEG = 15

interface Reading { id: string; label: string; deg: number; mode: 'true' | 'magnetic'; at: number }

function loadReadings(): Reading[] {
  try { return JSON.parse(localStorage.getItem(READINGS_KEY) || '[]') } catch { return [] }
}
function saveReadings(r: Reading[]) {
  try { localStorage.setItem(READINGS_KEY, JSON.stringify(r.slice(0, 60))) } catch { /* private mode */ }
}

export function CompassScreen({ active }: { active: boolean }) {
  const theme = useStore((s) => s.theme)
  const toast = useStore((s) => s.toast)
  const h = useHeading(active)
  const [trueNorth, setTrueNorth] = useState(() => { try { return localStorage.getItem(TRUE_KEY) !== '0' } catch { return true } })
  const [readings, setReadings] = useState<Reading[]>(loadReadings)
  const [labelling, setLabelling] = useState(false)
  const [label, setLabel] = useState('')

  useEffect(() => { try { localStorage.setItem(TRUE_KEY, trueNorth ? '1' : '0') } catch { /* private mode */ } }, [trueNorth])

  const corrected = h.declination && trueNorth
  const heading = h.magneticDeg == null ? null : normalizeDeg(h.magneticDeg + (corrected ? h.declination!.deg : 0))
  const zone = heading == null ? null : ZONES8[zone8IndexFor(heading)]
  const pada = heading == null ? null : PADAS32[padaIndexFor(heading)]
  const aspect = heading == null ? null : LIFE_ASPECTS_16[point16IndexFor(heading)]
  const tilted = (h.tiltDeg ?? 0) > TILT_WARN_DEG

  const sourceLine = useMemo(() => {
    if (!trueNorth) return 'Magnetic north — the raw sensor heading, as a physical compass reads it.'
    if (h.declination) {
      const d = h.declination.deg
      const unc = h.declination.uncertaintyDeg != null ? ` ± ${h.declination.uncertaintyDeg.toFixed(1)}°` : ''
      return `True north — corrected by ${d >= 0 ? '+' : ''}${d.toFixed(1)}° (${h.declination.model}${unc}) for your location.`
    }
    if (h.location === 'asking') return 'Finding your location to correct for magnetic declination…'
    if (h.location === 'denied') return 'Location is off, so this is the magnetic heading. Allow location to correct to true north.'
    return 'Showing the magnetic heading — the declination service is out of reach right now.'
  }, [trueNorth, h.declination, h.location])

  const save = () => {
    if (heading == null) return
    const r: Reading = { id: Math.random().toString(36).slice(2), label: label.trim() || `${compassPointLabel(heading)} wall`, deg: Math.round(heading), mode: corrected ? 'true' : 'magnetic', at: Date.now() }
    const next = [r, ...readings]
    setReadings(next); saveReadings(next)
    setLabelling(false); setLabel('')
    haptic('success')
    toast(`Saved ${r.label} · ${r.deg}°`, 'ok')
  }
  const remove = (id: string) => { const next = readings.filter((r) => r.id !== id); setReadings(next); saveReadings(next) }

  return (
    <div className="m-scroll m-compass">
      <header className="m-head">
        <h1>Compass</h1>
        <p>Point the top of the phone at a wall or a door to read its zone.</p>
      </header>

      <div className="m-seg" role="tablist" aria-label="North reference">
        <button role="tab" aria-selected={trueNorth} className={trueNorth ? 'on' : ''} onClick={() => setTrueNorth(true)}>True north</button>
        <button role="tab" aria-selected={!trueNorth} className={!trueNorth ? 'on' : ''} onClick={() => setTrueNorth(false)}>Magnetic</button>
      </div>

      <div className="m-dial-wrap">
        {heading != null ? (
          <>
            <CompassDial headingDeg={heading} paper={theme === 'paper'} size={Math.min(320, window.innerWidth - 48)} />
            <div className={`m-tilt ${tilted ? 'show' : ''}`} aria-hidden={!tilted}>Hold the phone flat</div>
          </>
        ) : h.support === 'needs-permission' ? (
          <div className="m-sensor">
            <Compass size={28} />
            <p>The compass needs motion access on this phone.</p>
            <button className="btn-primary m-btn" onClick={() => void h.enable()}>Enable the compass</button>
          </div>
        ) : h.support === 'unsupported' ? (
          <div className="m-sensor">
            <Compass size={28} />
            <p>This device reports no orientation sensor, so there is no heading to show. Open the app on a phone.</p>
          </div>
        ) : (
          <div className="m-sensor"><Compass size={28} /><p>Waiting for the sensor…</p></div>
        )}
      </div>
      <p className="m-source"><LocateFixed size={12} /> {sourceLine}</p>

      {zone && heading != null && (
        <>
          <section className="m-card">
            <div className="m-card-head">
              <span className="m-zone-swatch" style={{ background: zone.colourHex }} />
              <div>
                <h2>{zone.sanskrit} · {zone.name}</h2>
                <p>{aspect} · {compassPointLabel(heading)} · {Math.round(heading)}°</p>
              </div>
            </div>
            <dl className="m-facts">
              <div><dt>Rules</dt><dd>{zone.planet} ({zone.planetSanskrit}) · {zone.deity}</dd></div>
              <div><dt>Colour, shape</dt><dd>{zone.colour} · {zone.shape}</dd></div>
              <div><dt>Best use</dt><dd>{zone.room}</dd></div>
              <div><dt>Entrance here</dt><dd>{zone.entrance}</dd></div>
              <div><dt>Body</dt><dd>{zone.organ}</dd></div>
              <div><dt>When faulted</dt><dd>{zone.defect}</dd></div>
              <div><dt>Remedy</dt><dd>{zone.remedy}</dd></div>
              <div><dt>Sleep</dt><dd>{zone.sleep}</dd></div>
            </dl>
          </section>

          {pada && (
            <section className="m-card m-pada">
              <div>
                <h2>{pada.name} <span className="m-hindi">{pada.hindi}</span></h2>
                <p>Pada {padaIndexFor(heading) + 1} of 32 · {pada.mantra}</p>
              </div>
              <span className={`vbadge lean-${pada.lean}`}>{pada.lean}</span>
            </section>
          )}

          {!labelling ? (
            <button className="btn-ghost m-btn" onClick={() => setLabelling(true)}><Bookmark size={15} /> Save this reading</button>
          ) : (
            <div className="m-savebar">
              <input className="m-input" autoFocus placeholder="Main door, kitchen window…" value={label}
                onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save() }} />
              <button className="btn-primary" onClick={save}>Save {Math.round(heading)}°</button>
              <button className="btn-ghost" onClick={() => { setLabelling(false); setLabel('') }}>Cancel</button>
            </div>
          )}
        </>
      )}

      {readings.length > 0 && (
        <section className="m-card">
          <h2 className="m-card-title">Saved readings</h2>
          <ul className="m-readings">
            {readings.map((r) => (
              <li key={r.id}>
                <div>
                  <b>{r.label}</b>
                  <small>{r.deg}° {compassPointLabel(r.deg)} · {ZONES8[zone8IndexFor(r.deg)].sanskrit} · {r.mode === 'true' ? 'true' : 'magnetic'} · {new Date(r.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</small>
                </div>
                <button className="icon-btn" aria-label={`Delete ${r.label}`} onClick={() => remove(r.id)}><Trash2 size={15} /></button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
