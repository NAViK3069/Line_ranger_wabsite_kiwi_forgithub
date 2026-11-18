'use client'
// ====================================================
// Gacha Ranger — หน้าสุ่ม (ดึงข้อมูลจาก DB)
// ====================================================

import { apiFetch } from '@/lib/staticApi'
import { useEffect, useState, useCallback, useRef, useContext, createContext } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import GachaRangerDetailPopup from '@/components/GachaRangerDetailPopup'
import BacklightCanvas from '@/components/BacklightCanvas'
import ChestCanvas from '@/components/ChestCanvas'
import RubyAnimation from '@/components/RubyAnimation'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import { useLanguage } from '@/contexts/LanguageContext'
import { useSound } from '@/contexts/SoundContext'
import { fireConfetti } from '@/lib/confettiCelebration'

// extract unitCode จาก imgUrl เช่น
// https://rangers.lerico.net/res/u1556e-af/u1556e-af-thum.png → "u1556e-af"
function extractRangerId(imgUrl?: string | null): string | null {
  if (!imgUrl) return null
  const m = imgUrl.match(/\/res\/([a-z0-9][a-z0-9_\-]+)\/[a-z0-9_\-]+-thum\.png$/i)
  return m ? m[1] : null
}

// ─── Types ────────────────────────────────────────
interface RangerEntry     {
  name: string; grade: string; rate: number; imgUrl?: string | null
  confetti?: boolean   // ติ๊กในแอดมิน → สุ่มได้เรนเจอร์นี้แล้วจุดพรุ้กระดาษ
  special?: boolean    // ติ๊กในแอดมิน → ไฮไลท์แถวนี้ในตาราง Ranger Drop Rates (แค่ UI ไม่กระทบเรทจริง)
}
interface GuaranteedEntry { name: string; grade: string; imgUrl?: string | null }
interface HistoryRow      { no: number; ranger: RangerEntry }

// ธาตุ (element) ของเรนเจอร์ — โหลดครั้งเดียวจาก /api/ranger-book (bulk, cache 24h)
// แล้วแชร์ผ่าน Context ให้ RangerCard lookup โดยไม่ต้องยิง API ต่อตัว
const ElementMapContext = createContext<Record<string, { element: string | null; elementOpen: string | null }>>({})
const ELEMENT_ICON: Record<string, string> = {
  fire: '/gacha/images/Fire.png',
  water: '/gacha/images/Water.png',
  wood: '/gacha/images/Tree.png',
  light: '/gacha/images/Light.png',
  dark: '/gacha/images/Dark.png',
}

// ─── Constants ────────────────────────────────────
const GRADE_COLORS: Record<string, string> = {
  '9star':  '#fcc100',
  '8+star': '#65e6ea',
  '8#star': '#4ade80',
  '8star':  '#de3791',
  '7+star': '#65e6ea',
  '7star':  '#ffffff',
}
const GRADE_BG: Record<string, string> = {
  '9star':  'border-[#fcc100] bg-[#2a2a2a]',
  '8+star': 'border-[#65e6ea] bg-[#1f1d55]',
  '8#star': 'border-[#4ade80] bg-[#0a2a14]',
  '8star':  'border-[#de3791] bg-[#420d37]',
  '7+star': 'border-[#65e6ea] bg-[#1f1d55]',
  '7star':  'border-white/30 bg-[#1a1a2e]',
}
function gradeImgSrc(grade: string) {
  return `/gacha/images/${grade.replace('#', '%23')}.png`
}
function getBase(grade: string) {
  if (grade === '9star') return '/gacha/images/tan9.png'
  if (grade === '8+star' || grade === '7+star') return '/gacha/images/tan8+.png'
  if (grade === '8#star') return '/gacha/images/tan8%23.png'
  return '/gacha/images/tan8.png'
}
const CHEST_THRESHOLDS = [
  { count: 100, label: 'Rangers Random Chest', img: '/gacha/images/random.png', mini: '/gacha/images/bigrandom.png' },
  { count: 200, label: 'Rangers Select Chest', img: '/gacha/images/select.png', mini: '/gacha/images/bigselect.png' },
]

// ─── Weighted Random ──────────────────────────────
function weightedRandom(pool: RangerEntry[], count: number): RangerEntry[] {
  const total = pool.reduce((s, r) => s + r.rate, 0)
  const result: RangerEntry[] = []
  for (let i = 0; i < count; i++) {
    let rand = Math.random() * total
    for (const ranger of pool) {
      rand -= ranger.rate
      if (rand <= 0) { result.push(ranger); break }
    }
    if (result.length < i + 1) result.push(pool[pool.length - 1])
  }
  return result
}

