// ====================================================
// ChestCanvas — render Gear chest SAM animation
// phases: 'ready' (idle loop) → 'start' (open animation)
//
// - React Portal → canvas อยู่ใน <body> ไม่มีคลิปจาก modal
// - canvas เต็ม viewport → explosion ไม่มีขอบ
// - anchorRef → ล็อคตำแหน่งกล่องไว้กับ hitbox (zoom-safe)
// - resize listener → ขนาด/ตำแหน่ง update ทันทีเมื่อ zoom/resize
// ====================================================

'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type FrameObj = [number, number, number, number, number, number, number, number]
type Frame    = FrameObj[]
interface ChestData {
  animRate: number
  sprites: [number, number, number, number, number][]
  anims: { ready: Frame[]; start: Frame[] }
}

export interface ChestCanvasProps {
  kind:            'random' | 'select'
  phase:           'ready' | 'start'
  onStartComplete?: () => void
  /** ref ของ hitbox element — ล็อคตำแหน่งกล่องให้ตรงกับ popup เสมอ */
  anchorRef?:      React.RefObject<HTMLElement>
  className?:      string
  style?:          React.CSSProperties
}

// World-space center ของกล่อง (จาก ready bbox: X 394-732, Y 53-426)
const VIEW_SCALE    = 0.62   // ขนาดกล่อง
const CHEST_WORLD_X = 563
const CHEST_WORLD_Y = 240
const ANCHOR_OFFSET_Y = -40  // ขยับขึ้น 40px จากกึ่งกลาง hitbox

const ATLAS = {
  random: '/gacha/animation/Gear Random Chest/mini_gacha_25.png',
  select: '/gacha/animation/Gear Select Chest/mini_gacha_26.png',
}
const FRAMES = {
  random: '/gacha/animation/Gear Random Chest/frames.json',
  select: '/gacha/animation/Gear Select Chest/frames.json',
}

export default function ChestCanvas({ kind, phase, onStartComplete, anchorRef, className, style }: ChestCanvasProps) {
  const canvasRef     = useRef<HTMLCanvasElement>(null)
  const phaseRef      = useRef(phase)
  const onCompleteRef = useRef(onStartComplete)
  // refs สำหรับ values ที่ต้อง update เมื่อ resize — ไม่ต้อง restart animation loop
  const wRef          = useRef(0)
  const hRef          = useRef(0)
  const offsetXRef    = useRef(0)
  const offsetYRef    = useRef(0)
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => { setIsMounted(true) }, [])
  useEffect(() => { phaseRef.current = phase }, [phase])
  useEffect(() => { onCompleteRef.current = onStartComplete }, [onStartComplete])

  useEffect(() => {
    if (!isMounted) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // ── ฟังก์ชัน update canvas + offset (เรียกตอน mount และ resize/zoom) ──
    const updateLayout = () => {
      const W = window.innerWidth
      const H = window.innerHeight
      canvas.width  = W
      canvas.height = H
      wRef.current = W
      hRef.current = H

      let cx: number, cy: number
      if (anchorRef?.current) {
        const rect = anchorRef.current.getBoundingClientRect()
        cx = rect.left + rect.width  / 2
        cy = rect.top  + rect.height / 2 + ANCHOR_OFFSET_Y
      } else {
        cx = W * 0.50
        cy = H * 0.45
      }
      offsetXRef.current = CHEST_WORLD_X - cx / VIEW_SCALE
      offsetYRef.current = CHEST_WORLD_Y - cy / VIEW_SCALE
    }

    updateLayout()
    window.addEventListener('resize', updateLayout)

    const atlas = new Image()
    atlas.src = ATLAS[kind]

    let data: ChestData | null = null
    let frameIdx    = 0
    let currentAnim: 'ready' | 'start' = 'ready'
    let lastTime    = 0
    let rafId       = 0
    let mounted     = true

    fetch(FRAMES[kind])
      .then(r => r.json())
      .then((d: ChestData) => { data = d })
      .catch(() => {})

    const draw = (timestamp: number) => {
      if (!mounted) return

      if (!data || !atlas.complete || !atlas.naturalWidth) {
        rafId = requestAnimationFrame(draw)
        return
      }

      // 30fps ทุกอุปกรณ์ (ตรงมาตรฐานโปรเจค + 60/30=2 หารลงตัวบนจอ 60Hz ลื่นกว่า 40fps)
      const frameDuration = 1000 / (data.animRate || 30)

      if (timestamp - lastTime >= frameDuration) {
        // fixed schedule: สะสมทีละ frameDuration (ไม่ drift เหมือน lastTime = timestamp)
        lastTime += frameDuration
        // cold start หรือตามหลัง > 3 เฟรม (สลับแท็บ) → reset กัน burst
        if (timestamp - lastTime > frameDuration * 3) lastTime = timestamp

        const targetPhase = phaseRef.current
        if (targetPhase !== currentAnim) {
          currentAnim = targetPhase
          frameIdx    = 0
        }

        const frames = data.anims[currentAnim] ?? data.anims.ready
        const frame  = frames[frameIdx] ?? []

        // ใช้ค่าจาก refs (อัปเดตโดย updateLayout เมื่อ resize)
        const W  = wRef.current
        const H  = hRef.current
        const ox = offsetXRef.current
        const oy = offsetYRef.current

        ctx.clearRect(0, 0, W, H)

        for (const obj of frame) {
          const [si, a, b, c, d2, wx, wy, alpha] = obj
          const sp = data.sprites[si]
          if (!sp || alpha === 0) continue
          const [ax, ay, aw, ah] = sp

          ctx.save()
          ctx.globalAlpha = alpha / 255
          ctx.setTransform(
            a  * VIEW_SCALE, b  * VIEW_SCALE,
            c  * VIEW_SCALE, d2 * VIEW_SCALE,
            (wx - ox) * VIEW_SCALE,
            (wy - oy) * VIEW_SCALE,
          )
          ctx.drawImage(atlas, ax, ay, aw, ah, -aw / 2, -ah / 2, aw, ah)
          ctx.restore()
        }

        frameIdx++
        if (frameIdx >= frames.length) {
          if (currentAnim === 'start') {
            currentAnim = 'ready'
            frameIdx    = 0
            onCompleteRef.current?.()
          } else {
            frameIdx = 0
          }
        }
      }

      rafId = requestAnimationFrame(draw)
    }

    rafId = requestAnimationFrame(draw)
    return () => {
      mounted = false
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', updateLayout)
    }
  }, [kind, isMounted])

  if (!isMounted) return null

  return createPortal(
    <canvas
      ref={canvasRef}
      className={className}
      style={style}
      aria-hidden="true"
    />,
    document.body
  )
}
