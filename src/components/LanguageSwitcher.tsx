'use client'
// ====================================================
// LanguageSwitcher — dropdown เลือกภาษา (EN/TH/ZH/JA)
// ====================================================

import { useState, useRef, useEffect } from 'react'
import { useLanguage, LANG_LABELS, type Lang } from '@/contexts/LanguageContext'
import { useSound } from '@/contexts/SoundContext'
import SoundToggle from '@/components/SoundToggle'

const LANGS: Lang[] = ['en', 'th']

interface LanguageSwitcherProps {
  className?: string
}

export default function LanguageSwitcher({ className = '' }: LanguageSwitcherProps) {
  const { lang, setLang, loading } = useLanguage()
  const { play } = useSound()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // ปิด dropdown เมื่อคลิกข้างนอก
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [open])

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* ปุ่มเปิด/ปิดเสียง — ซ้ายของปุ่มเปลี่ยนภาษา */}
      <SoundToggle />

      <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => { play('click_global.ogg'); setOpen(o => !o) }}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 text-white text-sm font-semibold transition"
        aria-label="Change language"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="material-icons-round text-base">language</span>
        <span>{LANG_LABELS[lang]}</span>
        {loading && <span className="material-icons-round text-base animate-spin">refresh</span>}
        <span className="material-icons-round text-sm opacity-70">expand_more</span>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 mt-1.5 min-w-[140px] rounded-xl bg-gray-900/95 backdrop-blur border border-white/10 shadow-xl overflow-hidden z-50"
        >
          {LANGS.map((l) => (
            <button
              key={l}
              role="option"
              aria-selected={l === lang}
              onClick={() => { play('click_global.ogg'); setLang(l); setOpen(false) }}
              className={`flex items-center gap-2 w-full px-3 py-2 text-sm text-left transition ${
                l === lang ? 'bg-purple-500/30 text-white' : 'text-gray-200 hover:bg-white/10'
              }`}
            >
              <span className="flex-1">{LANG_LABELS[l]}</span>
              {l === lang && <span className="material-icons-round text-sm text-purple-300">check</span>}
            </button>
          ))}
        </div>
      )}
      </div>
    </div>
  )
}
