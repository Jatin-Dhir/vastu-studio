// Landing page entry — same faces as the app, its own stylesheet, and two small
// behaviours: the dial's tick marks (generated, same geometry as the activation
// page's instrument) and IntersectionObserver-armed scroll reveals.
import '@fontsource-variable/inter'
import '@fontsource/cormorant-garamond/600.css'
import './landing.css'

// graduated ring: 32 ticks — cardinals gold, zone boundaries mid, minors faint —
// plus the 16 faint mid-ring spokes, mirroring src/ui/ActivationPage.tsx's Dial
const ticks = document.getElementById('ticks')
if (ticks) {
  const NS = 'http://www.w3.org/2000/svg'
  const frag = document.createDocumentFragment()
  for (let i = 0; i < 32; i++) {
    const a = i * 11.25
    const cardinal = a % 90 === 0
    const zone = a % 22.5 === 0
    const line = document.createElementNS(NS, 'line')
    line.setAttribute('x1', '100'); line.setAttribute('x2', '100')
    line.setAttribute('y1', cardinal ? '22' : zone ? '15' : '12'); line.setAttribute('y2', '10')
    line.setAttribute('transform', `rotate(${a} 100 100)`)
    line.setAttribute('stroke', cardinal ? '#D9B45B' : zone ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.13)')
    line.setAttribute('stroke-width', cardinal ? '1.8' : zone ? '1.2' : '1')
    frag.appendChild(line)
  }
  for (let i = 0; i < 16; i++) {
    const line = document.createElementNS(NS, 'line')
    line.setAttribute('x1', '100'); line.setAttribute('x2', '100')
    line.setAttribute('y1', '36'); line.setAttribute('y2', '64')
    line.setAttribute('transform', `rotate(${i * 22.5 + 11.25} 100 100)`)
    line.setAttribute('stroke', 'rgba(255,255,255,0.13)')
    line.setAttribute('stroke-width', '0.8')
    frag.appendChild(line)
  }
  ticks.appendChild(frag)
}

// scroll reveals — once each, generous margin so they land before the eye does
const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) }
    }
  },
  { rootMargin: '0px 0px -8% 0px' },
)
document.querySelectorAll('.reveal').forEach((el) => io.observe(el))
