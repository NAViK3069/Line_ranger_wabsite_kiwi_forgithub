// ====================================================
// assets.ts — โหลดไฟล์จริงของฉาก (SAM เรนเจอร์ / ภาพ / gif / webp / วิดีโอ / ภาพต่อเนื่อง / ฉากด่าน)
//
// โหลดครั้งเดียวต่อ asset แล้วแคชไว้ในหน่วยความจำ · ผู้วาดถาม get() ทุกเฟรม
// ยังโหลดไม่เสร็จ = คืน undefined → ผู้วาดข้ามไป (หรือวาดตัวยึดที่)
// ====================================================
import { SAMParser } from '@/anme/lib/animation/samParser'
import {
  loadSprites, disposeSprites, animMedianBBox, animBodyBBox, animStandPoint, anchorFromRatio, animCenterX, animSelfArcRise,
  type SpriteMap,
} from '@/anme/lib/animation/samRenderer'
import type { AssetDef, SamSetUrls, Vec } from './types'
import { L } from './i18n'
import { api, anmeFetch, appUrl, fetchBlob, resolveUrl, saveUpload, type UploadItem } from './storage'

export interface GameDataLite {
  sc: Vec | null
  fc: Vec | null
  fly: number
  ms: number | null
  n: MovePart | null
  s1: MovePart | null
  s2: MovePart | null
}
export interface MovePart { part: string | null; speed: number; motion: string | null; rot: string | null; start?: Vec | null }

/** ไฟล์เสียงของแต่ละท่า (จาก /data/ranger/projectile/<id>.json → soundUrls — เซิร์ฟเวอร์จับคู่ชื่อกับไฟล์บน lerico ไว้แล้ว) */
export type SkillSoundKind = 'normal' | 'skill1' | 'skill2'
export type SkillSoundUrls = Record<SkillSoundKind, { preparation: string | null; underAttack: string | null }>

const soundUrlsCache = new Map<string, Promise<SkillSoundUrls | null>>()
/** ตัวใหม่ที่ยังไม่มีข้อมูลเกม = null (ไม่ใส่เสียงให้) */
export function fetchSkillSoundUrls(rangerId: string): Promise<SkillSoundUrls | null> {
  const id = rangerId.trim().toLowerCase()
  if (!soundUrlsCache.has(id)) {
    soundUrlsCache.set(id, fetch(`/data/ranger/projectile/${encodeURIComponent(id)}.json`)
      .then(r => (r.ok ? r.json() : null))
      .then((d: { soundUrls?: SkillSoundUrls | null } | null) => d?.soundUrls ?? null)
      .catch(() => null))
  }
  return soundUrlsCache.get(id)!
}

export interface SamSet {
  sam: SAMParser
  sprites: SpriteMap
  fps: number
  clips: string[]
}

export interface BulletRuntime extends SamSet {
  flight: string | null
  finish: string | null
  /** คลิปบินลอยขึ้น-ลงในตัวเองอยู่แล้ว (≥ 40 หน่วย) → โค้งอัตโนมัติจะไม่ซ้อนทับ */
  selfArc: boolean
}

export interface RangerRuntime extends SamSet {
  kind: 'ranger'
  /** จุดยืน (เท้า) ในพิกัดของไฟล์ */
  stand: Vec
  /** จุดรับดาเมจ — เทียบกับจุดยืน (ยังไม่กลับด้าน) */
  hit: Vec
  /** ขอบบน/ล่าง/ซ้าย/ขวา เทียบกับจุดยืน (กรอบมัธยฐานของท่ายืน) */
  box: { x0: number; x1: number; y0: number; y1: number }
  idle: string
  bullets: Record<string, BulletRuntime>
  /** ชุดกระสุนที่ยังโหลดอยู่ */
  pending: Set<string>
  setKeys: string[]
  thumb: string | null
  gamedata: GameDataLite | null
  rangerId: string | null
  /** เสียงของท่า (ร่าย/โดน) จากข้อมูลเกม · ไม่มีข้อมูล = null */
  sounds: SkillSoundUrls | null
}

