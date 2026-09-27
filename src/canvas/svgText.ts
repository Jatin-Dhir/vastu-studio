/**
 * Place an SVG label by transform, with every glyph at positive x in its own user space.
 *
 * WebKit (verified in its Windows build; the engine behind Safari and every iPhone/iPad
 * browser) drops the stroke of any SVG text glyph that lies wholly at negative x. The stroke
 * is the dark legibility halo every plan label wears, so labels west of the drawing's origin
 * (the W cardinal, the west wall's length) and the left half of any centred label drawn at a
 * local origin rendered as pale fill on a pale ground.
 *
 * The label is drawn `OFF` ems along its own baseline and the frame is shifted back by the
 * same amount, so it lands exactly where rotate(rot px py) on the old x/y put it — and no
 * glyph is ever left of zero. `em` is the label's font size (world units).
 * (px, py) is the rotation pivot when it differs from the anchor point.
 */
const OFF = 40 // ems: further than half of any label's width, so every glyph stays positive

export function at(x: number, y: number, rot = 0, em = 0, px = x, py = y): { x: number; y: number; transform: string } {
  const off = OFF * em
  return {
    x: x - px + off,
    y: y - py,
    transform: `translate(${px} ${py})${rot ? ` rotate(${rot})` : ''}${off ? ` translate(${-off} 0)` : ''}`,
  }
}
