// ====================================================
// storage.ts — ที่เก็บไฟล์อัปโหลดและโปรเจค
//
//   disk    = รันด้วย npm run dev / npm start → เก็บในโฟลเดอร์ storage/ ของเครื่อง (ผ่าน /api)
//   browser = เว็บออนไลน์ (Netlify ฯลฯ ไม่มีดิสก์ถาวร) → เก็บใน IndexedDB ของเบราว์เซอร์
//
// ไฟล์ในโหมด browser อ้างด้วย URL รูปแบบ "local:<แฮช>/<ชื่อไฟล์>" ในฉาก
// ทุกจุดที่จะโหลดไฟล์ต้องผ่าน fetchBlob() / resolveUrl() เพื่อแปลงเป็น blob: URL
// ====================================================

export type StorageMode = 'disk' | 'browser'

// ── ที่อยู่หลังบ้าน (เวอร์ชันในเว็บ Line Ranger Kiwi) ──
// ANME ตัวเดิมมีหลังบ้านของตัวเอง (server/api.mjs / Netlify Function) — ในเว็บนี้ไม่มีเซิร์ฟเวอร์
// จึงจำลองเส้นทาง /api/* ที่แอพเรียกไว้ฝั่ง browser ทั้งหมด (anmeFetch ด้านล่าง):
//   ไฟล์เกมจาก lerico → Cloudflare Worker ของเว็บ (/lerico/res/…)
//   รายชื่อเรนเจอร์     → /data/translations/{th,en}-names.json (สร้างตอน build ทุกวัน)
//   ข้อมูลจุดเงา/กระสุน → /anme/gamedata-index.json
// ไฟล์อัปโหลดกับโปรเจคเก็บใน IndexedDB ของเบราว์เซอร์ (โหมด browser) เหมือน ANME บน Netlify
import { WORKER_URL } from '@/lib/staticApi'

export const api = (path: string) => path

