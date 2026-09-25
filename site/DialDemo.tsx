import { useEffect, useRef, useState } from 'react'
import { CompassDial } from '../src/compass/CompassDial'
import { PADAS32, ZONES8 } from '../src/compass/data'
import { compassPointLabel, padaIndexFor, zone8IndexFor } from '../src/compass/math'
import { scrubSection } from './motion'

/* The phone app's compass, turning as you scroll through its chapter — the rose sweeps from
 * north-west round through north to east, and the reading beside it changes zone by zone,
 * from the same tables the app reads. On a phone with sensors this is what pointing does. */
const FROM = 318, TO = 96

export function DialDemo({ sectionRef }: { sectionRef: React.RefObject<HTMLElement | null> }) {
  const [heading, setHeading] = useState(47)
  const last = useRef(47)

  useEffect(() => {
    const el = sectionRef.current
    if (!el) return
    return scrubSection(el, (p) => {
      const span = ((TO - FROM + 360) % 360) || 360
      const h = Math.round((FROM + p * span) % 360)
      if (h !== last.current) { last.current = h; setHeading(h) }
    })
  }, [sectionRef])

  const zone = ZONES8[zone8IndexFor(heading)]
  const pada = PADAS32[padaIndexFor(heading)]

  return (
    <div className="dial-demo">
      <div className="dial-demo-face">
        <CompassDial headingDeg={heading} size={360} paper={false} />
      </div>
      <div className="dial-demo-read" aria-live="polite">
        <div className="dd-zone">
          <span className="dd-swatch" style={{ background: zone.colourHex }} aria-hidden="true" />
          <div>
            <h3>{zone.sanskrit} · {zone.name}</h3>
            <p>{zone.lifeAspect} · {compassPointLabel(heading)} · {heading}°</p>
          </div>
        </div>
        <dl className="dd-facts">
          <div><dt>Rules</dt><dd>{zone.planet} ({zone.planetSanskrit}) · {zone.deity}</dd></div>
          <div><dt>Colour, shape</dt><dd>{zone.colour} · {zone.shape}</dd></div>
          <div><dt>Best use</dt><dd>{zone.room}</dd></div>
          <div><dt>Entrance here</dt><dd>{zone.entrance}</dd></div>
          <div><dt>Sleep</dt><dd>{zone.sleep}</dd></div>
          <div><dt>Pada</dt><dd>{pada.name} <span className={`dd-lean ${pada.lean}`}>{pada.lean}</span></dd></div>
        </dl>
      </div>
    </div>
  )
}
