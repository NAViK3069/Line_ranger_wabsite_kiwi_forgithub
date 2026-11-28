'use client'

// ====================================================
// PotentialSection — ศักยภาพ 5 ช่องของเรนเจอร์ (potential_stat_group → potential_stat_info)
// การ์ดละช่อง: เหรียญวัสดุ pt-00N + ค่าที่ได้ (grth_val × เลเวล) · กดการ์ด = ปรับเลเวล 0 – max_lv
// ค่าถูกบวกเข้าค่าพลังใน RangerStatPanel แบบเดียวกับเกียร์ (rangerGameCalc.potentialValues)
// ====================================================

import { useEffect, useRef, useState } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'
import { useSound, SFX } from '@/contexts/SoundContext'
import type { PotentialSlot } from '@/lib/rangerGameCalc'

// ── เหรียญจากชีต common_ui.16 ของเกม (potential_meterial_0N.png — 78×78 ไม่หมุน) ──
const SHEET = '/gameres/hd/common/common_ui.16.png'
const SHEET_W = 1922, SHEET_H = 128, CELL = 78
const MEDAL_X = [633, 717, 801, 885, 969]
const DIM_X = 1053

/** เหรียญวัสดุศักยภาพ — ขนาดตายตัว (ไม่กระพริบขนาดตอนรูปโหลด) */
export function PotentialMedal({ order, size = 32, dim = false }: { order: number; size?: number; dim?: boolean }) {
  const k = size / CELL
  const x = dim ? DIM_X : MEDAL_X[Math.min(4, Math.max(0, order - 1))]
  return (
    <span
      aria-hidden
      className="inline-block shrink-0"
      style={{
        width: size, height: size,
        backgroundImage: `url(${SHEET})`,
        backgroundSize: `${SHEET_W * k}px ${SHEET_H * k}px`,
        backgroundPosition: `-${x * k}px -${5 * k}px`,
        backgroundRepeat: 'no-repeat',
      }}
    />
  )
}

// สีธีมตามสีเหรียญ 1–5 — พื้นทึบเข้มโทนเดียวกับเหรียญ + ขอบสีเดียวกัน ไม่มีเงา (เรียบ)
const TONE = [
  { card: 'bg-teal-950/70 border-teal-500/40', on: 'border-teal-400', label: 'text-teal-300/80' },
  { card: 'bg-red-950/70 border-red-500/40', on: 'border-red-400', label: 'text-red-300/80' },
  { card: 'bg-sky-950/70 border-sky-500/40', on: 'border-sky-400', label: 'text-sky-300/80' },
  { card: 'bg-fuchsia-950/70 border-fuchsia-500/40', on: 'border-fuchsia-400', label: 'text-fuchsia-300/80' },
  { card: 'bg-amber-950/70 border-amber-500/40', on: 'border-amber-400', label: 'text-amber-300/80' },
]

/** ชนิด % (MUL / PROB) หรือค่าตรง (ADD) — ตามชื่อชนิดของเกม */
const isPct = (type: string) => /_MUL$/.test(type)
function fmtValue(type: string, v: number): string {
  if (isPct(type)) return `+${+(v * 100).toFixed(2)}%`
  return `+${Math.abs(v) >= 100 ? Math.round(v).toLocaleString('en-US') : +v.toFixed(2)}`
}

/** เพดานผลรวมระดับศักยภาพ — game_factor POTENTIAL_GROWTH_MAX_LEVEL_LIMIT */
const TOTAL_LIMIT = 2500

