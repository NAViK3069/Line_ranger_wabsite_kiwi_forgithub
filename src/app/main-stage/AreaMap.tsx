'use client'

// ====================================================
// AreaMap — ฉากของพื้นที่ (อนิเมชัน) บนพื้นแผนที่ของเกม (ส่วนของแผนที่ใหญ่รอบฉากนั้น) — ไม่มีปุ่มด่าน
//
// จาก libgame.so (AreaScrollLayer, 0xb2aacc):
//   แผนที่ = ภาพ res/area_bgN/bg-NN-k.png เรียงเป็นแถว — ภาพที่ i (0..) → แถว N = i / 3 + 1, คอลัมน์ k = i % 3 + 1
//   ภาพละ 1024px = 512pt (contentScaleFactor 2) · แถว 1 อยู่ล่างสุด ซ้อนขึ้นไปทีละ 512pt · คอลัมน์ 1–3 ซ้ายไปขวา
//   ตำแหน่งบนแผนที่ใช้หน่วย pt แกน y ขึ้นบน:
//     ฉากพื้นที่ = area.towerPosX / towerPosY — SuperAnimNode anchor (0.5, 0.5) ของกรอบ .sam (1 pt = 2 px ของไฟล์)
// กล่องนี้ตัดหน้าต่าง VIEW_W × VIEW_H pt รอบฉากของพื้นที่ แล้วย่อ/ขยายให้พอดีความกว้างกล่อง
// Hard / Extreme ใช้แผนที่และตำแหน่งชุดเดียวกับพื้นที่ปกติเลขเดียวกัน — ย้อมสีตามโหมด
// ====================================================

import { useEffect, useRef, useState } from 'react'
import { renderSAMFrame } from '@/lib/animation/samRenderer'
import { LERICO_ORIGIN } from '@/lib/staticApi'
import type { StageMode } from '@/lib/mainStage'
import { landStill, loadLand, type Loaded } from './Landmark'

const TILE = 512          // pt ต่อภาพ (1024 px)
const COLS = 3
const ROWS = 23           // area_bg1 – area_bg23
/** สัดส่วนกล่อง (กว้าง : สูง) */
const ASPECT = 6 / 5
/** หน้าต่างที่ตัดมาแสดง (pt) — กึ่งกลางภาพฉากจริง (ไม่ใช่จุดยึด: ภาพมักอยู่สูงกว่าจุดยึด) · ขนาดพอดีภาพ + ขอบ */
interface View { x0: number; y0: number; w: number; h: number }
function viewFor(tower: [number, number], d: Loaded | null): View {
  let cx = tower[0], cy = tower[1], w = 240
  if (d) {
    const { box, sam } = d
    // กรอบภาพในพิกัด pt (y ลง) เทียบจุดยึด = กลางกรอบ .sam
    const ax = ((box.x0 + box.x1) / 2 - sam.canvas.w / 2) / 2, ay = ((box.y0 + box.y1) / 2 - sam.canvas.h / 2) / 2
    const aw = (box.x1 - box.x0) / 2, ah = (box.y1 - box.y0) / 2
    cx = tower[0] + ax; cy = tower[1] - ay
    w = Math.max(200, Math.min(380, Math.max(aw * 1.45, ah * 1.3 * ASPECT)))
  }
  const h = w / ASPECT
  return {
    x0: Math.max(0, Math.min(COLS * TILE - w, cx - w / 2)),
    y0: Math.max(0, Math.min(ROWS * TILE - h, cy - h / 2)),
    w, h,
  }
}

/** ย้อมแผนที่ตามโหมด (แบบโหมดยากในเกมที่แผนที่มืดลง) */
const TINT: Record<StageMode, string> = {
  normal: 'none',
  hard: 'saturate(.75) hue-rotate(205deg) brightness(.72)',
  extreme: 'sepia(.35) saturate(1.35) hue-rotate(-28deg) brightness(.6)',
}