/** แปลง path ภายในแอพเป็น URL จริง: /api/res/… → Worker · /maps/… → /anme/maps/… */
export function appUrl(url: string): string {
  if (url.startsWith('/api/res/')) return `${WORKER_URL}/lerico/res/${url.slice('/api/res/'.length)}`
  if (url.startsWith('/maps/')) return '/anme' + url
  return url
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

let gamedataPromise: Promise<Record<string, unknown>> | null = null
function gamedataIndex(): Promise<Record<string, unknown>> {
  if (!gamedataPromise) {
    gamedataPromise = fetch('/anme/gamedata-index.json').then(r => r.json())
    gamedataPromise.catch(() => { gamedataPromise = null })
  }
  return gamedataPromise
}

/** ชื่อไฟล์ทั้งหมดในโฟลเดอร์ของ lerico (อ่าน directory index ผ่าน Worker) */
async function listDir(dir: string): Promise<string[]> {
  const r = await fetch(`${WORKER_URL}/lerico/res/${encodeURIComponent(dir)}/`)
  if (!r.ok) throw Object.assign(new Error(`ไม่พบ "${dir}" บน lerico (${r.status})`), { status: 404 })
  const html = await r.text()
  return [...html.matchAll(/href="([^"]+)"/gi)].map(m => decodeURIComponent(m[1]))
    .filter(h => !h.startsWith('.') && !h.startsWith('/') && !h.endsWith('/') && !/^https?:/.test(h))
}

function rangerSets(id: string, files: string[]) {
  const sets: Record<string, { sam: string; plist: string; png: string }> = {}
  const thumbs: Record<string, string> = {}
  const has = new Set(files)
  for (const f of files) {
    if (!f.startsWith(id + '-')) continue
    const part = f.slice(id.length + 1)
    const m = part.match(/^(.+)\.sam$/)
    if (m && has.has(`${id}-${m[1]}.plist`) && has.has(`${id}-${m[1]}.png`)) {
      sets[m[1]] = { sam: `${id}-${m[1]}.sam`, plist: `${id}-${m[1]}.plist`, png: `${id}-${m[1]}.png` }
    }
    if (part === 'thum.png') thumbs.body = f
    if (part === 'e-thum.png') thumbs['e-body'] = f
  }
  return { sets, thumbs }
}

let namesListPromise: Promise<{ id: string; en: string | null; th: string | null }[]> | null = null
function namesList() {
  if (!namesListPromise) {
    namesListPromise = Promise.all(['en', 'th'].map(l =>
      fetch(`/data/translations/${l}-names.json`).then(r => (r.ok ? r.json() : {})).catch(() => ({})) as Promise<Record<string, string>>,
    )).then(([en, th]) => {
      const ids = new Set<string>()
      for (const k of [...Object.keys(en), ...Object.keys(th)]) {
        const m = k.match(/^(.+)_nm$/)
        if (m) ids.add(m[1])
      }
      return [...ids].sort().map(id => ({ id, en: en[`${id}_nm`] ?? null, th: th[`${id}_nm`] ?? null }))
    })
    namesListPromise.catch(() => { namesListPromise = null })
  }
  return namesListPromise
}

const ID_RE = /^[a-z0-9][a-z0-9_-]*$/i

/** ใช้แทน anmeFetch(api('/api/…')) ของ ANME เดิม — เส้นทางอื่นส่งต่อให้ fetch ตามปกติ */
export async function anmeFetch(path: string, init?: RequestInit): Promise<Response> {
  if (!path.startsWith('/api/')) return fetch(appUrl(path), init)
  const url = new URL(path, 'http://anme.local')
  const seg = url.pathname.split('/').filter(Boolean).map(s => decodeURIComponent(s))
  try {
    if (seg[1] === 'health') return json({ ok: true, storage: 'browser' })
    if (seg[1] === 'library') return json({ rangers: [] })
    if (seg[1] === 'names') return json({ rangers: await namesList() })
    if (seg[1] === 'res') return fetch(appUrl(path), init)
    if (seg[1] === 'gamedata' && seg[2]) return json({ gamedata: (await gamedataIndex())[seg[2].toLowerCase()] ?? null })
    if (seg[1] === 'list' && seg[2]) return json({ files: await listDir(seg[2]) })
    if (seg[1] === 'ranger' && seg[2]) {
      const id = seg[2].toLowerCase().trim()
      if (!ID_RE.test(id)) return json({ error: 'รหัสเรนเจอร์ไม่ถูกต้อง' }, 400)
      const [files, gd] = await Promise.all([listDir(id), gamedataIndex().catch(() => ({} as Record<string, unknown>))])
      const { sets, thumbs } = rangerSets(id, files)
      if (!Object.keys(sets).length) return json({ error: `ไม่พบไฟล์อนิเมชั่นของ ${id}` }, 404)
      return json({ id, sets, thumbs, gamedata: gd[id] ?? null })
    }
    if (seg[1] === 'fetch') {
      // ไม่มีเซิร์ฟเวอร์ช่วยดาวน์โหลด → ลองดึงตรงจากเบราว์เซอร์ (ได้เฉพาะเว็บที่เปิด CORS)
      const src = url.searchParams.get('url') ?? ''
      try {
        const r = await fetch(src)
        if (!r.ok) return json({ error: `ต้นทางตอบ ${r.status}` }, 502)
        return r
      } catch {
        return json({ error: 'เว็บต้นทางไม่อนุญาตให้ดึงจากเบราว์เซอร์ — ดาวน์โหลดลงเครื่องแล้วอัปโหลดแทน' }, 502)
      }
    }
    return json({ error: 'เวอร์ชันนี้เก็บไฟล์ในเบราว์เซอร์ของคุณ (IndexedDB) — ไม่มีเซิร์ฟเวอร์' }, 501)
  } catch (err) {
    const status = typeof (err as { status?: number })?.status === 'number' ? (err as { status: number }).status : 500
    return json({ error: err instanceof Error ? err.message : String(err) }, status)
  }
}



export interface UploadItem {
  file: string
  name: string
  /** URL ที่เก็บในฉาก (local:… หรือ /files/uploads/…) */
  url: string
  /** URL สำหรับแสดงผลตรงๆ (<img>/<video>) */
  src: string
  size: number
  mime: string
  at: number
}

const MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', apng: 'image/apng', avif: 'image/avif', svg: 'image/svg+xml',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', m4v: 'video/mp4',
  mp3: 'audio/mpeg', ogg: 'audio/ogg', oga: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac', opus: 'audio/ogg',
  sam: 'application/octet-stream', plist: 'application/xml', json: 'application/json',
}
const mimeOf = (name: string, fallback = '') => fallback && fallback !== 'application/octet-stream' ? fallback : MIME[name.split('.').pop()?.toLowerCase() ?? ''] ?? (fallback || 'application/octet-stream')

