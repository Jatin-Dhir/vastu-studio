import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Dialog } from './Dialogs'
import { useStore } from '../store'
import { centroid, sampledPolygon } from '../geometry'
import { placementOf } from '../analysis'
import { detectRoomExtents } from '../roomExtent'
import { MARKER_KINDS, markerKindMeta } from '../vastu'
import type { MarkerKind, Pt } from '../types'
import type { DetectedRoom } from '../roomDetect'

interface ReviewRow {
  id: string
  included: boolean
  label: string
  kind: MarkerKind
  p: Pt
  sourceText: string
  confidence: number
  /** the room's footprint read from the walls around the label — null = not readable */
  rect: [Pt, Pt] | null
  /** the room's PRINTED size (the dimension line under its label), in metres */
  dimM?: { w: number; h: number }
}

const toRow = (r: DetectedRoom): ReviewRow => ({
  id: r.id, included: true, label: r.label, kind: r.kind, p: r.p, sourceText: r.sourceText, confidence: r.confidence, rect: null, dimM: r.dimM,
})

/** The best available footprint for a row: the architect's own printed dimensions
 *  (exact, drawing-style-proof) beat the pixel-detected wall box; null = point. */
function rectFor(row: ReviewRow, metersPerPx: number | null): [Pt, Pt] | null {
  if (row.dimM && metersPerPx) {
    const hw = row.dimM.w / metersPerPx / 2
    const hh = row.dimM.h / metersPerPx / 2
    return [{ x: row.p.x - hw, y: row.p.y - hh }, { x: row.p.x + hw, y: row.p.y + hh }]
  }
  return row.rect
}

/**
 * Review-and-confirm for src/roomDetect.ts candidates. Nothing here touches the
 * store's real markers until "Add N markers" — rows are edited in local state only.
 */
