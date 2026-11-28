// ====================================================
// Static API — แทน /api/* เดิมของ Next.js server
//
// เว็บนี้เป็น static site บน GitHub Pages จึงไม่มี API route ตอนรันจริง
// ข้อมูลทุกอย่างถูกเขียนเป็นไฟล์ JSON ไว้ล่วงหน้าใน /data/... ตอน build (scripts/emit-data.ts)
// โดยรันโค้ด route handler เดิมแล้วเซฟผลลัพธ์ลงไฟล์
//
// คอมโพเนนต์เรียก apiFetch('/api/...') แทน fetch('/api/...') ได้ทันที — URL เดิม หน้าตา JSON เดิม
// ส่วนที่ต้องดึงจาก rangers.lerico.net สดๆ (ไม่มี CORS) วิ่งผ่าน Cloudflare Worker (lericoProxy)
//
// ⚠ dataFile() ถูกใช้ทั้งฝั่ง browser และ scripts/emit-data.ts — แก้กฎที่นี่ที่เดียว
// ====================================================

export const DATA_BASE = '/data'
export const LERICO_ORIGIN = 'https://rangers.lerico.net'

/** URL ของ Cloudflare Worker (ตั้งใน .env.local / GitHub Actions variable) */
export const WORKER_URL = (process.env.NEXT_PUBLIC_WORKER_URL ?? '').replace(/\/+$/, '')

/**
 * รูปที่โหลดผ่าน Worker (api.<โดเมน>) อยู่คนละโดเมนกับหน้าเว็บ → ต้องตั้ง crossOrigin = 'anonymous'
 * ไม่งั้นเบราว์เซอร์ไม่ใช้หัว CORS ที่ Worker ส่งมา แล้ว canvas ที่วาดรูปนี้จะถูก taint
 * (toDataURL / toBlob / getImageData ใช้ไม่ได้ — "Tainted canvases may not be exported")
 * ตั้งเฉพาะ URL ของ Worker: รูปจาก lerico ตรงๆ ไม่มีหัว CORS ถ้าตั้งไปจะโหลดไม่ขึ้นเลย
 */
export function corsImage(el: HTMLImageElement, src: string): void {
  if (WORKER_URL && src.startsWith(WORKER_URL + '/')) el.crossOrigin = 'anonymous'
}

/** แปลง URL ของ rangers.lerico.net ให้วิ่งผ่าน Worker (ได้ CORS header + cache ที่ edge) */
export function lericoProxy(url: string): string {
  if (!url.startsWith(LERICO_ORIGIN)) return url
  return `${WORKER_URL}/lerico${url.slice(LERICO_ORIGIN.length)}`
}

const enc = encodeURIComponent

/** ดึง itemCode จาก URL ไอคอนเกียร์ (/gear_icon/eq_123_wpn_09_icon.png → eq_123_wpn_09) */
export function itemCodeFromIconUrl(iconUrl: string): string | null {
  return iconUrl.match(/\/gear_icon\/(.+)_icon\.png$/)?.[1] ?? null
}

/**
 * แปลง path + query ของ API เดิม → ไฟล์ JSON ใต้ /data (ไม่รวม DATA_BASE)
 * คืน null ถ้า endpoint นั้นไม่มีไฟล์ static (ต้องจัดการแบบพิเศษ)
 */
