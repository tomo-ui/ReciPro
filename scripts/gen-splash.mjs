// Generuje ekrany startowe iOS (apple-touch-startup-image) w jasnym i ciemnym wariancie
// i wypisuje znaczniki <link> do wklejenia w index.html.
// Użycie: node scripts/gen-splash.mjs
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

// [szerokość pt, wysokość pt, skala]
const DEVICES = [
  [440, 956, 3], // 16 Pro Max
  [402, 874, 3], // 16 Pro
  [430, 932, 3], // 14/15 Pro Max, 15 Plus
  [393, 852, 3], // 14 Pro, 15, 15 Pro, 16
  [428, 926, 3], // 12/13 Pro Max, 14 Plus
  [390, 844, 3], // 12/13/14
  [375, 812, 3], // X, XS, 11 Pro, 12/13 mini
  [414, 896, 3], // XS Max, 11 Pro Max
  [414, 896, 2], // XR, 11
  [375, 667, 2], // SE, 8
]
const THEMES = [
  { name: 'light', bg: '#f2f2f7' },
  { name: 'dark', bg: '#000000' },
]

const logo = await readFile('public/logo.svg')
await mkdir('public/splash', { recursive: true })
const links = []

for (const [w, h, r] of DEVICES) {
  for (const t of THEMES) {
    const W = w * r
    const H = h * r
    const size = Math.round(Math.min(W, H) * 0.28)
    const icon = await sharp(logo, { density: 384 }).resize(size, size, { fit: 'contain', background: t.bg }).png().toBuffer()
    const file = `splash/${w}x${h}@${r}-${t.name}.png`
    await sharp({ create: { width: W, height: H, channels: 3, background: t.bg } })
      .composite([{ input: icon, gravity: 'center' }])
      .png({ compressionLevel: 9, palette: true })
      .toFile(`public/${file}`)
    links.push(
      `    <link rel="apple-touch-startup-image" href="/${file}" media="(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: portrait) and (prefers-color-scheme: ${t.name})" />`,
    )
  }
}
await writeFile('scripts/splash-links.html', links.join('\n') + '\n')
console.log(`Wygenerowano ${links.length} obrazów, znaczniki w scripts/splash-links.html`)
