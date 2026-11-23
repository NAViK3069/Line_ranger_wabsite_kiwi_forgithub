'use client'

// ====================================================
// AwakeningTalentRanking — จัดอันดับ Awakening Ability / Talent stage
// ที่ผู้เล่นทั้งลีคเลือกใช้ (จาก warmycat usage*.json, ข้อมูลทั้งหมด ไม่ใช่แค่ top N)
//
// ประหยัดทรัพยากร: เช็คก่อนว่าเรนเจอร์มี Awakening (9★) / Talent จริงไหม ผ่าน endpoint
// ที่ cache ไว้อยู่แล้ว (awakening, talents) ก่อนค่อยขอ usage-ranking — ถ้าไม่มีทั้งคู่
// จะไม่ยิง request ขอ usage-ranking เลย
// ====================================================

import { apiFetch } from '@/lib/staticApi'
import { useEffect, useState } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'
import type { AwakenAbility } from '@/server/api/ranger/awakening/[id]/route'

interface UsageEntry { code: string; count: number; rate: number }
interface UsageData { awakeningUsage: UsageEntry[]; talentUsage: UsageEntry[] }

const TALENT_STAGE_ICON: Record<string, string> = {
  '0': '/gacha/images/tltno.png',
  '1': '/gacha/images/tlt1.png',
  '2': '/gacha/images/tlt2.png',
  '3': '/gacha/images/tlt3.png',
  '4': '/gacha/images/tlt4.png',
}
const TALENT_STAGE_LABEL: Record<string, string> = {
  '0': 'Not Unlocked',
  '1': 'Talent Stage 1',
  '2': 'Talent Stage 2',
  '3': 'Talent Stage 3',
  '4': 'Talent Stage 4',
}

interface Props {
  rangerId: string
  league: number
}

function RankBar({ children, pct, barClass }: { children: React.ReactNode; pct: number; barClass: string }) {
  return (
    <div className="flex-1 min-w-0">
      {children}
      <div className="mt-1 h-1.5 bg-white/10 rounded-full">
        <div className={`h-1.5 rounded-full ${barClass}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  )
}

export default function AwakeningTalentRanking({ rangerId, league }: Props) {
  const { lang, tAbility, tStat } = useLanguage()
  const [abilities, setAbilities] = useState<AwakenAbility[]>([])
  const [hasTalent, setHasTalent] = useState(false)
  const [checked, setChecked] = useState(false)
  const [usage, setUsage] = useState<UsageData | null>(null)

  // ── 1) เช็คคุณสมบัติเรนเจอร์ก่อน (endpoint cache 7-30 วันอยู่แล้ว — แทบไม่เสียทรัพยากรเพิ่ม) ──
  useEffect(() => {
    let cancelled = false
    setChecked(false); setUsage(null); setAbilities([]); setHasTalent(false)

    Promise.all([
      apiFetch(`/api/ranger/awakening/${encodeURIComponent(rangerId)}`).then((r) => r.json()).catch(() => ({ abilities: [] })),
      apiFetch(`/api/ranger/talents/${encodeURIComponent(rangerId)}`).then((r) => r.json()).catch(() => ({ hasTalent: false })),
    ]).then(([aw, tal]) => {
      if (cancelled) return
      setAbilities(Array.isArray(aw.abilities) ? aw.abilities : [])
      setHasTalent(!!tal.hasTalent)
      setChecked(true)
    })

    return () => { cancelled = true }
  }, [rangerId])

  // ── 2) มีคุณสมบัติอย่างใดอย่างหนึ่งจริง → ค่อยขอ usage ranking (ไม่งั้นไม่ขอเลย) ──
  useEffect(() => {
    if (!checked) return
    if (abilities.length === 0 && !hasTalent) return
    let cancelled = false
    apiFetch(`/api/ranger/usage-ranking/${encodeURIComponent(rangerId)}?league=${league}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setUsage(d) })
      .catch(() => { if (!cancelled) setUsage(null) })
    return () => { cancelled = true }
  }, [checked, abilities.length, hasTalent, rangerId, league])

  if (!checked || (abilities.length === 0 && !hasTalent) || !usage) return null

  const abilityByCode = new Map(abilities.map((a) => [a.code, a]))
  const showAwaken = abilities.length > 0 && usage.awakeningUsage.length > 0
  const showTalent = hasTalent && usage.talentUsage.length > 0
  if (!showAwaken && !showTalent) return null

  return (
    <>
      {showAwaken && (
        <section>
          <h3 className="text-sm font-bold text-gray-300 mb-3 flex items-center gap-2">
            <span className="material-icons-round text-purple-400">auto_awesome</span>
            {tStat('Awakening Ability Usage')}
          </h3>
          <div className="space-y-3 bg-white/5 rounded-xl p-2 sm:p-3">
            {usage.awakeningUsage.map((u) => {
              const ab = abilityByCode.get(u.code)
              const name = ab ? (lang === 'en' ? (ab.nameEn || ab.nameZh) : tAbility(ab.code, ab.nameZh)) : u.code
              return (
                <div key={u.code} className="flex items-center gap-2">
                  {ab?.iconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img loading="lazy" decoding="async"
                      src={ab.iconUrl}
                      alt={name}
                      className="w-8 h-8 rounded object-contain bg-white/5 shrink-0"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                  ) : <span className="w-8 h-8 shrink-0" />}
                  <RankBar pct={u.rate} barClass="bg-gradient-to-r from-purple-400 to-blue-500">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs text-white truncate">{name}</span>
                      <span className="text-xs text-purple-300 font-semibold shrink-0">{u.rate.toFixed(2)}%</span>
                    </div>
                  </RankBar>
                  <span className="text-[10px] text-gray-500 shrink-0 w-14 text-right">{u.count} {tStat('Unit')}</span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {showTalent && (
        <section>
          <h3 className="text-sm font-bold text-gray-300 mb-3 flex items-center gap-2">
            <span className="material-icons-round text-yellow-400">workspace_premium</span>
            {tStat('Talent Release Status')}
          </h3>
          <div className="space-y-3 bg-white/5 rounded-xl p-2 sm:p-3">
            {usage.talentUsage.map((u) => (
              <div key={u.code} className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img loading="lazy" decoding="async"
                  src={TALENT_STAGE_ICON[u.code] ?? '/gacha/images/tltno.png'}
                  alt=""
                  className="w-8 h-8 rounded object-contain bg-white/5 shrink-0"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
                <RankBar pct={u.rate} barClass="bg-gradient-to-r from-yellow-400 to-orange-500">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs text-white truncate">{tStat(TALENT_STAGE_LABEL[u.code] ?? u.code)}</span>
                    <span className="text-xs text-yellow-400 font-semibold shrink-0">{u.rate.toFixed(2)}%</span>
                  </div>
                </RankBar>
                <span className="text-[10px] text-gray-500 shrink-0 w-14 text-right">{u.count} {tStat('Unit')}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  )
}
