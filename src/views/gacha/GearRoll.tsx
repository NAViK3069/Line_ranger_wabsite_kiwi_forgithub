'use client'
// ====================================================
// Gacha Gear — หน้าสุ่ม (ดึงข้อมูลจาก DB)
// ====================================================

import { apiFetch } from '@/lib/staticApi'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import GearDetailPopup from '@/components/GearDetailPopup'
import BacklightCanvas from '@/components/BacklightCanvas'
import ChestCanvas from '@/components/ChestCanvas'
import RubyAnimation from '@/components/RubyAnimation'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import { useLanguage } from '@/contexts/LanguageContext'
import { useSound } from '@/contexts/SoundContext'
import { fireConfetti } from '@/lib/confettiCelebration'
import { usePageLoading } from '@/lib/pageLoading'

// ─── Types ────────────────────────────────────────
interface GearEntry {
  id: string
  name: string
  grade: string
  rate: number
  type: string
  imgUrl?: string | null
  isChristmas?: boolean
  confetti?: boolean   // ติ๊กในแอดมิน → สุ่มได้ชิ้นนี้แล้วจุดพรุ้กระดาษ
  special?: boolean    // ติ๊กในแอดมิน → ไฮไลท์แถวนี้ในตาราง Gear Drop Rates (แค่ UI ไม่กระทบเรทจริง)
}
interface GuaranteedGearEntry { name: string; grade: string; type?: string; imgUrl?: string | null }
interface HistoryRow          { no: number; gear: GearEntry }
type ChristmasTierRates = Partial<Record<'5' | '6' | '7' | '8', number>>

// ─── Constants ────────────────────────────────────
const GRADE_COLORS: Record<string, string> = {
  '9star':  '#fcc100',
  '8+star': '#65e6ea',
  '8star':  '#de3791',
  '7+star': '#65e6ea',
  '7star':  '#ffffff',
  '6star':  '#ff9900',
  '5star':  '#cc66ff',
}
const TYPE_IMG: Record<string, string> = {
  wpn: '/gacha/images/gear_weapon.png',
  amr: '/gacha/images/gear_armor.png',
  acc: '/gacha/images/gear_accessory.png',
}

// ── Chest: 90 random, 150 random, 200 select ──
const CHEST_THRESHOLDS = [
  { count: 90,  label: 'Gear Random Chest', img: '/gacha/images/random.png', big: '/gacha/images/bigrandom.png', kind: 'random' as const },
  { count: 150, label: 'Gear Random Chest', img: '/gacha/images/random.png', big: '/gacha/images/bigrandom.png', kind: 'random' as const },
  { count: 200, label: 'Gear Select Chest',  img: '/gacha/images/select.png', big: '/gacha/images/bigselect.png', kind: 'select' as const },
]

function getBase(grade: string) {
  if (grade === '9star') return '/gacha/images/tan9.png'
  if (grade === '8+star' || grade === '7+star') return '/gacha/images/tan8+.png'
  return '/gacha/images/tan8.png'
}

// ─── Weighted Random ──────────────────────────────
function weightedRandom(pool: GearEntry[], count: number): GearEntry[] {
  const total = pool.reduce((s, g) => s + g.rate, 0)
  const result: GearEntry[] = []
  for (let i = 0; i < count; i++) {
    let rand = Math.random() * total
    for (const gear of pool) {
      rand -= gear.rate
      if (rand <= 0) { result.push(gear); break }
    }
    if (result.length < i + 1) result.push(pool[pool.length - 1])
  }
  return result
}

// ─── Christmas Guaranteed Slot Pick ───────────────
// ช่องที่ 6 (index 5) ในการสุ่ม 5+1 — บังคับสุ่มเฉพาะเกียร์ที่ติ๊ก isChristmas
// ใช้ tierRates สำหรับเลือกระดับดาวก่อน (normalize แบบน้ำหนัก) แล้วสุ่มภายในระดับนั้นแบบ uniform
function pickChristmasSlot(pool: GearEntry[], tierRates: ChristmasTierRates): GearEntry | null {
  const christmasGears = pool.filter(g => g.isChristmas)
  if (christmasGears.length === 0) return null

  const stars: Array<'5' | '6' | '7' | '8'> = ['5', '6', '7', '8']
  const weights = stars.map(s => Math.max(0, Number(tierRates[s]) || 0))
  const totalWeight = weights.reduce((s, w) => s + w, 0)

  // 1) เลือก tier (ระดับดาว) โดย normalize แบบน้ำหนัก
  let pickedStar: string | null = null
  if (totalWeight > 0) {
    let rand = Math.random() * totalWeight
    for (let i = 0; i < stars.length; i++) {
      rand -= weights[i]
      if (rand <= 0) { pickedStar = stars[i]; break }
    }
    if (!pickedStar) pickedStar = stars[stars.length - 1]
  }

  // 2) กรองเกียร์คริสต์มาสตาม tier — ถ้าไม่มีตัวเลือกใน tier นั้นให้ fallback ไปที่ทั้งหมด
  let candidates: GearEntry[]
  if (pickedStar) {
    candidates = christmasGears.filter(g => g.grade === `${pickedStar}star`)
    if (candidates.length === 0) candidates = christmasGears
  } else {
    // ไม่มี tier rates ตั้งไว้ — เฉลี่ยแบบ uniform ใน christmas pool ทั้งหมด
    candidates = christmasGears
  }
  return candidates[Math.floor(Math.random() * candidates.length)]
}