export default function PotentialSection({ slots, levels, onChange, onTick }: {
  slots: PotentialSlot[]
  levels: number[]
  onChange: (levels: number[]) => void
  onTick: () => void
}) {
  const { lang, tStat } = useLanguage()
  const { play, tick } = useSound()
  const th = lang === 'th'
  const [open, setOpen] = useState<number | null>(null)
  // ตัวปรับเลเวลปิดเมื่อกดตรงไหนก็ได้นอกส่วนศักยภาพ (การ์ด + ตัวปรับ)
  const rootRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (open == null) return
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(null)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])
  const total = levels.reduce((a, v) => a + v, 0)
  const setLv = (i: number, lv: number) => {
    const next = [...levels]
    next[i] = Math.max(0, Math.min(slots[i].max, lv))
    onChange(next)
  }
  const name = (s: PotentialSlot) => (th ? s.name.th || s.name.en : s.name.en)
  const label = (t: PotentialSlot['types'][number]) => (th ? t.label.th || t.label.en : t.label.en)
  const sel = open != null ? slots[open] : null
  const cur = open != null ? (levels[open] ?? 0) : 0

  return (
    <section ref={rootRef} className="mt-3">
      {/* หัวข้อ — สไตล์เดียวกับ Talents · data-fold-divider = จุดตัดหน้าแรกของ popup */}
      <div data-fold-divider className="flex items-center gap-3 mb-2">
        <div className="flex-1 h-px bg-yellow-500/30" />
        <span className="text-yellow-300 font-bold text-xs tracking-wider">{tStat('Potential')}</span>
        <div className="flex-1 h-px bg-yellow-500/30" />
      </div>
      {/* กดแถวนี้ (รวมถึง MAX / รีเซ็ต) = ปิดตัวปรับเลเวลด้วย */}
      <div onClick={() => setOpen(null)} className="flex items-center justify-between mb-1.5 text-[11px] text-gray-500">
        <span>{th ? 'ระดับรวม' : 'Total'} <b className="text-yellow-300 tabular-nums">{total}</b> / {TOTAL_LIMIT}</span>
        <span className="flex items-center gap-2">
          <button type="button" onClick={() => { play(SFX.max); onChange(slots.map(s => s.max)) }} className="hover:text-white font-semibold">MAX</button>
          <span className="text-gray-700">·</span>
          <button type="button" onClick={() => { play(SFX.reset); onChange(slots.map(() => 0)) }} className="hover:text-white font-semibold">{th ? 'รีเซ็ต' : 'Reset'}</button>
        </span>
      </div>

      {/* การ์ด: มือถือ 2 คอลัมน์ (ช่องสุดท้ายเต็มแถว) · จอใหญ่ 5 คอลัมน์ */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
        {slots.map((s, i) => {
          const lv = levels[i] ?? 0
          const active = open === i
          const tone = TONE[i] ?? TONE[0]
          const two = s.types.length > 1
          return (
            // ความสูงคงที่ทุกการ์ด (ค่าสองชนิดซ้อนสองบรรทัดเสมอ) → ไม่หุบ/ขยายตามความยาวตัวเลข
            <button
              key={s.id}
              type="button"
              onClick={() => { onTick(); setOpen(active ? null : i) }}
              aria-expanded={active}
              className={`min-w-0 h-[3.75rem] text-left rounded-lg border px-2 py-1.5 flex items-center gap-2 transition-colors ${tone.card} ${active ? tone.on : ''} ${
                i === slots.length - 1 && slots.length % 2 ? 'col-span-2 sm:col-span-1' : ''}`}
            >
              {/* เหรียญใหญ่ด้านซ้าย (สูงเต็มการ์ด) — ข้อความด้านขวา */}
              <PotentialMedal order={s.order} size={32} dim={lv === 0} />
              <span className="flex-1 min-w-0 h-full flex flex-col">
              <span className="flex items-center gap-1.5 min-w-0">
                <span className="flex-1 min-w-0 truncate text-[11px] text-gray-300">{name(s)}</span>
                <span className="shrink-0 text-[10px] tabular-nums text-gray-400">{lv}</span>
              </span>
              <span className="flex-1 flex flex-col justify-center min-w-0">
                {s.types.map(t => (
                  <span key={t.type} className={`block whitespace-nowrap font-bold tabular-nums leading-4 ${two ? 'text-[12px]' : 'text-[14px]'} ${lv ? 'text-white' : 'text-gray-500'}`}>
                    {two && <span className={`mr-1 text-[10px] font-semibold ${tone.label}`}>{label(t)}</span>}
                    {fmtValue(t.type, Math.fround(Math.fround(t.per) * lv))}
                  </span>
                ))}
              </span>
              </span>
            </button>
          )
        })}
      </div>

      {/* ตัวปรับเลเวลของช่องที่เลือก */}
      {sel && open != null && (
        // สีเทาปกติแบบกล่องอื่นในหน้ารายละเอียด (ไม่ใช้สีธีมของช่อง)
        <div className="mt-1.5 rounded-lg bg-white/5 px-2.5 py-2">
          <div className="flex items-center gap-2">
            <PotentialMedal order={sel.order} size={24} />
            <span className="min-w-0 truncate text-[12px] font-semibold text-gray-200">{name(sel)}</span>
            <span className="ml-auto shrink-0 whitespace-nowrap text-[11px] tabular-nums text-gray-300">Lv {cur} / {sel.max}</span>
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <button type="button" aria-label="-1" onClick={() => { if (cur > 0) tick(); setLv(open, cur - 1) }}
              className="w-6 h-6 rounded-md bg-white/5 hover:bg-white/10 text-gray-200 text-sm leading-none shrink-0">−</button>
            <input
              type="range" min={0} max={sel.max} step={1}
              value={cur}
              onChange={e => { tick(); setLv(open, parseInt(e.target.value, 10)) }}
              aria-label={name(sel)}
              className={`flex-1 h-1.5 rounded-lg appearance-none cursor-pointer bg-white/15 accent-yellow-400`}
            />
            <button type="button" aria-label="+1" onClick={() => { if (cur < sel.max) tick(); setLv(open, cur + 1) }}
              className="w-6 h-6 rounded-md bg-white/5 hover:bg-white/10 text-gray-200 text-sm leading-none shrink-0">+</button>
          </div>
          <div className="flex gap-1 mt-1.5">
            {[0, Math.round(sel.max / 2), sel.max].map(v => (
              <button key={v} type="button" onClick={() => { play(v === sel.max && v > cur ? SFX.max : SFX.click); setLv(open, v) }}
                className={`flex-1 rounded-md py-0.5 text-[11px] font-semibold tabular-nums ${v === cur ? 'bg-white/15 text-white' : 'bg-white/[0.04] text-gray-400 hover:bg-white/10'}`}>
                Lv.{v}
              </button>
            ))}
          </div>
          <div className="mt-1.5 text-[10px] text-gray-500 tabular-nums">
            {sel.types.map(t => `${label(t) ? label(t) + ' ' : ''}${fmtValue(t.type, t.per)}`).join(' · ')} {th ? 'ต่อเลเวล' : 'per level'}
          </div>
        </div>
      )}
    </section>
  )
}
