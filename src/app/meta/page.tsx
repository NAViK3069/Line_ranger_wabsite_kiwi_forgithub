'use client'

// ====================================================
// Meta Rangers Page - อันดับ Ranger & Gear ในแต่ละ League
// ====================================================

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/staticApi'
import RangerDetailPopup from '@/components/RangerDetailPopup'
import GearDetailPopup from '@/components/GearDetailPopup'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import { useLanguage } from '@/contexts/LanguageContext'

const LEAGUES = [
  { value: 0,  label: 'Legend',     players: 200 },
  { value: 1,  label: 'Master I',   players: 100 },
  { value: 2,  label: 'Master II',  players: 100 },
  { value: 3,  label: 'Master III', players: 100 },
  { value: 4,  label: 'Diamond I',  players: 100 },
  { value: 5,  label: 'Diamond II', players: 100 },
  { value: 6,  label: 'Diamond III',players: 100 },
  { value: 7,  label: 'Gold I',     players: 100 },
  { value: 8,  label: 'Gold II',    players: 100 },
  { value: 9,  label: 'Gold III',   players: 100 },
  // ตัด Silver Ⅰ–Ⅲ (10–12) กับ Bronze (13) ออก — ต้องตรงกับ LEAGUES ใน lib/pvpScraper.ts
  // ที่นี่มีลิสต์แยกเพราะฝั่ง client ต้องรู้จำนวนผู้เล่นไว้คำนวณ % ก่อนข้อมูลจะมาถึง
]

// ── Types ─────────────────────────────────────────────
interface RangerStat {
  id: string; name: string; imageUrl: string
  count: number; totalCount: number; minRank: number
  // ป้ายในคอลัมน์ Name — เติมมาจากฝั่ง server ตอน refresh (ดู RangerStat ใน pvpScraper)
  grade?: number; evolution?: string; type?: string; element?: string | null
  // เกียร์ที่ใช้มากสุดของแต่ละช่อง (ดู withTopGear ใน pvpScraper)
  topGear?: Partial<Record<'WPN' | 'AMR' | 'ACC', { name: string; iconUrl: string; grade: number | null }>>
}
interface RangersApiResult {
  leagueName: string; rangers: RangerStat[]
  fetchedAt: number; totalPlayers: number
}
interface GearItem {
  slot: string; name: string; iconUrl: string; grade: number | null; count: number
}
interface GearsApiResult {
  gears: GearItem[]; totalSampled: number
}
interface LeagueData {
  rangers: RangersApiResult
  gears: GearsApiResult
}

type GearSlotFilter = 'all' | 'WPN' | 'AMR' | 'ACC'

// ── Helpers ───────────────────────────────────────────
function RankCell({ index }: { index: number }) {
  if (index === 0) return <span className="material-icons-round text-xl text-yellow-400">looks_one</span>
  if (index === 1) return <span className="material-icons-round text-xl text-gray-300">looks_two</span>
  if (index === 2) return <span className="material-icons-round text-xl text-orange-400">looks_3</span>
  return <span className="text-gray-500 font-bold text-sm">#{index + 1}</span>
}

/** แถวเกียร์ใต้ชื่อ — อาวุธ / เกราะ / เครื่องประดับ ที่ใช้มากสุด หน้าตาย่อจากช่องเกียร์ในป๊อปอัพ
 *  (ดาวใต้ไอคอน ไม่มีไอคอนระดับ max) ช่องไหนไม่มีข้อมูลก็ข้าม */
function RangerTopGear({ gear }: { gear?: RangerStat['topGear'] }) {
  const items = (['WPN', 'AMR', 'ACC'] as const).map(slot => gear?.[slot]).filter(Boolean) as
    { name: string; iconUrl: string; grade: number | null }[]
  if (!items.length) return null
  return (
    <div className="flex items-center gap-1.5 mt-1 pb-1.5">
      {items.map((it) => (
          <div key={it.iconUrl} className="relative">
            <div className="w-7 h-7 sm:w-9 sm:h-9 bg-white/5 rounded flex items-center justify-center" title={it.name}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img loading="lazy" decoding="async" src={it.iconUrl} alt={it.name} className="w-6 h-6 sm:w-8 sm:h-8 object-contain"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
            </div>
            {it.grade != null && (
              // eslint-disable-next-line @next/next/no-img-element
              <img loading="lazy" decoding="async" src={`/gacha/images/${it.grade}star.png`} alt={`${it.grade}★`}
                className="absolute left-1/2 -translate-x-1/2 object-contain pointer-events-none h-2 sm:h-2.5"
                style={{ bottom: '-0.4rem' }}
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
            )}
          </div>
      ))}
    </div>
  )
}