export function AutoDetectDialog() {
  const detected = useStore((s) => s.detectedRooms)
  const pts = useStore((s) => s.pts)
  const bulges = useStore((s) => s.bulges)
  const closed = useStore((s) => s.closed)
  const centerOverride = useStore((s) => s.centerOverride)
  const northDeg = useStore((s) => s.northDeg)
  const theme = useStore((s) => s.theme)
  const metersPerPx = useStore((s) => s.metersPerPx)
  const [rows, setRows] = useState<ReviewRow[]>([])
  const [asAreas, setAsAreas] = useState(true)
  const [sizing, setSizing] = useState(false)

  useEffect(() => {
    if (!detected) return
    setRows(detected.map(toRow))
    // grow each label point into the room around it (raster plans only — a DXF
    // background has no pixels to fill; its rows simply stay point markers)
    const bg = useStore.getState().bg
    if (bg.kind !== 'raster' || !bg.dataUrl || detected.length === 0) return
    let stale = false
    setSizing(true)
    void detectRoomExtents(bg.dataUrl, detected.map((d) => d.p)).then((rects) => {
      if (stale) return
      setRows((rs) => rs.map((r) => {
        const i = detected.findIndex((d) => d.id === r.id)
        return i >= 0 ? { ...r, rect: rects[i] } : r
      }))
      setSizing(false)
    })
    return () => { stale = true }
  }, [detected])

  // the plot's centre, only once the outline is closed — an open outline has no
  // reliable centroid, so the zone chip is skipped entirely rather than guessed
  const center = useMemo(() => {
    if (!closed || pts.length < 3) return null
    return centerOverride ?? centroid(sampledPolygon(pts, bulges, closed))
  }, [pts, bulges, closed, centerOverride])

  if (!detected) return null

  const close = () => useStore.getState().setDetectedRooms(null)
  const checkedCount = rows.filter((r) => r.included).length

  const patchRow = (id: string, patch: Partial<ReviewRow>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  const commit = () => {
    const s = useStore.getState()
    let added = 0
    for (const row of rows) {
      if (!row.included) continue
      const label = row.label.trim() || markerKindMeta(row.kind).name
      // an entrance is a door — a point on the boundary, never an area (and the
      // entrance-analysis pipeline reads point markers specifically)
      const rect = rectFor(row, s.metersPerPx)
      if (asAreas && rect && row.kind !== 'entrance') {
        // setRoomShapeKind THEN addRoomShape — same store API shape as markers:
        // the add reads the currently-armed kind, it takes no kind argument
        s.setRoomShapeKind(row.kind)
        const id = s.addRoomShape('rect', rect)
        s.updateRoomShape(id, { label })
      } else {
        // setMarkerKind THEN addMarker — addMarker reads the currently-armed kind,
        // it takes no kind argument (see CLAUDE.md's CRITICAL store API trap)
        s.setMarkerKind(row.kind)
        const id = s.addMarker(row.p)
        s.updateMarker(id, { label })
      }
      added++
    }
    useStore.getState().setDetectedRooms(null)
    useStore.getState().toast(`${added} room${added === 1 ? '' : 's'} added — see them on the plan`, 'ok')
  }

  return (
    <Dialog
      title={`${detected.length} room${detected.length === 1 ? '' : 's'} found — review before adding`}
      onClose={close}
      width={520}
    >
      <div className="row-between" style={{ marginBottom: 10 }}>
        <span className="lbl dim">{checkedCount} of {rows.length} selected</span>
        <span style={{ display: 'flex', gap: 6 }}>
          <button className="btn-ghost" style={{ padding: '5px 10px', fontSize: 11.5 }}
            onClick={() => setRows((rs) => rs.map((r) => ({ ...r, included: true })))}>
            Select all
          </button>
          <button className="btn-ghost" style={{ padding: '5px 10px', fontSize: 11.5 }}
            onClick={() => setRows((rs) => rs.map((r) => ({ ...r, included: false })))}>
            Select none
          </button>
        </span>
      </div>

      {(sizing || rows.some((r) => rectFor(r, metersPerPx))) && (
        <div className="row-between" style={{ marginBottom: 10 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button type="button" className={`toggle ${asAreas ? 'on' : ''}`} aria-pressed={asAreas}
              aria-label="Mark whole room areas instead of points"
              onClick={() => setAsAreas(!asAreas)} style={{ padding: 3, flex: '0 0 auto' }}>
              <span className="knob" />
            </button>
            <span className="lbl" style={{ fontWeight: 650 }}>Mark whole room areas</span>
          </span>
          <span className="lbl dim">
            {sizing ? 'reading sizes…' : `${rows.filter((r) => rectFor(r, metersPerPx)).length} of ${rows.length} sized`}
          </span>
        </div>
      )}

      <div className="proj-list">
        {rows.map((row) => {
          const meta = markerKindMeta(row.kind)
          const zone = center ? placementOf(row.p, center, northDeg).zone : null
          const lowConf = row.confidence < 0.7
          return (
            <div key={row.id} className="marker-row"
              style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6, padding: '8px 9px', opacity: row.included ? 1 : 0.5 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button type="button" className={`toggle ${row.included ? 'on' : ''}`}
                  aria-pressed={row.included}
                  aria-label={row.included ? 'Included — tap to exclude' : 'Excluded — tap to include'}
                  onClick={() => patchRow(row.id, { included: !row.included })}
                  style={{ padding: 3, flex: '0 0 auto' }}>
                  <span className="knob" />
                </button>
                <span className="kind-dot" style={{ background: meta.color }} />
                <input type="text" className="marker-note" value={row.label}
                  aria-label="Room label"
                  onChange={(e) => patchRow(row.id, { label: e.target.value })}
                  style={{ flex: '1 1 100px', minWidth: 70, padding: '6px 9px', fontSize: 12.5, fontWeight: 600 }} />
                <select value={row.kind} aria-label="Room kind" className="kind-select"
                  onChange={(e) => patchRow(row.id, { kind: e.target.value as MarkerKind })}
                  style={{ colorScheme: theme === 'paper' ? 'light' : 'dark' }}>
                  {MARKER_KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.name}</option>)}
                </select>
              </div>
              {(zone || lowConf || rectFor(row, metersPerPx)) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, paddingLeft: 41 }}>
                  {zone && <span className="marker-zone" style={{ color: zone.color }}>{zone.key}</span>}
                  {rectFor(row, metersPerPx) && (
                    <span className="lbl dim">
                      {asAreas && row.kind !== 'entrance'
                        ? (row.dimM && metersPerPx ? 'whole room — printed size' : 'whole room')
                        : 'point'}
                    </span>
                  )}
                  {lowConf && (
                    <span className="chip" style={{ color: 'var(--warn)', borderColor: 'rgba(232,165,75,0.4)' }}>
                      <AlertTriangle size={10} /> low confidence
                    </span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="dialog-actions">
        <button className="btn-ghost" onClick={close}>Cancel</button>
        <button className="btn-primary" disabled={checkedCount === 0} onClick={commit}>
          Add {checkedCount} room{checkedCount === 1 ? '' : 's'}
        </button>
      </div>
    </Dialog>
  )
}
