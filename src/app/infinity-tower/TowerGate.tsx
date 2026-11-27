'use client'

// ====================================================
// ประตูชั้นของหอคอย — อนิเมชันจริงของเกม endless_main_effect/endless_maintop_<ประเภท>.sam
//   boss = ด่านบอส · normal = ช่วยเหลือ · time = ช่วยเหลือ (จับเวลา) · siege = ล้อมโจมตี
//   ท่าในไฟล์: lock, open_start → open_idle, close_start → close_idle (30 เฟรม/วิ)
//   หน้านี้วน open_idle ตลอด (ประตูเปิดค้าง พอร์ทัลเรืองแสง — แบบหน้าหอคอยในเกม)
//
// ประตูหลายร้อยบานบนหน้าเดียว → ใช้นาฬิกาตัวเดียว (requestAnimationFrame) วาดเฉพาะบานที่อยู่บนจอ
// ผู้ใช้ตั้ง "ลดการเคลื่อนไหว" → วาดเฟรมเดียว ไม่เล่น
// ====================================================

import { useEffect, useRef, useState } from 'react'
import { animBBox, renderSAMFrame } from '@/lib/animation/samRenderer'
import type { SAMParser } from '@/lib/animation/samParser'
import type { SpriteMap } from '@/lib/animation/samRenderer'
import { loadSam } from '../gear-options/tutorials/sam'
import type { TBattle } from '@/lib/infinityTower'

const SAM_OF: Record<TBattle, string> = { BOSS: 'boss', OFFENCE: 'normal', TIMEATTACK: 'time', SIEGE: 'siege' }
const FPS = 30
/** ท่าที่หน้าใช้ (open_end ไม่ใช้ — เป็นแสงตอนผ่านชั้นในเกม) */
const GATE_CLIPS = ['lock', 'close_start', 'close_idle', 'open_start', 'open_idle']
/** สัดส่วนกรอบประตู (กว้าง/สูง) จากไฟล์ — ทุกประเภทเท่ากัน ~328×197 */
export const GATE_ASPECT = 328 / 197

// ── นาฬิกาตัวเดียวของทุกบาน ──
const drawers = new Set<(tick: number) => void>()
let raf = 0, t0 = 0
function loop(now: number) {
  if (!t0) t0 = now
  const tick = Math.floor(((now - t0) / 1000) * FPS)
  for (const d of drawers) d(tick)
  raf = drawers.size ? requestAnimationFrame(loop) : 0
}
function subscribe(d: (tick: number) => void) {
  drawers.add(d)
  if (!raf) raf = requestAnimationFrame(loop)
  return () => { drawers.delete(d) }
}

interface Data { sam: SAMParser; sprites: SpriteMap }

export default function TowerGate({ battle, className = '' }: { battle: TBattle; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [data, setData] = useState<Data | null>(null)
  const [visible, setVisible] = useState(false)
  // ท่าที่กำลังเล่น + เฟรมของนาฬิกาตอนเริ่มท่า (next = ท่าต่อไปเมื่อจบ — เผื่อใช้ open_start → open_idle)
  const clip = useRef<{ name: string; start: number; next?: string }>({ name: 'open_idle', start: 0 })
  const lastTick = useRef(0)

  useEffect(() => {
    let live = true
    loadSam(`endless_main_effect/endless_maintop_${SAM_OF[battle]}`).then(d => { if (live) setData(d) }).catch(() => {})
    return () => { live = false }
  }, [battle])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: '120px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    const cv = ref.current
    if (!data || !cv) return
    // กรอบ = ประตูเท่านั้น (รวมท่าที่ใช้) — ไม่ใช้ '_all' เพราะ open_end มีแสงระเบิดกว้าง ~900px ทำให้ประตูเล็กจิ๋ว
    const boxes = GATE_CLIPS.map(n => animBBox(data.sam, data.sprites, n)).filter(b => !!b)
    if (!boxes.length) return
    const box = { x0: Math.min(...boxes.map(b => b.x0)), y0: Math.min(...boxes.map(b => b.y0)), x1: Math.max(...boxes.map(b => b.x1)), y1: Math.max(...boxes.map(b => b.y1)) }
    const bw = box.x1 - box.x0, bh = box.y1 - box.y0
    const draw = (tick: number) => {
      lastTick.current = tick
      let c = clip.current
      let frames = data.sam.animations[c.name]
      if (!frames?.length) return
      let i = tick - c.start
      if (i >= frames.length && c.next) {
        clip.current = c = { name: c.next, start: c.start + frames.length }
        frames = data.sam.animations[c.name]
        if (!frames?.length) return
        i = tick - c.start
      }
      i = ((i % frames.length) + frames.length) % frames.length
      const W = cv.clientWidth, H = cv.clientHeight
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr) }
      const zoom = Math.min(cv.width / bw, cv.height / bh)
      const ctx = cv.getContext('2d')!
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, cv.width, cv.height)
      renderSAMFrame(ctx, frames[i], data.sam.images, data.sprites,
        (cv.width - bw * zoom) / 2 - box.x0 * zoom, (cv.height - bh * zoom) / 2 - box.y0 * zoom, zoom)
    }
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (still || !visible) { draw(lastTick.current); return }
    return subscribe(draw)
  }, [data, visible])

  return <canvas ref={ref} className={`block w-full h-full ${className}`} aria-hidden="true" />
}
