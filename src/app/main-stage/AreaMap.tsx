'use client'

// ====================================================
// AreaMap — ฉากของพื้นที่ (อนิเมชัน) บนพื้นแผนที่ของเกม (ส่วนของแผนที่ใหญ่รอบฉากนั้น) — ไม่มีปุ่มด่าน
//
// จาก libgame.so (AreaScrollLayer, 0xb2aacc):
//   แผนที่ = ภาพ res/area_bgN/bg-NN-k.png เรียงเป็นแถว — ภาพที่ i (0..) → แถว N = i / 3 + 1, คอลัมน์ k = i % 3 + 1
//   ภาพละ 1024px = 512pt (contentScaleFactor 2) · แถว 1 อยู่ล่างสุด ซ้อนขึ้นไปทีละ 512pt · คอลัมน์ 1–3 ซ้ายไปขวา
//   ตำแหน่งบนแผนที่ใช้หน่วย pt แกน y ขึ้นบน:
//     ฉากพื้นที่ = area.towerPosX / towerPosY = จุดตั้งฐานบนแผนที่ — SuperAnimNode anchor (0.5, 0.5) ของกรอบ .sam
//     (1 pt = 2 px ของไฟล์) · ตัวภาพในกรอบ .sam ไม่ได้อยู่กลางกรอบเสมอ (ar31 เตาไฟอยู่ขวาล่าง ควันลอยขึ้นซ้ายบน)
//
// กล่องนี้ = หน้าต่างรอบ "ตัวฉาก": วาดเฟรมแรกของฉากลง canvas ชั่วคราว แล้วหากรอบของส่วนทึบ (alpha สูง)
//   — ควัน/แสง/เอฟเฟกต์ที่โปร่งแสงไม่นับ → กึ่งกลางและขนาดหน้าต่างตามตัวฉากจริง
// พื้นแผนที่วาดลง canvas เดียว (ภาพต่อกันซ้อนขอบ 1px) → ไม่มีรอยต่อระหว่างภาพ
// Hard / Extreme ใช้แผนที่และตำแหน่งชุดเดียวกับพื้นที่ปกติเลขเดียวกัน — ย้อมสีตามโหมด
// ====================================================

import { useEffect, useRef, useState } from 'react'
import { renderSAMFrame } from '@/lib/animation/samRenderer'
import { LERICO_ORIGIN } from '@/lib/staticApi'
import type { StageMode } from '@/lib/mainStage'
import { loadLand, type Loaded } from './Landmark'

const TILE = 512          // pt ต่อภาพ (1024 px)
const COLS = 3
const ROWS = 23           // area_bg1 – area_bg23
/** สัดส่วนกล่อง (กว้าง : สูง) */
const ASPECT = 6 / 5

/** ย้อมแผนที่ตามโหมด (แบบโหมดยากในเกมที่แผนที่มืดลง) */
const TINT: Record<StageMode, string> = {
  normal: 'none',
  hard: 'saturate(.75) hue-rotate(205deg) brightness(.72)',
  extreme: 'sepia(.35) saturate(1.35) hue-rotate(-28deg) brightness(.6)',
}

// ── ตัวฉาก: กรอบส่วนทึบ (pt เทียบจุดยึด, y ลง) ──
interface Art { cx: number; cy: number; w: number; h: number }
const artCache = new WeakMap<Loaded, Art>()
function artOf(d: Loaded): Art {
  const hit = artCache.get(d)
  if (hit) return hit
  const { w, h } = d.sam.canvas
  const W = Math.max(1, Math.round(w / 2)), H = Math.max(1, Math.round(h / 2))   // วาดที่ 1 px = 1 pt
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  renderSAMFrame(ctx, d.sam.animations[d.clip][0], d.sam.images, d.sprites, 0, 0, 0.5)
  let art: Art = { cx: 0, cy: 0, w: W * 0.6, h: H * 0.6 }
  try {
    const px = ctx.getImageData(0, 0, W, H).data
    const xs: number[] = [], ys: number[] = []
    for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) if (px[(y * W + x) * 4 + 3] >= 200) { xs.push(x); ys.push(y) }
    if (xs.length > 20) {
      xs.sort((a, b) => a - b); ys.sort((a, b) => a - b)
      // ตัดปลายสุด 3% (เศษเล็กๆ ที่หลุดออกไป) → กรอบของก้อนหลัก
      const q = (a: number[], p: number) => a[Math.min(a.length - 1, Math.floor(a.length * p))]
      const x0 = q(xs, 0.03), x1 = q(xs, 0.97), y0 = q(ys, 0.03), y1 = q(ys, 0.97)
      art = { cx: (x0 + x1) / 2 - W / 2, cy: (y0 + y1) / 2 - H / 2, w: x1 - x0, h: y1 - y0 }
    }
  } catch { /* อ่านพิกเซลไม่ได้ → ใช้กลางกรอบ */ }
  artCache.set(d, art)
  return art
}

