'use client'

// ====================================================
// EvolutionSection — สายวิวัฒนาการของเรนเจอร์ (evolveChain)
// • เรียงร่างทุกระดับเป็นแถวยาว [u284e][u285e][u286e][u286u][u286h]
// • ไฮไลท์ร่างที่กำลังเปิดดูอยู่ + กดร่างอื่นเพื่อสลับไปดูแทน
// • Self-hide ถ้าไม่มีสาย (chain ว่าง) — สไตล์เดียวกับ TalentSection
// ====================================================

import { apiFetch } from '@/lib/staticApi'
import { useEffect, useState } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'

interface EvolveEntry {
  id: string
  name: string
  grade: number | null
  tierIconKey: string
  tierLabel: string
}

interface Props {
  rangerId: string
  /** กดร่างอื่น → host สลับเนื้อหา popup ไปเป็นร่างนั้น (ไม่ส่งมา = แสดงอย่างเดียว กดไม่ได้) */
  onSelect?: (id: string, name: string) => void
}

// cache ต่อ session — กดสลับร่างไปมาไม่ยิงซ้ำ (ทุกตัวในสายใช้ผลลัพธ์ก้อนเดียวกัน)
const chainCache = new Map<string, EvolveEntry[]>()

const thumbUrl = (id: string) => `https://rangers.lerico.net/res/${id}/${id}-thum.png`
// tierIconKey ∈ "1".."9" | "7+"/"8+" | "8#" — encode "+"/"#" ก่อนใช้เป็น URL (ไม่งั้น "#" กลายเป็น fragment)
const starUrl = (key: string) => `/gacha/images/${encodeURIComponent(key)}star.png`

export default function EvolutionSection({ rangerId, onSelect }: Props) {
  const { tStat, tRanger } = useLanguage()
  const [chain, setChain] = useState<EvolveEntry[]>(() => chainCache.get(rangerId) ?? [])
  const [loading, setLoading] = useState(!chainCache.has(rangerId))

  useEffect(() => {
    const cached = chainCache.get(rangerId)
    if (cached) { setChain(cached); setLoading(false); return }

    let alive = true
    setLoading(true)
    apiFetch(`/api/ranger/evolve/${encodeURIComponent(rangerId)}`)
      .then(r => r.json())
      .then((d: { chain?: EvolveEntry[] }) => {
        const list = Array.isArray(d.chain) ? d.chain : []
        // เก็บ cache ให้ทุกตัวในสาย — กดสลับร่างแล้วขึ้นทันทีไม่ต้องรอโหลด
        chainCache.set(rangerId, list)
        for (const e of list) chainCache.set(e.id, list)
        if (alive) { setChain(list); setLoading(false) }
      })
      .catch(() => { if (alive) { setChain([]); setLoading(false) } })
    return () => { alive = false }
  }, [rangerId])

  if (loading || chain.length < 2) return null

  return (
    <section className="lr-detail-zone mt-3 px-1 sm:px-2">
      {/* ── Divider: ─── Evolution ─── (สไตล์เดียวกับ Talents) ── */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1 h-px bg-yellow-500/30"></div>
        <span className="text-yellow-300 font-bold text-xs tracking-wider">
          {tStat('Evolution')}
        </span>
        <div className="flex-1 h-px bg-yellow-500/30"></div>
      </div>

      {/* แถวยาว — สายยาวเกินจอเลื่อนแนวนอนได้ ทุกช่องกว้างเท่ากัน */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {chain.map((e) => {
          const isCurrent = e.id === rangerId
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => { if (!isCurrent) onSelect?.(e.id, e.name) }}
              disabled={isCurrent || !onSelect}
              title={e.id}
              className={`shrink-0 basis-[92px] sm:basis-[108px] rounded-xl p-1.5 border transition-all ${
                isCurrent
                  ? 'border-yellow-400/70 bg-yellow-400/10 cursor-default'
                  : onSelect
                    ? 'border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/25 active:scale-95 cursor-pointer'
                    : 'border-white/10 bg-white/5 cursor-default'
              }`}
            >
              <div className="w-full aspect-square flex items-center justify-center relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={thumbUrl(e.id)}
                  alt={e.name}
                  className="max-h-full max-w-full object-contain pointer-events-none"
                  onError={(ev) => { (ev.target as HTMLImageElement).style.display = 'none' }}
                />
              </div>

              {/* ระดับดาว */}
              {e.tierIconKey && (
                <div className="flex justify-center mt-0.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={starUrl(e.tierIconKey)}
                    alt={e.tierLabel}
                    className="h-3.5 sm:h-4 object-contain pointer-events-none"
                    onError={(ev) => { (ev.target as HTMLImageElement).style.display = 'none' }}
                  />
                </div>
              )}

              {/* ชื่อ — จอง 2 บรรทัด ให้ทุกช่องสูงเท่ากันไม่ว่าชื่อยาวสั้น */}
              <div className={`mt-0.5 text-[10px] sm:text-xs leading-tight text-center line-clamp-2 min-h-[2.2em] ${
                isCurrent ? 'text-yellow-200 font-bold' : 'text-gray-300'
              }`}>
                {tRanger(e.id, e.name)}
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}