const SLOT_IMG: Record<string, string> = {
  WPN: '/gacha/images/gear_weapon.png',
  AMR: '/gacha/images/gear_armor.png',
  ACC: '/gacha/images/gear_accessory.png',
}

const SLOT_BAR: Record<string, string> = {
  WPN: 'from-red-400 to-orange-500',
  AMR: 'from-blue-400 to-cyan-400',
  ACC: 'from-yellow-400 to-amber-500',
}
const STAR_IMG: Record<number, string> = {
  1: '/gacha/images/1star.png', 2: '/gacha/images/2star.png',
  3: '/gacha/images/3star.png', 4: '/gacha/images/4star.png',
  5: '/gacha/images/5star.png', 6: '/gacha/images/6star.png',
  7: '/gacha/images/7star.png', 8: '/gacha/images/8star.png',
  9: '/gacha/images/9star.png',
}

function SlotImage({ slot, className = 'h-4 object-contain' }: { slot: string; className?: string }) {
  const src = SLOT_IMG[slot]
  if (!src) return <span className="text-xs text-gray-400">{slot}</span>
  // eslint-disable-next-line @next/next/no-img-element
  return <img loading="lazy" decoding="async" src={src} alt={slot} className={className} />
}

function StarImage({ grade, className = 'h-3.5 object-contain' }: { grade: number | null; className?: string }) {
  if (!grade) return null
  const src = STAR_IMG[grade]
  if (!src) return null
  // eslint-disable-next-line @next/next/no-img-element
  return <img loading="lazy" decoding="async" src={src} alt={`${grade}★`} className={className} />
}

