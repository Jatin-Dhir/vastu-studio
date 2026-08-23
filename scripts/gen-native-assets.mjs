// Brands both Capacitor shells: Android adaptive + legacy launchers and splash
// drawables, iOS single-size app icon and splash imageset. Zero dependencies.
import { writeFileSync, existsSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderIcon, renderSplash, solidPng } from './icon-lib.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/* ---------- Android ---------- */
const res = join(root, 'android', 'app', 'src', 'main', 'res')
if (existsSync(res)) {
  const LEGACY = { 'mipmap-mdpi': 48, 'mipmap-hdpi': 72, 'mipmap-xhdpi': 96, 'mipmap-xxhdpi': 144, 'mipmap-xxxhdpi': 192 }
  const FG = { 'mipmap-mdpi': 108, 'mipmap-hdpi': 162, 'mipmap-xhdpi': 216, 'mipmap-xxhdpi': 324, 'mipmap-xxxhdpi': 432 }
  for (const [dir, size] of Object.entries(LEGACY)) {
    writeFileSync(join(res, dir, 'ic_launcher.png'), renderIcon(size, { shape: 'rounded' }))
    writeFileSync(join(res, dir, 'ic_launcher_round.png'), renderIcon(size, { shape: 'rounded' }))
  }
  for (const [dir, size] of Object.entries(FG)) {
    // adaptive foreground: transparent ground, mark inside the 66/108 safe zone
    writeFileSync(join(res, dir, 'ic_launcher_foreground.png'), renderIcon(size, { shape: 'none', inset: 0.24 }))
  }
  writeFileSync(
    join(res, 'values', 'ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#0B0C10</color>\n</resources>\n`
  )
  let splashes = 0
  for (const dir of readdirSync(res)) {
    if (!dir.startsWith('drawable')) continue
    const target = join(res, dir, 'splash.png')
    if (existsSync(target)) {
      writeFileSync(target, dir.includes('land') || dir.includes('port') ? solidPng() : renderSplash(480))
      splashes++
    }
  }
  console.log(`android: launchers x${Object.keys(LEGACY).length}, adaptive x${Object.keys(FG).length}, splash x${splashes}`)
} else {
  console.log('android: project not found, skipped')
}

/* ---------- iOS ---------- */
const xc = join(root, 'ios', 'App', 'App', 'Assets.xcassets')
if (existsSync(xc)) {
  const appIcon = join(xc, 'AppIcon.appiconset')
  // Capacitor's template ships a single 1024 universal icon named AppIcon-512@2x
  writeFileSync(join(appIcon, 'AppIcon-512@2x.png'), renderIcon(1024, { shape: 'square' }))
  const splashSet = join(xc, 'Splash.imageset')
  const splash = renderSplash(2732)
  for (const f of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
    writeFileSync(join(splashSet, f), splash)
  }
  console.log('ios: app icon + splash imageset')
} else {
  console.log('ios: project not found, skipped')
}
