const MAX_DIM = 3600

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not decode image'))
    img.src = src
  })
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(new Error('Could not read file'))
    r.readAsDataURL(blob)
  })
}

/** Load a raster file/blob, downscaling to a sane working size. */
export async function importRaster(blob: Blob): Promise<{ dataUrl: string; w: number; h: number }> {
  const raw = await blobToDataUrl(blob)
  const img = await loadImage(raw)
  let { width: w, height: h } = img
  if (Math.max(w, h) <= MAX_DIM) return { dataUrl: raw, w, h }
  const s = MAX_DIM / Math.max(w, h)
  w = Math.round(w * s); h = Math.round(h * s)
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, w, h)
  const isJpeg = blob.type.includes('jpeg') || blob.type.includes('jpg')
  const dataUrl = isJpeg ? canvas.toDataURL('image/jpeg', 0.92) : canvas.toDataURL('image/png')
  return { dataUrl, w, h }
}
