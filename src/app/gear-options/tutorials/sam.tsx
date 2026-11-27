'use client'

// ====================================================
// ภาพจากไฟล์เกมในชั้นซ้อนของวิดีโอสอน
//   <SamSprite>   เล่นอนิเมชัน .sam (เช่น ช่องเกียร์ fx70-gear-slot, วิญญาณ eff_die_enemy) — เฟรมคำนวณจากเวลาวิดีโอ
//   <AtlasSprite> ชิ้นเดียวจาก atlas .plist/.png (เช่น ไอคอนช่อง gear_main_slot_icon_weapon_on.png)
// ไฟล์โหลดผ่าน Worker (lericoProxy) ครั้งเดียวต่อไฟล์ แล้วใช้ร่วมกันทุกชิ้น
// ====================================================

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { SAMParser } from '@/lib/animation/samParser'
import { animBBox, loadSprites, renderSAMFrame, type SpriteMap } from '@/lib/animation/samRenderer'
import { LERICO_ORIGIN, lericoProxy } from '@/lib/staticApi'
import { isLocalRes, localResUrl } from '@/lib/gameRes'

/** hd/... = ไฟล์ APK ล่าสุดที่เว็บเก็บเอง (public/gameres) · อื่นๆ = lerico ผ่าน Worker */
const resUrl = (path: string) => (isLocalRes(path) ? localResUrl(path) : lericoProxy(`${LERICO_ORIGIN}/res/${path}`))

const atlasCache = new Map<string, Promise<SpriteMap>>()
/** atlas = พาธใต้ res/ ไม่มีนามสกุล เช่น 'gear_main/gear_common' */
function loadAtlas(atlas: string): Promise<SpriteMap> {
  let p = atlasCache.get(atlas)
  if (!p) {
    p = Promise.all([
      fetch(resUrl(`${atlas}.plist`)).then(r => r.arrayBuffer()),
      fetch(resUrl(`${atlas}.png`)).then(r => r.blob()),
    ]).then(([plist, png]) => loadSprites(plist, png))
    p.catch(() => atlasCache.delete(atlas))
    atlasCache.set(atlas, p)
  }
  return p
}

interface SamData { sam: SAMParser; sprites: SpriteMap }
const samCache = new Map<string, Promise<SamData>>()
/** base = พาธใต้ res/ ไม่มีนามสกุล เช่น 'gear_main/fx70-gear-slot' (ใช้ .sam + .plist + .png ชื่อเดียวกัน) */
function loadSam(base: string): Promise<SamData> {
  let p = samCache.get(base)
  if (!p) {
    p = Promise.all([fetch(resUrl(`${base}.sam`)).then(r => r.arrayBuffer()), loadAtlas(base)])
      .then(([buf, sprites]) => ({ sam: new SAMParser(buf), sprites }))
    p.catch(() => samCache.delete(base))
    samCache.set(base, p)
  }
  return p
}

