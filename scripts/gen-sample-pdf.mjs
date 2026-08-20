// Generates public/samples/sample-plan.pdf — a small vector floor plan, no deps.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const ops = []
ops.push('0.13 0.20 0.29 RG')
ops.push('3 w')
// L-shaped outer boundary (page 792x612, y-up)
ops.push('90 100 m 700 100 l 700 380 l 480 380 l 480 520 l 90 520 l h S')
ops.push('1.2 w')
// interior walls
ops.push('320 100 m 320 330 l S')
ops.push('320 330 m 90 330 l S')
ops.push('480 100 m 480 250 l S')
ops.push('480 300 m 480 380 l S')
ops.push('230 330 m 230 520 l S')
ops.push('0.35 0.42 0.55 RG 0.8 w')
// door swings (quarter arcs via bezier, k = 0.5523)
ops.push('320 330 m 320 385.2 l S')
ops.push('320 385.2 m 350.5 372.6 375.2 347.9 375.2 330 c S')
// window ticks
ops.push('0.13 0.20 0.29 RG 2 w')
ops.push('150 100 m 220 100 l S 150 104 m 220 104 l S')
ops.push('540 100 m 610 100 l S 540 104 m 610 104 l S')
ops.push('700 180 m 700 250 l S 696 180 m 696 250 l S')
ops.push('120 520 m 190 520 l S 120 516 m 190 516 l S')
// labels
ops.push('BT /F1 13 Tf 0.36 0.42 0.53 rg')
ops.push('1 0 0 1 150 210 Tm (DRAWING ROOM) Tj')
ops.push('1 0 0 1 380 210 Tm (KITCHEN) Tj')
ops.push('1 0 0 1 545 250 Tm (BED ROOM) Tj')
ops.push('1 0 0 1 120 420 Tm (VERANDAH) Tj')
ops.push('1 0 0 1 300 420 Tm (BATH) Tj')
ops.push('ET')
// title — the stated 1:100 makes the 610pt plan width a real 21.5 m
ops.push('BT /F1 10 Tf 0.5 0.55 0.63 rg 1 0 0 1 90 70 Tm (SAMPLE RESIDENCE - GROUND FLOOR - SCALE 1 : 100 - Plot 21.5 m x 14.8 m) Tj ET')

const stream = ops.join('\n')

const objs = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 792 612] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
  `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
]

let pdf = '%PDF-1.4\n'
const offsets = []
objs.forEach((body, i) => {
  offsets.push(pdf.length)
  pdf += `${i + 1} 0 obj\n${body}\nendobj\n`
})
const xrefPos = pdf.length
pdf += `xref\n0 ${objs.length + 1}\n`
pdf += '0000000000 65535 f \n'
for (const off of offsets) pdf += `${String(off).padStart(10, '0')} 00000 n \n`
pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`

const out = join(root, 'public', 'samples')
mkdirSync(out, { recursive: true })
writeFileSync(join(out, 'sample-plan.pdf'), Buffer.from(pdf, 'latin1'))
console.log('Wrote', join(out, 'sample-plan.pdf'), `(${pdf.length} bytes)`)