// ─── Main Component ───────────────────────────────
export default function GachaRollPage() {
  const { id } = useParams<{ id: string }>()
  const { tRanger, tStat } = useLanguage()
  const { play, playLoop } = useSound()
  const [rolling, setRolling] = useState(false)   // คูลดาวน์ปุ่มสุ่ม 0.5วิ
  const rollingRef = useRef(false)
  // helper สั้นสำหรับแปลชื่อ ranger จาก imgUrl
  const tr = (r: { name: string; imgUrl?: string | null }) => {
    const rid = extractRangerId(r.imgUrl)
    return rid ? tRanger(rid, r.name) : r.name
  }

  const [poolName, setPoolName] = useState('')
  const [rangers, setRangers] = useState<RangerEntry[]>([])
  const [guaranteedRangers, setGuaranteedRangers] = useState<GuaranteedEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [isFrog, setIsFrog] = useState(false)
  const [elementMap, setElementMap] = useState<Record<string, { element: string | null; elementOpen: string | null }>>({})

  // โหลด element + elementOpen ของเรนเจอร์ทั้งหมดครั้งเดียว (id + name → ข้อมูล) สำหรับ badge ธาตุ
  // elementOpen "1" = ยังไม่เปิดช่องธาตุ (ไม่แสดง badge เหมือนไร้ธาตุ), "2" = เปิดแล้ว (แสดงปกติ)
  useEffect(() => {
    apiFetch('/api/ranger-book')
      .then((r) => r.json())
      .then((d) => {
        const map: Record<string, { element: string | null; elementOpen: string | null }> = {}
        for (const r of (d.rangers ?? [])) {
          const entry = { element: r.element ?? null, elementOpen: r.elementOpen ?? null }
          map[r.id] = entry
          map[r.name] = entry
        }
        setElementMap(map)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // game state
  const [rubyUsed, setRubyUsed] = useState(0)
  const [results, setResults] = useState<RangerEntry[]>([])
  const [rollKey, setRollKey] = useState(0)   // force re-mount cards ทุกครั้งที่สุ่ม
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [historyCounter, setHistoryCounter] = useState(0)
  const [chestPlays, setChestPlays] = useState(0)            // นับรอบ 6+1
  const [claimedChests, setClaimedChests] = useState<Set<number>>(new Set())
  const [ownedMap, setOwnedMap] = useState<Record<string, number>>({})

  // ranger detail popup (กดรูปเรนเจอร์เพื่อดู stat)
  const [detailRanger, setDetailRanger] = useState<RangerEntry | null>(null)

  // modals
  const [modal, setModal] = useState<'none' | 'history' | 'info' | 'chest' | 'random-chest' | 'random-result' | 'select-chest' | 'chest-info' | 'confirm-reset'>('none')
  const [infoExpanded, setInfoExpanded] = useState(true)
  const [chestResult, setChestResult]     = useState<GuaranteedEntry | null>(null)
  const [chestPhase, setChestPhase]       = useState<'ready' | 'start'>('ready')
  const [pendingResult, setPendingResult] = useState<GuaranteedEntry | null>(null)
  const chestAnchorRef = useRef<HTMLDivElement>(null)
  const [selectChestPhase, setSelectChestPhase] = useState<'opening' | 'selecting'>('opening')
  const [chestInfoType, setChestInfoType] = useState<'random' | 'select'>('random')
  // บันทึกว่ากล่องไหนเราได้ ranger อะไรไป สำหรับโชว์ ✓ ใน Guaranteed Rangers popup
  const [chestResults, setChestResults] = useState<Record<number, string>>({})
  const [chestInfoCount, setChestInfoCount] = useState<number | null>(null)
  const [pendingChest, setPendingChest] = useState<{ count: number; kind: 'random' | 'select' } | null>(null)

  // โหลดข้อมูล pool
  useEffect(() => {
    if (!id) return
    apiFetch(`/api/gacha/pools/${id}`)
      .then((r) => { if (!r.ok) throw new Error('not found'); return r.json() })
      .then((d) => {
        setPoolName(d.name)
        setRangers(Array.isArray(d.rangers) ? d.rangers : [])
        setGuaranteedRangers(Array.isArray(d.guaranteedRangers) ? d.guaranteedRangers : [])
        setIsFrog(d.isFrog ?? false)
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [id])

  // ─── Roll ──────────────────────────────────────
  const roll = useCallback((count: 1 | 3 | 7) => {
    if (rangers.length === 0 || rollingRef.current) return   // กันกดรัว + คูลดาวน์
    rollingRef.current = true
    setRolling(true)
    setTimeout(() => { rollingRef.current = false; setRolling(false) }, 500)
    const cost = count === 1 ? 50 : count === 3 ? 200 : 300
    setRubyUsed((p) => p - cost)
    const selected = weightedRandom(rangers, count)
    setResults(selected)
    play('gacha_end.ogg')                    // เสียงตอนผลกาชาออก
    play('ml_voice_gacha_result_en.ogg')     // เสียงพากย์ทับตอนผลออก
    if (selected.some((r) => r.confetti)) fireConfetti()
    setRollKey((k) => k + 1)
    setOwnedMap((prev) => {
      const next = { ...prev }
      selected.forEach((r) => { next[r.name] = (next[r.name] ?? 0) + 1 })
      return next
    })
    setHistoryCounter((prev) => {
      const start = prev
      const total = selected.length
      // prepend ใหม่ก่อน (ตัวที่ no สูงสุดขึ้นก่อน → ลำดับ newest first)
      setHistory((h) => [
        ...[...selected].reverse().map((r, i) => ({ no: start + total - i, ranger: r })),
        ...h,
      ])
      return prev + total
    })
    setChestPlays((p) => p + count)
  }, [rangers, play])

  const reset = () => {
    setRubyUsed(0); setResults([]); setHistory([])
    setHistoryCounter(0); setChestPlays(0); setClaimedChests(new Set())
    setRollKey(0); setModal('none'); setChestResult(null); setOwnedMap({})
    setChestResults({}); setChestInfoCount(null); setPendingChest(null); setSelectChestPhase('opening')
  }

  const addGuaranteedToHistory = (g: GuaranteedEntry, rate: number) => {
    const entry: RangerEntry = { name: g.name, grade: g.grade, rate, imgUrl: g.imgUrl ?? null }
    setHistoryCounter((prev) => {
      setHistory((h) => [{ no: prev + 1, ranger: entry }, ...h])
      return prev + 1
    })
    setOwnedMap((prev) => ({ ...prev, [g.name]: (prev[g.name] ?? 0) + 1 }))
  }

  const claimChest = (threshold: number) => {
    if (claimedChests.has(threshold) || chestPlays < threshold) return
    const chest = CHEST_THRESHOLDS.find((c) => c.count === threshold)
    if (!chest) return
    setClaimedChests((p) => new Set([...p, threshold]))
    setChestResult(null)
    const kind: 'random' | 'select' = chest.label.includes('Random') ? 'random' : 'select'
    setPendingChest({ count: threshold, kind })
    if (kind === 'random') {
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
        <span className="material-icons-round text-6xl text-gray-700 mb-4 block">casino</span>
        <p className="text-white font-bold text-lg mb-2">ไม่พบตู้กาชา</p>
        <p className="text-gray-500 text-sm mb-6">ตู้นี้อาจถูกปิดหรือไม่มีอยู่</p>
        <Link href="/gacha-ranger" className="px-6 py-2.5 bg-gradient-to-r from-yellow-500 to-orange-500 text-black font-bold rounded-xl text-sm">
          ← {tStat('Select banner')}
        </Link>
      </div>
    </main>
  )

  const isModalOpen = modal !== 'none'

  return (
    <ElementMapContext.Provider value={elementMap}>
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
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl" />
        </div>

        <div className="max-w-5xl mx-auto px-4 pt-4">

          {/* ── Nav ── ปุ่มย้อนกลับ | ชื่อตู้ | เสียง+ภาษา
              จอกว้าง: แถวเดียว ข้างซ้ายขวาเป็น flex-1 เท่ากัน ชื่อตู้จึงอยู่กึ่งกลางแถวจริงๆ
              มือถือ: ชื่อตู้ลงมาอยู่แถวล่างเต็มความกว้าง — ยัดสามอย่างในแถวเดียวแล้ว
              ที่เหลือให้ชื่อไม่ถึง 90px อ่านไม่ออก และปุ่มภาษาโดนบีบจนล้น */}
          <div className="mb-8">
            <div className="flex items-center gap-2">
              <div className="flex-1 flex justify-start">
                <Link href="/gacha-ranger" className="text-gray-400 hover:text-white transition-colors flex items-center gap-1 text-sm">
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

          {/* ── Top Row: Ruby + Info buttons ── */}
          <div className="flex flex-wrap items-center justify-center gap-2 mb-4">
            {/* Ruby box */}
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-white text-base card-glass border border-pink-500/50"
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
            {!isFrog && (() => {
              const readyCount = CHEST_THRESHOLDS.filter(
                (c) => chestPlays >= c.count && !claimedChests.has(c.count)
              ).length
              return (
                <div className="relative inline-block">
                  <button onClick={() => setModal('chest')}
                    className="px-4 py-2 rounded-xl font-bold text-white text-sm transition hover:scale-105 active:scale-95 bg-gradient-to-r from-purple-600 to-pink-600">
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

          {/* ── Roll Buttons ── */}
          <div className="flex gap-3 justify-center mb-6">
            {!isFrog && (
              <button onClick={() => roll(1)} disabled={rangers.length === 0 || rolling}
                className="flex-1 max-w-[200px] py-3 rounded-xl font-bold text-black text-sm transition hover:scale-105 active:scale-95 disabled:opacity-40 bg-gradient-to-r from-yellow-400 to-orange-500 shadow-lg">
                1 {tStat('Time')} (50 Ruby)
              </button>
            )}
            <button onClick={() => isFrog ? roll(3) : roll(7)} disabled={rangers.length === 0 || rolling}
              className="flex-1 max-w-[200px] py-3 rounded-xl font-bold text-white text-sm transition hover:scale-105 active:scale-95 disabled:opacity-40 bg-gradient-to-r from-purple-600 to-cyan-500 shadow-lg">
              {isFrog ? `2+1 ${tStat('Times')} (200 Ruby)` : `6+1 ${tStat('Times')} (300 Ruby)`}
            </button>
          </div>

          {/* ── Result Area ── */}
          {results.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 220 }}>
              <p style={{ color: '#4b5563', fontSize: '0.875rem' }}>{tStat('Press "Roll" to start')}</p>
            </div>
          ) : results.length === 3 ? (
            isMobile ? (
              /* Mobile frog: แถวเดียว 3 ตัว */
              <div key={`mob-${rollKey}`} className="gacha-result-mobile gacha-result-mobile-ranger">
                <div className="gacha-row">
                  {results.map((r, i) => <RangerCard key={i} ranger={r} mobile onSelect={setDetailRanger} />)}
                </div>
              </div>
            ) : (
              /* Desktop frog: ปกติ */
              <div key={rollKey} className="gacha-result-space">
                {results.map((r, i) => <RangerCard key={i} ranger={r} onSelect={setDetailRanger} />)}
              </div>
            )
          ) : results.length === 7 ? (
            isMobile ? (
              /* Mobile only: 3+3+1 */
              <div key={`mob-${rollKey}`} className="gacha-result-mobile gacha-result-mobile-ranger">
                <div className="gacha-row">
                  {results.slice(0, 3).map((r, i) => <RangerCard key={i} ranger={r} mobile onSelect={setDetailRanger} />)}
                </div>
                <div className="gacha-row">
                  {results.slice(3, 6).map((r, i) => <RangerCard key={i + 3} ranger={r} mobile onSelect={setDetailRanger} />)}
                </div>
                <div className="gacha-row">
                  {results.slice(6).map((r, i) => <RangerCard key={i + 6} ranger={r} mobile onSelect={setDetailRanger} />)}
                </div>
              </div>
            ) : (
              /* Desktop only: 4+3 */
              <div key={rollKey} className="gacha-result-space-grid flex flex-col">
                <div className="gacha-row">
                  {results.slice(0, 4).map((r, i) => <RangerCard key={i} ranger={r} onSelect={setDetailRanger} />)}
                </div>
                <div className="gacha-row">
                  {results.slice(4).map((r, i) => <RangerCard key={i + 4} ranger={r} onSelect={setDetailRanger} />)}
                </div>
              </div>
            )
          ) : (
            <div key={rollKey} className="gacha-result-space">
              {results.map((r, i) => <RangerCard key={i} ranger={r} onSelect={setDetailRanger} />)}
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
                    <th className="py-2 text-left pl-2">Ranger</th>
                    <th className="py-2 text-right">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h, i) => (
                    <tr key={i} className="border-b border-white/5 cursor-pointer hover:bg-white/5 transition-colors"
                      onClick={() => { if (extractRangerId(h.ranger.imgUrl)) setDetailRanger(h.ranger) }}>
                      <td className="py-2 text-center text-gray-500 text-xs">#{h.no}</td>
                      <td className="py-2 text-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={gradeImgSrc(h.ranger.grade)} alt={h.ranger.grade}
                          style={{ height: '1rem' }} className="mx-auto"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                      </td>
                      <td className="py-2 pl-1 sm:pl-2">
                        <div className="flex items-center gap-1.5 sm:gap-2 pl-0 sm:pl-3">
                          {h.ranger.imgUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={h.ranger.imgUrl} alt={h.ranger.name} className="h-9 w-9 object-contain shrink-0"
                              style={{ maxWidth: 'none' }}
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                          )}
                          <span className="text-white text-xs">{tr(h.ranger)}</span>
                        </div>
                      </td>
                      <td className="py-2 text-right font-mono text-yellow-400 text-xs">{h.ranger.rate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </GachaModal>
      )}

      {/* ── Modal: Info (Drop Rates) ── */}
      {modal === 'info' && (() => {
        // กลุ่ม base name สำหรับตู้กบ (ตัดส่วนท้าย เช่น "(AGI)", "(INT)", "(STR)")
        const getBaseName = (name: string) => name.replace(/\s*\([^)]*\)\s*$/, '').trim()

        type DisplayRow = { key: string; ranger: RangerEntry; ownCount: number; baseName: string; displayRate: number }
        let displayRows: DisplayRow[]

        if (isFrog && !infoExpanded) {
          // collapsed: รวมกลุ่มตาม base name (รวมทั้ง own และ rate)
          const seen = new Map<string, DisplayRow>()
          rangers.forEach((r) => {
            const base = getBaseName(r.name)
            if (!seen.has(base)) {
              seen.set(base, { key: base, ranger: r, ownCount: ownedMap[r.name] ?? 0, baseName: base, displayRate: r.rate })
            } else {
              seen.get(base)!.ownCount += ownedMap[r.name] ?? 0
              seen.get(base)!.displayRate += r.rate
            }
          })
          displayRows = Array.from(seen.values())
        } else {
          displayRows = rangers.map((r) => ({
            key: r.name,
            ranger: r,
            ownCount: ownedMap[r.name] ?? 0,
            baseName: getBaseName(r.name),
            displayRate: r.rate,
          }))
        }

        const toggleBtn = isFrog ? (
          <button
            onClick={() => setInfoExpanded((v) => !v)}
            className="px-3 py-1 rounded-lg text-white font-bold text-xs transition hover:opacity-80"
            style={{ background: infoExpanded ? '#3b3b6a' : '#1a5c3a' }}
          >
            {infoExpanded ? tStat('Collapse') : tStat('Expand')}
          </button>
        ) : undefined

        const rubyBadge = rubyUsed !== 0 ? (
          <div className="flex items-center gap-1 px-2 py-1 rounded-lg font-bold text-white text-xs card-glass border border-pink-500/50">
            <RubyAnimation size={16} />
            <span style={{ fontFamily: 'LineBold' }}>{rubyUsed.toLocaleString()}</span>
          </div>
        ) : null

        return (
          <GachaModal title="Ranger Drop Rates" onClose={() => setModal('none')} headerAction={<>{rubyBadge}{toggleBtn}</>}>
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
                  <th className="py-2 text-left pl-2">Ranger</th>
                  <th className="py-2 text-center">Own</th>
                  <th className="py-2 text-right pr-2">Rate</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((row) => (
                  <tr key={row.key} className="border-b border-white/5 cursor-pointer hover:bg-white/5 transition-colors"
                    onClick={() => { if (extractRangerId(row.ranger.imgUrl)) setDetailRanger(row.ranger) }}
                    style={row.ranger.special ? {
                      background: 'linear-gradient(90deg, rgba(250,204,21,0.14), rgba(250,204,21,0.05))',
                    } : undefined}>
                    <td className="py-2 text-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={gradeImgSrc(row.ranger.grade)} alt={row.ranger.grade}
                        style={{ height: '1rem' }} className="mx-auto"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                    </td>
                    <td className="py-2 pl-1 sm:pl-2 overflow-hidden">
                      <div className="flex items-center gap-1.5 sm:gap-2 pl-0 sm:pl-3 min-w-0">
                        {row.ranger.imgUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={row.ranger.imgUrl} alt={row.baseName} className="h-9 w-9 object-contain shrink-0"
                            style={{ maxWidth: 'none' }}
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                        )}
                        <span className="text-white text-xs truncate min-w-0">{isFrog && !infoExpanded ? row.baseName : tr(row.ranger)}</span>
                      </div>
                    </td>
                    <td className="py-2 text-center whitespace-nowrap">
                      {row.ownCount > 0 && (
                        <span
                          className="inline-flex items-center justify-center px-2 py-0.5 rounded-lg font-bold text-green-300 border border-green-500/50"
                          style={{
                            fontSize: '0.85rem',
                            fontFamily: 'monospace',
                            background: 'linear-gradient(135deg, #0a2518 0%, #12381e 50%, #0a2518 100%)',
                            minWidth: '2.2rem',
                          }}
                        >
                          {row.ownCount > 99 ? '99+' : row.ownCount}
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-right pr-2 font-mono text-yellow-400 text-xs">{row.displayRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </GachaModal>
        )
      })()}

      {/* ── Modal: Chest (Pity) ── */}
      {modal === 'chest' && (
        <GachaModal title="Pity Gacha Ranger" onClose={() => setModal('none')}>
          <div className="space-y-3">
            {CHEST_THRESHOLDS.map((c) => {
              const progress = Math.min(chestPlays, c.count)
              const pct = (progress / c.count) * 100
              const claimed = claimedChests.has(c.count)
              const canClaim = chestPlays >= c.count && !claimed
              return (
                <div key={c.count}
                  onClick={() => { setChestInfoType(c.label.includes('Random') ? 'random' : 'select'); setChestInfoCount(c.count); setModal('chest-info') }}
                  className="flex items-center gap-3 rounded-xl p-3 cursor-pointer hover:bg-white/5 transition-colors"
                  style={{ background: '#11121c' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/gacha/images/chestlogo.png" alt="chest" className="w-14 h-auto shrink-0"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-xs font-bold mb-0.5">{tStat('When achieving')} {c.count} {tStat('time')}</p>
                    {/* คลิกที่การ์ดทั้งใบเพื่อดูข้อมูล guaranteed rangers */}
                    <div className="flex items-center gap-2 text-xs text-gray-400 text-left">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={c.img} alt="" className="w-5 h-5"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                      {tStat(c.label)} (x1)
                    </div>
                  </div>
                  <div className="text-center shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => claimChest(c.count)}
                      disabled={!canClaim}
                      className="px-7 py-1.5 rounded-full font-bold text-sm mb-1.5 transition disabled:opacity-40"
                      style={{ background: canClaim ? '#00e676' : '#555', border: '3px solid #1d8f3a', color: 'white' }}>
                      {claimed ? '✓' : tStat('Go')}
                    </button>
                    {/* Progress bar */}
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

      {/* ── Modal: Random Chest — คลิกกล่องเพื่อสุ่ม ── */}
      {modal === 'random-chest' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={chestResult !== null ? () => setModal('none') : undefined}>
          <div className={`rounded-2xl ${chestResult === null ? 'pt-8 pb-14' : 'p-8'} px-8 flex flex-col items-center ${isMobile ? 'gap-2' : 'gap-4'} text-center`}
            style={{ background: '#13102a', border: '3px solid #cbff3f', minWidth: 280 }}
            onClick={(e) => e.stopPropagation()}>
            {chestResult === null ? (
              <>
                <p className="text-yellow-300 font-bold text-lg">{tStat('Rangers Random Chest')}</p>
                {/* คลิกกล่องเพื่อเปิด */}
                {/* hitbox — anchorRef ใช้ล็อคตำแหน่ง ChestCanvas ให้ตรงนี้เสมอ */}
                <div ref={chestAnchorRef} className="relative w-32 h-32 flex items-center justify-center mt-4">
                  <ChestCanvas
                    kind="random"
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
                      if (guaranteedRangers.length === 0 || chestPhase === 'start') return
                      const picked = guaranteedRangers[Math.floor(Math.random() * guaranteedRangers.length)]
                      addGuaranteedToHistory(picked, +(100 / guaranteedRangers.length).toFixed(2))
                      if (pendingChest) setChestResults(prev => ({ ...prev, [pendingChest.count]: picked.name }))
                      setPendingResult(picked)
                      play('shop_mgacha_open.ogg')   // เสียงกล่องกำลังเปิด
                      setChestPhase('start')
                    }}
                    className="absolute inset-0 transition hover:scale-110 active:scale-95"
                    aria-label="เปิดกล่อง"
                  />
                </div>
              </>
            ) : (
              <>
                <p className="text-yellow-300 font-bold text-lg">{tStat('You got!')}</p>
                <div className="chest-card-wrap" style={{ display: 'flex', justifyContent: 'center', padding: '0' }}>
                  <RangerCard
                    ranger={{
                      name: chestResult.name,
                      grade: chestResult.grade,
                      rate: 100,
                      imgUrl: chestResult.imgUrl ?? null,
                    }}
                    onSelect={setDetailRanger}
                  />
                </div>
                <p className="text-white font-bold mt-2">{tr(chestResult)}</p>
                <button onClick={() => setModal('none')}
                  className="mt-2 px-6 py-2 rounded-full font-bold text-sm text-white transition hover:opacity-80"
                  style={{ background: '#6b21a8' }}>
                  {tStat('Close')}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Modal: Select Chest — เปิดกล่องก่อน แล้วค่อยเลือก ranger ── */}
      {modal === 'select-chest' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={chestResult !== null ? () => setModal('none') : undefined}>

          {/* phase: opening — แสดงกล่อง SAM ก่อน */}
          {chestResult === null && selectChestPhase === 'opening' ? (
            <div className="rounded-2xl pt-8 pb-14 px-8 flex flex-col items-center gap-4 text-center"
              style={{ background: '#13102a', border: '3px solid #cbff3f', minWidth: 280 }}
              onClick={(e) => e.stopPropagation()}>
              <p className="text-yellow-300 font-bold text-lg">{tStat('Rangers Select Chest')}</p>
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
                  onClick={() => { if (chestPhase === 'start') return; play('shop_mgacha_open.ogg'); setChestPhase('start') }}
                  className="absolute inset-0 transition hover:scale-110 active:scale-95"
                />
              </div>
            </div>

          ) : chestResult === null ? (
            /* phase: selecting — หน้าเลือก ranger */
            <div className="rounded-2xl flex flex-col"
              style={{ background: '#13102a', border: '3px solid #cbff3f', width: isMobile ? '80vw' : '60vw', maxWidth: isMobile ? '80vw' : '60vw', maxHeight: '85vh' }}>
              <div className="px-5 py-3 shrink-0 border-b border-white/10">
                <h2 className="text-gradient-gold font-black text-center">{tStat('Rangers Select Chest')}</h2>
              </div>
              <div className="overflow-y-auto flex-1 p-4" style={{ overflowX: 'hidden' }}>
                {guaranteedRangers.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">ไม่มี Ranger การันตีในตู้นี้</p>
                ) : (
                  <div className={`flex flex-wrap justify-center select-chest-list`} style={{ gap: '10px' }}>
                    {guaranteedRangers.map((g, i) => (
                      <div key={i} className="flex flex-col items-center select-chest-item" style={{ marginTop: 10, marginBottom: isMobile ? 0 : 10 }}>
                        <RangerCard ranger={{ name: g.name, grade: g.grade, rate: 100, imgUrl: g.imgUrl ?? null }} onSelect={setDetailRanger} />
                        <button
                          onClick={() => {
                            addGuaranteedToHistory(g, 100)
                            play('arena_gacha_get_meffect.mp3')   // เสียงผลกล่องออก (เลือกแล้ว)
                            setChestResult(g)
                            if (pendingChest) setChestResults(prev => ({ ...prev, [pendingChest.count]: g.name }))
                          }}
                          className="px-5 py-1.5 rounded-full font-bold text-white text-sm transition hover:scale-105 active:scale-95"
                          style={{ marginTop: isMobile ? -10 : 10, background: '#00c853', border: '2px solid #1b5e20' }}>
                          {tStat('Select')}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* หน้าผลลัพธ์หลังเลือก */
            <div className={`rounded-2xl p-8 flex flex-col items-center ${isMobile ? 'gap-2' : 'gap-4'} text-center`}
              style={{ background: '#13102a', border: '3px solid #cbff3f', minWidth: 280 }}
              onClick={(e) => e.stopPropagation()}>
              <p className="text-yellow-300 font-bold text-lg">{tStat('You got!')}</p>
              <div className="chest-card-wrap" style={{ display: 'flex', justifyContent: 'center', padding: '0' }}>
                <RangerCard ranger={{ name: chestResult.name, grade: chestResult.grade, rate: 100, imgUrl: chestResult.imgUrl ?? null }} onSelect={setDetailRanger} />
              </div>
              <p className="text-white font-bold mt-2">{chestResult.name}</p>
              <button onClick={() => setModal('none')}
                className="mt-2 px-6 py-2 rounded-full font-bold text-sm text-white transition hover:opacity-80"
                style={{ background: '#6b21a8' }}>
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
              <button
                onClick={() => setModal('none')}
                className="flex-1 py-2.5 rounded-xl text-gray-300 text-sm transition hover:bg-white/10"
                style={{ background: 'rgba(255,255,255,0.08)' }}>
                ยกเลิก
              </button>
              <button
                onClick={() => { reset(); setModal('none') }}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-semibold transition">
                รีเซ็ต
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Chest Info — guaranteed rangers + rates ── */}
      {modal === 'chest-info' && (
        <GachaModal title="Guaranteed Rangers" onClose={() => setModal('chest')}>
          {guaranteedRangers.length === 0 ? (
            <p className="text-gray-500 text-center py-8">ไม่มี Ranger การันตีในตู้นี้</p>
          ) : (() => {
            const resultName = chestInfoCount !== null ? chestResults[chestInfoCount] : undefined
            return (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-400 text-xs border-b border-white/10">
                    <th className="py-2 text-center">Grade</th>
                    <th className="py-2 text-left pl-2">Ranger</th>
                    <th className="py-2 text-center">Result</th>
                    <th className="py-2 text-right">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {guaranteedRangers.map((g, i) => {
                    const isResult = resultName === g.name
                    return (
                      <tr key={i} className="border-b border-white/5 cursor-pointer hover:bg-white/5 transition-colors"
                        onClick={() => { if (extractRangerId(g.imgUrl)) setDetailRanger({ name: g.name, grade: g.grade, rate: 0, imgUrl: g.imgUrl ?? null }) }}>
                        <td className="py-2 text-center">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={gradeImgSrc(g.grade)} alt={g.grade}
                            style={{ height: '1rem' }} className="mx-auto"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                        </td>
                        <td className="py-2 pl-1 sm:pl-2">
                          <div className="flex items-center gap-1.5 sm:gap-2 pl-0 sm:pl-3">
                            {g.imgUrl && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={g.imgUrl} alt={g.name} className="h-9 w-9 object-contain shrink-0"
                                style={{ maxWidth: 'none' }}
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                            )}
                            <span className="text-white text-xs">{(() => {
                              const rid = extractRangerId(g.imgUrl)
                              return rid ? tRanger(rid, g.name) : g.name
                            })()}</span>
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
                          {chestInfoType === 'random'
                            ? `${+(100 / guaranteedRangers.length).toFixed(1)}%`
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

      {/* ── Ranger Detail Popup (กดรูปเรนเจอร์ใน gacha) ── */}
      {detailRanger && (() => {
        const rid = extractRangerId(detailRanger.imgUrl)
        if (!rid) return null
        return (
          <GachaRangerDetailPopup
            rangerId={rid}
            rangerName={detailRanger.name}
            rangerImageUrl={detailRanger.imgUrl ?? `https://rangers.lerico.net/res/${rid}/${rid}-thum.png`}
            onClose={() => setDetailRanger(null)}
          />
        )
      })()}
    </ElementMapContext.Provider>
  )
}

// ─── RangerCard ───────────────────────────────────
// โครงสร้างเหมือนโค้ดเก่า: light → base → ranger-img → star (layered absolute)
// onSelect (optional) → กดรูปเรนเจอร์แล้วเปิด detail popup
function RangerCard({
  ranger, mobile, onSelect,
}: {
  ranger: RangerEntry
  mobile?: boolean
  onSelect?: (r: RangerEntry) => void
}) {
  const { tRanger } = useLanguage()
  const rangerId = extractRangerId(ranger.imgUrl)
  const displayName = rangerId ? tRanger(rangerId, ranger.name) : ranger.name
  const base = getBase(ranger.grade)
  const color = GRADE_COLORS[ranger.grade] ?? '#fff'
  const clickable = !!onSelect && !!rangerId
  // ธาตุ — lookup จาก id ก่อน ไม่เจอค่อย fallback เป็นชื่อ
  // elementOpen "1" = ยังไม่เปิดช่องธาตุ → ไม่แสดง badge (เหมือนไร้ธาตุ)
  const elementMap = useContext(ElementMapContext)
  const elementInfo = (rangerId ? elementMap[rangerId] : undefined) ?? elementMap[ranger.name]
  const elementIcon = elementInfo?.elementOpen === '2' && elementInfo.element
    ? ELEMENT_ICON[elementInfo.element]
    : undefined

  return (
    <div
      className={`${mobile ? 'result-ranger-mob animate-bounce-mob' : 'result-ranger animate-bounce-in'}${clickable ? ' cursor-pointer' : ''}`}
      onClick={clickable ? () => onSelect?.(ranger) : undefined}
      aria-label={clickable ? `ดูรายละเอียด ${displayName}` : undefined}
      role={clickable ? 'button' : undefined}
    >
      {/* Light effect — SAM animation จาก fx02-backlight-01 */}
      <BacklightCanvas className="light-effect" />
      {/* Base plate */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={base}
        className="ranger-base"
        alt=""
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
      />
      {/* รูป Ranger — ใช้ imgUrl จาก lerico.net */}
      {ranger.imgUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={ranger.imgUrl}
          alt={displayName}
          className="ranger-img"
          onError={(e) => {
            // fallback เป็นข้อความถ้ารูปโหลดไม่ได้
            const el = e.target as HTMLImageElement
            el.style.display = 'none'
            const txt = document.createElement('div')
            txt.className = 'ranger-img'
            txt.style.cssText = `color:${color};font-weight:bold;font-size:0.55rem;text-align:center;line-height:1.2;max-width:80px;padding:0 4px`
            txt.textContent = displayName
            el.parentNode?.insertBefore(txt, el.nextSibling)
          }}
        />
      ) : (
        <div className="ranger-img" style={{ color, fontWeight: 'bold', fontSize: '0.55rem', textAlign: 'center', lineHeight: 1.2, maxWidth: 80, padding: '0 4px' }}>
          {displayName}
        </div>
      )}
      {/* Star grade */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={gradeImgSrc(ranger.grade)}
        className="ranger-star"
        alt={ranger.grade}
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
      />
      {/* Element badge — มุมขวาล่าง ทับบนสุด */}
      {elementIcon && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={elementIcon}
          className="ranger-element-badge"
          alt={elementInfo?.element ?? ''}
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
      <div className="w-full max-w-lg rounded-2xl shadow-2xl flex flex-col border border-purple-500/50"
        style={{ maxHeight: '85vh', background: '#13102a' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-3 sm:px-5 py-3 shrink-0 border-b border-white/10">
          <h2 className="text-gradient-gold font-black text-sm sm:text-base">{title}</h2>
          <div className="flex items-center gap-2 sm:gap-4">
            {headerAction}
            <button onClick={onClose}
              className="px-3 py-1 rounded-lg text-white font-bold text-sm transition hover:opacity-80"
              style={{ background: '#ff4d4d' }}>✕</button>
          </div>
        </div>
        {/* Scrollable content */}
        <div className="overflow-y-auto px-2 sm:px-5 py-3 flex-1" style={{ scrollbarWidth: 'thin', scrollbarColor: '#3798c7 transparent' }}>
          {children}
        </div>
      </div>
    </div>
  )
}