export interface ImageRuntime {
  kind: 'image'
  w: number
  h: number
  /** ภาพเคลื่อนไหว (gif/webp/apng) ถอดเป็นเฟรมแล้ว · null = ภาพนิ่ง */
  frames: { bmp: ImageBitmap; at: number; dur: number }[] | null
  total: number
  still: ImageBitmap | HTMLImageElement
}

export interface SequenceRuntime { kind: 'sequence'; w: number; h: number; frames: ImageBitmap[]; fps: number }

export interface VideoRuntime { kind: 'video'; w: number; h: number; duration: number; url: string }

export interface AudioRuntime { kind: 'audio'; url: string; duration: number; buffer: AudioBuffer }

export type Runtime = RangerRuntime | ImageRuntime | SequenceRuntime | VideoRuntime | AudioRuntime

let actx: AudioContext | null = null
/** AudioContext ตัวเดียวของทั้งแอพ (สร้างตอนต้องใช้ครั้งแรก) */
export function audioCtx(): AudioContext {
  if (!actx) actx = new AudioContext({ latencyHint: 'interactive' })
  return actx
}

export interface StageRuntime { canvas: HTMLCanvasElement; roadRatio: number }

type Status = { state: 'loading' } | { state: 'ready' } | { state: 'error'; error: string }

const IDLE_NAMES = ['idle', 'wait', 'stand']

/** ความยาวช่วงร่ายจริง (เฟรม) — ตัดเฟรมท้ายที่ไม่มีภาพออก (ท่าวาป/ดำดินที่หายตัวก่อนจบ) ยกมาจาก TurnBased */
export function readyLength(set: SamSet, clips: string[]): number {
  const frames = clips.flatMap(c => set.sam.animations[c] ?? [])
  let n = frames.length
  const has = (f: (typeof frames)[number]) => f.some(([, res, , color]) => color[3] > 0 && res < set.sam.images.length)
  while (n > 0 && !has(frames[n - 1])) n--
  return n
}
export const ROAD_RATIO = 0.778

// ── fetch helpers ──
// ผ่าน storage → รองรับทั้ง URL ปกติ และไฟล์ที่เก็บในเบราว์เซอร์ (local:…) · หน้า HTML ที่ตอบกลับมาแทนไฟล์ถือว่าพัง
const getBlob = (u: string) => fetchBlob(u)
const getBuf = (u: string) => fetchBlob(u).then(b => b.arrayBuffer())

export async function loadSamSet(urls: SamSetUrls): Promise<SamSet> {
  const [samBuf, plistBuf, png] = await Promise.all([getBuf(urls.sam), getBuf(urls.plist), getBlob(urls.png)])
  const sam = new SAMParser(samBuf)
  const sprites = await loadSprites(plistBuf, png)
  return { sam, sprites, fps: sam.animRate || 30, clips: sam.animNames.filter(n => n !== '_all' && sam.animations[n]?.length) }
}

function bulletOf(set: SamSet): BulletRuntime {
  const flight = set.sam.animations['normal']?.length ? 'normal' : set.clips.find(c => c !== 'finish') ?? null
  const finish = set.sam.animations['finish']?.length ? 'finish' : null
  const selfArc = !!flight && animSelfArcRise(set.sam, set.sprites, flight) >= 40
  return { ...set, flight, finish, selfArc }
}