/** ค่าที่โหลดเสร็จแล้ว → ชิ้นที่เพิ่งโผล่ใช้ได้ทันทีในเฟรมแรก (ไม่ต้องรอ promise — สำคัญตอนส่งออกวิดีโอทีละเฟรม) */
const resolved = new Map<string, unknown>()
function useLoaded<T>(load: () => Promise<T>, key: string): T | null {
  const [v, setV] = useState<T | null>(() => (resolved.get(key) as T | undefined) ?? null)
  useEffect(() => {
    let alive = true
    const hit = resolved.get(key) as T | undefined
    if (hit !== undefined) { setV(hit); return }
    load().then(x => { resolved.set(key, x); if (alive) setV(x) }).catch(() => {})
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return v
}

/** กรอบภาพของเฟรมเดียวในท่า (พิกัดของไฟล์) */
export function frameBBox(sam: Pick<SAMParser, 'animations' | 'images'>, sprites: SpriteMap, clip: string, index: number) {
  const frames = sam.animations[clip]
  const f = frames?.[Math.max(0, Math.min(frames.length - 1, index))]
  return f ? animBBox({ animations: { f: [f] }, images: sam.images } as unknown as SAMParser, sprites, 'f') : null
}

const RES = 2   // ความละเอียด canvas (ชั้นซ้อนถูกย่อ/ขยายด้วย CSS — วาด 2 เท่าไว้ให้คมบนจอใหญ่)

/**
 * เล่นท่า clip ของไฟล์ .sam ที่เฟรม frame (เรียกจาก t: Math.floor((t - start) * 30))
 *   canvas ครอบกรอบของท่า fitClip (ค่าเริ่ม '_all' = รวมทุกท่า) → สลับท่า/แสงฟุ้งแล้วไม่โดนตัด
 *   ตำแหน่ง: จุดกึ่งกลางของท่า anchorClip (ค่าเริ่ม = clip) วางที่ x, y
 *            anchorFrame = ใช้กรอบของเฟรมนั้นเฟรมเดียว (ภาพที่ส่ายไปมาในท่า เช่น วิญญาณ — เฟรมแรกตรงจุดที่ต้องการ)
 *   ขนาด: size = ความกว้างที่ต้องการของ anchorClip (พิกเซลชั้นซ้อน) · ไม่ใส่ = ใช้ scale ตรงๆ
 */
export function SamSprite({ base, clip, frame, loop = false, x, y, scale: scaleIn = 1, size, alpha = 1, fitClip = '_all', anchorClip, anchorFrame, anchorStage = false, stageAnchorY = 0.5 }: {
  base: string; clip: string; frame: number; loop?: boolean; x: number; y: number; scale?: number; size?: number; alpha?: number
  fitClip?: string; anchorClip?: string; anchorFrame?: number
  /** true = ให้กลางกรอบเวทีของไฟล์ .sam ตกที่ x, y (แบบ SuperAnimNode anchor 0.5, 0.5 ในเกม) */
  anchorStage?: boolean
  /** anchor แนวตั้งของกรอบเวที (แบบ cocos: 0 = ขอบล่าง · 0.5 = กลาง · 1 = ขอบบน) */
  stageAnchorY?: number
}) {
  const data = useLoaded(() => loadSam(base), `sam:${base}`)
  const ref = useRef<HTMLCanvasElement>(null)
  const pick = (name: string) => (data && data.sam.animations[name] ? name : clip)
  const box = data ? animBBox(data.sam, data.sprites, pick(fitClip)) : null
  const cv0 = data?.sam.canvas
  const anchor = data
    ? anchorStage && cv0?.w ? { x0: cv0.x, x1: cv0.x + cv0.w, y0: cv0.y + cv0.h * (1 - stageAnchorY), y1: cv0.y + cv0.h * (1 - stageAnchorY) }
    : anchorFrame != null ? frameBBox(data.sam, data.sprites, pick(anchorClip ?? clip), anchorFrame) : animBBox(data.sam, data.sprites, pick(anchorClip ?? clip))
    : null
  const scale = size && anchor ? size / Math.max(1, anchor.x1 - anchor.x0) : scaleIn
  const w = box ? Math.ceil((box.x1 - box.x0) * scale) : 0
  const h = box ? Math.ceil((box.y1 - box.y0) * scale) : 0
  // มุมซ้ายบนของ canvas บนชั้นซ้อน — ให้จุดกึ่งกลางของ anchor ตกที่ x, y
  const left = box && anchor ? x - (((anchor.x0 + anchor.x1) / 2) - box.x0) * scale : 0
  const top = box && anchor ? y - (((anchor.y0 + anchor.y1) / 2) - box.y0) * scale : 0

  useLayoutEffect(() => {
    const cv = ref.current
    if (!data || !box || !cv) return
    const frames = data.sam.animations[clip]
    if (!frames?.length) return
    const i = loop ? ((frame % frames.length) + frames.length) % frames.length : Math.max(0, Math.min(frames.length - 1, frame))
    const ctx = cv.getContext('2d')!
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, cv.width, cv.height)
    // renderSAMFrame ตั้ง transform เองทุกชิ้น (ทับ ctx.setTransform) → คูณ RES เข้าไปในตำแหน่ง/สเกลตรงๆ
    renderSAMFrame(ctx, frames[i], data.sam.images, data.sprites, -box.x0 * scale * RES, -box.y0 * scale * RES, scale * RES)
  })

  if (!box || alpha <= 0) return null
  return (
    <canvas ref={ref} width={w * RES} height={h * RES} className="absolute pointer-events-none"
      style={{ left, top, width: w, height: h, opacity: alpha }} />
  )
}

/** ชิ้นเดียวจาก atlas — วาดลง canvas ตามขนาดจริงของชิ้น × scale · x, y = จุดกึ่งกลาง */
export function AtlasSprite({ atlas, name, x, y, scale = 1, alpha = 1, style }: {
  atlas: string; name: string; x: number; y: number; scale?: number; alpha?: number; style?: React.CSSProperties
}) {
  const sprites = useLoaded(() => loadAtlas(atlas), `atlas:${atlas}`)
  const ref = useRef<HTMLCanvasElement>(null)
  const spr = sprites?.[name]
  useLayoutEffect(() => {
    const cv = ref.current
    if (!spr || !cv) return
    const ctx = cv.getContext('2d')!
    ctx.clearRect(0, 0, cv.width, cv.height)
    ctx.drawImage(spr.bitmap, 0, 0, cv.width, cv.height)
  }, [spr])
  if (!spr) return null
  const w = spr.w * scale, h = spr.h * scale
  return (
    <canvas ref={ref} width={Math.ceil(spr.w * RES)} height={Math.ceil(spr.h * RES)} className="absolute pointer-events-none"
      style={{ left: x - w / 2, top: y - h / 2, width: w, height: h, opacity: alpha, ...style }} />
  )
}
