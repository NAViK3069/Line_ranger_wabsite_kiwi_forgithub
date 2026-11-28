'use client'

// ====================================================
// StageScene — ฉากต่อสู้ของด่าน (res/<bgRsourceId>/) วาดแบบในเกม เป็นพื้นของแถบหัวด่าน
//
// จาก libgame.so (ตัวสร้างฉากต่อสู้ 0xc53300 – 0xc53b90):
//   bg.png        ปูซ้ำแนวนอน: จำนวน = ความยาวสนาม / กว้างภาพ + 2 · ภาพที่ i อยู่ที่ x = (กว้าง − 1) × i (ซ้อนกัน 1 pt)
//                 anchor (0, 0) — ขอบล่างของทุกชั้นอยู่ที่ระดับเดียวกัน
//   object%d.png  เรียงจากซ้ายไปขวาจนสุดสนาม: x = ปลายชิ้นก่อน + สุ่ม 0–79 pt · anchor (0, 0) ขอบล่างตรงกับ bg
//                 ลำดับภาพวน 1 → 6 (ต่อจาก 6 กลับไป 1)
//   s_object1/2   ออปเจคพิเศษ 2 ชิ้น (anchor กลางภาพ) — 1 ทางฝั่งซ้าย · 2 ทางฝั่งขวา (x = ความยาวสนาม − ระยะ)
//                 ตำแหน่งจริงมาจากข้อมูลที่ยังไม่ได้ถอด → ประมาณ: 1 ตั้งบนพื้นช่วงซ้าย · 2 ห้อยจากขอบบนช่วงขวา
// ภาพเป็นความละเอียด 2 px ต่อ pt (contentScaleFactor 2) — ทุกชั้นใช้สเกลเดียวกัน จึงวาดเป็น px ของภาพได้เลย
// ช่องว่างสุ่มใช้เลขสุ่มที่อิงรหัสด่าน → ภาพเดิมทุกครั้งที่เปิด
// ====================================================

import { useEffect, useRef, useState } from 'react'
import { LERICO_ORIGIN } from '@/lib/staticApi'

const imgCache = new Map<string, Promise<HTMLImageElement | null>>()
function loadImg(src: string): Promise<HTMLImageElement | null> {
  let p = imgCache.get(src)
  if (!p) {
    p = new Promise(res => { const im = new Image(); im.decoding = 'async'; im.onload = () => res(im); im.onerror = () => res(null); im.src = src })
    imgCache.set(src, p)
  }
  return p
}

/** เลขสุ่มคงที่ตามรหัสด่าน (mulberry32) */
function rng(seed: string) {
  let a = 0
  for (const ch of seed) a = (Math.imul(a, 31) + ch.charCodeAt(0)) | 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** แถบที่ยึดไว้กลางกล่องตอนต้องตัด (สัดส่วนจากบนของ bg) — เส้นขอบฟ้าและฐานของออปเจคพื้น */
const FOCUS_Y = 0.6

interface Scene { W: number; H: number; draw: (ctx: CanvasRenderingContext2D, s: number, offY: number) => void }

async function buildScene(bg: string, field: number, seed: string): Promise<Scene | null> {
  const base = `${LERICO_ORIGIN}/res/${bg}/`
  const [bgIm, ...rest] = await Promise.all([
    loadImg(`${base}bg.png`),
    ...[1, 2, 3, 4, 5, 6].map(i => loadImg(`${base}object${i}.png`)),
    loadImg(`${base}s_object1.png`), loadImg(`${base}s_object2.png`),
  ])
  if (!bgIm) return null
  const objs = rest.slice(0, 6)
  const [s1, s2] = rest.slice(6)
  const W = Math.max(bgIm.width, Math.round(field * 2))   // ความยาวสนาม (px ของภาพ)
  const H = bgIm.height
  const rand = rng(seed)
  // วางออปเจค (คำนวณครั้งเดียว)
  const placed: { im: HTMLImageElement; x: number }[] = []
  const have = objs.map((o, i) => (o ? i : -1)).filter(i => i >= 0)
  if (have.length) {
    let x = 0, n = 0
    while (x < W) {
      const im = objs[have[n % have.length]]!
      const px = x + Math.floor(rand() * 80) * 2
      if (px + im.width > W + im.width * 0.5) break
      placed.push({ im, x: px })
      x = px + im.width
      n++
    }
  }
  return {
    W, H,
    draw(ctx, s, offY) {
      // bg ปูซ้ำ (ซ้อนกัน 1 pt = 2 px)
      const step = bgIm.width - 2
      for (let x = 0; x < W; x += step) ctx.drawImage(bgIm, Math.floor(x * s), Math.floor(offY), Math.ceil(bgIm.width * s) + 1, Math.ceil(H * s))
      // ออปเจคพิเศษ (หลังออปเจคพื้น)
      if (s1) ctx.drawImage(s1, (W * 0.2 - s1.width / 2) * s, offY + (H * 0.66 - s1.height) * s, s1.width * s, s1.height * s)
      if (s2) ctx.drawImage(s2, (W * 0.78 - s2.width / 2) * s, offY, s2.width * s, s2.height * s)
      // ออปเจคพื้น — ขอบล่างตรงกับ bg
      for (const p of placed) ctx.drawImage(p.im, p.x * s, offY + (H - p.im.height) * s, p.im.width * s, p.im.height * s)
    },
  }
}

/** ฉากเต็มความกว้างกล่อง · ความสูงไม่เกิน maxH — เกินจะตัดท้องฟ้าด้านบนออก (คงพื้นและออปเจคไว้) */
export default function StageScene({ bg, field, seed, className = '' }: { bg: string; field: number; seed: string; className?: string }) {
  const box = useRef<HTMLDivElement>(null)
  const cv = useRef<HTMLCanvasElement>(null)
  const [scene, setScene] = useState<Scene | null>(null)
  const [w, setW] = useState(0)

  useEffect(() => {
    let live = true
    buildScene(bg, field, seed).then(sc => { if (live) setScene(sc) })
    return () => { live = false }
  }, [bg, field, seed])

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const c = cv.current, el = box.current
    if (!scene || !c || !el || !w) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const hBox = el.clientHeight
    const s = (w / scene.W) * dpr
    const fullH = scene.H * s
    const H = Math.round(hBox * dpr), W = Math.round(w * dpr)
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H }
    const ctx = c.getContext('2d')!
    ctx.clearRect(0, 0, W, H)
    ctx.imageSmoothingQuality = 'high'
    // ฉากสูงกว่ากล่อง → ตัดบน/ล่าง ให้แถบเส้นขอบฟ้า + ออปเจค (~60% ของความสูงภาพ) อยู่กลางกล่อง
    // เตี้ยกว่า → ขยายให้เต็มความสูงแทน (ตัดซ้ายขวาเท่ากัน)
    if (fullH >= H) scene.draw(ctx, s, Math.max(H - fullH, Math.min(0, H / 2 - fullH * FOCUS_Y)))
    else {
      const s2 = H / scene.H
      ctx.save(); ctx.translate((W - scene.W * s2) / 2, 0); scene.draw(ctx, s2, 0); ctx.restore()
    }
  }, [scene, w])

  return (
    <div ref={box} className={`absolute inset-0 overflow-hidden ${className}`}>
      <canvas ref={cv} aria-hidden="true" className="block h-full w-full transition-opacity duration-300" style={{ opacity: scene ? 1 : 0 }} />
    </div>
  )
}
