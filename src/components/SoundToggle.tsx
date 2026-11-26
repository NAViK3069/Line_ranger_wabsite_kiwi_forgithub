'use client'
// ====================================================
// SoundToggle — ปุ่มไอคอนเสียง + dropdown slider ปรับระดับเสียง
//   (วางซ้ายปุ่มเปลี่ยนภาษา)
// ====================================================

import { useState, useRef, useEffect } from 'react'
import { useSound } from '@/contexts/SoundContext'
import { useLanguage } from '@/contexts/LanguageContext'

interface SoundToggleProps {
  className?: string
  /** เปิดแถบปรับเสียงขึ้นด้านบน ชิดขวา (ใช้ในแถบควบคุมล่างของวิดีโอตอนเต็มจอ) */
  dropUp?: boolean
}

export default function SoundToggle({ className = '', dropUp = false }: SoundToggleProps) {
  const { volume, setVolume, play } = useSound()
  const { lang } = useLanguage()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const label = lang === 'th' ? 'ระดับเสียง' : 'Volume'

  // ปิด dropdown เมื่อคลิกข้างนอก
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [open])

  const pct = Math.round(volume * 100)
  const icon = volume <= 0 ? 'volume_off' : volume < 0.5 ? 'volume_down' : 'volume_up'

  return (
    <div ref={ref} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label="Sound volume"
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`flex items-center justify-center w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 transition ${
          volume <= 0 ? 'text-gray-400' : 'text-white'
        }`}
      >
        <span className="material-icons-round text-lg">{icon}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Sound volume"
          className={`absolute ${dropUp ? 'right-0 bottom-full mb-1.5' : 'left-1/2 -translate-x-1/2 mt-1.5'} w-56 rounded-xl bg-gray-900/95 backdrop-blur border border-white/10 shadow-xl z-50 p-3.5`}
        >
          <div className="flex items-center justify-between mb-2.5">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-300">
              <span className="material-icons-round text-base text-purple-300">{icon}</span>
              {label}
            </span>
            <span className="text-xs font-bold text-purple-300 tabular-nums">{pct}%</span>
          </div>

          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={pct}
            onChange={(e) => setVolume(parseInt(e.target.value, 10) / 100)}
            // เล่นเสียงตัวอย่างเมื่อปล่อยนิ้ว → ได้ยินระดับที่ตั้ง
            onPointerUp={() => play('click_button.ogg')}
            onKeyUp={() => play('click_button.ogg')}
            className="w-full h-1.5 rounded-lg appearance-none cursor-pointer bg-white/15 accent-purple-500"
            aria-label="Volume level"
          />
        </div>
      )}
    </div>
  )
}
