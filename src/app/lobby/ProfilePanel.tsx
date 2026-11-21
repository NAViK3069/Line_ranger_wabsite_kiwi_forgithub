'use client'

// ====================================================
// ProfilePanel — แผงแก้ไขโปรไฟล์ของหน้า /lobby (ส่วนที่คนทั่วไปใช้)
// เลือกรูป / ระดับ / เลเวล / ความยาวหลอด — ที่เหลือสลับไฟล์ให้ครบชุดเองใน profile.ts
// ====================================================

import { useEffect, useState, type ReactNode } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'
import { PROFILE_IMG_OPTIONS, valueToRef } from './scene'
import { PROFILE_TIERS, groupDigits, RUBY_MAX, COIN_MAX, FEATHER_MAX } from './profile'
import type { ProfileState, ProfileTier } from './profile'

// ทรัพยากรสามอย่างที่กรอกได้ — บอกด้วยไอคอนล้วน ไม่มีข้อความกำกับ
// ใช้ชุด pop_gift_icon (72x74) เพราะไอคอนจริงในฉากสองตัวเป็นอนิเมชั่น .sam เอามาโชว์ตรงๆ ไม่ได้
const RESOURCES: { key: 'feather' | 'ruby' | 'coin'; icon: string }[] = [
  { key: 'feather', icon: '/gacha/images/pop_gift_icon_03.png' },
  { key: 'ruby',    icon: '/gacha/images/pop_gift_icon_00.png' },
  { key: 'coin',    icon: '/gacha/images/pop_gift_icon_02.png' },
]

// ค่าตัวเลือกเก็บเป็น "img:<url>" — ดึง url ออกมาโชว์ในตารางเลือกรูป
const optionUrl = (value: string): string => {
  const r = valueToRef(value)
  return r?.kind === 'image' ? r.url : ''
}

interface Props {
  profile: ProfileState
  /** ขั้นต่ำของขนนก = เลขหลัง "/" ที่ตั้งไว้ในฉาก (แถบขนนกช่องข้อความที่ 2) */
  featherMin: number
  onChange: (next: Partial<ProfileState>) => void
  /** ของที่วางต่อจากรูปโปรไฟล์ (ปุ่มเลือกป้อมปราการ) */
  beside?: ReactNode
}

