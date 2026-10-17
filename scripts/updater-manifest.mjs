// Writes latest.json, the feed the Windows app's updater reads, for the version in
// src-tauri/tauri.conf.json. Run after `npx tauri build` with TAURI_SIGNING_PRIVATE_KEY set, which
// leaves "<name>_<version>_x64-setup.exe.sig" beside the installer.
//
//   node scripts/updater-manifest.mjs <notes.md> <out/latest.json>
//
// Upload latest.json to the release together with the installer renamed to
// VastuStudio-Setup-x64.exe: the URL below points at that asset of this version's tag, and the
// updater finds the newest feed at releases/latest/download/latest.json.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const conf = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'))
const version = conf.version
const dir = 'src-tauri/target/release/bundle/nsis'
const sig = readdirSync(dir).find((f) => f.endsWith(`_${version}_x64-setup.exe.sig`))
if (!sig) {
  console.error(`No signature for ${version} in ${dir}. Build with TAURI_SIGNING_PRIVATE_KEY set.`)
  process.exit(1)
}
const notesFile = process.argv[2]
const out = process.argv[3] ?? 'latest.json'
const notes = notesFile ? readFileSync(notesFile, 'utf8').trim() : `Vastu Studio ${version}`

const manifest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms: {
    'windows-x86_64': {
      signature: readFileSync(join(dir, sig), 'utf8').trim(),
      url: `https://github.com/Jatin-Dhir/vastu-studio/releases/download/v${version}/VastuStudio-Setup-x64.exe`,
    },
  },
}
writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n')
console.log(`wrote ${out} for ${version}`)