function rangerOf(set: SamSet, gd: GameDataLite | null): Omit<RangerRuntime, 'bullets' | 'pending' | 'setKeys' | 'thumb' | 'rangerId' | 'sounds'> {
  const { sam, sprites } = set
  const idle = IDLE_NAMES.find(n => sam.animations[n]?.length) ?? set.clips[0] ?? '_all'
  const med = animMedianBBox(sam, sprites, idle) ?? { x0: -50, x1: 50, y0: -150, y1: 0 }
  const body = animBodyBBox(sam, sprites, idle) ?? med
  const stand = animStandPoint(sam, sprites, idle, gd?.sc ?? null)
    ?? (gd?.sc ? anchorFromRatio(body, gd.sc) : null)
    ?? { x: animCenterX(sam, sprites, idle), y: med.y1 }
  const face = gd?.fc ? anchorFromRatio(body, gd.fc) : { x: (body.x0 + body.x1) / 2, y: (body.y0 + body.y1) / 2 }
  return {
    ...set, kind: 'ranger', stand, idle, gamedata: gd,
    hit: { x: face.x - stand.x, y: face.y - stand.y },
    box: { x0: med.x0 - stand.x, x1: med.x1 - stand.x, y0: med.y0 - stand.y, y1: Math.max(med.y1, stand.y) - stand.y + 4 },
  }
}

// ── ภาพเคลื่อนไหว: ใช้ ImageDecoder (WebCodecs) ถอดทุกเฟรมพร้อมเวลา → เลื่อนไทม์ไลน์แล้วเฟรมตรงเสมอ ──
async function decodeAnimated(blob: Blob, type: string): Promise<ImageRuntime['frames']> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ID = (globalThis as any).ImageDecoder
  if (!ID || !type) return null
  try {
    if (!(await ID.isTypeSupported(type))) return null
    const dec = new ID({ data: await blob.arrayBuffer(), type })
    await dec.tracks.ready
    const track = dec.tracks.selectedTrack
    if (!track || !track.animated || track.frameCount <= 1) { dec.close(); return null }
    await dec.completed.catch(() => {})
    const frames: NonNullable<ImageRuntime['frames']> = []
    let at = 0
    for (let i = 0; i < track.frameCount; i++) {
      const { image } = await dec.decode({ frameIndex: i })
      const dur = Math.max(0.02, (image.duration ?? 100000) / 1e6)
      frames.push({ bmp: await createImageBitmap(image), at, dur })
      at += dur
      image.close()
    }
    dec.close()
    return frames
  } catch (e) {
    console.warn('decodeAnimated', e)
    return null
  }
}

const sniffType = (url: string, blob: Blob) => {
  if (blob.type && blob.type !== 'application/octet-stream') return blob.type
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase()
  return ({ gif: 'image/gif', webp: 'image/webp', png: 'image/png', apng: 'image/apng', jpg: 'image/jpeg', jpeg: 'image/jpeg', avif: 'image/avif' } as Record<string, string>)[ext ?? ''] ?? ''
}

export async function loadImageRuntime(url: string): Promise<ImageRuntime> {
  const blob = await getBlob(url)
  const type = sniffType(url, blob)
  const animated = /gif|webp|png|apng|avif/.test(type) ? await decodeAnimated(blob, type === 'image/apng' ? 'image/png' : type) : null
  if (animated?.length) {
    const last = animated[animated.length - 1]
    return { kind: 'image', w: animated[0].bmp.width, h: animated[0].bmp.height, frames: animated, total: last.at + last.dur, still: animated[0].bmp }
  }
  // svg ต้องผ่าน <img> · ที่เหลือ createImageBitmap
  if (type.includes('svg')) {
    const img = new Image()
    img.src = URL.createObjectURL(blob)
    await img.decode()
    return { kind: 'image', w: img.naturalWidth || 256, h: img.naturalHeight || 256, frames: null, total: 0, still: img }
  }
  const bmp = await createImageBitmap(blob)
  return { kind: 'image', w: bmp.width, h: bmp.height, frames: null, total: 0, still: bmp }
}

async function loadVideoMeta(ref: string): Promise<VideoRuntime> {
  const url = await resolveUrl(ref)
  return new Promise((resolve, reject) => {
    const v = document.createElement('video')
    v.preload = 'metadata'; v.muted = true; v.src = url
    v.onloadedmetadata = () => { resolve({ kind: 'video', w: v.videoWidth || 640, h: v.videoHeight || 360, duration: v.duration || 0, url }); v.removeAttribute('src'); v.load() }
    v.onerror = () => reject(new Error('เปิดไฟล์วิดีโอไม่ได้'))
  })
}

