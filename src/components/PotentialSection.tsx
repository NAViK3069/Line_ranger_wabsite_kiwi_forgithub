'use client'

// ====================================================
// PotentialSection — ศักยภาพ 5 ช่องของเรนเจอร์ (potential_stat_group → potential_stat_info)
// การ์ดละช่อง: เหรียญวัสดุ pt-00N + ค่าที่ได้ (grth_val × เลเวล) · กดการ์ด = ปรับเลเวล 0 – max_lv
// ค่าถูกบวกเข้าค่าพลังใน RangerStatPanel แบบเดียวกับเกียร์ (rangerGameCalc.potentialValues)
// ====================================================

import { useState } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'
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

// สีการ์ดตามสีเหรียญ 1–5
const TONE = [
  { ring: 'ring-teal-400/60', bg: 'from-teal-500/25 to-teal-500/5', text: 'text-teal-200', accent: 'accent-teal-400' },
  { ring: 'ring-red-400/60', bg: 'from-red-500/25 to-red-500/5', text: 'text-red-200', accent: 'accent-red-400' },
  { ring: 'ring-sky-400/60', bg: 'from-sky-500/25 to-sky-500/5', text: 'text-sky-200', accent: 'accent-sky-400' },
  { ring: 'ring-fuchsia-400/60', bg: 'from-fuchsia-500/25 to-fuchsia-500/5', text: 'text-fuchsia-200', accent: 'accent-fuchsia-400' },
  { ring: 'ring-amber-400/60', bg: 'from-amber-500/25 to-amber-500/5', text: 'text-amber-200', accent: 'accent-amber-400' },
]