export default function ProfilePanel({ profile, featherMin: fMin, onChange, beside }: Props) {
  const { tStat } = useLanguage()
  const [picking, setPicking] = useState(false)
  const [search, setSearch] = useState('')

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

  const current = profile.img || PROFILE_IMG_OPTIONS[0]?.value || ''
  const q = search.trim().toLowerCase()
  const shown = q ? PROFILE_IMG_OPTIONS.filter(o => o.label.toLowerCase().includes(q)) : PROFILE_IMG_OPTIONS

  return (
    <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.02] p-3 sm:p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="material-icons-round text-lg text-cyan-400">account_circle</span>
        <h2 className="text-sm font-bold text-white">{tStat('Edit profile')}</h2>
      </div>

      <div className="flex flex-wrap items-start gap-4">
        {/* รูปโปรไฟล์ — กดเพื่อเปิดตารางเลือก */}
        <button
          type="button" onClick={() => setPicking(true)}
          className="w-20 h-20 shrink-0 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/25 active:scale-95 transition-all overflow-hidden flex items-center justify-center"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={optionUrl(current)} alt=""
            className="max-h-full max-w-full object-contain pointer-events-none"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        </button>

        {beside}

        <div className="flex-1 min-w-[260px] space-y-3">
          {/* ระดับ — สลับทั้งชุด (ตัวเลข / ธง / เสาธง / ข้อความ / หลอด) พร้อมกัน */}
          <div className="flex flex-wrap gap-1">
            {PROFILE_TIERS.map(t => (
              <button
                key={t.key} type="button"
                onClick={() => onChange({ tier: t.key as ProfileTier })}
                className={`h-7 px-2.5 rounded-lg border text-xs transition-colors ${
                  profile.tier === t.key
                    ? 'text-cyan-200 border-cyan-500 bg-cyan-500/20'
                    : 'text-gray-400 border-slate-700 bg-slate-800 hover:bg-slate-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* เลเวล */}
            <label className="inline-flex items-center gap-1.5 text-xs text-gray-400">
              {tStat('Level')}
              {/* 1-99 — ลบให้ว่างระหว่างพิมพ์ได้ แล้วค่อยเด้งเป็น 1 ตอนออกจากช่อง */}
              <input
                type="text" inputMode="numeric" maxLength={2} value={profile.level}
                onChange={e => {
                  const digits = e.target.value.replace(/\D/g, '')
                  if (!digits) { onChange({ level: '' }); return }
                  onChange({ level: String(Math.min(99, Math.max(1, parseInt(digits, 10)))) })
                }}
                onBlur={() => { if (!profile.level) onChange({ level: '1' }) }}
                className="w-14 h-6 px-1 rounded bg-slate-900 border border-slate-700 text-gray-100 text-[11px] text-center focus:outline-none focus:border-cyan-500"
              />
            </label>

            {/* ความยาวหลอด */}
            <label className="inline-flex items-center gap-2 text-xs text-gray-400 flex-1 min-w-[160px]">
              {tStat('Gauge')}
              <input
                type="range" min={1} max={100} step={1} value={profile.gauge}
                onChange={e => onChange({ gauge: parseInt(e.target.value, 10) || 1 })}
                className="flex-1 min-w-0 h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />
              <span className="w-8 text-right tabular-nums text-gray-500">{profile.gauge}%</span>
            </label>

            {/* ── จำนวนทรัพยากร ── ต่อท้าย Gauge ตามที่สั่ง ── */}
            {RESOURCES.map(r => {
              // ขนนกมีทั้งเพดานของตัวเอง และห้ามต่ำกว่าเลขหลัง "/" ของระดับนั้นด้วย
              const min = r.key === 'feather' ? fMin : 0
              const max = r.key === 'ruby' ? RUBY_MAX : r.key === 'coin' ? COIN_MAX : FEATHER_MAX
              return (
                <label key={r.key} className="inline-flex items-center gap-1.5 text-xs text-gray-400">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.icon} alt={r.key} className="h-6 w-6 object-contain" />
                  <input
                    type="text" inputMode="numeric" value={groupDigits(profile[r.key])}
                    onChange={e => {
                      const digits = e.target.value.replace(/\D/g, '')
                      if (!digits) { onChange({ [r.key]: '' }); return }
                      onChange({ [r.key]: String(Math.min(max, parseInt(digits, 10))) })
                    }}
                    onBlur={() => {
                      const n = parseInt(profile[r.key] || '0', 10) || 0
                      if (n < min) onChange({ [r.key]: String(min) })
                      else if (!profile[r.key]) onChange({ [r.key]: '0' })
                    }}
                    className="w-24 h-6 px-1 rounded bg-slate-900 border border-slate-700 text-gray-100 text-[11px] text-right focus:outline-none focus:border-cyan-500"
                  />
                </label>
              )
            })}
          </div>
        </div>
      </div>

      {/* ตารางเลือกรูปโปรไฟล์ */}
      {picking && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) setPicking(false) }}
        >
          {/* ล็อกความสูงตายตัวเหมือนตารางเลือกเรนเจอร์ — ค้นหาแล้วเหลือไม่กี่รูปกรอบก็ไม่หุบ */}
          <div className="card-glass w-full h-[85vh] flex flex-col rounded-2xl relative overflow-hidden" style={{ maxWidth: '52rem' }}>
            <button onClick={() => setPicking(false)} className="absolute top-3 right-3 text-gray-400 hover:text-white z-10" aria-label="close">
              <span className="material-icons-round">close</span>
            </button>
            <div className="px-4 sm:px-5 pt-4 pb-3 border-b border-white/10 shrink-0">
              <h3 className="text-white font-bold text-sm mb-2 pr-8">{tStat('Choose profile image')}</h3>
              <div className="relative">
                <span className="material-icons-round absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 text-base">search</span>
                <input
                  type="text" value={search} onChange={e => setSearch(e.target.value)} autoFocus
                  placeholder="profile_img_001 / laby / pkg"
                  className="w-full h-9 pl-8 pr-2 rounded-lg bg-slate-900 border border-slate-700 text-gray-100 text-sm focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 sm:p-4">
              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                {shown.map(o => (
                  <button
                    key={o.value} type="button"
                    onClick={() => { onChange({ img: o.value }); setPicking(false) }}
                    className={`rounded-xl p-1 border transition-all active:scale-95 ${
                      o.value === current
                        ? 'border-cyan-400/70 bg-cyan-400/10'
                        : 'border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/25'
                    }`}
                  >
                    <div className="w-full aspect-square flex items-center justify-center relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={optionUrl(o.value)} alt=""
                        className="max-h-full max-w-full object-contain pointer-events-none"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                    </div>
                  </button>
                ))}
              </div>
              {shown.length === 0 && <p className="text-gray-500 text-sm text-center py-10">{tStat('No results')}</p>}
            </div>
            <div className="px-4 py-2 border-t border-white/10 shrink-0 text-center text-xs text-gray-500">
              {shown.length} / {PROFILE_IMG_OPTIONS.length}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
