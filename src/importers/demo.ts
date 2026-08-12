/** Generates a sample residence blueprint on a canvas so the app works out of the box. */
export function generateDemoPlan(): { dataUrl: string; w: number; h: number; metersPerPx: number } {
  const W = 1560, H = 1180
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const g = c.getContext('2d')!

  // paper
  g.fillStyle = '#FAF8F2'
  g.fillRect(0, 0, W, H)
  g.strokeStyle = '#E9E4D6'
  g.lineWidth = 1
  for (let x = 40; x < W; x += 40) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke() }
  for (let y = 40; y < H; y += 40) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke() }
  g.strokeStyle = '#C9C2AE'
  g.lineWidth = 2
  g.strokeRect(28, 28, W - 56, H - 56)

  const ink = '#233247'
  const wall = (x1: number, y1: number, x2: number, y2: number, w = 8) => {
    g.strokeStyle = ink; g.lineWidth = w; g.lineCap = 'butt'
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke()
  }
  const thin = (x1: number, y1: number, x2: number, y2: number) => wall(x1, y1, x2, y2, 2)

  // L-shaped outer boundary: (200,160) → (1010,160) → (1010,420) → (1360,420) → (1360,1020) → (200,1020)
  wall(200, 160, 1010, 160)
  wall(1010, 160, 1010, 420)
  wall(1010, 420, 1360, 420)
  wall(1360, 420, 1360, 1020)
  wall(1360, 1020, 200, 1020)
  wall(200, 1020, 200, 160)

  // interior walls with door gaps
  wall(660, 160, 660, 520); wall(660, 610, 660, 700)
  wall(200, 700, 520, 700); wall(610, 700, 1010, 700)
  wall(1010, 700, 1010, 1020, 6)
  wall(1010, 420, 1010, 610, 6)
  wall(1180, 420, 1180, 760, 6); wall(1180, 850, 1180, 1020, 6)

  // door swing arcs
  const door = (x: number, y: number, r: number, a0: number, a1: number) => {
    g.strokeStyle = '#5A6B84'; g.lineWidth = 2
    g.beginPath(); g.arc(x, y, r, a0, a1); g.stroke()
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + r * Math.cos(a1), y + r * Math.sin(a1)); g.stroke()
  }
  door(660, 610, 90, Math.PI / 2, Math.PI)
  door(610, 700, 90, -Math.PI / 2, 0)
  door(1180, 850, 90, Math.PI / 2, Math.PI)
  door(780, 1020, 100, Math.PI, Math.PI * 1.5)

  // windows: double tick marks on outer walls
  const win = (x1: number, y1: number, x2: number, y2: number) => {
    g.strokeStyle = '#FAF8F2'; g.lineWidth = 10
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke()
    g.strokeStyle = ink; g.lineWidth = 2
    const nx = (y2 - y1), ny = -(x2 - x1)
    const L = Math.hypot(nx, ny) || 1
    const ox = (nx / L) * 3, oy = (ny / L) * 3
    g.beginPath(); g.moveTo(x1 + ox, y1 + oy); g.lineTo(x2 + ox, y2 + oy); g.stroke()
    g.beginPath(); g.moveTo(x1 - ox, y1 - oy); g.lineTo(x2 - ox, y2 - oy); g.stroke()
  }
  win(360, 160, 500, 160)
  win(760, 160, 900, 160)
  win(1360, 540, 1360, 660)
  win(1360, 780, 1360, 900)
  win(420, 1020, 560, 1020)
  win(200, 400, 200, 540)
  win(200, 760, 200, 880)

  // labels
  g.fillStyle = '#5C6A80'
  g.font = '600 26px system-ui, sans-serif'
  g.textAlign = 'center'
  g.fillText('DRAWING ROOM', 430, 450)
  g.fillText('KITCHEN', 835, 440)
  g.fillText('BED ROOM', 605, 880)
  g.fillText('BED ROOM', 1180, 560)
  g.font = '600 22px system-ui, sans-serif'
  g.fillText('BATH', 1095, 880)
  g.fillText('VERANDAH', 1268, 900)
  g.font = '500 18px system-ui, sans-serif'
  g.fillStyle = '#8A94A6'
  g.fillText('UP', 300, 970)

  // stair strokes
  for (let i = 0; i < 6; i++) thin(240 + i * 28, 920, 240 + i * 28, 1012)

  // north arrow
  g.save()
  g.translate(1440, 130)
  g.strokeStyle = '#233247'; g.lineWidth = 2.5
  g.beginPath(); g.arc(0, 0, 38, 0, Math.PI * 2); g.stroke()
  g.fillStyle = '#B23A2E'
  g.beginPath(); g.moveTo(0, -30); g.lineTo(11, 8); g.lineTo(0, 1); g.closePath(); g.fill()
  g.fillStyle = '#233247'
  g.beginPath(); g.moveTo(0, 30); g.lineTo(-11, -8); g.lineTo(0, -1); g.closePath(); g.fill()
  g.font = '700 20px system-ui, sans-serif'
  g.textAlign = 'center'
  g.fillText('N', 0, -46)
  g.restore()

  // title block
  g.fillStyle = '#233247'
  g.font = '700 24px system-ui, sans-serif'
  g.textAlign = 'left'
  g.fillText('RESIDENCE — GROUND FLOOR PLAN', 60, H - 66)
  g.font = '500 17px system-ui, sans-serif'
  g.fillStyle = '#7C8698'
  g.fillText('Plot 11.6 m × 8.6 m  ·  Scale 1 : 100  ·  Sample drawing', 60, H - 40)

  // 1160 px of plan width = 11.6 m
  return { dataUrl: c.toDataURL('image/png'), w: W, h: H, metersPerPx: 0.01 }
}