/** ชนิด % (MUL / PROB) หรือค่าตรง (ADD) — ตามชื่อชนิดของเกม */
const isPct = (type: string) => /_MUL$|_PROB_MUL$/.test(type)
function fmtValue(type: string, v: number): string {
  if (isPct(type)) return `+${(v * 100).toFixed(2)}%`
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
  const th = lang === 'th'
  const [open, setOpen] = useState<number | null>(null)
  const total = levels.reduce((a, v) => a + v, 0)
  const setLv = (i: number, lv: number) => {
    const next = [...levels]
    next[i] = Math.max(0, Math.min(slots[i].max, lv))
    onChange(next)
  }
  const name = (s: PotentialSlot) => (th ? s.name.th || s.name.en : s.name.en)
  const sel = open != null ? slots[open] : null

  return (
    <section className="mt-3">
      {/* หัวข้อ — สไตล์เดียวกับ Talents */}
      <div className="flex items-center gap-3 mb-2">
        <div className="flex-1 h-px bg-yellow-500/30" />
        <span className="text-yellow-300 font-bold text-xs tracking-wider">{tStat('Potential')}</span>
        <div className="flex-1 h-px bg-yellow-500/30" />
      </div>
      <div className="flex items-center justify-between gap-2 mb-2 text-[11px]">
        <span className="text-gray-400">
          {th ? 'ระดับศักยภาพ' : 'Potential Level'} <b className="text-white tabular-nums">{total}</b>
          <span className="text-gray-500"> / {TOTAL_LIMIT}</span>
        </span>
        <span className="flex gap-1.5">
          <button type="button" onClick={() => { onTick(); onChange(slots.map(s => s.max)) }}
            className="rounded-md bg-white/5 hover:bg-white/10 px-2 py-0.5 font-semibold text-gray-200">MAX</button>
          <button type="button" onClick={() => { onTick(); onChange(slots.map(() => 0)) }}
            className="rounded-md bg-white/5 hover:bg-white/10 px-2 py-0.5 font-semibold text-gray-200">{th ? 'รีเซ็ต' : 'Reset'}</button>
        </span>
      </div>

      {/* การ์ด: มือถือ 2 คอลัมน์ (ช่องสุดท้ายเต็มแถว) · จอใหญ่ 5 คอลัมน์ */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 sm:gap-2">
        {slots.map((s, i) => {
          const lv = levels[i] ?? 0
          const tone = TONE[i] ?? TONE[0]
          const active = open === i
          return (
            <div key={s.id} className={`min-w-0 ${i === slots.length - 1 && slots.length % 2 ? 'col-span-2 sm:col-span-1' : ''}`}>
              <button
                type="button"
                onClick={() => { onTick(); setOpen(active ? null : i) }}
                aria-expanded={active}
                className={`w-full h-14 rounded-xl bg-gradient-to-b ${tone.bg} ring-1 ${active ? `${tone.ring} ring-2` : 'ring-white/10'} px-1.5 sm:px-2 flex items-center gap-1 sm:gap-1.5 overflow-hidden transition-colors hover:brightness-110`}
              >
                <span className="hidden sm:inline-flex"><PotentialMedal order={s.order} size={34} dim={lv === 0} /></span>
                <span className="sm:hidden inline-flex"><PotentialMedal order={s.order} size={28} dim={lv === 0} /></span>
                <span className="min-w-0 flex-1 text-left leading-tight">
                  {s.types.map(t => (
                    <span key={t.type} className={`block whitespace-nowrap font-bold tabular-nums ${s.types.length > 1 ? 'text-[11px] sm:text-[12px]' : 'text-[14px] sm:text-[15px]'} ${lv ? 'text-white' : 'text-gray-400'}`}>
                      {s.types.length > 1 && <span className={`${tone.text} font-semibold mr-1 text-[10px] sm:text-[11px]`}>{th ? t.label.th || t.label.en : t.label.en}</span>}
                      {fmtValue(t.type, Math.fround(Math.fround(t.per) * lv))}
                    </span>
                  ))}
                </span>
              </button>
              <div className="mt-1 text-center text-[10px] sm:text-[11px] leading-tight text-gray-400">
                {name(s)} <span className="tabular-nums text-gray-300 whitespace-nowrap">{lv} / {s.max}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* ตัวปรับเลเวลของช่องที่เลือก */}
      {sel && open != null && (
        <div className="mt-2 rounded-xl bg-gray-900/90 ring-1 ring-white/10 p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="flex items-center gap-1.5 min-w-0">
              <PotentialMedal order={sel.order} size={22} />
              <span className="text-[13px] font-bold text-white truncate">{name(sel)}</span>
            </span>
            <span className={`text-[12px] font-bold tabular-nums ${TONE[open]?.text ?? ''}`}>Lv {levels[open] ?? 0} / {sel.max}</span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" aria-label="-1" onClick={() => setLv(open, (levels[open] ?? 0) - 1)}
              className="w-7 h-7 rounded-md bg-white/5 hover:bg-white/10 text-white font-bold shrink-0">−</button>
            <input
              type="range" min={0} max={sel.max} step={1}
              value={levels[open] ?? 0}
              onChange={e => setLv(open, parseInt(e.target.value, 10))}
              onPointerUp={onTick}
              onKeyUp={onTick}
              aria-label={name(sel)}
              className={`flex-1 h-1.5 rounded-lg appearance-none cursor-pointer bg-white/15 ${TONE[open]?.accent ?? ''}`}
            />
            <button type="button" aria-label="+1" onClick={() => setLv(open, (levels[open] ?? 0) + 1)}
              className="w-7 h-7 rounded-md bg-white/5 hover:bg-white/10 text-white font-bold shrink-0">+</button>
          </div>
          <div className="flex gap-1.5 mt-2.5">
            {[0, Math.round(sel.max / 2), sel.max].map(v => (
              <button key={v} type="button" onClick={() => { onTick(); setLv(open, v) }}
                className={`flex-1 rounded-md py-1 text-xs font-bold tabular-nums ${v === (levels[open] ?? 0) ? 'bg-white/20 text-white' : 'bg-white/5 text-gray-300 hover:bg-white/10'}`}>
                Lv.{v}
              </button>
            ))}
          </div>
          <div className="mt-2 text-[11px] text-gray-400">
            {sel.types.map(t => (
              <span key={t.type} className="mr-3">
                {th ? 'ต่อเลเวล' : 'Per level'}{s2(t, th) ? ` (${s2(t, th)})` : ''}: <b className="text-gray-200">{fmtValue(t.type, t.per)}</b>
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function s2(t: PotentialSlot['types'][number], th: boolean) {
  return th ? t.label.th || t.label.en : t.label.en
}
