'use client'
// ====================================================
// RubyAnimation — Canvas-based ruby gem animation
// ใช้ frames.json ที่ pre-compile แล้ว (pattern เดียวกับ ChestCanvas)
//
// • โหลด JSON + atlas PNG ครั้งเดียว (module-level cache)
// • Layout 28×28 (default) แต่ canvas overflow 2× → ไม่ดัน element อื่น
// ====================================================

import { useEffect, useRef } from 'react'

// Frame data format: [spriteIdx, a, b, c, d, wx, wy, alpha]
// a, b, c, d = combined linear transform; wx, wy = sprite center (world); alpha 0-255
type FrameObj = [number, number, number, number, number, number, number, number]

interface RubyData {
  animRate: number
  sprites: [number, number, number, number][]   // [ax, ay, aw, ah] in atlas
  frames: FrameObj[][]
}

const ATLAS_URL  = '/gacha/animation/ruby/fx25-ruby.png'
const FRAMES_URL = '/gacha/animation/ruby/frames.json'

// ── Module cache ──
type Assets = { data: RubyData; atlas: HTMLImageElement }
let cached: Assets | null = null
let loading: Promise<Assets> | null = null

async function loadAssets(): Promise<Assets> {
  if (cached) return cached
  if (loading) return loading
  loading = (async () => {
    const [data, atlas] = await Promise.all([
      fetch(FRAMES_URL).then(r => r.json() as Promise<RubyData>),
      new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error('atlas load failed'))
        img.src = ATLAS_URL
      }),
    ])
    cached = { data, atlas }
    return cached
  })()
  return loading
}

interface RubyAnimationProps {
  /** Layout box (px) — ขนาดที่กิน space ใน flex/grid (default 28) */
  size?: number
  /** Canvas size (px) — ขนาดจริงที่ render (overflow ออกได้ default 2×) */
  visualSize?: number
  className?: string
}

export default function RubyAnimation({
  size = 28,
  visualSize,
  className = '',
}: RubyAnimationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const renderSize = visualSize ?? size * 2

  useEffect(() => {
    let cancelled = false
    let rafId: number | null = null

    loadAssets().then((assets) => {
      if (cancelled || !assets) return
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const dpr = window.devicePixelRatio || 1
      canvas.width = renderSize * dpr
      canvas.height = renderSize * dpr

      const { data, atlas } = assets

      // ── คำนวณ bbox จาก wx/wy + sprite half-size (auto-center + scale) ──
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const objs of data.frames) {
        for (const [si, , , , , wx, wy, alpha] of objs) {
          if (alpha === 0) continue
          const sp = data.sprites[si]
          if (!sp) continue
          const hw = sp[2] / 2, hh = sp[3] / 2
          if (wx - hw < minX) minX = wx - hw
          if (wy - hh < minY) minY = wy - hh
          if (wx + hw > maxX) maxX = wx + hw
          if (wy + hh > maxY) maxY = wy + hh
        }
      }
      if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 70; maxY = 70 }

      const bboxW = maxX - minX || 1
      const bboxH = maxY - minY || 1
      const cx = (minX + maxX) / 2
      const cy = (minY + maxY) / 2
      const scale = Math.min(renderSize / bboxW, renderSize / bboxH) * dpr * 0.95
      const ox = (renderSize * dpr) / 2 - cx * scale
      const oy = (renderSize * dpr) / 2 - cy * scale

      const frameInterval = 1000 / (data.animRate || 30)
      let lastTime = performance.now()
      let frameIdx = 0

      const drawFrame = (idx: number) => {
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        const objs = data.frames[idx]
        for (const [si, a, b, c, d, wx, wy, alpha] of objs) {
          if (alpha === 0) continue
          const sp = data.sprites[si]
          if (!sp) continue
          const [ax, ay, aw, ah] = sp
          ctx.setTransform(
            a * scale, b * scale,
            c * scale, d * scale,
            wx * scale + ox,
            wy * scale + oy,
          )
          ctx.globalAlpha = alpha / 255
          ctx.drawImage(atlas, ax, ay, aw, ah, -aw / 2, -ah / 2, aw, ah)
        }
      }
      drawFrame(0)

      const tick = (now: number) => {
        if (cancelled) return
        const elapsed = now - lastTime
        if (elapsed >= frameInterval) {
          const advance = Math.floor(elapsed / frameInterval)
          frameIdx = (frameIdx + advance) % data.frames.length
          lastTime += advance * frameInterval
          drawFrame(frameIdx)
        }
        rafId = requestAnimationFrame(tick)
      }
      rafId = requestAnimationFrame(tick)
    }).catch((err) => {
      console.error('[RubyAnimation]', err)
    })

    return () => {
      cancelled = true
      if (rafId !== null) cancelAnimationFrame(rafId)
    }
  }, [renderSize])

  return (
    <div
      className={`shrink-0 relative ${className}`}
      style={{ width: size, height: size, overflow: 'visible' }}
      role="img"
      aria-label="ruby"
    >
      <canvas
        ref={canvasRef}
        style={{
          width: renderSize,
          height: renderSize,
          position: 'absolute',
          top: '50%',
          left: '50%',
          // shift ขึ้น 4px + ซ้าย 3px ให้ตรงกับตำแหน่งของรูปเดิม
          transform: 'translate(calc(-50% - 3px), calc(-50% - 4px))',
          pointerEvents: 'none',
        }}
      />
    </div>
  )
}