// ── ตรวจโหมด (ครั้งเดียว) ──
let modePromise: Promise<StorageMode> | null = null
export function storageMode(): Promise<StorageMode> {
  // เว็บนี้เป็น static site — เก็บไฟล์อัปโหลด/โปรเจคในเบราว์เซอร์ (IndexedDB) เสมอ
  if (!modePromise) modePromise = Promise.resolve('browser')
  return modePromise
}

// ── IndexedDB ──
interface FileRec { key: string; name: string; mime: string; size: number; at: number; blob: Blob }
interface ProjectRec { name: string; at: number; scene: unknown }

let dbPromise: Promise<IDBDatabase> | null = null
function db(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((res, rej) => {
      const r = indexedDB.open('anme-studio', 1)
      r.onupgradeneeded = () => {
        const d = r.result
        if (!d.objectStoreNames.contains('files')) d.createObjectStore('files', { keyPath: 'key' })
        if (!d.objectStoreNames.contains('projects')) d.createObjectStore('projects', { keyPath: 'name' })
      }
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error ?? new Error('เปิด IndexedDB ไม่ได้'))
    })
  }
  return dbPromise
}
function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(d => new Promise<T>((res, rej) => {
    const t = d.transaction(store, mode)
    const req = fn(t.objectStore(store))
    req.onsuccess = () => res(req.result)
    req.onerror = () => rej(req.error)
  }))
}

async function hashOf(blob: Blob): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-1', await blob.arrayBuffer())
  return [...new Uint8Array(buf)].slice(0, 6).map(b => b.toString(16).padStart(2, '0')).join('')
}

const safeName = (n: string) => n.normalize('NFC').replace(/[\\/:*?"<>|#%]+/g, '_').slice(0, 80) || 'file'

// ── แปลง local: → blob: URL (แคชไว้ ใช้ซ้ำได้ตลอดอายุหน้า) ──
const objectUrls = new Map<string, string>()
const keyOf = (url: string) => url.slice('local:'.length).split('/')[0]
export const isLocalUrl = (url: string) => url.startsWith('local:')

export async function resolveUrl(url: string): Promise<string> {
  if (!isLocalUrl(url)) return appUrl(url)
  const key = keyOf(url)
  const hit = objectUrls.get(key)
  if (hit) return hit
  const rec = await tx<FileRec | undefined>('files', 'readonly', s => s.get(key))
  if (!rec) throw new Error(`ไม่พบไฟล์ในเบราว์เซอร์นี้ (${decodeURIComponent(url.split('/').pop() ?? '')}) — อาจถูกล้างข้อมูล หรือฉากนี้มาจากเครื่องอื่น`)
  const obj = URL.createObjectURL(rec.blob)
  objectUrls.set(key, obj)
  return obj
}

/** โหลดไฟล์เป็น Blob ได้ทั้ง URL ปกติและ local: */
export async function fetchBlob(url: string): Promise<Blob> {
  if (isLocalUrl(url)) {
    const rec = await tx<FileRec | undefined>('files', 'readonly', s => s.get(keyOf(url)))
    if (!rec) throw new Error(`ไม่พบไฟล์ในเบราว์เซอร์นี้ (${decodeURIComponent(url.split('/').pop() ?? '')})`)
    return rec.blob
  }
  const r = await anmeFetch(url)
  if (!r.ok || (r.headers.get('content-type') ?? '').startsWith('text/html')) {
    throw new Error(`${decodeURIComponent(url.split('/').pop() ?? url)} (${r.ok ? 'ไม่ใช่ไฟล์' : r.status})`)
  }
  return r.blob()
}

// ── อัปโหลด ──
export async function saveUpload(f: File | Blob, name?: string): Promise<UploadItem> {
  const n = safeName(name ?? (f instanceof File ? f.name : 'file'))
  if ((await storageMode()) === 'disk') {
    const r = await anmeFetch(api(`/api/upload?name=${encodeURIComponent(n)}`), { method: 'POST', body: f })
    const d = await r.json()
    if (!r.ok) throw new Error(d.error ?? 'อัปโหลดไม่สำเร็จ')
    return { ...d, src: d.url, at: Date.now() }
  }
  const key = await hashOf(f)
  const mime = mimeOf(n, f.type)
  const rec: FileRec = { key, name: n, mime, size: f.size, at: Date.now(), blob: f.type === mime ? f : new Blob([f], { type: mime }) }
  await tx('files', 'readwrite', s => s.put(rec))
  const url = `local:${key}/${encodeURIComponent(n)}`
  return { file: key, name: n, url, src: await resolveUrl(url), size: f.size, mime, at: rec.at }
}

export async function listUploads(): Promise<UploadItem[]> {
  if ((await storageMode()) === 'disk') {
    const d = await anmeFetch(api('/api/uploads')).then(r => r.json())
    return (d.files ?? []).map((x: UploadItem) => ({ ...x, src: x.url }))
  }
  const all = await tx<FileRec[]>('files', 'readonly', s => s.getAll())
  const out: UploadItem[] = []
  for (const r of all) {
    if (/\.(sam|plist)$/i.test(r.name)) continue
    const url = `local:${r.key}/${encodeURIComponent(r.name)}`
    out.push({ file: r.key, name: r.name, url, src: await resolveUrl(url), size: r.size, mime: r.mime, at: r.at })
  }
  return out.sort((a, b) => b.at - a.at)
}

/** ดึงสื่อจากลิงก์ภายนอกแล้วเก็บเหมือนไฟล์อัปโหลด */
export async function importFromUrl(src: string): Promise<UploadItem> {
  if ((await storageMode()) === 'disk') {
    const r = await anmeFetch(api('/api/import-url'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: src }) })
    const d = await r.json()
    if (!r.ok) throw new Error(d.error ?? 'ดาวน์โหลดไม่ได้')
    return { ...d, src: d.url, at: Date.now() }
  }
  const r = await anmeFetch(api(`/api/fetch?url=${encodeURIComponent(src)}`))
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `ดาวน์โหลดไม่ได้ (${r.status})`)
  const blob = await r.blob()
  let name = decodeURIComponent(new URL(src).pathname.split('/').pop() || 'media')
  if (!/\.\w+$/.test(name)) name += '.' + (blob.type.split('/')[1] ?? 'bin')
  return saveUpload(blob, name)
}

