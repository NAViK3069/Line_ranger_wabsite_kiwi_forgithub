'use client'

// ====================================================
// FortressButton — ปุ่มรูปป้อมปราการ อยู่ข้างรูปโปรไฟล์ในแผงแก้ไขโปรไฟล์ของหน้า /lobby
// กดแล้วเปิดตารางเลือกป้อม (twr01 … twr78) · ท่าบังคับเป็นท่ายืนปกติ (normal_idle) เสมอ
// ====================================================

import { useEffect, useState } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'
import { FORTRESS_IDS, fortressThumb, fortressThumbScale } from './fortress'

interface Props {
  value: string
  onChange: (id: string) => void
}

export default function FortressButton({ value, onChange }: Props) {
  const { tStat } = useLanguage()
  const [picking, setPicking] = useState(false)

  useEffect(() => {
    if (!picking) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setPicking(false) }
    window.addEventListener('keydown', h)
    // ล็อกไม่ให้หน้าข้างหลังเลื่อนตามขณะเปิดตารางอยู่
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', h)
      document.body.style.overflow = prev
    }
  }, [picking])

  return (
    <>
      {/* ขนาดเท่าปุ่มรูปโปรไฟล์ — ไม่มีข้อความกำกับ (ชื่อป้อมอยู่ใน tooltip) */}
      <button
        type="button" onClick={() => setPicking(true)}
        aria-label={tStat('Choose fortress')} title={`${tStat('Choose fortress')} · ${value}`}
        className="w-20 h-20 shrink-0 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/25 active:scale-95 transition-all overflow-hidden flex items-center justify-center"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={fortressThumb(value)} alt={value}
          className="max-h-full max-w-full object-contain pointer-events-none"
          style={{ transform: `scale(${fortressThumbScale(value)})` }}
          onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden' }}
        />
      </button>

      {/* ตารางเลือกป้อม */}
      {picking && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) setPicking(false) }}
        >
          <div className="card-glass w-full h-[85vh] flex flex-col rounded-2xl relative overflow-hidden" style={{ maxWidth: '52rem' }}>
            <button onClick={() => setPicking(false)} className="absolute top-3 right-3 text-gray-400 hover:text-white z-10" aria-label="close">
              <span className="material-icons-round">close</span>
            </button>
            <div className="px-4 sm:px-5 pt-4 pb-3 border-b border-white/10 shrink-0">
              <h3 className="text-white font-bold text-sm pr-8">{tStat('Choose fortress')}</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-3 sm:p-4">
              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                {FORTRESS_IDS.map(id => (
                  <button
                    key={id} type="button"
                    onClick={() => { onChange(id); setPicking(false) }}
                    className={`rounded-xl p-1 border transition-all active:scale-95 ${
                      id === value
                        ? 'border-cyan-400/70 bg-cyan-400/10'
                        : 'border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/25'
                    }`}
                  >
                    <div className="w-full aspect-square flex items-center justify-center overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={fortressThumb(id)} alt={id} loading="lazy"
                        className="max-h-full max-w-full object-contain pointer-events-none"
                        style={{ transform: `scale(${fortressThumbScale(id)})` }}
                        onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden' }}
                      />
                    </div>
                    <span className="block text-[10px] text-gray-400 text-center leading-tight mt-0.5">{id}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="px-4 py-2 border-t border-white/10 shrink-0 text-center text-xs text-gray-500">
              {FORTRESS_IDS.length}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
