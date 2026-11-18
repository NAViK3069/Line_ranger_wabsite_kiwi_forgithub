'use client'

// ====================================================
// RangerDetailPopup - Popup แสดง Popular Gear ของ Ranger
// ====================================================

import { apiFetch } from '@/lib/staticApi'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import RangerStatPanel from './RangerStatPanel'
import TalentSection from './TalentSection'
import EvolutionSection from './EvolutionSection'
import AwakeningTalentRanking from './AwakeningTalentRanking'
import GearDetailPopup from './GearDetailPopup'
import { useLanguage } from '@/contexts/LanguageContext'
import { useSound } from '@/contexts/SoundContext'

interface GearItem {
  slot: string
  name: string
  iconUrl: string
  grade: number | null
  count: number
}

interface GearRanking {
  WPN: GearItem[]
  AMR: GearItem[]
  ACC: GearItem[]
}

interface GearSet {
  WPN: string
  WPNIcon: string
  AMR: string
  AMRIcon: string
  ACC: string
  ACCIcon: string
  count: number
}

interface RangerDetailResult {
  id: string
  name: string
  imageUrl: string
  gear: GearRanking
  topSets: GearSet[]
  gearFromCache: boolean
  gearLoading: boolean
  usersInLeague: number
  gearSampled: number
}

interface Props {
  rangerId: string
  rangerName: string
  rangerImageUrl: string
  league: number
  totalPlayers: number
  onClose: () => void
}

const SLOT_IMG: Record<string, string> = {
  WPN: '/gacha/images/gear_weapon.png',
  AMR: '/gacha/images/gear_armor.png',
  ACC: '/gacha/images/gear_accessory.png',
}

const SLOT_LABEL_COLOR: Record<string, string> = {
  WPN: 'text-red-400',
  AMR: 'text-blue-400',
  ACC: 'text-purple-400',
}

const SLOT_LABEL: Record<string, string> = {
  WPN: 'Weapon',
  AMR: 'Armor',
  ACC: 'Accessory',
}

const PAGE_SIZE = 5

