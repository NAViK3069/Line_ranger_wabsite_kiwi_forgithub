'use client'
// ====================================================
// TalentSection — แสดงทาเลนต์หลัก + ทาเลนต์เสริม จากข้อมูลเกมของเรา (/api/ranger/talents)
// • Show เฉพาะ ranger ที่มี talent (เช็คก่อน fetch ถ้า 404/empty → return null)
// • ข้อความไทย/อังกฤษเป็นข้อความทางการของเกมทั้งหมด (…L จาก API) — ไม่มีการแปลเอง
//   คำอธิบายทาเลนต์หลัก = ข้อความเต็มของเกม · เงื่อนไข = บรรทัดนำ · ผล = รายการ * แต่ละข้อ
// ====================================================

import { apiFetch } from '@/lib/staticApi'
import { useEffect, useState } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'

/** ข้อความทางการสองภาษา — ภาษาที่เกมไม่มีจะไม่มีฟิลด์นั้น */
interface Localized { en?: string; th?: string }

interface BuffEffect {
  triggerRate: string
  effect: string
  template: string
  effectL?: Localized
}

interface PrimaryTalent {
  description: string
  descriptionTh?: string
  descriptionEn?: string
  triggerRate: string
  condition: string
  conditionTemplate: string
  condition2?: string
  conditionL?: Localized
  condition2L?: Localized
  buffs: BuffEffect[]
}

export interface TalentData {
  hasTalent: boolean
  primary?: PrimaryTalent
  enhanced?: string[]
  enhancedL?: (Localized | null)[]
  /** ค่าดิบของทาเลนต์เสริม (ชนิด + ค่า) */
  enhancedStats?: { type: string; value: number }[]
}

interface TalentSectionProps {
  rangerId: string
  // ── Ranger Book เท่านั้น: slider ปรับระดับพรสวรรค์ 0-4 + เครื่องหมาย check_circle ──
  showLevelSlider?: boolean
  talentLevel?: number
  onTalentLevelChange?: (level: number) => void
}

