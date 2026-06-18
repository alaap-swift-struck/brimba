// Regenerates the PWA PNG icons (manifest + iOS apple-touch) from the brand
// monogram SVGs (web/public/icons/*.svg). The PNGs are committed as static
// assets, so this is NOT part of build/deploy and `sharp` stays out of the
// project deps (used transitively here). Re-run after editing the SVGs or
// dropping in a real brand logo:  node scripts/gen-icons.mjs
import sharp from "sharp"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "web", "public", "icons")
const rounded = readFileSync(join(dir, "icon.svg"))
const maskable = readFileSync(join(dir, "icon-maskable.svg"))

const jobs = [
  [rounded, 192, "icon-192.png"],
  [rounded, 512, "icon-512.png"],
  [maskable, 512, "icon-maskable-512.png"],
  [maskable, 180, "apple-touch-icon.png"], // iOS rounds it itself; full-bleed
]

for (const [svg, size, name] of jobs) {
  await sharp(svg, { density: 384 })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(join(dir, name))
  console.log("wrote", name, size + "x" + size)
}
console.log("done")