function GearSlotSection({
  slot,
  items,
  sampled,
  page,
  onSelectGear,
}: {
  slot: string
  items: GearItem[]
  sampled: number
  page: number
  onSelectGear: (gear: GearItem, slot: string) => void
}) {
  const { tGear, tStat } = useLanguage()
  const pageItems = items.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)
  const offset = page * PAGE_SIZE

  if (items.length === 0) {
    return (
      <div>
        <div className="text-xs font-semibold mb-2">
          <span className={`flex items-center gap-1 ${SLOT_LABEL_COLOR[slot]}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={SLOT_IMG[slot]} alt={slot} className="h-4 object-contain" />
            {tStat(SLOT_LABEL[slot])}
          </span>
        </div>
        <div className="text-xs text-gray-600 italic">ไม่มีข้อมูล</div>
      </div>
    )
  }

  const maxCount = items[0].count
  return (
    <div>
      <div className="text-xs font-semibold mb-2">
        <span className={`flex items-center gap-1 ${SLOT_LABEL_COLOR[slot]}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={SLOT_IMG[slot]} alt={slot} className="h-4 object-contain" />
          {SLOT_LABEL[slot]}
        </span>
      </div>
      <div className="space-y-2">
        {pageItems.map((gear, idx) => {
          const pct = sampled > 0 ? ((gear.count / sampled) * 100).toFixed(0) : '0'
          const barPct = maxCount > 0 ? (gear.count / maxCount) * 100 : 0
          return (
            <div
              key={`${slot}-${offset + idx}`}
              className="flex items-center gap-2 cursor-pointer hover:bg-white/5 rounded-lg -mx-1 px-1 py-0.5 transition-colors"
              onClick={() => onSelectGear(gear, slot)}
            >
              <span className="text-xs text-gray-500 w-4 shrink-0">#{offset + idx + 1}</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={gear.iconUrl}
                alt={gear.name}
                className="w-7 h-7 rounded object-contain bg-white/5 shrink-0"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs text-white truncate">{tGear(gear.iconUrl, gear.name)}</span>
                  <span className="text-xs text-gray-400 shrink-0">{gear.count} {tStat('rangers')}</span>
                </div>
                <div className="mt-0.5 h-1 bg-white/10 rounded-full">
                  <div
                    className="h-1 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full"
                    style={{ width: `${barPct}%` }}
                  />
                </div>
              </div>
              <span className="text-xs text-yellow-400 shrink-0 w-8 text-right">{pct}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SetRankIcon({ idx }: { idx: number }) {
  if (idx === 0) return <span className="material-icons-round text-yellow-400 text-xl">looks_one</span>
  if (idx === 1) return <span className="material-icons-round text-gray-300 text-xl">looks_two</span>
  if (idx === 2) return <span className="material-icons-round text-orange-400 text-xl">looks_3</span>
  return <span className="text-gray-500 font-bold text-sm">#{idx + 1}</span>
}

function TopSetsSection({
  sets,
  sampled,
  onSelectGear,
}: {
  sets: GearSet[]
  sampled: number
  onSelectGear: (gear: { name: string; iconUrl: string }, slot: string) => void
}) {
  const { tGear, tStat } = useLanguage()
  if (sets.length === 0) return null
  return (
    <section>
      <h3 className="text-sm font-bold text-gray-300 mb-3 flex items-center gap-2">
        <span className="material-icons-round text-yellow-400">emoji_events</span> {tStat('TOP 5 Popular Sets')}
        <span className="text-xs font-normal text-gray-500">(WPN + AMR + ACC)</span>
      </h3>
      <div className="space-y-3">
        {sets.map((set, idx) => {
          const pct = sampled > 0 ? ((set.count / sampled) * 100).toFixed(1) : '0'
          const rankColors = ['text-yellow-400', 'text-gray-300', 'text-orange-400', 'text-gray-500', 'text-gray-500']
          return (
            <div key={idx} className="bg-white/5 rounded-xl p-2 sm:p-3">
              <div className="flex items-center justify-between mb-2">
                <SetRankIcon idx={idx} />
                <span className={`text-sm font-bold ${rankColors[idx]}`}>
                  {set.count} {tStat('rangers')} ({pct}%)
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1 sm:gap-2">
                {([
                  { slotKey: 'WPN', slotImg: SLOT_IMG.WPN, name: tGear(set.WPNIcon, set.WPN), img: set.WPNIcon },
                  { slotKey: 'AMR', slotImg: SLOT_IMG.AMR, name: tGear(set.AMRIcon, set.AMR), img: set.AMRIcon },
                  { slotKey: 'ACC', slotImg: SLOT_IMG.ACC, name: tGear(set.ACCIcon, set.ACC), img: set.ACCIcon },
                ] as { slotKey: string; slotImg: string; name: string; img: string }[]).map((slot) => (
                  <div
                    key={slot.slotImg}
                    className="flex flex-col items-center gap-1 bg-white/5 rounded-lg p-1 sm:p-2 cursor-pointer hover:bg-white/10 transition-colors"
                    onClick={() => onSelectGear({ name: slot.name, iconUrl: slot.img }, slot.slotKey)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={slot.slotImg} alt="" className="h-5 object-contain" style={{ width: '3rem' }} />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={slot.img}
                      alt={slot.name}
                      className="w-7 h-7 sm:w-8 sm:h-8 object-contain"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                    <span className="text-xs text-gray-300 text-center leading-tight line-clamp-2">{slot.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export default function RangerDetailPopup({
  rangerId,
  rangerName,
  rangerImageUrl,
  league,
  totalPlayers,
  onClose,
}: Props) {
  const { tRanger, tStat } = useLanguage()
  const { play } = useSound()
  const handleClose = () => { play('click_collect_cancel.ogg'); onClose() }

  // ── ร่างที่กำลังเปิดดูอยู่ ──
  // เริ่มจาก prop แต่สลับได้เองผ่าน Evolution (กดร่างอื่น → พับร่างนี้แล้วโหลดร่างนั้นแทนใน popup เดิม)
  // ทุกอย่างใต้ header อ้าง view* ไม่ใช่ prop โดยตรง
  const [viewId, setViewId] = useState(rangerId)
  const [viewName, setViewName] = useState(rangerName)
  useEffect(() => { setViewId(rangerId); setViewName(rangerName) }, [rangerId, rangerName])
  const viewImageUrl = viewId === rangerId
    ? rangerImageUrl
    : `https://rangers.lerico.net/res/${viewId}/${viewId}-thum.png`

  const displayName = tRanger(viewId, viewName)
  const [data, setData] = useState<RangerDetailResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [gearPage, setGearPage] = useState(0)
  // เกียร์ที่กดดู (จาก Gear Ranking per Slot หรือ TOP 5 Popular Sets) — เปิด GearDetailPopup ซ้อนทับ
  const [detailGear, setDetailGear] = useState<{ name: string; iconUrl: string; grade: number | null; slot: string } | null>(null)
  const pollRef = useRef<NodeJS.Timeout | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const scrollBodyTop = () => bodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' })

  useEffect(() => {
    setGearPage(0)
    const fetchDetail = async () => {
      try {
        const res = await apiFetch(`/api/meta/ranger-detail?id=${encodeURIComponent(viewId)}&league=${league}`)
        const json = await res.json()
        if (json.error) throw new Error(json.error)
        setData(json)
        setLoading(false)

        if (json.gearLoading) {
          pollRef.current = setTimeout(fetchDetail, 10000)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
        setLoading(false)
      }
    }

    fetchDetail()
    return () => { if (pollRef.current) clearTimeout(pollRef.current) }
  }, [viewId, league])

  // ── ระดับพรสวรรค์อันดับ 1 จาก Talent Release Status — ใช้ไฮไลท์กรอบทองใน TalentSection อัตโนมัติ
  //    (เหมือน RangerStatPanel ใช้ topAwakenCode ไฮไลท์ Awakening Ability)
  const [topTalentLevel, setTopTalentLevel] = useState(0)
  useEffect(() => {
    apiFetch(`/api/ranger/usage-ranking/${encodeURIComponent(viewId)}?league=${league}`)
      .then(r => r.json())
      .then(d => setTopTalentLevel(d.talentUsage?.[0]?.code ? parseInt(d.talentUsage[0].code, 10) || 0 : 0))
      .catch(() => setTopTalentLevel(0))
  }, [viewId, league])

  // เสียงเปิด popup (ครั้งเดียวตอน mount; ref guard กัน StrictMode เล่นซ้ำ)
  const openedRef = useRef(false)
  useEffect(() => {
    if (openedRef.current) return
    openedRef.current = true
    play('click_collect.ogg')
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose])

  // ล็อก scroll ของ body ทุกขนาดหน้าจอ ขณะ popup เปิด
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const usagePct = totalPlayers > 0 && data
    ? ((data.usersInLeague / totalPlayers) * 100).toFixed(1)
    : '0'

  const maxGearLen = data ? Math.max(data.gear.WPN.length, data.gear.AMR.length, data.gear.ACC.length) : 0
  const totalPages = Math.ceil(maxGearLen / PAGE_SIZE)

  // ── JS measurement: lock popup body height ให้ตัด "ชน" divider แรกใต้ fold พอดี
  //    (Talents ถ้ามี, ไม่งั้น Gear Ranking) — โชว์เส้น divider เต็ม + 6px แล้วตัด ไม่โชว์เนื้อหาถัดไป
  //    วัดจากตำแหน่งจริงของ divider (ไม่ grow-only) → ไม่ค้าง/ไม่พองเกินจากค่าตอนโหลด async
  const mainContentRef = useRef<HTMLDivElement>(null)
  const [bodyMaxHeight, setBodyMaxHeight] = useState<string | undefined>(undefined)

  useLayoutEffect(() => {
    if (!mainContentRef.current || !data || loading) return
    const core = mainContentRef.current
    const bodyEl = core.parentElement
    if (!bodyEl) return
    // คำนวณความสูงที่ควรล็อก = ตัด "ชน" divider แรกใต้ fold พอดี (เผยเส้น divider เต็ม + 6px)
    // หมายเหตุ: ไม่บวก padBottom — เรากำลังตัดกลางเนื้อหา (ไม่ใช่ปลายสุดจริง) padding ล่างของ
    // container จะยังไม่ถูก render ตรงจุดตัดนี้ (มันโผล่แค่ตอนเจอปลายสุดของเนื้อหาจริง) ถ้าบวกไปด้วย
    // จะเผยเนื้อหาเกินมาอีก ~padBottom px (เคยทำให้ "Major Talent" โผล่เกินมา)
    const computeH = (): number | null => {
      const style = window.getComputedStyle(bodyEl)
      const padTop = parseFloat(style.paddingTop) || 0
      const belowFold = core.nextElementSibling as HTMLElement | null
      const firstDivider = belowFold?.querySelector('.flex.items-center') as HTMLElement | null
      const bodyRect = bodyEl.getBoundingClientRect()
      if (firstDivider) {
        const divRect = firstDivider.getBoundingClientRect()
        const divTopInContent = divRect.top - bodyRect.top + bodyEl.scrollTop - padTop
        return divTopInContent + firstDivider.offsetHeight + 6 + padTop
      }
      return core.offsetHeight + padTop
    }
    let lastH = -1
    const apply = () => {
      const h = computeH()
      if (h != null && Math.abs(h - lastH) >= 1) { lastH = h; setBodyMaxHeight(`${Math.round(h)}px`) }
    }
    // 3 กลไกร่วมกันให้ชัวร์ว่าจับตอน RangerStatPanel/TalentSection โหลด stats เสร็จ (async, ช้าได้ถึงหลักวินาที):
    //  1) ResizeObserver จับ core/below-fold โตตอนข้อมูลมา
    //  2) setInterval poll 10 วิ (เวลาจริง ไม่ใช่นับเฟรม — กัน RO ไม่ยิงในบางเคส/tab ไม่ active)
    //  3) window resize เผื่อผู้ใช้ย่อ/ขยายจอ
    const ro = new ResizeObserver(apply)
    ro.observe(core)
    const belowFold = core.nextElementSibling as HTMLElement | null
    if (belowFold) ro.observe(belowFold)
    apply()
    const intervalId = window.setInterval(apply, 200)
    const stopId = window.setTimeout(() => window.clearInterval(intervalId), 10000)
    window.addEventListener('resize', apply)
    return () => {
      ro.disconnect()
      window.clearInterval(intervalId)
      window.clearTimeout(stopId)
      window.removeEventListener('resize', apply)
    }
  }, [data, loading])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}
    >
      <div className="lr-detail-zone card-glass w-full max-h-[90vh] flex flex-col rounded-2xl relative overflow-hidden" style={{ maxWidth: '58rem' }}>
        {/* Close */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors z-10"
        >
          <span className="material-icons-round">close</span>
        </button>

        {/* Header — sticky ที่ด้านบน ไม่ scroll ตาม body */}
        <div className="flex items-center gap-3 p-4 sm:p-6 pb-4 border-b border-white/10 shrink-0">
          <div className="rounded-xl bg-white/5 overflow-hidden shrink-0 flex items-center justify-center" style={{ width: 52, height: 74 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={viewImageUrl}
              alt={displayName}
              style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg sm:text-2xl font-black text-white leading-tight break-words">{displayName}</h2>
            <div className="text-xs text-gray-500 mt-0.5 hidden sm:block">{viewId}</div>
            {data && (
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                <span className="text-xs text-gray-400">
                  {tStat('Used:')}{' '}
                  <span className="text-yellow-400 font-semibold">{data.usersInLeague} {tStat('users')} ({usagePct}%)</span>
                </span>
                <span className="text-xs text-gray-400">
                  Gear:{' '}
                  <span className="text-white font-semibold">{data.gearSampled} {tStat('rangers')}</span>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Content — body scrollable
            maxHeight ถูก lock ด้วย JS ให้เท่ากับความสูงของ mainContentRef
            (= main details ไม่นับ TalentSection) → popup คงขนาดเดิม
            Talent อยู่ใน scroll overflow — user เลื่อนลงดู */}
        <div
          ref={bodyRef}
          className="p-4 sm:p-6 flex-1 overflow-y-auto"
          style={{ maxHeight: bodyMaxHeight }}
        >
          {loading && (
            <div className="text-center py-8">
              <span className="material-icons-round text-5xl text-yellow-400 animate-pulse">sports_mma</span>
              <p className="text-gray-400 text-sm mt-3">{tStat('Fetching Gear data...')}</p>
            </div>
          )}

          {error && (
            <div className="text-red-400 text-sm bg-red-500/10 rounded-xl p-4 flex items-center gap-2">
              <span className="material-icons-round text-red-400">warning</span>
              {error}
            </div>
          )}

          {data && !loading && (
            <>
              {/* Main content area (core = RangerStatPanel) — ล็อกความสูง popup แค่นี้
                  แล้วเผย divider แรกใต้ fold (Talents ถ้ามี, ไม่งั้น Gear Ranking) ให้เห็นชนขอบ */}
              <div ref={mainContentRef}>
              {/* Ranger Detail (stats / skills / abilities / gear loadout) */}
              <RangerStatPanel
                rangerId={viewId}
                rangerName={viewName}
                rangerImageUrl={viewImageUrl}
                topSets={data.topSets}
                gear={data.gear}
              />
              </div>  {/* /mainContentRef = core */}

              {/* ── ใต้ fold (peek): divider แรกโผล่ให้เห็น — pt-1 ให้ offset ใกล้ Spec+ ── */}
              <div className="space-y-6 pt-1">
              {/* Talents — ขึ้นก่อน Gear Ranking (self-hide ถ้าเรนเจอร์ไม่มีพรสวรรค์) */}
              <TalentSection rangerId={viewId} talentLevel={topTalentLevel} />

              {/* Evolution — สายร่างของเรนเจอร์ตัวนี้ กดสลับร่างได้ (self-hide ถ้าไม่มีสาย) */}
              <EvolutionSection
                rangerId={viewId}
                onSelect={(id, name) => {
                  play('click_collect.ogg')
                  setViewId(id)
                  setViewName(name)
                  // เด้งกลับบนสุด — ไม่งั้นค้างอยู่ตรงแถว Evolution ของร่างเดิม
                  scrollBodyTop()
                }}
              />

              {/* Individual Gear Rankings — mt-3 ให้ offset เท่า Talents (พอเป็น divider แรกตอนไม่มีพรสวรรค์) */}
              <section className="mt-3">
                {/* ── Divider: ─── Gear Ranking per Slot ─── (สไตล์เดียวกับ Talents) ── */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex-1 h-px bg-yellow-500/30"></div>
                  <span className="text-yellow-300 font-bold text-xs tracking-wider">{tStat('Gear Ranking per Slot')}</span>
                  <div className="flex-1 h-px bg-yellow-500/30"></div>
                </div>
                {data.gearSampled === 0 ? (
                  <p className="text-xs text-gray-600 italic text-center">{tStat('No Gear data')}</p>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {(['WPN', 'AMR', 'ACC'] as const).map((slot) => (
                        <GearSlotSection
                          key={slot}
                          slot={slot}
                          items={data.gear[slot]}
                          sampled={data.gearSampled}
                          page={gearPage}
                          onSelectGear={(gear, slotKey) => setDetailGear({ name: gear.name, iconUrl: gear.iconUrl, grade: gear.grade, slot: slotKey })}
                        />
                      ))}
                    </div>

                    {/* Page navigation — แสดงเฉพาะถ้ามีมากกว่า 5 รายการ */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-center gap-3 mt-4 pt-3 border-t border-white/10">
                        <button
                          onClick={() => setGearPage((p) => Math.max(0, p - 1))}
                          disabled={gearPage === 0}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-white/10 rounded-lg hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          <span className="material-icons-round text-sm">chevron_left</span> {tStat('Previous')}
                        </button>
                        <span className="text-xs text-gray-400">
                          #{gearPage * PAGE_SIZE + 1}–#{Math.min((gearPage + 1) * PAGE_SIZE, maxGearLen)}
                          <span className="text-gray-600 ml-1">/ {maxGearLen}</span>
                        </span>
                        <button
                          onClick={() => setGearPage((p) => Math.min(totalPages - 1, p + 1))}
                          disabled={gearPage >= totalPages - 1}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-white/10 rounded-lg hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          {tStat('Next')} <span className="material-icons-round text-sm">chevron_right</span>
                        </button>
                      </div>
                    )}
                  </>
                )}
              </section>

              {/* Awakening Ability / Talent usage ranking — จัดอันดับจากผู้เล่นทั้งลีค (self-hide ถ้าเรนเจอร์ไม่มีทั้งคู่) */}
              <AwakeningTalentRanking rangerId={viewId} league={league} />

              {/* Top Sets */}
              {data.topSets.length > 0 && (
                <TopSetsSection
                  sets={data.topSets}
                  sampled={data.gearSampled}
                  onSelectGear={(gear, slotKey) => {
                    // topSets ไม่มี grade ติดมา — หาจาก Gear Ranking per Slot ที่เป็นเกียร์ตัวเดียวกัน (iconUrl ตรงกัน)
                    const grade = data.gear[slotKey as 'WPN' | 'AMR' | 'ACC']?.find((g) => g.iconUrl === gear.iconUrl)?.grade ?? null
                    setDetailGear({ name: gear.name, iconUrl: gear.iconUrl, grade, slot: slotKey })
                  }}
                />
              )}
              </div>  {/* /below-fold wrapper */}
            </>
          )}
        </div>
      </div>

      {/* GearDetailPopup — เปิดตอนกดดูเกียร์จาก Gear Ranking per Slot / TOP 5 Popular Sets — z สูงกว่า popup นี้ */}
      {detailGear && typeof document !== 'undefined' && createPortal(
        <GearDetailPopup
          gearName={detailGear.name}
          gearIconUrl={detailGear.iconUrl}
          gearGrade={detailGear.grade}
          gearSlot={detailGear.slot}
          league={league}
          zIndex={60}
          onClose={() => setDetailGear(null)}
        />,
        document.body
      )}
    </div>
  )
}