// ── API lerico ──
export interface RangerListing { id: string; sets: Record<string, SamSetUrls>; thumbs: Record<string, string>; gamedata: GameDataLite | null }

const listingCache = new Map<string, Promise<RangerListing>>()
export function fetchRangerListing(id: string): Promise<RangerListing> {
  id = id.trim().toLowerCase()
  if (!listingCache.has(id)) {
    const p = anmeFetch(api(`/api/ranger/${encodeURIComponent(id)}`)).then(async r => {
      if (!(r.headers.get('content-type') ?? '').includes('json')) throw new Error(L('ไม่พบหลังบ้าน /api — รันด้วย npm run dev / npm start, deploy บน Netlify หรือตั้ง API_BASE ให้ GitHub Pages', 'No /api backend — run npm run dev / npm start, deploy on Netlify, or set API_BASE for GitHub Pages'))
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`)
      const res = (f: string) => `/api/res/${encodeURIComponent(id)}/${encodeURIComponent(f)}`
      const sets: Record<string, SamSetUrls> = {}
      for (const [k, s] of Object.entries<{ sam: string; plist: string; png: string }>(d.sets)) {
        sets[k] = { sam: res(s.sam), plist: res(s.plist), png: res(s.png) }
      }
      const thumbs: Record<string, string> = {}
      for (const [k, f] of Object.entries<string>(d.thumbs ?? {})) thumbs[k] = res(f)
      return { id, sets, thumbs, gamedata: d.gamedata ?? null }
    })
    p.catch(() => listingCache.delete(id))
    listingCache.set(id, p)
  }
  return listingCache.get(id)!
}

export const thumbUrl = (id: string) => appUrl(`/api/res/${encodeURIComponent(id)}/${encodeURIComponent(id)}-thum.png`)

/** ชุดกระสุนของร่างนี้ → ชื่อเรียกสั้น (e-bul2 → bul2) */
function bulletSetsFor(form: string, sets: Record<string, SamSetUrls>): Record<string, SamSetUrls> {
  const out: Record<string, SamSetUrls> = {}
  const evolved = form.startsWith('e-')
  for (const [k, v] of Object.entries(sets)) {
    if (k === form || /^(e-)?body/.test(k)) continue
    const isE = k.startsWith('e-')
    const short = isE ? k.slice(2) : k
    if (evolved === isE) out[short] = v
    else if (!(short in out) && !sets[evolved ? 'e-' + k : k.slice(2)]) out[short] = v   // อีกร่างไม่มีชุดนี้ → ยืมของร่างที่มี
  }
  return out
}

// ── ฉากด่านจาก lerico (bg.png ต่อกัน + object วางบนพื้น) ──
const BG_TILES = 8
async function composeStage(stage: string): Promise<StageRuntime> {
  const load = (f: string) => new Promise<HTMLImageElement | null>(res => {
    const img = new Image()
    img.onload = () => res(img); img.onerror = () => res(null)
    img.crossOrigin = 'anonymous'
    img.src = appUrl(`/api/res/${encodeURIComponent(stage)}/${f}`)
  })
  const bg = await load('bg.png')
  if (!bg) throw new Error(`โหลดฉาก ${stage} ไม่ได้`)
  const objects = (await Promise.all([1, 2, 3, 4, 5, 6].map(i => load(`object${i}.png`)))).filter((o): o is HTMLImageElement => !!o)
  const W = bg.width * BG_TILES, H = bg.height
  const cv = document.createElement('canvas')
  cv.width = W; cv.height = H
  const ctx = cv.getContext('2d')!
  for (let i = 0; i < BG_TILES; i++) ctx.drawImage(bg, i * bg.width, 0)
  // วาง object ด้วยตัวสุ่มที่ seed คงที่ → ฉากเดิมทุกครั้งที่เปิด
  let seed = [...stage].reduce((s, c) => s * 31 + c.charCodeAt(0), 7) >>> 0
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
  if (objects.length) {
    let x = rnd() * 60
    for (let i = 0; x < W; i++) {
      const o = objects[i % objects.length]
      ctx.drawImage(o, Math.round(x), H - o.height)
      x += o.width + 40 + rnd() * 60
    }
  }
  return { canvas: cv, roadRatio: ROAD_RATIO }
}

// ====================================================
// AssetStore
// ====================================================
class AssetStore {
  private runtimes = new Map<string, Runtime>()
  private status = new Map<string, Status>()
  private defs = new Map<string, string>()     // assetId → ลายเซ็นของ def (เปลี่ยน = โหลดใหม่)
  private stages = new Map<string, StageRuntime | 'loading' | 'error'>()
  private listeners = new Set<() => void>()
  version = 0

  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn) } }
  private emit() { this.version++; this.listeners.forEach(f => f()) }

  get(id: string): Runtime | undefined { return this.runtimes.get(id) }
  statusOf(id: string): Status | undefined { return this.status.get(id) }

  /** ให้แน่ใจว่าทุก asset ในฉากถูกโหลด (เรียกซ้ำได้ ไม่โหลดซ้ำ) */
  sync(defs: AssetDef[]) {
    for (const d of defs) this.ensure(d)
  }

  ensure(def: AssetDef): void {
    const sig = JSON.stringify(def)
    if (this.defs.get(def.id) === sig) return
    this.defs.set(def.id, sig)
    const old = this.runtimes.get(def.id)
    if (old) this.dispose(old)
    this.runtimes.delete(def.id)
    this.status.set(def.id, { state: 'loading' })
    this.emit()
    this.load(def).then(rt => {
      if (this.defs.get(def.id) !== sig) { this.dispose(rt); return }
      this.runtimes.set(def.id, rt)
      this.status.set(def.id, { state: 'ready' })
      this.emit()
    }).catch(err => {
      console.error(err)
      this.status.set(def.id, { state: 'error', error: err instanceof Error ? err.message : String(err) })
      this.emit()
    })
  }

  private dispose(rt: Runtime) {
    if (rt.kind === 'ranger') {
      disposeSprites(rt.sprites)
      Object.values(rt.bullets).forEach(b => disposeSprites(b.sprites))
    } else if (rt.kind === 'sequence') rt.frames.forEach(f => f.close())
  }

  private async load(def: AssetDef): Promise<Runtime> {
    switch (def.type) {
      case 'ranger': {
        let bodyUrls: SamSetUrls, bullets: Record<string, SamSetUrls>, gd: GameDataLite | null = null
        let thumb: string | null = null, rangerId: string | null = null
        let sounds: SkillSoundUrls | null = null
        if (def.source === 'lerico') {
          const [L, snd] = await Promise.all([fetchRangerListing(def.rangerId), fetchSkillSoundUrls(def.rangerId)])
          sounds = snd
          const form = L.sets[def.form] ? def.form : 'body'
          if (!L.sets[form]) throw new Error(`ไม่มีร่าง ${def.form}`)
          bodyUrls = L.sets[form]
          bullets = bulletSetsFor(form, L.sets)
          gd = L.gamedata
          thumb = L.thumbs[form] ?? L.thumbs.body ?? null
          rangerId = L.id
        } else {
          bodyUrls = def.sets[def.body]
          if (!bodyUrls) throw new Error('ไม่มีไฟล์ตัวละคร (body)')
          bullets = Object.fromEntries(Object.entries(def.sets).filter(([k]) => k !== def.body))
        }
        const body = await loadSamSet(bodyUrls)
        const rt: RangerRuntime = {
          ...rangerOf(body, gd), bullets: {}, pending: new Set(Object.keys(bullets)),
          setKeys: Object.keys(bullets).sort(), thumb, rangerId, sounds,
        }
        // กระสุนโหลดตามหลัง — ตัวละครขึ้นจอได้ก่อน
        for (const [k, urls] of Object.entries(bullets)) {
          loadSamSet(urls).then(s => { rt.bullets[k] = bulletOf(s) }).catch(e => console.warn('bullet', k, e))
            .finally(() => { rt.pending.delete(k); this.emit() })
        }
        return rt
      }
      case 'image': return loadImageRuntime(def.url)
      case 'video': return loadVideoMeta(def.url)
      case 'audio': {
        const buf = await getBuf(def.url)
        const buffer = await audioCtx().decodeAudioData(buf)
        return { kind: 'audio', url: def.url, duration: buffer.duration, buffer }
      }
      case 'sequence': {
        const frames = await Promise.all(def.urls.map(u => getBlob(u).then(b => createImageBitmap(b))))
        if (!frames.length) throw new Error('ไม่มีภาพ')
        return { kind: 'sequence', frames, fps: def.fps, w: frames[0].width, h: frames[0].height }
      }
    }
  }

  // ── ฉากด่าน ──
  stage(name: string): StageRuntime | null {
    const s = this.stages.get(name)
    if (s === 'loading' || s === 'error') return null
    if (s) return s
    this.stages.set(name, 'loading')
    composeStage(name).then(rt => { this.stages.set(name, rt); this.emit() })
      .catch(() => { this.stages.set(name, 'error'); this.emit() })
    return null
  }
  stageFailed(name: string) { return this.stages.get(name) === 'error' }

  // ── วิดีโอ: element แยกต่อผู้ใช้ (actor/พื้นหลัง) เพราะแต่ละตัวอยู่คนละเวลา ──
  private videos = new Map<string, HTMLVideoElement>()
  video(key: string, url: string): HTMLVideoElement {
    let v = this.videos.get(key)
    if (!v || v.dataset.src !== url) {
      v?.pause()
      v = document.createElement('video')
      v.dataset.src = url
      v.src = url
      v.muted = true; v.playsInline = true; v.preload = 'auto'; v.loop = false
      v.load()
      v.addEventListener('loadeddata', () => this.emit())
      v.addEventListener('seeked', () => this.emit())
      this.videos.set(key, v)
    }
    return v
  }
  /** หยุดวิดีโอที่ไม่ได้ใช้ในเฟรมนี้ */
  pauseVideosExcept(used: Set<string>) {
    for (const [k, v] of this.videos) if (!used.has(k) && !v.paused) v.pause()
  }
  /** รอวิดีโอที่กำลัง seek/โหลดให้เสร็จ (ใช้ตอน export ทีละเฟรม) — คืน true ถ้ามีวิดีโอให้รอ */
  async settleVideos(timeoutMs = 1500): Promise<boolean> {
    const busy = [...this.videos.values()].filter(v => v.seeking || v.readyState < 2)
    if (!busy.length) return false
    await Promise.race([
      Promise.all(busy.map(v => new Promise<void>(r => {
        if (!v.seeking && v.readyState >= 2) return r()
        const done = () => { v.removeEventListener('seeked', done); v.removeEventListener('loadeddata', done); r() }
        v.addEventListener('seeked', done); v.addEventListener('loadeddata', done)
      }))),
      new Promise(r => setTimeout(r, timeoutMs)),
    ])
    return true
  }
}

export const assets = new AssetStore()

// ── อัปโหลด ──
export type UploadResult = UploadItem
/** อัปโหลด: ดิสก์ของเครื่อง (dev/start) หรือ IndexedDB ของเบราว์เซอร์ (เว็บออนไลน์) — ดู storage.ts */
export const uploadFile = (f: File | Blob, name?: string): Promise<UploadResult> => saveUpload(f, name)

export const isAudioName = (n: string) => /\.(mp3|ogg|oga|wav|m4a|aac|flac|opus)$/i.test(n)
export const isVideoName = (n: string) => /\.(mp4|webm|mov|m4v|ogv)$/i.test(n)
export const isImageName = (n: string) => /\.(png|jpe?g|gif|webp|apng|avif|svg|bmp)$/i.test(n)