export default function TalentSection({ rangerId, showLevelSlider, talentLevel = 0, onTalentLevelChange }: TalentSectionProps) {
  const { lang, tStat } = useLanguage()
  const [data, setData] = useState<TalentData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const ctrl = new AbortController()
    const timeoutId = setTimeout(() => ctrl.abort(), 10000)  // 10s timeout
    setLoading(true)

    // ?v=3 = รุ่นข้อมูลเกมของเรา — กัน browser ใช้ JSON รุ่นเก่า (warmycat) ที่แคชไว้ 7 วัน
    const talentPromise = apiFetch(`/api/ranger/talents/${encodeURIComponent(rangerId)}?v=3`, { signal: ctrl.signal })
      .then(r => {
        const ct = r.headers.get('content-type') ?? ''
        if (!ct.includes('application/json')) throw new Error('non-json response')
        return r.json() as Promise<TalentData>
      })
      .then(d => d && typeof d === 'object' ? d : { hasTalent: false } as TalentData)
      .catch(() => ({ hasTalent: false } as TalentData))

    talentPromise
      .then(d => {
        if (cancelled) return
        setData(d)
      })
      .finally(() => {
        clearTimeout(timeoutId)
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true; clearTimeout(timeoutId); ctrl.abort() }
  }, [rangerId])

  // ── ข้อความทางการของภาษาที่เลือก — เกมไม่มีภาษานั้นค่อยใช้อีกภาษา แล้วค่อยจีน ──
  const targetLang: 'en' | 'th' = lang === 'th' ? 'th' : 'en'
  const localize = (zh: string, official?: Localized | null): string =>
    official?.[targetLang] || official?.[targetLang === 'th' ? 'en' : 'th'] || zh

  // Hide if loading or no talent
  if (loading) return null
  if (!data || !data.hasTalent) return null

  const { primary, enhanced } = data

  return (
    <section className="lr-detail-zone mt-3 px-1 sm:px-2">
      {/* ── Divider: ─── พรสวรรค์ ─── ── */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1 h-px bg-yellow-500/30"></div>
        <span className="text-yellow-300 font-bold text-xs tracking-wider">
          {tStat('Talents')}
        </span>
        <div className="flex-1 h-px bg-yellow-500/30"></div>
      </div>

      {/* ── Level slider (Ranger Book เท่านั้น) — ปรับ 0-4, ระดับ 2-4 เพิ่มค่าพลังเรนเจอร์เหมือนเกียร์ ── */}
      {showLevelSlider && (
        <div className="space-y-1.5 mb-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-yellow-200">{tStat('Talent level')}</span>
            <span className="text-yellow-200 font-semibold font-mono">
              {talentLevel === 0
                ? tStat('Not Unlocked')
                : `${talentLevel} / 4${talentLevel === 4 ? ` (${tStat('Max')})` : ''}`}
            </span>
          </div>
          <input
            min={0} max={4} step={1} type="range"
            value={talentLevel}
            onChange={(e) => onTalentLevelChange?.(parseInt(e.target.value, 10))}
            className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-yellow-400"
          />
        </div>
      )}

      {/* ── Primary Talent ── */}
      {primary && (
        <div className="mb-4">
          <div className={`flex items-center gap-2 mb-2 rounded-lg border px-2 py-1.5 -mx-2 ${talentLevel >= 1 ? 'border-yellow-400/50 bg-yellow-400/10' : 'border-transparent'}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/gacha/images/tlt1.png" alt="" className="w-7 h-7 object-contain shrink-0"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
            <span className="text-yellow-300 font-semibold text-sm">{tStat('Major Talent')}</span>
            {talentLevel >= 1 && (
              <span className="material-icons-round text-base text-yellow-400">check_circle</span>
            )}
          </div>

          {/* Description — ข้อความทางการของเกม (ABILITY:ab_tlt_N_desc) */}
          {(() => {
            const desc = lang === 'th' ? primary.descriptionTh : primary.descriptionEn
            if (!desc) return null
            return (
              <p className="text-white/90 text-xs leading-relaxed whitespace-pre-line mb-2 px-1">
                {desc}
              </p>
            )
          })()}

          {/* Probability + Condition — คำอธิบายแบบประโยคเดียวไม่มีเงื่อนไขแยก (อยู่ในประโยคแล้ว) */}
          {(() => {
            const cond = localize(primary.condition, primary.conditionL)
            return (
              <div className="rounded-xl bg-white/5 border border-white/10 overflow-hidden mb-2">
                <div className={`grid ${cond ? 'grid-cols-[100px_1fr]' : 'grid-cols-1'} text-xs`}>
                  <div className="bg-yellow-500/15 text-yellow-300 px-3 py-2 font-semibold border-b border-white/10">{tStat('Probability')}</div>
                  {cond && <div className="bg-yellow-500/15 text-yellow-300 px-3 py-2 font-semibold border-b border-white/10">{tStat('Condition')}</div>}
                  <div className="px-3 py-2 text-white">{primary.triggerRate}</div>
                  {cond && <div className="px-3 py-2 text-gray-200">{cond}</div>}
                </div>
              </div>
            )
          })()}

          {/* Buff Effects */}
          {primary.buffs.length > 0 && (
            <div className="rounded-xl bg-white/5 border border-white/10 overflow-hidden">
              <div className="grid grid-cols-[100px_1fr] text-xs">
                <div className="bg-yellow-500/15 text-yellow-300 px-3 py-2 font-semibold border-b border-white/10">{tStat('Probability')}</div>
                <div className="bg-yellow-500/15 text-yellow-300 px-3 py-2 font-semibold border-b border-white/10">{tStat('Buff Effect')}</div>
                {primary.buffs.map((b, i) => (
                  <BuffRow key={i} buff={b} localize={localize} isLast={i === primary.buffs.length - 1} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Enhanced Talents (3 stat lines) ── */}
      {enhanced && enhanced.length > 0 && (
        <div className="pt-3 border-t border-white/10">
          <div className="text-yellow-300 font-semibold text-sm mb-3">{tStat('Enhanced Talents')}</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {enhanced.map((line, i) => {
              // i = 0 → tlt2 (slot 2, ปลดที่ talent level 2), 1 → tlt3 (level 3), 2 → tlt4 (level 4)
              const iconSrc = `/gacha/images/tlt${i + 2}.png`
              const unlocked = talentLevel >= i + 2
              return (
                <div key={i} className={`rounded-lg px-3 py-2.5 flex items-center gap-2 ${unlocked ? 'bg-yellow-400/10 border border-yellow-400/50' : 'bg-white/5 border border-white/10'}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={iconSrc} alt="" className="w-6 h-6 object-contain shrink-0"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  <span className="text-sm text-white truncate flex-1 min-w-0">{localize(line, data.enhancedL?.[i])}</span>
                  {unlocked && (
                    <span className="material-icons-round text-base text-yellow-400 shrink-0">check_circle</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* แสดง raw zh ถ้าใช้ EN/TH (debug — ลบได้ถ้าไม่ต้องการ) */}
    </section>
  )
}

interface BuffRowProps {
  buff: BuffEffect
  localize: (zh: string, official?: Localized | null) => string
  isLast: boolean
}

function BuffRow({ buff, localize, isLast }: BuffRowProps) {
  return (
    <>
      <div className={`px-3 py-2 text-white ${!isLast ? 'border-b border-white/5' : ''}`}>{buff.triggerRate}</div>
      <div className={`px-3 py-2 text-gray-200 ${!isLast ? 'border-b border-white/5' : ''}`}>{localize(buff.effect, buff.effectL)}</div>
    </>
  )
}
