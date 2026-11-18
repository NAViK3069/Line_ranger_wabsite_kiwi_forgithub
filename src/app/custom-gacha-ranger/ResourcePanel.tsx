'use client'

// ====================================================
// ResourcePanel — แผงแก้จำนวนทรัพยากรของหน้า /custom-gacha-ranger
// รูบี้ / ตั๋วกาชา / M point — ช่องกรอกแบบเดียวกับแผงโปรไฟล์ของ /lobby
// M point: หลักหน่วยต้องเป็น 0 และไม่ต่ำกว่า 40 (ปัดให้ตอนออกจากช่อง พิมพ์ค้างระหว่างทางได้)
// ====================================================

import { useLanguage } from '@/contexts/LanguageContext'
import { groupDigits } from '../lobby/profile'
import { MPOINT_LIMIT, MPOINT_MIN, RUBY_LIMIT, TICKET_LIMIT, normalizeMPoint } from './slots'
import type { GachaResources } from './slots'

const FIELDS: { key: keyof GachaResources; icon: string; max: number }[] = [
  { key: 'ruby',   icon: '/gacha/images/pop_gift_icon_00.png', max: RUBY_LIMIT },
  { key: 'ticket', icon: '/gacha/images/gacha.png',            max: TICKET_LIMIT },
  { key: 'mpoint', icon: '/gacha/images/Mpoint.png',           max: MPOINT_LIMIT },
]

interface Props {
  resources: GachaResources
  onChange: (next: Partial<GachaResources>) => void
}

export default function ResourcePanel({ resources, onChange }: Props) {
  const { tStat } = useLanguage()
  return (
    <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.02] p-3 sm:p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="material-icons-round text-lg text-cyan-400">diamond</span>
        <h2 className="text-sm font-bold text-white">{tStat('Resources')}</h2>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        {FIELDS.map(f => (
          <label key={f.key} className="inline-flex items-center gap-1.5 text-xs text-gray-400">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={f.icon} alt={f.key} className="h-6 w-6 object-contain" />
            <input
              type="text" inputMode="numeric" value={groupDigits(resources[f.key])}
              onChange={e => {
                const digits = e.target.value.replace(/\D/g, '')
                if (!digits) { onChange({ [f.key]: '' }); return }
                onChange({ [f.key]: String(Math.min(f.max, parseInt(digits, 10))) })
              }}
              onBlur={() => {
                const n = parseInt(resources[f.key] || '0', 10) || 0
                if (f.key === 'mpoint') onChange({ mpoint: String(normalizeMPoint(n)) })
                else if (!resources[f.key]) onChange({ [f.key]: '0' })
              }}
              className="w-24 h-6 px-1 rounded bg-slate-900 border border-slate-700 text-gray-100 text-[11px] text-right focus:outline-none focus:border-cyan-500"
            />
          </label>
        ))}
      </div>
      <p className="text-[10px] text-gray-500 mt-2">
        {tStat('M point must end in 0 and be at least')} {MPOINT_MIN}
      </p>
    </div>
  )
}
