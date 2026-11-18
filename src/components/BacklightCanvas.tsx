// ====================================================
// BacklightCanvas — render fx02-backlight-01 animation
// ข้อมูล frame มาจาก SAM file จริง (backlight-frames.json)
// แต่ละ frame คือ array ของ layers: [tx, ty, angle_rad, scaleX, scaleY, alpha]
// layer 0: opacity 255 (หมุนตามเข็ม)
// layer 1: opacity 127 (หมุนสวนทาง) — สร้าง double-spin effect
//
// ── Performance: Shared RAF Scheduler ──────────────
// ทุก instance ใช้ requestAnimationFrame loop เดียวกัน
// ไม่ว่าจะมีกี่การ์ดบนหน้าจอ → main thread โหลดน้อยลงมาก
// ====================================================

'use client'

import { useEffect, useRef } from 'react'

const IMG_SRC    = '/gacha/animation/backlight/fx02-backlight-01.png'
const FRAMES_SRC = '/gacha/animation/backlight/backlight-frames.json'

// ── Module-level frame/image cache ─────────────────
let _frameCache: { animRate: number; frames: number[][][] } | null = null
let _fetchPromise: Promise<{ animRate: number; frames: number[][][] }> | null = null

function getFrameData(): Promise<{ animRate: number; frames: number[][][] }> {
  if (_frameCache) return Promise.resolve(_frameCache)
  if (!_fetchPromise) {
    _fetchPromise = fetch(FRAMES_SRC)
      .then(r => r.json())
      .then(data => { _frameCache = data; return data })
      .catch(() => ({ animRate: 30, frames: [] }))
  }
  return _fetchPromise
}

const _sharedImg = typeof window !== 'undefined' ? (() => {
  const img = new Image(); img.src = IMG_SRC; return img
})() : null

// ── Shared RAF Scheduler ────────────────────────────
// Loop เดียวสำหรับทุก instance — ลด main-thread work บนมือถือ
type DrawFn = (timestamp: number) => void
const _drawFns = new Set<DrawFn>()
let _rafId = 0

function _tick(timestamp: number) {
  for (const fn of _drawFns) fn(timestamp)
  _rafId = requestAnimationFrame(_tick)
}

function _register(fn: DrawFn) {
  _drawFns.add(fn)
  if (_drawFns.size === 1) _rafId = requestAnimationFrame(_tick)
}

function _unregister(fn: DrawFn) {
  _drawFns.delete(fn)
  if (_drawFns.size === 0) {
    cancelAnimationFrame(_rafId)
    _rafId = 0
  }
}

// ──────────────────────────────────────────────────

interface Props {
  className?: string
  style?: React.CSSProperties
}

export default function BacklightCanvas({ className, style }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    const img = _sharedImg ?? new Image()
    if (!_sharedImg) img.src = IMG_SRC

    let frames: number[][][] = []
    let frameIdx = 0
    let lastTime = 0
    let frameDuration = 1000 / 30   // 30fps มาตรฐานโปรเจค (คำนวณครั้งเดียว ไม่อ่าน innerWidth ทุกเฟรม)

    getFrameData().then(data => {
      frames = data.frames
      frameDuration = 1000 / (data.animRate || 30)
    })

    const draw = (timestamp: number) => {
      if (frames.length === 0 || !img.complete || !img.naturalWidth) return
      if (timestamp - lastTime < frameDuration) return
      // fixed schedule: ไม่ drift; ถ้าตามหลัง > 3 เฟรม (สลับแท็บ) reset กัน burst
      lastTime += frameDuration
      if (timestamp - lastTime > frameDuration * 3) lastTime = timestamp
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      for (const layer of frames[frameIdx]) {
        const [tx, ty, angle, sx, sy, alpha] = layer
        ctx.save()
        ctx.globalAlpha = alpha / 255
        ctx.translate(tx, ty)
        ctx.rotate(angle)
        ctx.scale(sx, sy)
        ctx.drawImage(img, -100, -100, 200, 200)
        ctx.restore()
      }

      frameIdx = (frameIdx + 1) % frames.length
    }

    _register(draw)
    return () => _unregister(draw)
  }, [])

  return (
    <canvas
      ref={canvasRef}
      width={200}
      height={200}
      className={className}
      style={style}
      aria-hidden="true"
    />
  )
}
