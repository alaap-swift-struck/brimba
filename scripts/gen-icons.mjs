#!/usr/bin/env node
// gen-icons — the app's icon set, DERIVED from shared/brand.ts (Law R26).
//
//   node scripts/gen-icons.mjs
//
// WHY IT IS DERIVED. The fork sweep is TEXTUAL, and an icon is not text. It
// rewrote `aria-label="Brimba"` in these SVGs to the new product's name and left
// the drawn glyph `B` underneath — an icon that CLAIMS to be the new product
// while showing the old one's letter, which is worse than not sweeping at all —
// and the four PNGs beside them are binaries no text sweep can reach at all. So
// the monogram is generated from `brand.name`, the same letter `BrandMark` shows
// in-app, and `scripts/fork.mjs` runs this as its final step. Re-run it yourself
// after editing shared/brand.ts.
//
// `sharp` is not a project dependency — it arrives with Next as an optional one.
// This is an authoring/fork step, never part of build or deploy.
import sharp from "sharp"
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = new URL("..", import.meta.url).pathname
const dir = join(ROOT, "web", "public", "icons")
const SIZE = 512

// A MASKABLE icon is FULL BLEED: the OS applies its own mask (circle, squircle,
// rounded square), so the background must fill the square and anything outside
// the SAFE CIRCLE — 80% of the square, the PWA spec — may be cropped. The
// largest glyph box that survives EVERY mask shape is that circle's inscribed
// square. Both numbers below are checked against it before anything is written.
const SAFE_CIRCLE = 0.8
const GLYPH_MAX = SAFE_CIRCLE / Math.SQRT2 // 0.566 of the square

// The share of the square the drawn glyph occupies. A capital in Helvetica draws
// about CAP of its font size across, so the font size is DERIVED from the share
// — the numbers here are the drawn extent, not a guess about it.
const CAP = 0.78
const GLYPH_SHARE = { rounded: 0.5, maskable: 0.36 }
const fontFor = (share) => Math.round((SIZE * share) / CAP)

// Generated SVGs carry this marker. Drop in a REAL logo (an SVG without it) and
// this script leaves the file alone — regenerating would erase the logo.
const MARK = "<!-- generated from shared/brand.ts by scripts/gen-icons.mjs -->"

/** Who this app is TODAY — read off disk, never hardcoded, so a fork of a fork
 * still generates its own mark. Same read `scripts/fork.mjs` does. */
function identity() {
  const src = readFileSync(join(ROOT, "shared/brand.ts"), "utf8")
  const name = /name:\s*"([^"]+)"/.exec(src)?.[1]
  const primary = /primary:\s*"(#[0-9a-fA-F]{6})"/.exec(src)?.[1]
  if (!name || !primary) throw new Error("gen-icons: could not read brand.name + brand.accentHex.primary from shared/brand.ts")
  return { letter: [...name][0].toUpperCase(), name, primary }
}

/** The gradient's two stops, from the ONE accent hex — so an app that re-skins
 * shared/brand.ts gets an icon in its own colour, not the base's teal. */
const scale = (hex, k) =>
  "#" +
  [1, 3, 5]
    .map((i) => Math.min(255, Math.round(parseInt(hex.slice(i, i + 2), 16) * k)))
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")

const svgFor = ({ letter, name, primary }, maskable) => {
  const share = maskable ? GLYPH_SHARE.maskable : GLYPH_SHARE.rounded
  const shape = maskable
    ? `<rect width="${SIZE}" height="${SIZE}" fill="url(#g)"/>` // full bleed: the OS masks it
    : `<rect width="${SIZE}" height="${SIZE}" rx="${Math.round(SIZE * 0.22)}" fill="url(#g)"/>`
  return `<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${name}">
  ${MARK}
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${scale(primary, 1.16)}"/>
      <stop offset="1" stop-color="${scale(primary, 0.885)}"/>
    </linearGradient>
  </defs>
  ${shape}
  <text x="${SIZE / 2}" y="${Math.round(SIZE * 0.53)}" font-family="Helvetica, Arial, sans-serif" font-size="${fontFor(share)}" font-weight="700" fill="#ffffff" text-anchor="middle" dominant-baseline="central">${letter}</text>
</svg>
`
}

// The claim this file makes about the maskable icon, checked before it draws it.
if (GLYPH_SHARE.maskable > GLYPH_MAX)
  throw new Error(`gen-icons: the maskable glyph (${GLYPH_SHARE.maskable}) is outside the safe circle (${GLYPH_MAX.toFixed(3)}) — it would be cropped by the OS mask`)

const brand = identity()

// 1 · the two source SVGs, unless a real logo has replaced one.
for (const [file, maskable] of [
  ["icon.svg", false],
  ["icon-maskable.svg", true],
]) {
  const path = join(dir, file)
  const existing = readFileSync(path, "utf8")
  if (!existing.includes(MARK)) {
    console.log(`kept ${file} — it is not a generated monogram (a real logo lives here)`)
    continue
  }
  writeFileSync(path, svgFor(brand, maskable))
  console.log(`wrote ${file} — "${brand.letter}" on ${scale(brand.primary, 1.16)}→${scale(brand.primary, 0.885)}`)
}

// 2 · the PNGs the manifest and iOS reference, at FULL SIZE.
//
// They are rendered EDGE TO EDGE on purpose. An earlier version composited each
// mark onto a transparent square at 76% — which was never re-run, so it never
// reached the committed assets, and would have broken both of them if it had:
// the maskable icon would have lost its full bleed (the OS mask crops to the
// safe circle and the transparent margin shows through as a gap), and iOS
// composites a transparent apple-touch-icon onto BLACK, so the home-screen icon
// would have gained black corners. Each SVG already carries its own safe zone —
// the rounded tile its corner radius, the maskable one its glyph share — so the
// raster must not add a second one on top.
const svg = (f) => readFileSync(join(dir, f))
const jobs = [
  ["icon.svg", 192, "icon-192.png"],
  ["icon.svg", 512, "icon-512.png"],
  ["icon-maskable.svg", 512, "icon-maskable-512.png"],
  ["icon-maskable.svg", 180, "apple-touch-icon.png"], // iOS rounds it itself
]
for (const [source, size, name] of jobs) {
  await sharp(svg(source), { density: 384 }).resize(size, size).png().toFile(join(dir, name))
  console.log(`wrote ${name} ${size}x${size} from ${source}`)
}
console.log(
  `done — monogram "${brand.letter}" from shared/brand.ts; maskable glyph at ${Math.round(GLYPH_SHARE.maskable * 100)}% of the square, inside the ${Math.round(SAFE_CIRCLE * 100)}% safe circle (max ${Math.round(GLYPH_MAX * 100)}%)`,
)