export function dataFile(pathname: string, q: URLSearchParams): string | null {
  const p = pathname.replace(/^\/api\//, '').replace(/\/+$/, '').split('/').map(s => decodeURIComponent(s))
  const [a, b, c] = p
  const league = q.get('league') ?? '0'

  switch (a) {
    case 'gacha':
      if (b === 'pools' || b === 'gear-pools') {
        if (c) return `gacha/${b}/${enc(c)}.json`
        return `gacha/${b}${q.get('test') === 'true' ? '-test' : ''}.json`
      }
      return null
    case 'top40': return 'top40.json'
    case 'ranger-book': return 'ranger-book.json'
    case 'gear-book': return 'gear-book.json'
    case 'ranger-abilities': return 'ranger-abilities.json'
    case 'ranger-faces': return 'ranger-faces.json'
    case 'infinity-tower': return b ? `infinity-tower/${enc(b)}.json` : 'infinity-tower.json'
    case 'main-stage': return b ? `main-stage/${enc(b)}.json` : 'main-stage.json'
    case 'custom-assets': return 'custom-assets.json'
    case 'site-profile': return 'site-profile.json'
    case 'tierlist': return 'tierlist.json'
    case 'lerico':
      return b === 'ranger-names' || b === 'equip-names' ? `lerico/${b}.json` : null
    case 'translations':
      return b ? `translations/${enc(b.toLowerCase())}${q.get('only') === 'names' ? '-names' : ''}.json` : null
    case 'ranger-skill-effects':
      return `ranger-skill-effects/${q.get('lang') === 'th' ? 'th' : 'en'}.json`
    case 'meta':
      switch (b) {
        case 'rangers':
        case 'rangers-stream': return `meta/rangers/${enc(league)}.json`
        case 'gear-ranking': return `meta/gear-ranking/${enc(league)}.json`
        case 'ranger-detail': return `meta/ranger-detail/${enc(league)}/${enc(q.get('id') ?? '')}.json`
        case 'ranger-stats':
          return `ranger/${q.get('level') === '1' ? 'stats-lv1' : 'stats'}/${enc(q.get('id') ?? '')}.json`
      }
      return null
    case 'gear':
      return b === 'spec-plus' && c ? `gear/spec-plus/${enc(c)}.json` : null
    case 'ranger':
      if (!c) return null
      if (b === 'usage-ranking') return `ranger/usage/${enc(league)}/${enc(c)}.json`
      if (b === 'talents' || b === 'awakening' || b === 'projectile' || b === 'evolve') return `ranger/${b}/${enc(c)}.json`
      return null
  }
  return null
}

/** ไฟล์ effects ของเกียร์ 1 ชิ้น — { "0": GearEffects, ..., "5": GearEffects } ตามระดับเอนชานต์ */
export const gearEffectsFile = (itemCode: string) => `gear/effects/${enc(itemCode)}.json`
/** เรนเจอร์ที่ใช้เกียร์ชิ้นนี้ในลีค — rangers[] แบบเดียวกับ /api/meta/gear-detail */
export const gearUsersFile = (league: number | string, itemCode: string) => `meta/gear-users/${enc(String(league))}/${enc(itemCode)}.json`
/** รายการโฟลเดอร์ของหน้า /res (เฉพาะหน้าราก — คำนวณล่วงหน้าเพราะต้องเช็คโฟลเดอร์ว่าง ~950 โฟลเดอร์) */
export const resRootFile = 'res/root.json'
/** โฟลเดอร์เรนเจอร์ (u…/g…) ชั้นบนสุดที่มีไฟล์จริง — ใช้ตอนเปิดโหมดขั้นสูง (เช็คไว้ตอน build ~3,100 โฟลเดอร์) */
export const resRootUnitsFile = 'res/root-units.json'

// ── ค่าที่คืนแทนเมื่อไม่มีไฟล์ (404) — emit-data จะไม่เขียนไฟล์ที่มีแต่ค่าว่างเหล่านี้ เพื่อลดจำนวนไฟล์ ──
export function emptyFallback(pathname: string, q: URLSearchParams): unknown {
  const p = pathname.replace(/^\/api\//, '').split('/')
  if (p[0] === 'ranger') {
    if (p[1] === 'talents') return { hasTalent: false }
    if (p[1] === 'usage-ranking') return { awakeningUsage: [], talentUsage: [] }
    if (p[1] === 'evolve') return { chain: [] }
    if (p[1] === 'awakening') return { rangerId: decodeURIComponent(p[2] ?? ''), abilities: [] }
  }
  if (p[0] === 'gear' && p[1] === 'spec-plus') return { hasSpec: false }
  // ยังไม่มีไฟล์ (Daily Data ยังไม่รัน) → ไม่มีตำแหน่งหน้า = การ์ดแสดงเต็มตัวแบบเดิม
  if (p[0] === 'ranger-faces') return {}
  // เรนเจอร์ที่ไม่มีใครใช้ในลีคนั้น (เช่นกดเปลี่ยนร่างใน Evolution ไปร่างที่ไม่ติดอันดับ)
  // ไม่มีไฟล์ — คืนผลแบบเดียวกับ getRangerDetail() เดิม: ผู้ใช้ 0 คน ไม่มีเกียร์
  if (p[0] === 'meta' && p[1] === 'ranger-detail') {
    const id = q.get('id') ?? ''
    return {
      id, name: id, imageUrl: `${LERICO_ORIGIN}/res/${id}/${id}-thum.png`,
      gear: { WPN: [], AMR: [], ACC: [] }, topSets: [],
      gearFromCache: false, gearLoading: false, usersInLeague: 0, gearSampled: 0,
    }
  }
  return undefined
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

async function getData<T = unknown>(file: string): Promise<T | null> {
  const res = await fetch(`${DATA_BASE}/${file}`)
  if (!res.ok) return null
  return res.json() as Promise<T>
}

// ── เคสพิเศษ ─────────────────────────────────────────

type EffectsByLevel = Record<string, unknown>
const effectsMemo = new Map<string, Promise<EffectsByLevel | null>>()
function gearEffects(itemCode: string): Promise<EffectsByLevel | null> {
  let p = effectsMemo.get(itemCode)
  if (!p) {
    p = getData<EffectsByLevel>(gearEffectsFile(itemCode)).catch(() => null)
    effectsMemo.set(itemCode, p)
  }
  return p
}

function levelOf(q: URLSearchParams): string {
  // slider ส่ง basicLevel/switchLevel/skillPlusLevel=5 เสมอ (client คำนวณระดับอื่นเอง) → ใช้ max
  if (q.has('basicLevel') || q.has('switchLevel') || q.has('skillPlusLevel')) return '5'
  const v = q.get('level') ?? 'max'
  if (v === 'max') return '5'
  const n = parseInt(v, 10)
  return String(isNaN(n) ? 5 : Math.max(0, Math.min(5, n)))
}

async function gearDetail(q: URLSearchParams): Promise<Response> {
  const iconUrl = q.get('iconUrl') ?? ''
  const code = itemCodeFromIconUrl(iconUrl)
  if (!code) return json({ error: 'Missing iconUrl' }, 400)
  const fx = await gearEffects(code)
  const effects = fx?.[levelOf(q)] ?? null
  if (q.get('effectsOnly') === 'true') return json({ rangers: [], effects })
  const rangers = (await getData<unknown[]>(gearUsersFile(q.get('league') ?? '0', code)).catch(() => null)) ?? []
  return json({ rangers, effects })
}

async function gearEffectsBatch(q: URLSearchParams): Promise<Response> {
  const urls = (q.get('iconUrls') ?? '').split(',').filter(Boolean)
  const effects: Record<string, unknown> = {}
  await Promise.all(urls.map(async (u) => {
    const code = itemCodeFromIconUrl(u)
    effects[u] = code ? ((await gearEffects(code))?.['5'] ?? null) : null
  }))
  return json({ effects })
}

async function castTime(id: string): Promise<Response> {
  const unitCode = id.toLowerCase().trim()
  if (!/^[a-z0-9_-]+$/.test(unitCode)) return json({ error: 'Invalid ranger id' }, 400)
  const res = await fetch(lericoProxy(`${LERICO_ORIGIN}/res/${unitCode}/${unitCode}-body.sam`))
  if (!res.ok) return json({ error: `SAM file not found for "${unitCode}" (HTTP ${res.status})` }, 404)
  const { parseSAMFrameCounts, extractCastTimes } = await import('./samParser')
  try {
    return json({ unitCode, ...extractCastTimes(parseSAMFrameCounts(await res.arrayBuffer())) })
  } catch {
    return json({ error: 'Failed to parse SAM file' }, 500)
  }
}

/** URL ไฟล์บน lerico ผ่าน Worker (แทน /api/lerico-proxy/file?url=... เดิม) */
export const proxyFile = (url: string) => lericoProxy(url)

/**
 * รายชื่อไฟล์ .sam ในโฟลเดอร์ของเรนเจอร์ (แทน /api/lerico-proxy/list/[id] เดิม)
 * คืน Response ที่ .json() ได้ { samFiles: string[] } หน้าตาเดียวกับของเดิม
 */
export async function fetchSamList(id: string): Promise<Response> {
  const unit = id.toLowerCase().trim()
  if (!/^[a-z0-9][a-z0-9_-]+$/i.test(unit)) return json({ samFiles: [], error: 'Invalid ranger id' }, 400)
  const dirUrl = `${LERICO_ORIGIN}/res/${unit}/`
  try {
    const res = await fetch(lericoProxy(dirUrl))
    if (!res.ok) return json({ samFiles: [], error: `Origin ${res.status}` }, res.status)
    const { parseSamLinks } = await import('./resIndex')
    return json({ samFiles: parseSamLinks(await res.text(), dirUrl) })
  } catch (err) {
    return json({ samFiles: [], error: err instanceof Error ? err.message : 'unknown' }, 502)
  }
}

/**
 * รายการของโฟลเดอร์ใน rangers.lerico.net/res/ (แทน /api/lerico-proxy/dir เดิม)
 * หน้าราก → ไฟล์ที่คำนวณไว้ตอน build (ต้องเช็คโฟลเดอร์ว่าง ~950 โฟลเดอร์ ทำสดไม่ไหว)
 * โฟลเดอร์ย่อย → อ่าน directory index ผ่าน Worker แล้วตัดโฟลเดอร์ว่างออกเหมือนเดิม
 */
export async function loadResDir(rawPath: string, advanced = false): Promise<import('./resIndex').DirEntry[]> {
  // เรนเจอร์ที่เจ้าของเว็บซ่อนไว้ (hiddenRangers.ts): เข้าโฟลเดอร์ตรงๆ = ไม่พบ · ไม่ขึ้นในรายการ
  const { isHiddenRanger } = await import('./hiddenRangers')
  if (isHiddenRanger(rawPath.replace(/^\/+/, ''))) throw new Error('Origin 404')
  return (await loadResDirAll(rawPath, advanced)).filter(e => !isHiddenRanger(e.name))
}

async function loadResDirAll(rawPath: string, advanced: boolean): Promise<import('./resIndex').DirEntry[]> {
  const { safeResPath, parseResIndex, isUnitDir } = await import('./resIndex')
  type Entry = import('./resIndex').DirEntry
  const path = safeResPath(rawPath)
  if (path === null) throw new Error('Invalid path')
  // hd/... = ไฟล์ APK เวอร์ชันล่าสุดที่เว็บเก็บไว้เอง (public/gameres/hd) — ไม่อ่านจาก lerico
  const { isLocalRes, loadLocalResDir } = await import('./gameRes')
  if (isLocalRes(path)) return loadLocalResDir(path)
  const list = async (p: string) => {
    const res = await fetch(lericoProxy(`${LERICO_ORIGIN}/res/${p ? `${p}/` : ''}`))
    if (!res.ok) throw new Error(`Origin ${res.status}`)
    return parseResIndex(await res.text(), advanced)
  }
  if (path === '') {
    const d = await getData<{ entries: Entry[] }>(resRootFile)
    if (d && !advanced) return d.entries
    if (d && advanced) {
      // โหมดขั้นสูง: เพิ่มโฟลเดอร์เรนเจอร์ที่ build เช็คไว้แล้วว่ามีไฟล์
      // ยังไม่มีไฟล์นี้ (build รอบถัดไปถึงจะมี) → อ่านรายการสดจากต้นทาง ไม่เช็คว่าว่าง (3,000+ โฟลเดอร์ เช็คสดไม่ไหว)
      const units = (await getData<{ entries: Entry[] }>(resRootUnitsFile))?.entries
        ?? (await list('')).filter(e => e.kind === 'dir' && isUnitDir(e.name))
      const cmp = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })
      return [...d.entries, ...units].sort((a, b) =>
        a.kind !== b.kind ? (a.kind === 'dir' ? -1 : 1) : cmp.compare(a.name, b.name))
    }
  }
  const entries = await list(path)
  const dirs = entries.filter(e => e.kind === 'dir')
  const keep = new Set<string>()
  const PARALLEL = 12
  for (let i = 0; i < dirs.length; i += PARALLEL) {
    await Promise.all(dirs.slice(i, i + PARALLEL).map(async d => {
      // อ่านไม่ได้ → โชว์ไว้ก่อน ดีกว่าซ่อนของที่อาจมีจริง
      try { if ((await list(path ? `${path}/${d.name}` : d.name)).length > 0) keep.add(d.name) } catch { keep.add(d.name) }
    }))
  }
  return entries.filter(e => e.kind !== 'dir' || keep.has(e.name))
}

/**
 * ใช้แทน fetch() สำหรับ URL /api/... เดิม
 * URL อื่น (ไม่ขึ้นต้นด้วย /api/) ส่งต่อให้ fetch ตามปกติ
 */
export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  if (!input.startsWith('/api/')) return fetch(input, init)
  const url = new URL(input, 'http://static.local')
  const { pathname, searchParams: q } = url

  if (pathname === '/api/meta/gear-detail') return gearDetail(q)
  if (pathname === '/api/meta/gear-effects-batch') return gearEffectsBatch(q)
  const cast = pathname.match(/^\/api\/ranger-cast-time\/([^/]+)$/)
  if (cast) return castTime(decodeURIComponent(cast[1]))

  const file = dataFile(pathname, q)
  if (!file) return json({ error: `No static data for ${pathname}` }, 404)

  const d = await dataFileOnce(file)
  if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  if (d.status === 404) {
    const fb = emptyFallback(pathname, q)
    if (fb !== undefined) return json(fb)
    return json({ error: 'Not found' }, 404)
  }
  return new Response(d.body, { status: d.status, headers: { 'Content-Type': d.type } })
}

/**
 * ไฟล์ข้อมูลเดียวกันดึงครั้งเดียวต่อการเปิดเว็บ (ข้อมูลเปลี่ยนวันละครั้งตอน deploy)
 * → กลับมาหน้าเดิมได้ข้อมูลทันที ไม่ต้องรอเน็ต · หลายคอมโพเนนต์ขอพร้อมกันก็ยิงครั้งเดียว
 */
const dataMemo = new Map<string, Promise<{ status: number; body: string; type: string }>>()
function dataFileOnce(file: string) {
  let p = dataMemo.get(file)
  if (!p) {
    p = fetch(`${DATA_BASE}/${file}`).then(async r => ({
      status: r.status, body: await r.text(), type: r.headers.get('Content-Type') ?? 'application/json',
    }))
    dataMemo.set(file, p)
    // เน็ตหลุด / เซิร์ฟเวอร์พัง → ไม่จำ ให้ลองใหม่ได้ครั้งหน้า
    p.then(d => { if (d.status >= 500) dataMemo.delete(file) }, () => dataMemo.delete(file))
  }
  return p
}