// ── โปรเจค ──
export interface ProjectInfo { name: string; at: number }

export async function listProjects(): Promise<ProjectInfo[]> {
  if ((await storageMode()) === 'disk') return (await anmeFetch(api('/api/projects')).then(r => r.json())).projects ?? []
  const all = await tx<ProjectRec[]>('projects', 'readonly', s => s.getAll())
  return all.map(p => ({ name: p.name, at: p.at })).sort((a, b) => b.at - a.at)
}

export async function loadProject(name: string): Promise<unknown | null> {
  if ((await storageMode()) === 'disk') return (await anmeFetch(api(`/api/projects/${encodeURIComponent(name)}`)).then(r => r.json())).project ?? null
  return (await tx<ProjectRec | undefined>('projects', 'readonly', s => s.get(name)))?.scene ?? null
}

export async function saveProjectData(name: string, scene: unknown): Promise<void> {
  if ((await storageMode()) === 'disk') {
    const r = await anmeFetch(api(`/api/projects/${encodeURIComponent(name)}`), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(scene) })
    if (!r.ok) throw new Error((await r.json()).error ?? 'บันทึกไม่สำเร็จ')
    return
  }
  await tx('projects', 'readwrite', s => s.put({ name, at: Date.now(), scene: JSON.parse(JSON.stringify(scene)) }))
}

export async function deleteProject(name: string): Promise<void> {
  if ((await storageMode()) === 'disk') { await anmeFetch(api(`/api/projects/${encodeURIComponent(name)}`), { method: 'DELETE' }); return }
  await tx('projects', 'readwrite', s => s.delete(name))
}

// ── เรนเจอร์ที่เคยโหลด (ใช้ในโหมด browser แทนการอ่านโฟลเดอร์แคช) ──
const RECENT_KEY = 'anme.recentRangers'
export function rememberRanger(id: string) {
  try {
    const list: string[] = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...list.filter(x => x !== id)].slice(0, 60)))
  } catch { /* */ }
}
export function recentRangers(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') } catch { return [] }
}