export default function AreaMap({ land, tower, mode, className = '' }: {
  land: string; tower: [number, number]; mode: StageMode; className?: string
}) {
  const box = useRef<HTMLDivElement>(null)
  const cv = useRef<HTMLCanvasElement>(null)
  const [bw, setBw] = useState(0)          // ความกว้างกล่อง (px)
  const [visible, setVisible] = useState(false)
  const [ready, setReady] = useState(false)
  // ข้อมูลฉาก (โหลดเมื่อใกล้จอ) — ใช้หาหน้าต่างรอบภาพฉาก · undefined = ยังไม่รู้ (ยังไม่วาดแผนที่ ไม่กระตุก)
  const [land_, setLand] = useState<Loaded | null | undefined>(undefined)
  const view = land_ === undefined ? null : viewFor(tower, land_)
  const VIEW_W = view?.w ?? 240, VIEW_H = view?.h ?? 200
  const k = bw / VIEW_W                    // สเกล pt → px ของกล่อง
  const x0 = view?.x0 ?? 0, y0 = view?.y0 ?? 0
  const sx = (x: number) => x - x0
  const sy = (y: number) => y0 + VIEW_H - y      // y ขึ้นบน → y ลงล่างของจอ

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

  // ฉากพื้นที่ (อนิเมชัน) — วางตาม towerPos แบบในเกม · เล่นเฉพาะตอนอยู่ใกล้จอ
  useEffect(() => {
    const d = land_
    if (!visible || !k || !d) return
    let live = true, raf = 0
    {
      const c = cv.current
      if (!c) return
      const frames = d.sam.animations[d.clip]
      const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      const t0 = performance.now()
      let shown = false
      const draw = () => {
        const dpr = Math.min(2, window.devicePixelRatio || 1)
        const W = Math.round(VIEW_W * k * dpr), H = Math.round(VIEW_H * k * dpr)
        if (c.width !== W || c.height !== H) { c.width = W; c.height = H }
        const s = k * dpr               // pt → px ของ canvas
        const zoom = 0.5 * s            // 1 px ของไฟล์ = 0.5 pt
        const { w, h, x, y } = d.sam.canvas
        const ox = (sx(tower[0]) - w / 4) * s - x * zoom
        const oy = (sy(tower[1]) - h / 4) * s - y * zoom
        const i = still ? 0 : Math.floor(((performance.now() - t0) / 1000) * 30) % frames.length
        const ctx = c.getContext('2d')!
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.clearRect(0, 0, W, H)
        renderSAMFrame(ctx, frames[i], d.sam.images, d.sprites, ox, oy, zoom)
        if (!shown) { shown = true; setReady(true) }
        if (live && !still) raf = requestAnimationFrame(draw)
      }
      draw()
    }
    return () => { live = false; cancelAnimationFrame(raf) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [land_, visible, k, x0, y0, VIEW_W, tower[0], tower[1]])

  // ภาพแผนที่ที่ทับหน้าต่าง
  const tiles: { row: number; col: number; left: number; top: number }[] = []
  for (let row = Math.floor(y0 / TILE) + 1; row <= Math.min(ROWS, Math.ceil((y0 + VIEW_H) / TILE)); row++)
    for (let col = Math.floor(x0 / TILE) + 1; col <= Math.min(COLS, Math.ceil((x0 + VIEW_W) / TILE)); col++)
      tiles.push({ row, col, left: (col - 1) * TILE - x0, top: sy(row * TILE) })

  return (
    <div ref={box} className={`relative overflow-hidden bg-[#2f6b2a] ${className}`} style={{ aspectRatio: `${ASPECT}` }}>
      {k > 0 && view && (
        <div className="absolute left-0 top-0 origin-top-left" style={{ width: VIEW_W, height: VIEW_H, transform: `scale(${k})` }}>
          {/* พื้นแผนที่ */}
          <div className="absolute inset-0" style={{ filter: TINT[mode] }}>
            {tiles.map(t => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={`${t.row}-${t.col}`} alt="" draggable={false} loading="lazy" decoding="async"
                src={`${LERICO_ORIGIN}/res/area_bg${t.row}/bg-${String(t.row).padStart(2, '0')}-${t.col}.png`}
                className="absolute max-w-none" style={{ left: t.left, top: t.top, width: TILE + 0.5, height: TILE + 0.5 }} />
            ))}
          </div>
          {/* ภาพนิ่งของฉากระหว่างรออนิเมชัน — ตำแหน่ง/ขนาดเดียวกัน (ภาพ = กรอบ .sam, 2 px ต่อ pt) */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={landStill(land)} alt="" draggable={false} loading="lazy" decoding="async"
            className="absolute max-w-none transition-opacity duration-300"
            style={{ left: sx(tower[0]), top: sy(tower[1]), transform: 'translate(-50%, -50%) scale(0.5)', opacity: ready ? 0 : 1 }} />
          <canvas ref={cv} aria-hidden="true" className="absolute inset-0 block transition-opacity duration-300"
            style={{ width: VIEW_W, height: VIEW_H, opacity: ready ? 1 : 0 }} />
        </div>
      )}
    </div>
  )
}
