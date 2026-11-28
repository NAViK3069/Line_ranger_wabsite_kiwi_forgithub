'use client'

// ====================================================
// Landmark — อนิเมชันประจำพื้นที่ของเกม (res/new_arNN/arNN-lm-body.sam)
//   atlas บางพื้นที่ชื่อมี .16 ต่อท้าย (ar04–ar25: arNN-lm-body.16.plist/.png) → ลองชื่อปกติก่อน ไม่มีค่อยใช้ .16
//   ระหว่างโหลด / นอกจอ: โชว์ภาพนิ่งของเกม (arNN-lm-body_ss.png) — เล่นอนิเมชันเฉพาะตอนอยู่บนจอ (ประหยัดเครื่อง)
//   Hard / Extreme ใช้ฉากของพื้นที่ปกติเลขเดียวกัน (ha14 / ea14 → ar14) — tint ตามโหมดทำที่ CSS
// ====================================================

import { useEffect, useRef, useState } from 'react'
import { SAMParser } from '@/lib/animation/samParser'
import { animBBox, loadSprites, renderSAMFrame, type SpriteMap } from '@/lib/animation/samRenderer'
import { LERICO_ORIGIN, lericoProxy } from '@/lib/staticApi'

export interface Loaded { sam: SAMParser; sprites: SpriteMap; clip: string; box: { x0: number; x1: number; y0: number; y1: number } }
const cache = new Map<string, Promise<Loaded | null>>()
const url = (land: string, file: string) => lericoProxy(`${LERICO_ORIGIN}/res/new_${land}/${file}`)
/** ภาพนิ่งของพื้นที่ (ไม่ต้องผ่าน Worker — แค่แสดงเป็น <img>) */
export const landStill = (land: string) => `${LERICO_ORIGIN}/res/new_${land}/${land}-lm-body_ss.png`

async function fetchAtlas(land: string): Promise<[ArrayBuffer, Blob] | null> {
  for (const base of [`${land}-lm-body`, `${land}-lm-body.16`]) {
    const [p, i] = await Promise.all([fetch(url(land, `${base}.plist`)), fetch(url(land, `${base}.png`))])
    if (p.ok && i.ok) return [await p.arrayBuffer(), await i.blob()]
  }
  return null
}

export function loadLand(land: string): Promise<Loaded | null> {
  let p = cache.get(land)
  if (!p) {
    p = (async () => {
      const [samRes, atlas] = await Promise.all([fetch(url(land, `${land}-lm-body.sam`)), fetchAtlas(land)])
      if (!samRes.ok || !atlas) return null
      const sam = new SAMParser(await samRes.arrayBuffer())
      const sprites = await loadSprites(atlas[0], atlas[1])
      // ท่าแรกที่มีเฟรม (ฉากพื้นที่มีท่าเดียว — วนไปเรื่อยๆ)
      const clip = Object.keys(sam.animations).find(k => !k.startsWith('_') && sam.animations[k]?.length) ?? Object.keys(sam.animations)[0]
      const box = clip ? animBBox(sam, sprites, clip) : null
      return clip && box ? { sam, sprites, clip, box } : null
    })().catch(() => null)
    p.then(v => { if (!v) cache.delete(land) })
    cache.set(land, p)
  }
  return p
}

export default function Landmark({ land, className = '' }: { land: string; className?: string }) {
  const wrap = useRef<HTMLDivElement>(null)
  const cv = useRef<HTMLCanvasElement>(null)
  const [visible, setVisible] = useState(false)
  const [ready, setReady] = useState(false)

  // เล่นเฉพาะตอนอยู่ใกล้จอ
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: '200px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (!visible) return
    let live = true, raf = 0
    loadLand(land).then(d => {
      const c = cv.current
      if (!live || !d || !c) return
      const frames = d.sam.animations[d.clip]
      const { box } = d
      const bw = box.x1 - box.x0, bh = box.y1 - box.y0
      const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      const t0 = performance.now()
      let shown = false
      const draw = () => {
        const i = still ? 0 : Math.floor(((performance.now() - t0) / 1000) * 30) % frames.length
        const dpr = Math.min(2, window.devicePixelRatio || 1)
        const W = Math.round(c.clientWidth * dpr), H = Math.round(c.clientHeight * dpr)
        if (W && H) {
          if (c.width !== W || c.height !== H) { c.width = W; c.height = H }
          const zoom = Math.min(W / bw, H / bh)
          const ctx = c.getContext('2d')!
          ctx.setTransform(1, 0, 0, 1, 0, 0)
          ctx.clearRect(0, 0, W, H)
          // ชิดล่าง (ฉากตั้งบนพื้น) · กึ่งกลางแนวนอน
          renderSAMFrame(ctx, frames[i], d.sam.images, d.sprites, (W - bw * zoom) / 2 - box.x0 * zoom, H - bh * zoom - box.y0 * zoom, zoom)
          if (!shown) { shown = true; setReady(true) }
        }
        if (live && !still) raf = requestAnimationFrame(draw)
      }
      draw()
    })
    return () => { live = false; cancelAnimationFrame(raf) }
  }, [land, visible])

  return (
    <div ref={wrap} className={`relative ${className}`}>
      {/* ภาพนิ่งของเกม — ระหว่างรออนิเมชัน (ไม่มีช่องว่าง/กระพริบ) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={landStill(land)} alt="" draggable={false} loading="lazy" decoding="async"
        className="absolute inset-0 h-full w-full object-contain object-top scale-[1.35] origin-top transition-opacity duration-300"
        style={{ opacity: ready ? 0 : 1 }} />
      <canvas ref={cv} aria-hidden="true" className="absolute inset-0 block h-full w-full transition-opacity duration-300"
        style={{ opacity: ready ? 1 : 0 }} />
    </div>
  )
}