/** ความกว้างหน้าต่าง (pt) — เท่ากันทุกพื้นที่ = ระยะซูมเดียวกัน (ฉากใหญ่/เล็กตามสัดส่วนจริงในเกม) */
const VIEW_W = 300
/** หน้าต่างที่ตัดมาแสดง (pt, มุมซ้ายล่างบนแผนที่ y ขึ้น) — กึ่งกลางตัวฉาก · ขนาดคงที่ · ไม่เลยขอบแผนที่ */
interface View { x0: number; y0: number; w: number; h: number }
function viewFor(tower: [number, number], d: Loaded | null): View {
  let cx = tower[0], cy = tower[1]
  if (d) {
    const a = artOf(d)
    cx = tower[0] + a.cx
    cy = tower[1] - a.cy
  }
  const w = VIEW_W, h = w / ASPECT
  return {
    x0: Math.max(0, Math.min(COLS * TILE - w, cx - w / 2)),
    y0: Math.max(0, Math.min(ROWS * TILE - h, cy - h / 2)),
    w, h,
  }
}

// ── ภาพแผนที่ (โหลดครั้งเดียวต่อภาพ ใช้ร่วมทุกการ์ด) ──
const tileCache = new Map<string, Promise<HTMLImageElement | null>>()
function loadTile(row: number, col: number): Promise<HTMLImageElement | null> {
  const src = `${LERICO_ORIGIN}/res/area_bg${row}/bg-${String(row).padStart(2, '0')}-${col}.png`
  let p = tileCache.get(src)
  if (!p) {
    p = new Promise(res => { const im = new Image(); im.decoding = 'async'; im.onload = () => res(im); im.onerror = () => res(null); im.src = src })
    tileCache.set(src, p)
  }
  return p
}

