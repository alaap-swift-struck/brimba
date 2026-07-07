// A minimal, SAFE .xlsx reader — zero dependencies (UI-GAPS #11 closed without
// SheetJS, whose npm build carries a HIGH advisory). An .xlsx is a ZIP of XML:
// we parse the ZIP directory by hand, inflate entries with the browser-native
// DecompressionStream, and read the FIRST worksheet + shared strings with
// DOMParser. No eval, no formulas evaluated (formula cells contribute their
// cached <v> value), no external fetches — pure parsing.
//
// Scope (deliberate): first sheet only, strings + numbers + booleans + inline
// strings. Date cells arrive as Excel serial NUMBERS (style-table date detection
// is out of scope) — documented in AGENTIC-IMPORT §9; the import's iso_date
// normalizer handles real date strings.

const EOCD_SIG = 0x06054b50
const CENTRAL_SIG = 0x02014b50
const LOCAL_SIG = 0x04034b50

type ZipEntry = { name: string; method: number; compressedSize: number; localOffset: number }

/** The ZIP central directory: name → where each file's bytes live. */
function readDirectory(buf: ArrayBuffer): Map<string, ZipEntry> {
  const view = new DataView(buf)
  // The end-of-central-directory record sits in the last ~64 KB (comment may follow).
  let eocd = -1
  const min = Math.max(0, buf.byteLength - 65558)
  for (let i = buf.byteLength - 22; i >= min; i--) {
    if (view.getUint32(i, true) === EOCD_SIG) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error("not a zip")
  const count = view.getUint16(eocd + 10, true)
  let at = view.getUint32(eocd + 16, true) // central directory offset
  const entries = new Map<string, ZipEntry>()
  const names = new TextDecoder()
  for (let n = 0; n < count; n++) {
    if (view.getUint32(at, true) !== CENTRAL_SIG) break
    const method = view.getUint16(at + 10, true)
    const compressedSize = view.getUint32(at + 20, true)
    const nameLen = view.getUint16(at + 28, true)
    const extraLen = view.getUint16(at + 30, true)
    const commentLen = view.getUint16(at + 32, true)
    const localOffset = view.getUint32(at + 42, true)
    const name = names.decode(new Uint8Array(buf, at + 46, nameLen))
    entries.set(name, { name, method, compressedSize, localOffset })
    at += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

/** One entry's bytes → text (method 0 = stored, 8 = deflate via the browser). */
async function readEntry(buf: ArrayBuffer, e: ZipEntry): Promise<string> {
  const view = new DataView(buf)
  if (view.getUint32(e.localOffset, true) !== LOCAL_SIG) throw new Error("bad zip entry")
  // The LOCAL header carries its own name/extra lengths (they can differ).
  const nameLen = view.getUint16(e.localOffset + 26, true)
  const extraLen = view.getUint16(e.localOffset + 28, true)
  const start = e.localOffset + 30 + nameLen + extraLen
  const bytes = new Uint8Array(buf, start, e.compressedSize)
  if (e.method === 0) return new TextDecoder().decode(bytes)
  if (e.method !== 8) throw new Error("unsupported zip compression")
  const source = new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
  const inflated = source.pipeThrough(new DecompressionStream("deflate-raw"))
  return new Response(inflated).text()
}

/** "B7" → 1 (zero-based column index). */
function colIndex(cellRef: string): number {
  let col = 0
  for (const ch of cellRef) {
    if (ch < "A" || ch > "Z") break
    col = col * 26 + (ch.charCodeAt(0) - 64)
  }
  return col - 1
}

function parseXml(xml: string): Document {
  return new DOMParser().parseFromString(xml, "application/xml")
}

/** A cell's displayed value, per its type attribute. */
function cellValue(c: Element, shared: string[]): string {
  const t = c.getAttribute("t")
  if (t === "inlineStr") {
    return Array.from(c.getElementsByTagName("t"))
      .map((n) => n.textContent ?? "")
      .join("")
  }
  const v = c.getElementsByTagName("v")[0]?.textContent ?? ""
  if (t === "s") return shared[Number(v)] ?? ""
  if (t === "b") return v === "1" ? "true" : "false"
  return v // n (number), str (formula's cached string), or untyped
}

const csvField = (s: string) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)

/** Read an .xlsx file's FIRST worksheet as CSV text. Throws on anything that
 * isn't a readable xlsx — callers show their friendly message then. */
export async function xlsxToCsv(buf: ArrayBuffer): Promise<string> {
  const dir = readDirectory(buf)

  // Shared strings (may be absent in a numbers-only sheet).
  const shared: string[] = []
  const sst = dir.get("xl/sharedStrings.xml")
  if (sst) {
    const doc = parseXml(await readEntry(buf, sst))
    for (const si of Array.from(doc.getElementsByTagName("si"))) {
      shared.push(
        Array.from(si.getElementsByTagName("t"))
          .map((n) => n.textContent ?? "")
          .join("")
      )
    }
  }

  // The first worksheet: lowest-numbered xl/worksheets/sheetN.xml.
  const sheetName = [...dir.keys()]
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]))[0]
  if (!sheetName) throw new Error("no worksheet")
  const sheet = parseXml(await readEntry(buf, dir.get(sheetName)!))

  const lines: string[] = []
  for (const row of Array.from(sheet.getElementsByTagName("row"))) {
    const cells: string[] = []
    for (const c of Array.from(row.getElementsByTagName("c"))) {
      const ref = c.getAttribute("r") ?? ""
      const idx = ref ? colIndex(ref) : cells.length
      while (cells.length < idx) cells.push("") // gaps = empty cells
      cells[idx] = cellValue(c, shared)
    }
    lines.push(cells.map(csvField).join(","))
  }
  return lines.join("\r\n")
}