// ─── Main Component ───────────────────────────────
export default function GachaGearRollPage() {
  const { id } = useParams<{ id: string }>()
  const { tGear, tStat } = useLanguage()
  const { play, playLoop } = useSound()
  const [rolling, setRolling] = useState(false)   // คูลดาวน์ปุ่มสุ่ม 0.5วิ
  const rollingRef = useRef(false)
  // helper สั้นสำหรับแปลชื่อ gear จาก imgUrl
  const tg = (g: { name: string; imgUrl?: string | null }) =>
    g.imgUrl ? tGear(g.imgUrl, g.name) : g.name

  const [poolName, setPoolName]               = useState('')
  const [gears, setGears]                     = useState<GearEntry[]>([])
  const [guaranteedGears, setGuaranteedGears] = useState<GuaranteedGearEntry[]>([])
  const [isChristmas, setIsChristmas]         = useState(false)
  const [christmasTierRates, setChristmasTierRates] = useState<ChristmasTierRates>({})
  const [loading, setLoading]                 = useState(true)
  usePageLoading(loading)
  const [notFound, setNotFound]               = useState(false)
  const [isMobile, setIsMobile]               = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // game state
  const [rubyUsed, setRubyUsed]             = useState(0)
  const [results, setResults]               = useState<GearEntry[]>([])
  const [rollKey, setRollKey]               = useState(0)
  const [history, setHistory]               = useState<HistoryRow[]>([])
  const [historyCounter, setHistoryCounter] = useState(0)
  const [chestPlays, setChestPlays]         = useState(0)
  const [claimedChests, setClaimedChests]   = useState<Set<number>>(new Set())
  const [ownedMap, setOwnedMap]             = useState<Record<string, number>>({})

  // modals
  const [modal, setModal] = useState<
    'none' | 'history' | 'info' | 'chest' | 'random-chest' | 'select-chest' | 'chest-info' | 'confirm-reset'
  >('none')
  const [pendingChest, setPendingChest]     = useState<typeof CHEST_THRESHOLDS[0] | null>(null)
  const [chestResult, setChestResult]       = useState<GuaranteedGearEntry | null>(null)
  const [chestPhase, setChestPhase]         = useState<'ready' | 'start'>('ready')
  const [pendingResult, setPendingResult]   = useState<GuaranteedGearEntry | null>(null)
  const chestAnchorRef = useRef<HTMLDivElement>(null)
  // select chest: 'opening' = โชว์กล่อง SAM, 'selecting' = โชว์ list เกียร์
  const [selectChestPhase, setSelectChestPhase] = useState<'opening' | 'selecting'>('opening')
  const [chestInfoKind, setChestInfoKind]   = useState<'random' | 'select'>('random')
  // บันทึกว่ากล่องไหน (90/150/200) เราได้เกียร์อะไรไป สำหรับโชว์ ✓ ใน Guaranteed Gears popup
  const [chestResults, setChestResults]     = useState<Record<number, string>>({})
  const [chestInfoCount, setChestInfoCount] = useState<number | null>(null)

  // Popup รายละเอียดเกียร์ (effects-only — ไม่โหลด league data)
  const [popupGear, setPopupGear] = useState<{
    name: string; grade: string; type?: string; imgUrl?: string | null
  } | null>(null)
  const openGearDetail = (g: { name: string; grade: string; type?: string; imgUrl?: string | null }) => {
    if (!g.imgUrl) return // ไม่มี icon URL — เปิดไม่ได้
    setPopupGear(g)
  }

  // โหลดข้อมูล pool
  useEffect(() => {
    if (!id) return
    apiFetch(`/api/gacha/gear-pools/${id}`)
      .then((r) => { if (!r.ok) throw new Error('not found'); return r.json() })
      .then((d) => {
        setPoolName(d.name)
        setGears(Array.isArray(d.gears) ? d.gears : [])
        setGuaranteedGears(Array.isArray(d.guaranteedGears) ? d.guaranteedGears : [])
        setIsChristmas(!!d.isChristmas)
        setChristmasTierRates(d.christmasTierRates && typeof d.christmasTierRates === 'object' ? d.christmasTierRates : {})
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [id])

  // ─── Roll: 1 ครั้ง=40, 5+1=200 ──────────────────
  const roll = useCallback((count: 1 | 6) => {
    if (gears.length === 0 || rollingRef.current) return   // กันกดรัว + คูลดาวน์
    rollingRef.current = true
    setRolling(true)
    setTimeout(() => { rollingRef.current = false; setRolling(false) }, 500)
    const cost = count === 1 ? 40 : 200
    setRubyUsed((p) => p - cost)
    // ── ตู้คริสต์มาส: 5 Normal Slots + 1 Guaranteed Slot (สุ่มตำแหน่งคละกัน) ──
    // วิธีนี้แยก logic ชัดเจน ไม่มีการทับกันของเกียร์คริสต์มาสกับ normal slot
    let selected: GearEntry[]
    if (count === 6 && isChristmas) {
      const xmas = pickChristmasSlot(gears, christmasTierRates)
      if (xmas) {
        const normals = weightedRandom(gears, 5) // 5 Normal Slots
        const slotIdx = Math.floor(Math.random() * 6) // 0-5 — ตำแหน่งของ Guaranteed
        selected = []
        let ni = 0
        for (let i = 0; i < 6; i++) {
          selected.push(i === slotIdx ? xmas : normals[ni++])
        }
      } else {
        // ไม่มีเกียร์ติ๊ก Christmas ในตู้ → fallback เป็น roll ปกติ 6 ช่อง
        selected = weightedRandom(gears, count)
      }
    } else {
      selected = weightedRandom(gears, count)
    }
    setResults(selected)
    play('gacha_end.ogg')                    // เสียงตอนผลกาชาออก
    play('ml_voice_gacha_result_en.ogg')     // เสียงพากย์ทับตอนผลออก
    if (selected.some((g) => g.confetti)) fireConfetti()
    setRollKey((k) => k + 1)
    setOwnedMap((prev) => {
      const next = { ...prev }
      selected.forEach((g) => {
        const key = g.name.trim()
        next[key] = (next[key] ?? 0) + 1
      })
      return next
    })
    setHistoryCounter((prev) => {
      const start = prev; const total = selected.length
      setHistory((h) => [
        ...[...selected].reverse().map((g, i) => ({ no: start + total - i, gear: g })),
        ...h,
      ])
      return prev + total
    })
    setChestPlays((p) => p + count)
  }, [gears, isChristmas, christmasTierRates, play])

  const reset = () => {
    setRubyUsed(0); setResults([]); setHistory([])
    setHistoryCounter(0); setChestPlays(0); setClaimedChests(new Set())
    setRollKey(0); setModal('none'); setChestResult(null); setPendingChest(null); setOwnedMap({})
    setChestResults({}); setChestInfoCount(null); setChestPhase('ready'); setPendingResult(null); setSelectChestPhase('opening')
  }

  const addGuaranteedToHistory = (g: GuaranteedGearEntry, rate: number) => {
    const entry: GearEntry = { id: '', name: g.name, grade: g.grade, rate, type: g.type ?? '', imgUrl: g.imgUrl ?? null }
    setHistoryCounter((prev) => {
      setHistory((h) => [{ no: prev + 1, gear: entry }, ...h])
      return prev + 1
    })
    const key = g.name.trim()
    setOwnedMap((prev) => ({ ...prev, [key]: (prev[key] ?? 0) + 1 }))
  }

  const claimChest = (chest: typeof CHEST_THRESHOLDS[0]) => {
    if (claimedChests.has(chest.count) || chestPlays < chest.count) return
    setClaimedChests((p) => new Set([...p, chest.count]))
    setChestResult(null)
    setPendingChest(chest)
    if (chest.kind === 'random') {
      setModal('random-chest')
    } else {
      setSelectChestPhase('opening')
      setChestPhase('ready')
      setModal('select-chest')
    }
    // เสียงกล่อง idle เล่นแบบ loop → จัดการโดย useEffect ด้านล่าง (chestIdle)
  }

  // ─── เสียงกล่อง idle: loop shop_mgacha_start จนกว่าจะเปิดกล่อง/ปิด ───
  useEffect(() => {
    const chestIdle =
      (modal === 'random-chest' && chestResult === null && chestPhase === 'ready') ||
      (modal === 'select-chest' && selectChestPhase === 'opening' && chestPhase === 'ready' && chestResult === null)
    if (!chestIdle) return
    const stop = playLoop('shop_mgacha_start.ogg', 1, 0.5)
    return () => { stop?.() }
  }, [modal, chestPhase, chestResult, selectChestPhase, playLoop])

  // ─── Loading / Not Found ──────────────────────
  if (loading) return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <span className="material-icons-round text-5xl text-gray-600 animate-spin block mb-3">refresh</span>
        <p className="text-gray-400">{tStat('Loading gacha pool...')}</p>
      </div>
    </main>
  )

  if (notFound) return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="card-glass p-10 text-center rounded-2xl max-w-sm">
        <span className="material-icons-round text-6xl text-gray-700 mb-4 block">construction</span>
        <p className="text-white font-bold text-lg mb-2">ไม่พบตู้กาชา</p>
        <p className="text-gray-500 text-sm mb-6">ตู้นี้อาจถูกปิดหรือไม่มีอยู่</p>
        <Link href="/gacha-gear" className="px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold rounded-xl text-sm">
          ← {tStat('Select banner')}
        </Link>
      </div>
    </main>
  )

  const isModalOpen = modal !== 'none'

  return (
    <>
      {/* Overlay */}
      {isModalOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40"
          onClick={() => {
            if (modal === 'history' || modal === 'info' || modal === 'chest') setModal('none')
          }}
        />
      )}

      <main className="min-h-screen pb-12 relative overflow-x-hidden" style={{ background: 'var(--color-dark)' }}>
        {/* Background decorative blobs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
        </div>

        <div className="max-w-5xl mx-auto px-4 pt-4">

          {/* ── Nav ── ปุ่มย้อนกลับ | ชื่อตู้ | เสียง+ภาษา
              จอกว้าง: แถวเดียว ข้างซ้ายขวาเป็น flex-1 เท่ากัน ชื่อตู้จึงอยู่กึ่งกลางแถวจริงๆ
              มือถือ: ชื่อตู้ลงมาอยู่แถวล่างเต็มความกว้าง — ยัดสามอย่างในแถวเดียวแล้ว
              ที่เหลือให้ชื่อไม่ถึง 90px อ่านไม่ออก และปุ่มภาษาโดนบีบจนล้น */}
          <div className="mb-8">
            <div className="flex items-center gap-2">
              <div className="flex-1 flex justify-start">
                <Link href="/gacha-gear" className="text-gray-400 hover:text-white transition-colors flex items-center gap-1 text-sm">
                  <span className="material-icons-round text-sm">arrow_back</span>
                  {tStat('Select banner')}
                </Link>
              </div>
              <p className="hidden sm:block min-w-0 truncate text-center text-gray-500 text-xs font-semibold tracking-wider">{poolName}</p>
              <div className="flex-1 flex justify-end">
                <LanguageSwitcher />
              </div>
            </div>
            <p className="sm:hidden mt-2 truncate text-center text-gray-500 text-xs font-semibold tracking-wider">{poolName}</p>
          </div>

          {/* ── Top Row: Ruby + buttons ── */}
          <div className="flex flex-wrap items-center justify-center gap-2 mb-4">
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-white text-base card-glass border border-cyan-500/50"
              style={{ minWidth: 120 }}>
              <RubyAnimation size={28} />
              <span style={{ fontFamily: 'LineBold' }}>{rubyUsed.toLocaleString()}</span>
            </div>
            <button onClick={() => setModal('confirm-reset')}
              className="px-4 py-2 rounded-xl font-bold text-white text-sm transition hover:scale-105 active:scale-95 bg-red-600 hover:bg-red-500 border border-red-400/50">
              {tStat('Reset')}
            </button>
            <button onClick={() => setModal('info')}
              className="px-4 py-2 rounded-xl font-bold text-sm transition hover:scale-105 active:scale-95 bg-gradient-to-r from-orange-500 to-yellow-500 text-black">
              {tStat('Info')}
            </button>
            <button onClick={() => setModal('history')}
              className="px-4 py-2 rounded-xl font-bold text-sm transition hover:scale-105 active:scale-95 bg-gradient-to-r from-yellow-400 to-orange-400 text-black">
              {tStat('History')}
            </button>
            {(() => {
              const readyCount = CHEST_THRESHOLDS.filter(
                (c) => chestPlays >= c.count && !claimedChests.has(c.count)
              ).length
              return (
                <div className="relative inline-block">
                  <button onClick={() => setModal('chest')}
                    className="px-4 py-2 rounded-xl font-bold text-white text-sm transition hover:scale-105 active:scale-95 bg-gradient-to-r from-cyan-600 to-blue-600">
                    {tStat('Chest')}
                  </button>
                  {readyCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none shadow-lg animate-badge-bounce">
                      {readyCount}
                    </span>
                  )}
                </div>
              )
            })()}
          </div>

          {/* ── Roll Buttons: 1x(40) / 5+1(200) ── */}
          <div className="flex gap-3 justify-center mb-6">
            <button onClick={() => roll(1)} disabled={gears.length === 0 || rolling}
              className="flex-1 max-w-[200px] py-3 rounded-xl font-bold text-black text-sm transition hover:scale-105 active:scale-95 disabled:opacity-40 bg-gradient-to-r from-yellow-400 to-orange-500 shadow-lg">
              1 {tStat('Time')} (40 Ruby)
            </button>
            <button onClick={() => roll(6)} disabled={gears.length === 0 || rolling}
              className="flex-1 max-w-[200px] py-3 rounded-xl font-bold text-white text-sm transition hover:scale-105 active:scale-95 disabled:opacity-40 bg-gradient-to-r from-cyan-600 to-blue-600 shadow-lg">
              5+1 {tStat('Times')} (200 Ruby)
            </button>
          </div>

          {/* ── Result Area ── */}
          {results.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 220 }}>
              <p style={{ color: '#4b5563', fontSize: '0.875rem' }}>{tStat('Press "Roll" to start')}</p>
            </div>
          ) : results.length === 6 ? (
            /* 5+1 = 3+3 grid */
            isMobile ? (
              <div key={`mob-${rollKey}`} className="gacha-result-mobile">
                <div className="gacha-row">
                  {results.slice(0, 3).map((g, i) => <GearCard key={i} gear={g} mobile onClick={() => openGearDetail(g)} />)}
                </div>
                <div className="gacha-row">
                  {results.slice(3).map((g, i) => <GearCard key={i + 3} gear={g} mobile onClick={() => openGearDetail(g)} />)}
                </div>
              </div>
            ) : (
              <div key={rollKey} className="gacha-result-space-grid flex flex-col">
                <div className="gacha-row">
                  {results.slice(0, 3).map((g, i) => <GearCard key={i} gear={g} onClick={() => openGearDetail(g)} />)}
                </div>
                <div className="gacha-row">
                  {results.slice(3).map((g, i) => <GearCard key={i + 3} gear={g} onClick={() => openGearDetail(g)} />)}
                </div>
              </div>
            )
          ) : (
            /* 1 roll */
            <div key={rollKey} className="gacha-result-space">
              {results.map((g, i) => <GearCard key={i} gear={g} mobile={isMobile} onClick={() => openGearDetail(g)} />)}
            </div>
          )}

        </div>
      </main>

      {/* ── Modal: History ── */}
      {modal === 'history' && (
        <GachaModal title="Randomization History" onClose={() => setModal('none')}>
          {history.length === 0
            ? <p className="text-gray-500 text-center py-8">{tStat('No history')}</p>
            : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-400 text-xs border-b border-white/10">
                    <th className="py-2 text-center">#</th>
                    <th className="py-2 text-center">Grade</th>
                    <th className="py-2 text-left pl-2">Gear</th>
                    <th className="py-2 text-right">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h, i) => (
                    <tr key={i}
                      onClick={() => openGearDetail(h.gear)}
                      className="border-b border-white/5 cursor-pointer hover:bg-white/5 transition-colors">
                      <td className="py-2 text-center text-gray-500 text-xs">#{h.no}</td>
                      <td className="py-2 text-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/gacha/images/${h.gear.grade}.png`} alt={h.gear.grade}
                          style={{ height: '1rem' }} className="mx-auto"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                      </td>
                      <td className="py-2 pl-1 sm:pl-2">
                        <div className="flex items-center gap-1.5 sm:gap-2 pl-0 sm:pl-3">
                          {h.gear.imgUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={h.gear.imgUrl} alt={h.gear.name} className="h-8 w-8 object-contain shrink-0"
                              style={{ maxWidth: 'none' }}
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                          )}
                          {h.gear.type && TYPE_IMG[h.gear.type] && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={TYPE_IMG[h.gear.type]} alt={h.gear.type} className="h-5 object-contain shrink-0 hidden sm:inline"
                              style={{ width: '2rem' }}
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                          )}
                          <span className="text-white text-xs">{tg(h.gear)}</span>
                        </div>
                      </td>
                      <td className="py-2 text-right font-mono text-yellow-400 text-xs">{h.gear.rate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </GachaModal>
      )}

      {/* ── Modal: Info (Drop Rates) ── */}
      {modal === 'info' && (
        <GachaModal title="Gear Drop Rates" onClose={() => setModal('none')} headerAction={rubyUsed !== 0 ? (
          <div className="flex items-center gap-1 px-2 py-1 rounded-lg font-bold text-white text-xs card-glass border border-pink-500/50">
            <RubyAnimation size={16} />
            <span style={{ fontFamily: 'LineBold' }}>{rubyUsed.toLocaleString()}</span>
          </div>
        ) : undefined}>
          <table className="w-full text-sm table-fixed">
            <colgroup>
              <col style={{ width: '70px' }} />
              <col />
              <col style={{ width: '40px' }} />
              <col style={{ width: '18%' }} />
            </colgroup>
            <thead>
              <tr className="text-gray-400 text-xs border-b border-white/10">
                <th className="py-2 text-center">Grade</th>
                <th className="py-2 text-left pl-2">Gear</th>
                <th className="py-2 text-center">Own</th>
                <th className="py-2 text-right pr-2">Rate</th>
              </tr>
            </thead>
            <tbody>
              {gears.map((g, i) => {
                const ownCount = ownedMap[g.name.trim()] ?? 0
                return (
                  <tr key={i}
                    onClick={() => openGearDetail(g)}
                    className="border-b border-white/5 cursor-pointer hover:bg-white/5 transition-colors"
                    style={g.special ? {
                      background: 'linear-gradient(90deg, rgba(250,204,21,0.14), rgba(250,204,21,0.05))',
                    } : undefined}>
                    <td className="py-2 text-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/gacha/images/${g.grade}.png`} alt={g.grade}
                        style={{ height: '1rem' }} className="mx-auto"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                    </td>
                    <td className="py-2 pl-1 sm:pl-2 overflow-hidden">
                      <div className="flex items-center gap-1.5 sm:gap-2 pl-0 sm:pl-3 min-w-0">
                        {g.imgUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={g.imgUrl} alt={g.name} className="h-8 w-8 object-contain shrink-0"
                            style={{ maxWidth: 'none' }}
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                        )}
                        {TYPE_IMG[g.type] && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={TYPE_IMG[g.type]} alt={g.type} className="h-5 object-contain shrink-0 hidden sm:inline"
                            style={{ width: '2rem' }}
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                        )}
                        <span className="text-white text-xs truncate min-w-0">{tg(g)}</span>
                      </div>
                    </td>
                    <td className="py-2 text-center whitespace-nowrap">
                      {ownCount > 0 && (
                        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-lg font-bold text-green-300 border border-green-500/50"
                          style={{ fontSize: '0.85rem', fontFamily: 'monospace', background: 'linear-gradient(135deg,#0a2518,#12381e,#0a2518)', minWidth: '2.2rem' }}>
                          {ownCount > 99 ? '99+' : ownCount}
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-right pr-2 font-mono text-yellow-400 text-xs">{g.rate}%</td>
                  </tr>
                )
              })}

              {/* ── Gear จาก Chest ที่ไม่อยู่ใน pool ปกติ ── */}
              {(() => {
                const poolNames = new Set(gears.map((g) => g.name.trim()))
                const chestOwned = Object.entries(ownedMap).filter(([name]) => !poolNames.has(name.trim()))
                if (chestOwned.length === 0) return null
                return (
                  <>
                    <tr>
                      <td colSpan={4} className="pt-4 pb-1">
                        <div className="flex items-center gap-2 text-gray-500 text-xs">
                          <div className="flex-1 h-px bg-white/10" />
                          🎁 จาก Chest
                          <div className="flex-1 h-px bg-white/10" />
                        </div>
                      </td>
                    </tr>
                    {chestOwned.map(([name, ownCount], i) => {
                      const meta = guaranteedGears.find((g) => g.name === name)
                      return (
                        <tr key={`chest-${i}`}
                          onClick={() => meta && openGearDetail({ name: meta.name, grade: meta.grade, type: meta.type, imgUrl: meta.imgUrl })}
                          className={`border-b border-white/5 ${meta ? 'cursor-pointer hover:bg-white/5 transition-colors' : ''}`}>
                          <td className="py-2 text-center">
                            {meta && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={`/gacha/images/${meta.grade}.png`} alt={meta.grade}
                                style={{ height: '1rem' }} className="mx-auto"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                            )}
                          </td>
                          <td className="py-2 pl-1 sm:pl-2 overflow-hidden">
                            <div className="flex items-center gap-1.5 sm:gap-2 pl-0 sm:pl-3">
                              {meta?.imgUrl && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={meta.imgUrl} alt={name} className="h-8 w-8 object-contain shrink-0"
                                  style={{ maxWidth: 'none' }}
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                              )}
                              {meta?.type && TYPE_IMG[meta.type] && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={TYPE_IMG[meta.type]} alt={meta.type} className="h-5 object-contain shrink-0 hidden sm:inline"
                                  style={{ width: '2rem' }}
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                              )}
                              <span className="text-white text-xs truncate min-w-0">{name}</span>
                            </div>
                          </td>
                          <td className="py-2 text-center whitespace-nowrap">
                            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-lg font-bold text-green-300 border border-green-500/50"
                              style={{ fontSize: '0.85rem', fontFamily: 'monospace', background: 'linear-gradient(135deg,#0a2518,#12381e,#0a2518)', minWidth: '2.2rem' }}>
                              {ownCount > 99 ? '99+' : ownCount}
                            </span>
                          </td>
                          <td className="py-2 text-right pr-2 font-mono text-gray-500 text-xs">Chest</td>
                        </tr>
                      )
                    })}
                  </>
                )
              })()}
            </tbody>
          </table>
        </GachaModal>
      )}

      {/* ── Modal: Chest (Pity) ── */}
      {modal === 'chest' && (
        <GachaModal title="Pity Gacha Gear" onClose={() => setModal('none')}>
          <div className="space-y-3">
            {CHEST_THRESHOLDS.map((c) => {
              const progress = Math.min(chestPlays, c.count)
              const pct = (progress / c.count) * 100
              const claimed = claimedChests.has(c.count)
              const canClaim = chestPlays >= c.count && !claimed
              return (
                <div key={c.count}
                  onClick={() => { setChestInfoKind(c.kind); setChestInfoCount(c.count); setModal('chest-info') }}
                  className="flex items-center gap-3 rounded-xl p-3 cursor-pointer hover:bg-white/5 transition-colors"
                  style={{ background: '#11121c' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/gacha/images/chestlogo.png" alt="chest" className="w-14 h-auto shrink-0"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-xs font-bold mb-0.5">{tStat('When achieving')} {c.count} {tStat('time')}</p>
                    <div className="flex items-center gap-2 text-xs text-gray-400 text-left">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={c.img} alt="" className="w-5 h-5"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                      {tStat(c.label)} (x1)
                    </div>
                  </div>
                  <div className="text-center shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => claimChest(c)}
                      disabled={!canClaim}
                      className="px-7 py-1.5 rounded-full font-bold text-sm mb-1.5 transition disabled:opacity-40"
                      style={{ background: canClaim ? '#00e676' : '#555', border: '3px solid #1d8f3a', color: 'white' }}>
                      {claimed ? '✓' : tStat('Go')}
                    </button>
                    <div className="relative w-20 h-3.5 rounded-full overflow-hidden" style={{ background: '#333', border: '1px solid #1d1d1d' }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: '#00e676' }} />
                      <span className="absolute inset-0 flex items-center justify-center text-white text-[9px] font-bold">{progress}/{c.count}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </GachaModal>
      )}

      {/* ── Modal: Random Chest ── */}
      {modal === 'random-chest' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={chestResult !== null ? () => { setModal('none'); setChestResult(null); setChestPhase('ready') } : undefined}>
          <div className={`rounded-2xl ${chestResult === null ? 'pt-8 pb-14' : 'p-8'} px-8 flex flex-col items-center ${isMobile ? 'gap-2' : 'gap-4'} text-center`}
            style={{ background: '#13102a', border: '3px solid #cbff3f', minWidth: 280 }}
            onClick={(e) => e.stopPropagation()}>
            {chestResult === null ? (
              <>
                <p className="text-yellow-300 font-bold text-lg">{tStat(pendingChest?.label ?? 'Gear Random Chest')}</p>
                <div ref={chestAnchorRef} className="relative w-32 h-32 flex items-center justify-center mt-4">
                  <ChestCanvas
                    kind={pendingChest?.kind ?? 'random'}
                    phase={chestPhase}
                    anchorRef={chestAnchorRef}
                    onStartComplete={() => {
                      play('arena_gacha_get_meffect.mp3')   // เสียงผลกล่องออก
                      setChestResult(pendingResult)
                      setPendingResult(null)
                      setChestPhase('ready')
                    }}
                    style={{
                      position: 'fixed',
                      top: 0, left: 0,
                      width: '100vw', height: '100vh',
                      zIndex: 9999, pointerEvents: 'none',
                    }}
                  />
                  <button
                    onClick={() => {
                      if (guaranteedGears.length === 0 || chestPhase === 'start') return
                      const picked = guaranteedGears[Math.floor(Math.random() * guaranteedGears.length)]
                      addGuaranteedToHistory(picked, +(100 / guaranteedGears.length).toFixed(2))
                      if (pendingChest) setChestResults(prev => ({ ...prev, [pendingChest.count]: picked.name }))
                      setPendingResult(picked)
                      play('shop_mgacha_open.ogg')   // เสียงกล่องกำลังเปิด
                      setChestPhase('start')
                    }}
                    className="absolute inset-0 transition hover:scale-110 active:scale-95"
                  />
                </div>
              </>
            ) : (
              <>
                <p className="text-yellow-300 font-bold text-lg">{tStat('You got!')}</p>
                <div className="chest-card-wrap" style={{ display: 'flex', justifyContent: 'center', padding: '0' }}>
                  <GearCard
                    gear={{ id: '', name: chestResult.name, grade: chestResult.grade, rate: 100, type: chestResult.type ?? '', imgUrl: chestResult.imgUrl ?? null }}
                    onClick={() => openGearDetail({ name: chestResult.name, grade: chestResult.grade, type: chestResult.type, imgUrl: chestResult.imgUrl })}
                  />
                </div>
                <p className="text-white font-bold mt-2">{chestResult.name}</p>
                <button onClick={() => { setModal('none'); setChestResult(null); setChestPhase('ready') }}
                  className="mt-2 px-6 py-2 rounded-full font-bold text-sm text-white transition hover:opacity-80"
                  style={{ background: '#0e6ba8' }}>
                  {tStat('Close')}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Modal: Select Chest ── */}
      {modal === 'select-chest' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={chestResult !== null ? () => setModal('none') : undefined}>
          {/* ── phase: opening — แสดงกล่อง SAM ก่อนเลือกเกียร์ ── */}
          {chestResult === null && selectChestPhase === 'opening' ? (
            <div className="rounded-2xl pt-8 pb-14 px-8 flex flex-col items-center gap-4 text-center"
              style={{ background: '#13102a', border: '3px solid #cbff3f', minWidth: 280 }}
              onClick={(e) => e.stopPropagation()}>
              <p className="text-yellow-300 font-bold text-lg">{tStat('Gear Select Chest')}</p>
              <div ref={chestAnchorRef} className="relative w-32 h-32 flex items-center justify-center mt-4">
                <ChestCanvas
                  kind="select"
                  phase={chestPhase}
                  anchorRef={chestAnchorRef}
                  onStartComplete={() => {
                    play('arena_gacha_get_meffect.mp3')   // เสียงตอนหน้าเลือกโผล่
                    setChestPhase('ready')
                    setSelectChestPhase('selecting')
                  }}
                  style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 9999, pointerEvents: 'none' }}
                />
                <button
                  onClick={() => {
                    if (chestPhase === 'start') return
                    play('shop_mgacha_open.ogg')   // เสียงกล่องกำลังเปิด
                    setChestPhase('start')
                  }}
                  className="absolute inset-0 transition hover:scale-110 active:scale-95"
                />
              </div>
            </div>
          ) : chestResult === null ? (
            /* ── phase: selecting — list เกียร์ให้เลือก ── */
            <div className="rounded-2xl flex flex-col"
              style={{ background: '#13102a', border: '3px solid #cbff3f', width: '75vw', maxWidth: '75vw', maxHeight: '85vh' }}>
              <div className="px-5 py-3 shrink-0 border-b border-white/10">
                <h2 className="text-gradient-gold font-black text-center">{tStat('Gear Select Chest')}</h2>
              </div>
              <div className="overflow-y-auto flex-1 p-4" style={{ overflowX: 'hidden' }}>
                {guaranteedGears.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">ไม่มี Gear การันตีในตู้นี้</p>
                ) : (
                  <div className="flex flex-wrap justify-center select-chest-list" style={{ gap: '10px' }}>
                    {guaranteedGears.map((g, i) => (
                      <div key={i} className="flex flex-col items-center select-chest-item"
                        style={{ marginTop: 10, marginBottom: isMobile ? 0 : 10, minHeight: isMobile ? 'auto' : 220 }}>
                        {/* GearCard + ชื่อ flex-1 ดัน Select ลงล่างเสมอ */}
                        <GearCard gear={{ id: '', name: g.name, grade: g.grade, rate: 100, type: g.type ?? '', imgUrl: g.imgUrl ?? null }}
                          onClick={() => openGearDetail({ name: g.name, grade: g.grade, type: g.type, imgUrl: g.imgUrl })} />
                        <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', paddingTop: isMobile ? 0 : 8, width: '100%', justifyContent: 'center' }}>
                          <p className="text-white text-xs text-center max-w-[100px] leading-tight">{g.name}</p>
                        </div>
                        <button
                          onClick={() => {
                            addGuaranteedToHistory(g, 100)
                            play('arena_gacha_get_meffect.mp3')   // เสียงผลกล่องออก (เลือกแล้ว)
                            setChestResult(g)
                            if (pendingChest) setChestResults(prev => ({ ...prev, [pendingChest.count]: g.name }))
                          }}
                          className="px-5 py-1.5 rounded-full font-bold text-white text-sm transition hover:scale-105 active:scale-95"
                          style={{ background: '#00c853', border: '2px solid #1b5e20', ...(isMobile ? { marginTop: 10 } : {}) }}>
                          Select
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className={`rounded-2xl p-8 flex flex-col items-center ${isMobile ? 'gap-2' : 'gap-4'} text-center`}
              style={{ background: '#13102a', border: '3px solid #cbff3f', minWidth: 280 }}
              onClick={(e) => e.stopPropagation()}>
              <p className="text-yellow-300 font-bold text-lg">{tStat('You got!')}</p>
              <div className="chest-card-wrap" style={{ display: 'flex', justifyContent: 'center', padding: '0' }}>
                <GearCard
                  gear={{ id: '', name: chestResult.name, grade: chestResult.grade, rate: 100, type: chestResult.type ?? '', imgUrl: chestResult.imgUrl ?? null }}
                  onClick={() => openGearDetail({ name: chestResult.name, grade: chestResult.grade, type: chestResult.type, imgUrl: chestResult.imgUrl })}
                />
              </div>
              <p className="text-white font-bold mt-2">{chestResult.name}</p>
              <button onClick={() => setModal('none')}
                className="mt-2 px-6 py-2 rounded-full font-bold text-sm text-white transition hover:opacity-80"
                style={{ background: '#0e6ba8' }}>
                {tStat('Close')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Modal: Confirm Reset ── */}
      {modal === 'confirm-reset' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setModal('none')} />
          <div className="relative z-10 pointer-events-auto rounded-2xl p-7 max-w-xs w-full text-center shadow-2xl border border-red-500/30"
            style={{ background: '#13102a' }}>
            <span className="material-icons-round text-red-400 text-5xl mb-3 block">refresh</span>
            <h2 className="text-white font-bold text-lg mb-2">รีเซ็ตประวัติการสุ่ม?</h2>
            <p className="text-gray-400 text-sm mb-6">ประวัติ, ของสะสม และความคืบหน้า Chest<br/>จะถูกล้างทั้งหมด</p>
            <div className="flex gap-3">
              <button onClick={() => setModal('none')}
                className="flex-1 py-2.5 rounded-xl text-gray-300 text-sm transition hover:bg-white/10"
                style={{ background: 'rgba(255,255,255,0.08)' }}>
                ยกเลิก
              </button>
              <button onClick={() => { reset(); setModal('none') }}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-semibold transition">
                รีเซ็ต
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Chest Info ── */}
      {modal === 'chest-info' && (
        <GachaModal title="Guaranteed Gears" onClose={() => setModal('chest')}>
          {guaranteedGears.length === 0 ? (
            <p className="text-gray-500 text-center py-8">ไม่มี Gear การันตีในตู้นี้</p>
          ) : (() => {
            const resultName = chestInfoCount !== null ? chestResults[chestInfoCount] : undefined
            return (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-400 text-xs border-b border-white/10">
                    <th className="py-2 text-center">Grade</th>
                    <th className="py-2 text-left pl-2">Gear</th>
                    <th className="py-2 text-center">Result</th>
                    <th className="py-2 text-right">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {guaranteedGears.map((g, i) => {
                    const isResult = resultName === g.name
                    return (
                      <tr key={i}
                        onClick={() => openGearDetail({ name: g.name, grade: g.grade, type: g.type, imgUrl: g.imgUrl })}
                        className="border-b border-white/5 cursor-pointer hover:bg-white/5 transition-colors">
                        <td className="py-2 text-center">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`/gacha/images/${g.grade}.png`} alt={g.grade}
                            style={{ height: '1rem' }} className="mx-auto"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                        </td>
                        <td className="py-2 pl-1 sm:pl-2">
                          <div className="flex items-center gap-1.5 sm:gap-2 pl-0 sm:pl-3">
                            {g.imgUrl && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={g.imgUrl} alt={g.name} className="h-8 w-8 object-contain shrink-0"
                                style={{ maxWidth: 'none' }}
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                            )}
                            <span className="text-white text-xs">{tg(g)}</span>
                          </div>
                        </td>
                        <td className="py-2 text-center whitespace-nowrap">
                          {isResult && (
                            <span className="inline-flex items-center justify-center rounded-lg font-bold text-green-300 border border-green-500/50"
                              style={{ fontSize: '0.85rem', padding: '0.1rem 0.6rem', background: 'linear-gradient(135deg,#0a2518,#12381e,#0a2518)', minWidth: '2.2rem' }}>
                              ✓
                            </span>
                          )}
                        </td>
                        <td className="py-2 text-right font-mono text-yellow-400 text-xs">
                          {chestInfoKind === 'random'
                            ? `${+(100 / guaranteedGears.length).toFixed(1)}%`
                            : '100%'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )
          })()}
        </GachaModal>
      )}

      {/* ── Gear Detail Popup (effects-only — ไม่แสดงข้อมูล league, ระดับ +0) ── */}
      {popupGear && popupGear.imgUrl && (
        <GearDetailPopup
          gearName={popupGear.name}
          gearIconUrl={popupGear.imgUrl}
          gearGrade={popupGear.grade}
          gearSlot={(popupGear.type ?? '').toUpperCase()}
          league={0}
          hideRangerUsage
          effectLevel={0}
          onClose={() => setPopupGear(null)}
        />
      )}
    </>
  )
}

// ─── GearCard ─────────────────────────────────────
// โครงสร้าง: light effect → gear image → stars → type icon badge
// (ไม่มี ranger-base)
function GearCard({ gear, mobile, onClick }: { gear: GearEntry; mobile?: boolean; onClick?: () => void }) {
  const color = GRADE_COLORS[gear.grade] ?? '#fff'
  const baseClass = mobile ? 'result-ranger-mob animate-bounce-mob gear-card' : 'result-ranger animate-bounce-in gear-card'
  const outerClass = onClick ? `${baseClass} cursor-pointer` : baseClass

  // ขนาดเท่ากันทั้ง desktop และ mobile (card width มือถือ 30% ≈ 117px ≈ desktop 120px)
  const gearSize   = 65   // px
  const gearBottom = 40   // px
  const starW      = '70%'
  const starBot    = 30   // px
  const badgeW     = '4.6rem'
  const badgeBot   = -5   // px

  return (
    <div className={outerClass} onClick={onClick}>
      {/* ① Light effect — SAM animation จาก fx02-backlight-01 */}
      <BacklightCanvas className="light-effect" />

      {/* ② รูปเกียร์ — ตรงกลาง-บน */}
      {gear.imgUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={gear.imgUrl}
          alt={gear.name}
          className="gear-img"
          style={{
            position: 'absolute',
            bottom: gearBottom,
            left: '50%',
            transform: 'translateX(-50%)',
            width: gearSize,
            height: gearSize,
            objectFit: 'contain',
            zIndex: 2,
            maxWidth: 'none',
          }}
          onError={(e) => {
            const el = e.target as HTMLImageElement
            el.style.display = 'none'
            const txt = document.createElement('div')
            txt.style.cssText = `position:absolute;bottom:${gearBottom}px;left:50%;transform:translateX(-50%);color:${color};font-weight:bold;font-size:0.45rem;text-align:center;width:${gearSize + 16}px;line-height:1.2;z-index:2`
            txt.textContent = gear.name
            el.parentNode?.insertBefore(txt, el.nextSibling)
          }}
        />
      ) : (
        <div style={{
          position: 'absolute',
          bottom: gearBottom,
          left: '50%',
          transform: 'translateX(-50%)',
          color,
          fontWeight: 'bold',
          fontSize: '0.45rem',
          textAlign: 'center',
          width: gearSize + 16,
          lineHeight: 1.2,
          zIndex: 2,
        }}>
          {gear.name}
        </div>
      )}

      {/* ③ Stars — ดาวระดับ */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/gacha/images/${gear.grade}.png`}
        alt={gear.grade}
        className="gear-stars"
        style={{
          position: 'absolute',
          bottom: starBot,
          left: '50%',
          transform: 'translateX(-50%)',
          width: starW,
          height: 'auto',
          zIndex: 3,
          maxWidth: 'none',
        }}
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
      />

      {/* ④ Type icon badge — ล่างสุด */}
      {gear.type && TYPE_IMG[gear.type] && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={TYPE_IMG[gear.type]}
          alt={gear.type}
          className="gear-badge"
          style={{
            position: 'absolute',
            bottom: badgeBot,
            left: '50%',
            transform: 'translateX(-50%)',
            width: badgeW,
            height: 'auto',
            objectFit: 'contain',
            zIndex: 4,
            maxWidth: 'none',
          }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
      )}
    </div>
  )
}

// ─── Modal wrapper ────────────────────────────────
function GachaModal({ title, onClose, children, headerAction }: {
  title: string
  onClose: () => void
  children: React.ReactNode
  headerAction?: React.ReactNode
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-lg rounded-2xl shadow-2xl flex flex-col border border-cyan-500/50"
        style={{ maxHeight: '85vh', background: '#13102a' }}>
        <div className="flex items-center justify-between px-3 sm:px-5 py-3 shrink-0 border-b border-white/10">
          <h2 className="text-gradient-gold font-black text-sm sm:text-base">{title}</h2>
          <div className="flex items-center gap-2 sm:gap-4">
            {headerAction}
            <button onClick={onClose}
              className="px-3 py-1 rounded-lg text-white font-bold text-sm transition hover:opacity-80"
              style={{ background: '#ff4d4d' }}>✕</button>
          </div>
        </div>
        <div className="overflow-y-auto px-2 sm:px-5 py-3 flex-1"
          style={{ scrollbarWidth: 'thin', scrollbarColor: '#3798c7 transparent' }}>
          {children}
        </div>
      </div>
    </div>
  )
}
