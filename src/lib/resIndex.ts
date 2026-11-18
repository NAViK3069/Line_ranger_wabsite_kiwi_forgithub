// ====================================================
// อ่านหน้า directory index (nginx autoindex) ของ rangers.lerico.net/res/
// ย้ายมาจาก /api/lerico-proxy/dir เดิม — ตอนนี้ใช้ทั้งฝั่ง browser (ผ่าน Worker) และตอน build
// ====================================================

export interface DirEntry {
  name: string
  kind: 'dir' | 'file'
  /** "11-Feb-2026 03:55" ตามที่ต้นทางให้มา */
  date: string
  /** ขนาดเป็นไบต์ — โฟลเดอร์เป็น null */
  size: number | null
}

const ROW_RE = /<a href="([^"]+)">[^<]*<\/a>\s*(\d{2}-[A-Za-z]{3}-\d{4}\s+\d{2}:\d{2})\s+(\S+)/g

/** โชว์เฉพาะไฟล์ที่หน้า /res เปิดดูได้ */
const KEEP_EXT = ['.png', '.plist', '.sam']

/** โฟลเดอร์ของเรนเจอร์แต่ละตัว (u1234e-xxx / g...) และ _raw — ซ่อน เพราะมีเป็นพันและดูผ่านหน้าเรนเจอร์ได้อยู่แล้ว */
const UNIT_DIR_RE = /^[ug]\d+[a-z]*-/i
const isHidden = (name: string) => name === '_raw' || UNIT_DIR_RE.test(name)

const SEGMENT_RE = /^[A-Za-z0-9._+@-]+$/

/** ตรวจ path ที่ผู้ใช้ขอ — คืน null ถ้ามี .. หรืออักขระแปลก */
export function safeResPath(raw: string | null): string | null {
  const p = (raw ?? '').replace(/^\/+|\/+$/g, '')
  if (!p) return ''
  const parts = p.split('/')
  if (parts.some(seg => seg === '..' || !SEGMENT_RE.test(seg))) return null
  return parts.join('/')
}

export function parseResIndex(html: string): DirEntry[] {
  const out: DirEntry[] = []
  for (const m of html.matchAll(ROW_RE)) {
    const href = m[1]
    if (href === '../') continue
    const isDir = href.endsWith('/')
    let name: string
    try {
      name = decodeURIComponent(isDir ? href.slice(0, -1) : href)
    } catch {
      name = isDir ? href.slice(0, -1) : href
    }
    if (isDir && isHidden(name)) continue
    if (!isDir && !KEEP_EXT.some(e => name.toLowerCase().endsWith(e))) continue
    const size = m[3] === '-' ? null : Number(m[3])
    out.push({ name, kind: isDir ? 'dir' : 'file', date: m[2].replace(/\s+/g, ' '), size: Number.isFinite(size as number) ? size : null })
  }
  const cmp = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })
  return out.sort((a, b) =>
    a.kind !== b.kind ? (a.kind === 'dir' ? -1 : 1) : cmp.compare(a.name, b.name))
}

/** ดึงไฟล์ .sam ทั้งหมดในโฟลเดอร์ของเรนเจอร์ (แทน /api/lerico-proxy/list/[id] เดิม) */
export function parseSamLinks(html: string, dirUrl: string): string[] {
  return [...html.matchAll(/href="([^"]+\.sam)"/gi)].map(m => {
    const href = m[1]
    if (href.startsWith('http')) return href
    if (href.startsWith('/')) return `https://rangers.lerico.net${href}`
    return `${dirUrl}${href}`
  })
}
