'use client'

// ====================================================
// การโหลดของหน้าหอคอยอนันต์
//   <FloorsLoader>   ตัวโหลดในพื้นที่รายการชั้น: อนิเมชันเกม endless_mission_result (ท่า failed_loop) + หลอดโหลด
//                    ใช้ตอนเปิดหน้า / เปลี่ยนประเภทด่าน / สลับลำดับ / ไปชั้น — ชั้นพร้อมแล้วซ่อนตัวโหลด แสดงชั้นแทน
//   preloadLoaderAnim()  โหลดไฟล์อนิเมชันเก็บไว้ตั้งแต่เปิดหน้า (เล่นได้ทันที ไม่ต้องรอโหลดตอนใช้)
//   <EnemySkeleton>  ระหว่างโหลดรายชื่อศัตรูของชั้น
// หลอดโหลดใช้ transform (scaleX) → วิ่งต่อได้แม้ JS กำลังวาดการ์ดหลายร้อยใบ
// ผู้ใช้ตั้ง "ลดการเคลื่อนไหว" → ไม่มีแสงวิ่ง/ลอย (motion-safe)
// ====================================================

import { useEffect, useRef, useState } from 'react'
import { animBBox, renderSAMFrame } from '@/lib/animation/samRenderer'
import { loadSam } from '../gear-options/tutorials/sam'

const KEYFRAMES = `
@keyframes it-shimmer { 0% { transform: translateX(-100%) } 100% { transform: translateX(100%) } }
@keyframes it-fill { 0% { transform: scaleX(0.04) } 60% { transform: scaleX(0.7) } 100% { transform: scaleX(0.9) } }
@keyframes it-sheen { 0% { transform: translateX(-120%) } 100% { transform: translateX(320%) } }
@keyframes it-pop { from { opacity: 0; transform: translateY(10px) scale(.96) } to { opacity: 1; transform: none } }
@keyframes it-dot { 0%,80%,100% { opacity: .25 } 40% { opacity: 1 } }
`

/** เล่นท่าเดียวของไฟล์ .sam วนไปเรื่อยๆ ให้พอดีกล่อง (ครอบกรอบของท่านั้น) */
export function SamLoop({ base, clip, className = '' }: { base: string; clip: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let live = true, raf = 0
    loadSam(base).then(({ sam, sprites }) => {
      const cv = ref.current
      const frames = sam.animations[clip]
      const box = animBBox(sam, sprites, clip)
      if (!live || !cv || !frames?.length || !box) return
      setReady(true)
      const bw = box.x1 - box.x0, bh = box.y1 - box.y0
      const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      const t0 = performance.now()
      const draw = () => {
        if (!cv.offsetParent) { if (live && !still) raf = requestAnimationFrame(draw); return }   // ซ่อนอยู่ = ไม่วาด
        const i = still ? 0 : Math.floor(((performance.now() - t0) / 1000) * 30) % frames.length
        const dpr = Math.min(2, window.devicePixelRatio || 1)
        const W = Math.round(cv.clientWidth * dpr), H = Math.round(cv.clientHeight * dpr)
        if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H }
        const zoom = Math.min(W / bw, H / bh)
        const ctx = cv.getContext('2d')!
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.clearRect(0, 0, W, H)
        renderSAMFrame(ctx, frames[i], sam.images, sprites, (W - bw * zoom) / 2 - box.x0 * zoom, (H - bh * zoom) / 2 - box.y0 * zoom, zoom)
        if (live && !still) raf = requestAnimationFrame(draw)
      }
      draw()
    }).catch(() => {})
    return () => { live = false; cancelAnimationFrame(raf) }
  }, [base, clip])
  return (
    <div className={`relative ${className}`}>
      <canvas ref={ref} className="block w-full h-full" style={{ opacity: ready ? 1 : 0, transition: 'opacity .3s' }} aria-hidden="true" />
      {!ready && <span className="absolute inset-[10%] rounded-2xl it-skel" aria-hidden="true" />}
    </div>
  )
}

export const LOADER_SAM = 'endless_mission_result/endless_mission_result'
/** โหลดไฟล์ .sam + atlas ของตัวโหลดเก็บไว้ในแคช (เรียกตอนเปิดหน้า) */
export const preloadLoaderAnim = () => { loadSam(LOADER_SAM).catch(() => {}) }

/**
 * ตัวโหลดในพื้นที่รายการชั้น — วางไว้ตลอด (อนิเมชันพร้อมเล่นเสมอ) · show=false = ซ่อน
 * progress = 0..1 (สัดส่วนการ์ดที่วาดแล้ว) — หลอดวิ่งตามจริง
 */
export function FloorsLoader({ label, show, progress }: { label: string; show: boolean; progress: number }) {
  return (
    <div role="status" aria-live="polite" aria-busy={show} hidden={!show}
      className="relative mt-3 overflow-hidden rounded-2xl border border-fuchsia-400/25 bg-gradient-to-b from-[#2a1147]/90 to-[#150a26]/90 px-5 pt-3 pb-5 text-center">
      <style>{KEYFRAMES}</style>
      <div className="pointer-events-none absolute left-1/2 top-8 h-28 w-56 -translate-x-1/2 rounded-full bg-fuchsia-600/30 blur-3xl" />
      <SamLoop base={LOADER_SAM} clip="failed_loop" className="relative mx-auto h-40 w-full max-w-[340px]" />
      <p className="relative mt-1 font-[family-name:var(--font-line)] text-[15px] text-white">
        {label}
        <span className="inline-flex w-5 justify-start">
          {[0, 1, 2].map(i => (
            <span key={i} className="motion-safe:animate-[it-dot_1.2s_ease-in-out_infinite]" style={{ animationDelay: `${i * 0.18}s` }}>.</span>
          ))}
        </span>
      </p>
      <div className="relative mx-auto mt-3 h-2.5 max-w-[300px] overflow-hidden rounded-full bg-black/40 ring-1 ring-white/10">
        <span className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-gradient-to-r from-fuchsia-500 via-purple-400 to-amber-300 transition-transform duration-200 ease-out"
          style={{ transform: `scaleX(${Math.max(0.04, Math.min(1, progress))})` }} />
        <span className="absolute inset-y-0 w-1/4 bg-gradient-to-r from-transparent via-white/40 to-transparent motion-safe:animate-[it-sheen_1s_linear_infinite]" />
      </div>
    </div>
  )
}

/** กล่องโครงที่มีแสงวิ่งผ่าน */
export function Shimmer({ className = '' }: { className?: string }) {
  return (
    <span className={`relative block overflow-hidden rounded-lg bg-white/[0.06] ${className}`}>
      <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/[0.09] to-transparent motion-safe:animate-[it-shimmer_1.4s_ease-in-out_infinite]" />
    </span>
  )
}

/** รายชื่อศัตรูระหว่างโหลด */
export function EnemySkeleton() {
  return (
    <div aria-busy="true" className="space-y-1.5">
      <style>{KEYFRAMES}</style>
      {[0, 1, 2, 3].map(i => (
        <div key={i} className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] p-2" style={{ opacity: 1 - i * 0.2 }}>
          <Shimmer className="w-11 h-11 shrink-0 rounded-lg" />
          <div className="flex-1 space-y-1.5">
            <Shimmer className="h-3.5 w-1/3" />
            <div className="grid grid-cols-3 gap-2"><Shimmer className="h-3" /><Shimmer className="h-3" /><Shimmer className="h-3" /></div>
          </div>
        </div>
      ))}
    </div>
  )
}