export default function AreaMap({ land, tower, mode, className = '' }: {
  land: string; tower: [number, number]; mode: StageMode; className?: string
}) {
  const box = useRef<HTMLDivElement>(null)
  const bgRef = useRef<HTMLCanvasElement>(null)
  const cv = useRef<HTMLCanvasElement>(null)
  const [bw, setBw] = useState(0)          // ความกว้างกล่อง (px)
  const [visible, setVisible] = useState(false)
  const [bgReady, setBgReady] = useState(false)
  const [ready, setReady] = useState(false)
  // ข้อมูลฉาก (โหลดเมื่อใกล้จอ) — ใช้หาหน้าต่างรอบตัวฉาก · undefined = ยังไม่รู้ (ยังไม่วาด ไม่กระตุก)
  const [land_, setLand] = useState<Loaded | null | undefined>(undefined)

  useEffect(() => {
    if (!visible || land_ !== undefined) return
    let live = true
    loadLand(land).then(d => { if (live) setLand(d) })
    return () => { live = false }
  }, [land, visible, land_])

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setBw(e.contentRect.width))
    ro.observe(el)
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: '200px 0px' })
    io.observe(el)
    return () => { ro.disconnect(); io.disconnect() }
  }, [])

  const view = land_ === undefined ? null : viewFor(tower, land_)

  // ── พื้นแผนที่: วาดภาพที่ทับหน้าต่างลง canvas เดียว (พิกัดปัดเป็นพิกเซลเต็ม + ซ้อนขอบ 1px = ไม่มีรอยต่อ) ──
  useEffect(() => {
    const c = bgRef.current
    if (!view || !bw || !c) return
    let live = true
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const s = (bw / view.w) * dpr
    const W = Math.round(bw * dpr), H = Math.round((bw / ASPECT) * dpr)
    const jobs: Promise<void>[] = []
    const parts: { im: HTMLImageElement | null; x: number; y: number }[] = []
    for (let row = Math.floor(view.y0 / TILE) + 1; row <= Math.min(ROWS, Math.ceil((view.y0 + view.h) / TILE)); row++)
      for (let col = Math.floor(view.x0 / TILE) + 1; col <= Math.min(COLS, Math.ceil((view.x0 + view.w) / TILE)); col++) {
        const part = { im: null as HTMLImageElement | null, x: (col - 1) * TILE - view.x0, y: view.y0 + view.h - row * TILE }
        parts.push(part)
        jobs.push(loadTile(row, col).then(im => { part.im = im }))
      }
    Promise.all(jobs).then(() => {
      if (!live) return
      if (c.width !== W || c.height !== H) { c.width = W; c.height = H }
      const ctx = c.getContext('2d')!
      ctx.clearRect(0, 0, W, H)
      ctx.imageSmoothingQuality = 'high'
      for (const p of parts) {
        if (!p.im) continue
        const x = Math.floor(p.x * s), y = Math.floor(p.y * s)
        const x2 = Math.ceil((p.x + TILE) * s), y2 = Math.ceil((p.y + TILE) * s)
        ctx.drawImage(p.im, x, y, x2 - x + 1, y2 - y + 1)
      }
      setBgReady(true)
    })
    return () => { live = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.x0, view?.y0, view?.w, bw])

  // ── ฉากพื้นที่ (อนิเมชัน) — วางตาม towerPos แบบในเกม · เล่นเฉพาะตอนอยู่ใกล้จอ ──
  useEffect(() => {
    const d = land_, c = cv.current
    if (!visible || !bw || !d || !view || !c) return
    let live = true, raf = 0
    const frames = d.sam.animations[d.clip]
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const t0 = performance.now()
    let shown = false
    const draw = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const W = Math.round(bw * dpr), H = Math.round((bw / ASPECT) * dpr)
      if (c.width !== W || c.height !== H) { c.width = W; c.height = H }
      const s = (bw / view.w) * dpr       // pt → px ของ canvas
      const zoom = 0.5 * s                // 1 px ของไฟล์ = 0.5 pt
      const { w, h, x, y } = d.sam.canvas
      const ox = (tower[0] - view.x0 - w / 4) * s - x * zoom
      const oy = (view.y0 + view.h - tower[1] - h / 4) * s - y * zoom
      const i = still ? 0 : Math.floor(((performance.now() - t0) / 1000) * 30) % frames.length
      const ctx = c.getContext('2d')!
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, W, H)
      renderSAMFrame(ctx, frames[i], d.sam.images, d.sprites, ox, oy, zoom)
      if (!shown) { shown = true; setReady(true) }
      if (live && !still) raf = requestAnimationFrame(draw)
    }
    draw()
    return () => { live = false; cancelAnimationFrame(raf) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [land_, visible, bw, view?.x0, view?.y0, view?.w, tower[0], tower[1]])

  return (
    <div ref={box} className={`relative overflow-hidden bg-[#1d2a22] ${className}`} style={{ aspectRatio: `${ASPECT}` }}>
      {!(bgReady && ready) && <span aria-hidden className="absolute inset-0 it-skel" />}
      <canvas ref={bgRef} aria-hidden="true" className="absolute inset-0 block h-full w-full transition-opacity duration-300"
        style={{ filter: TINT[mode], opacity: bgReady ? 1 : 0 }} />
      <canvas ref={cv} aria-hidden="true" className="absolute inset-0 block h-full w-full transition-opacity duration-300"
        style={{ opacity: ready ? 1 : 0 }} />
    </div>
  )
}