// ======================================================
// Main Page
// ======================================================
export default function MetaPage() {
  const { t, tStat } = useLanguage()
  const [selectedLeague, setSelectedLeague] = useState(0)
  const [viewMode, setViewMode]             = useState<'rangers' | 'gears'>('rangers')
  const [data, setData]                     = useState<LeagueData | null>(null)
  const [loading, setLoading]               = useState(false)
  const [error, setError]                   = useState('')
  const [progress, setProgress]             = useState<{ done: number; total: number } | null>(null)
  const [selectedRanger, setSelectedRanger] = useState<RangerStat | null>(null)
  const [gearSlot, setGearSlot]             = useState<GearSlotFilter>('all')
  const [selectedGear, setSelectedGear]     = useState<GearItem | null>(null)
  const cache = useRef<Map<number, { data: LeagueData; fetchedAt: number }>>(new Map())
  const CLIENT_TTL = 10 * 60 * 1000 // 10 นาที

  // ── Fetch: อ่านไฟล์ JSON ของลีค ──
  const fetchData = useCallback(async (league: number) => {
    const cached = cache.current.get(league)
    if (cached && Date.now() - cached.fetchedAt < CLIENT_TTL) {
      setData(cached.data)
      setError('')
      return
    }
    setLoading(true)
    setProgress(null)
    setError('')
    setData(null)
    try {
      // ── ข้อมูลลีคถูกเตรียมไว้เป็นไฟล์ JSON ตอน build (static site — ไม่มี SSE แล้ว) ──
      const res = await apiFetch(`/api/meta/rangers?league=${league}`)
      if (!res.ok) throw new Error('ไม่สามารถเชื่อมต่อได้')
      const rangersData = await res.json() as RangersApiResult | null

      if (!rangersData) throw new Error('ไม่ได้รับข้อมูล')

      // gear-ranking อ่านจาก DB ที่ rangers เพิ่งบันทึก
      const gearsRes  = await apiFetch(`/api/meta/gear-ranking?league=${league}`)
      const gearsData = gearsRes.ok
        ? (await gearsRes.json() as GearsApiResult)
        : { gears: [], totalSampled: 0 }

      const combined: LeagueData = { rangers: rangersData, gears: gearsData }
      cache.current.set(league, { data: combined, fetchedAt: Date.now() })
      setData(combined)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
    } finally {
      setLoading(false)
      setProgress(null)
    }
  }, [])

  useEffect(() => { fetchData(selectedLeague) }, [selectedLeague, fetchData])

  const leagueInfo = LEAGUES.find((l) => l.value === selectedLeague) ?? LEAGUES[0]

  const filteredGears = data?.gears.gears.filter(
    (g) => gearSlot === 'all' || g.slot === gearSlot
  ) ?? []

  // นับ total count ต่อ slot สำหรับคำนวณ % ของ Slot
  const slotTotals: Record<string, number> = {}
  for (const g of data?.gears.gears ?? []) {
    slotTotals[g.slot] = (slotTotals[g.slot] ?? 0) + g.count
  }

  // ── Tab button component (compact, for use inside summary bar) ──
  const TabBtn = ({ mode, icon, label }: { mode: 'rangers' | 'gears'; icon: string; label: string }) => (
    <button
      onClick={() => setViewMode(mode)}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold border transition-all ${
        viewMode === mode
          ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40'
          : 'bg-white/5 text-gray-400 border-white/10 hover:text-white hover:bg-white/10'
      }`}
    >
      <span className="material-icons-round text-sm">{icon}</span>
      {label}
    </button>
  )

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="max-w-5xl mx-auto">

        {/* Back + Language */}
        <div className="flex items-center gap-4 mb-8">
          <Link href="/" className="text-gray-400 hover:text-white transition-colors text-sm flex items-center gap-1">
            <span className="material-icons-round text-sm">arrow_back</span>
            {tStat('Back')}
          </Link>
          <div className="ml-auto">
            <LanguageSwitcher />
          </div>
        </div>

        {/* Header */}
        <h1 className="text-3xl md:text-4xl font-black text-center mb-2 flex items-center justify-center gap-3">
          <span className="text-4xl" style={{ filter: 'sepia(1) saturate(3) hue-rotate(5deg) brightness(1.2)' }}>⚔️</span>
          <span className="text-gradient-gold">Meta PVP</span>
        </h1>
        <p className="text-center text-gray-400 mb-8">
          {tStat('Top ranking Ranger & Gear in each League from PVP Tracker')}
        </p>

        {/* League Selector */}
        <div className="card-glass p-6 mb-4">
          <label className="block text-sm text-gray-400 mb-2">{tStat('Select League')}</label>
          <select
            value={selectedLeague}
            onChange={(e) => { setSelectedLeague(Number(e.target.value)) }}
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-purple-500"
          >
            {LEAGUES.map((l) => (
              <option key={l.value} value={l.value} className="bg-gray-900">
                {tStat(l.label)}
              </option>
            ))}
          </select>
        </div>

        {/* Loading */}
        {loading && (
          <div className="card-glass p-8 text-center mb-6">
            <span className="text-5xl animate-pulse" style={{ filter: 'sepia(1) saturate(3) hue-rotate(5deg) brightness(1.2)' }}>⚔️</span>
            <p className="text-white font-semibold text-lg mt-4 mb-1">{tStat('Loading data...')}</p>
            <p className="text-gray-400 text-sm">{leagueInfo.label}</p>
            {progress ? (
              <div className="mt-5 max-w-xs mx-auto">
                <div className="flex justify-between text-xs text-gray-400 mb-1.5">
                  <span>{tStat('Fetching players')}</span>
                  <span className="text-yellow-400 font-semibold">{progress.done} / {progress.total} {tStat('users')}</span>
                </div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-2 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-gray-600 mt-1.5">{Math.round((progress.done / progress.total) * 100)}%</p>
              </div>
            ) : (
              <div className="mt-5 max-w-xs mx-auto">
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-2 bg-white/20 rounded-full animate-pulse w-1/3" />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="card-glass p-4 mb-4 border-red-500/30 bg-red-500/10 flex items-center gap-2">
            <span className="material-icons-round text-red-400">warning</span>
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {/* ── Summary bar + Tab buttons (shown after load) ── */}
        {data && (
          <div className="flex flex-wrap gap-2 mb-4 items-center">
            {/* Tabs */}
            <TabBtn mode="rangers" icon="groups" label="Rangers" />
            <TabBtn mode="gears"   icon="shield"  label="Gears"   />

            {/* Separator */}
            <div className="hidden sm:block h-5 w-px bg-white/15 mx-0.5" />

            {/* Stats — Rangers view */}
            {viewMode === 'rangers' && (
              <>
                <div className="hidden sm:block card-glass px-3 py-1.5 text-sm">
                  <span className="text-gray-400">League: </span>
                  <span className="text-white font-semibold">{tStat(data.rangers.leagueName)}</span>
                </div>
                <div className="hidden sm:block card-glass px-3 py-1.5 text-sm">
                  <span className="text-gray-400">{tStat('Players:')} </span>
                  <span className="text-white font-semibold">{data.rangers.totalPlayers} {tStat('users')}</span>
                </div>
                <div className="hidden sm:block card-glass px-3 py-1.5 text-sm">
                  <span className="text-gray-400">Rangers: </span>
                  <span className="text-white font-semibold">{data.rangers.rangers.length} {tStat('rangers')}</span>
                </div>
              </>
            )}

            {/* Stats — Gears view */}
            {viewMode === 'gears' && (
              <>
                <div className="hidden sm:block card-glass px-3 py-1.5 text-sm">
                  <span className="text-gray-400">League: </span>
                  <span className="text-white font-semibold">{tStat(data.rangers.leagueName)}</span>
                </div>
                <div className="hidden sm:block card-glass px-3 py-1.5 text-sm">
                  <span className="text-gray-400">Gears: </span>
                  <span className="text-white font-semibold">{data.gears.gears.length} {tStat('gears')}</span>
                </div>
                <div className="hidden sm:block card-glass px-3 py-1.5 text-sm">
                  <span className="text-gray-400">{tStat('Data from:')} </span>
                  <span className="text-white font-semibold">{data.gears.totalSampled} {tStat('rangers')}</span>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Rangers View ── */}
        {!loading && data && viewMode === 'rangers' && (
          <div className="card-glass overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10 text-left">
                    <th className="pl-3 pr-1 sm:px-4 py-2 sm:py-3 text-gray-400 text-xs sm:text-sm font-medium">{tStat('Rank')}</th>
                    <th className="px-1 sm:px-4 py-2 sm:py-3 text-gray-400 text-xs sm:text-sm font-medium">{tStat('Img')}</th>
                    <th className="px-1 sm:px-4 py-2 sm:py-3 text-gray-400 text-xs sm:text-sm font-medium">{tStat('Name')}</th>
                    <th className="pl-1 pr-3 sm:px-4 py-2 sm:py-3 text-gray-400 text-xs sm:text-sm font-medium text-right">{tStat('Rangers')}</th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-gray-400 text-xs sm:text-sm font-medium text-right hidden sm:table-cell">{tStat('Users')}</th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-gray-400 text-xs sm:text-sm font-medium text-right hidden sm:table-cell">{tStat('Usage %')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rangers.rangers.map((ranger, index) => {
                    const usagePercent = ((ranger.totalCount / data.rangers.totalPlayers) * 100).toFixed(1)
                    const isTop3 = index < 3
                    return (
                      <tr
                        key={ranger.id}
                        onClick={() => setSelectedRanger(ranger)}
                        className={`border-b border-white/5 hover:bg-white/10 transition-colors cursor-pointer ${isTop3 ? 'bg-yellow-500/5' : ''}`}
                      >
                        <td className="pl-3 pr-1 sm:px-4 py-1 sm:py-3"><RankCell index={index} /></td>
                        <td className="px-1 sm:px-2 py-1">
                          <div className="rounded-lg bg-white/5 overflow-hidden flex items-center justify-center w-9 h-[50px] sm:w-14 sm:h-20">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img loading="lazy" decoding="async" src={ranger.imageUrl} alt={ranger.name}
                              style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                            />
                          </div>
                        </td>
                        <td className="px-1 sm:px-4 py-1 sm:py-3">
                          {/* ชื่อ แล้วต่อด้วยเกียร์ที่ใช้มากสุด 3 ช่อง (แทนป้ายชนิด/ธาตุ/ดาวเดิม) */}
                          <div className="font-medium text-white text-xs sm:text-base leading-tight break-words">{t('unit', `${ranger.id}_nm`, ranger.name)}</div>
                          <RangerTopGear gear={ranger.topGear} />
                        </td>
                        <td className="pl-1 pr-3 sm:px-4 py-1 sm:py-3 text-right whitespace-nowrap">
                          <span className={`font-bold text-xs sm:text-base ${isTop3 ? 'text-yellow-400' : 'text-white'}`}>{ranger.totalCount}</span>
                          <span className="text-gray-400 text-xs sm:text-sm"> {tStat('rangers')}</span>
                        </td>
                        <td className="px-2 sm:px-4 py-1 sm:py-3 text-right hidden sm:table-cell">
                          <span className="font-bold text-white">{ranger.count}</span>
                          <span className="text-gray-400 text-sm"> {tStat('users')}</span>
                        </td>
                        <td className="px-2 sm:px-4 py-1 sm:py-3 text-right hidden sm:table-cell">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-28 bg-white/10 rounded-full h-1.5">
                              <div className="bg-gradient-to-r from-yellow-400 to-orange-500 h-1.5 rounded-full"
                                style={{ width: `${Math.min(parseFloat(usagePercent), 100)}%` }} />
                            </div>
                            <span className={`font-semibold ${isTop3 ? 'text-yellow-400' : 'text-gray-300'}`}>{usagePercent}%</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Gears View ── */}
        {!loading && data && viewMode === 'gears' && (
          <>
            {/* Slot filter */}
            <div className="flex gap-2 mb-4 flex-wrap items-center">
              {(['all', 'WPN', 'AMR', 'ACC'] as GearSlotFilter[]).map((slot) => {
                const activeStyles: Record<GearSlotFilter, string> = {
                  all: 'bg-white/15 text-white border-white/30',
                  WPN: 'bg-red-500/20 text-red-300 border-red-500/40',
                  AMR: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
                  ACC: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40',
                }
                const isActive = gearSlot === slot
                return (
                  <button key={slot} onClick={() => setGearSlot(slot)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold border transition-all ${
                      isActive ? activeStyles[slot] : 'bg-white/5 text-gray-400 border-white/10 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    {slot === 'all' ? 'ทั้งหมด' : (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img loading="lazy" decoding="async" src={SLOT_IMG[slot]} alt={slot} className="h-4 object-contain" />
                        <span>{slot}</span>
                      </>
                    )}
                  </button>
                )
              })}
              <span className="ml-auto text-xs text-gray-500">{filteredGears.length} {tStat('items')}</span>
            </div>

            {filteredGears.length === 0 ? (
              <div className="card-glass p-8 text-center text-gray-400">
                ยังไม่มีข้อมูล Gear ใน League นี้
              </div>
            ) : (
              <div className="card-glass overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/10 text-left">
                        <th className="pl-3 pr-1 sm:px-4 py-2 sm:py-3 text-gray-400 text-xs sm:text-sm font-medium">{tStat('Rank')}</th>
                        <th className="px-1 sm:px-2 py-2 sm:py-3 text-gray-400 text-xs sm:text-sm font-medium">{tStat('Img')}</th>
                        <th className="px-1 sm:px-4 py-2 sm:py-3 text-gray-400 text-xs sm:text-sm font-medium">{tStat('Name')}</th>
                        <th className="px-2 sm:px-4 py-2 sm:py-3 text-gray-400 text-xs sm:text-sm font-medium text-center hidden sm:table-cell">{tStat('Slot')}</th>
                        <th className="pl-1 pr-3 sm:px-4 py-2 sm:py-3 text-gray-400 text-xs sm:text-sm font-medium text-right">{tStat('Count')}</th>
                        <th className="px-2 sm:px-4 py-2 sm:py-3 text-gray-400 text-xs sm:text-sm font-medium text-right hidden sm:table-cell">{tStat('% of Slot')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredGears.map((gear, index) => {
                        const isTop3 = index < 3
                        const slotPct = slotTotals[gear.slot] > 0
                          ? (gear.count / slotTotals[gear.slot]) * 100
                          : 0
                        return (
                          <tr
                            key={`${gear.iconUrl}-${index}`}
                            onClick={() => setSelectedGear(gear)}
                            className={`border-b border-white/5 hover:bg-white/10 transition-colors cursor-pointer ${isTop3 ? 'bg-yellow-500/5' : ''}`}
                          >
                            <td className="pl-3 pr-1 sm:px-4 py-2 sm:py-3"><RankCell index={index} /></td>
                            <td className="px-1 sm:px-2 py-1 sm:py-2">
                              <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-lg bg-white/5 overflow-hidden flex items-center justify-center">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img loading="lazy" decoding="async" src={gear.iconUrl} alt={gear.name}
                                  style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                                />
                              </div>
                            </td>
                            <td className="px-1 sm:px-4 py-2 sm:py-3">
                              <div className="font-medium text-white text-xs sm:text-base leading-snug break-words hover:text-yellow-300 transition-colors">{(() => {
                                const m = gear.iconUrl.match(/\/gear_icon\/(.+)_icon\.png$/)
                                return m ? t('equip', `${m[1]}_nm`, gear.name) : gear.name
                              })()}</div>
                              <div className="flex items-center gap-1.5 mt-1 sm:hidden">
                                <SlotImage slot={gear.slot} className="h-3.5 object-contain" />
                                <StarImage grade={gear.grade} className="h-3 object-contain" />
                              </div>
                            </td>
                            <td className="px-2 sm:px-4 py-2 sm:py-3 text-center hidden sm:table-cell">
                              <div className="flex flex-col items-center gap-1">
                                <SlotImage slot={gear.slot} className="h-5 object-contain" />
                                <StarImage grade={gear.grade} className="h-3.5 object-contain" />
                              </div>
                            </td>
                            <td className="pl-1 pr-3 sm:px-4 py-2 sm:py-3 text-right whitespace-nowrap">
                              <span className={`font-bold text-xs sm:text-base ${isTop3 ? 'text-yellow-400' : 'text-white'}`}>
                                {gear.count}
                              </span>
                              <span className="text-gray-400 text-xs sm:text-sm"> {tStat('gears')}</span>
                            </td>
                            <td className="px-2 sm:px-4 py-2 sm:py-3 text-right hidden sm:table-cell">
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-28 bg-white/10 rounded-full h-1.5">
                                  <div className={`bg-gradient-to-r ${SLOT_BAR[gear.slot] ?? 'from-yellow-400 to-orange-500'} h-1.5 rounded-full`}
                                    style={{ width: `${Math.min(slotPct, 100)}%` }} />
                                </div>
                                <span className={`font-semibold text-sm ${isTop3 ? 'text-yellow-400' : 'text-gray-300'}`}>
                                  {slotPct.toFixed(1)}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* Footer */}
        <p className="text-center text-gray-600 text-xs mt-6">
          ข้อมูลจาก{' '}
          <a href="https://rangers.lerico.net/en/pvp-tracker" target="_blank" rel="noopener noreferrer"
            className="text-gray-500 hover:text-gray-400">
            rangers.lerico.net
          </a>
          {' '}· โหลดครั้งแรกต่อ League / Refresh เพื่ออัปเดต
        </p>
      </div>

      {/* Ranger Detail Popup */}
      {selectedRanger && (
        <RangerDetailPopup
          rangerId={selectedRanger.id} rangerName={selectedRanger.name}
          rangerImageUrl={selectedRanger.imageUrl} league={selectedLeague}
          totalPlayers={data?.rangers.totalPlayers ?? 0}
          onClose={() => setSelectedRanger(null)}
        />
      )}

      {/* Gear Detail Popup */}
      {selectedGear && (
        <GearDetailPopup
          gearName={selectedGear.name} gearIconUrl={selectedGear.iconUrl}
          gearGrade={selectedGear.grade} gearSlot={selectedGear.slot}
          league={selectedLeague} onClose={() => setSelectedGear(null)}
        />
      )}
    </main>
  )
}
