'use client'

// ====================================================
// Admin Ranger Book — ตารางเรนเจอร์ทั้งหมด + sync
// ====================================================

import { adminFetch } from '@/lib/adminApi'
import { useState, useEffect, useMemo } from 'react'
import GachaRangerDetailPopup from '@/components/GachaRangerDetailPopup'
import Pagination from '@/components/Pagination'

interface RangerRecord {
  id: string
  name: string
  grade: number | null
  evolution: string | null
  type: string | null
  role: string | null
  element: string | null
  sortOrder: number
  syncedAt: string
}

// ─── Constants ────────────────────────────────────
const GRADE_LIST = [1, 2, 3, 4, 5, 6, 7, 8, 9]
const EVOLUTION_LIST = [
  { value: 'normal', label: 'Normal Ranger', color: 'text-yellow-300 border-yellow-500 bg-yellow-500/20' },
  { value: 'ultra',  label: 'Ultra Ranger',  color: 'text-cyan-300 border-cyan-500 bg-cyan-500/20'  },
  { value: 'hyper',  label: 'Hyper Ranger',  color: 'text-pink-300 border-pink-500 bg-pink-500/20'   },
]
const TYPE_LIST = [
  { value: 'AGI', img: '/gacha/images/Agi.png'  },
  { value: 'STR', img: '/gacha/images/Str.png'  },
  { value: 'INT', img: '/gacha/images/Int.png'  },
]
const ROLE_LIST = [
  { value: 'ATTACK',  label: 'Attack',  color: 'text-red-300 border-red-500 bg-red-500/20'         },
  { value: 'SPLASH',  label: 'Splash',  color: 'text-orange-300 border-orange-500 bg-orange-500/20' },
  { value: 'HP',      label: 'HP',      color: 'text-green-300 border-green-500 bg-green-500/20'    },
  { value: 'SPEED',   label: 'Speed',   color: 'text-yellow-300 border-yellow-500 bg-yellow-500/20' },
  { value: 'BALANCE', label: 'Balance', color: 'text-blue-300 border-blue-500 bg-blue-500/20'       },
  { value: 'SUPPORT', label: 'Support', color: 'text-purple-300 border-purple-500 bg-purple-500/20' },
  { value: 'SPECIAL', label: 'Special', color: 'text-pink-300 border-pink-500 bg-pink-500/20'       },
]
const ELEMENT_LIST = [
  { value: 'fire',  label: 'Fire',  img: '/gacha/images/Fire.png'  },
  { value: 'water', label: 'Water', img: '/gacha/images/Water.png' },
  { value: 'wood',  label: 'Wood',  img: '/gacha/images/Tree.png'  },
  { value: 'light', label: 'Light', img: '/gacha/images/Light.png' },
  { value: 'dark',  label: 'Dark',  img: '/gacha/images/Dark.png'  },
  { value: 'none',  label: 'None',  img: null                       },
]
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

// ─── Helpers ──────────────────────────────────────
function gradeImg(grade: number, evolution?: string | null) {
  if (evolution === 'hyper') return `/gacha/images/${grade}%23star.png`
  if (evolution === 'ultra') return `/gacha/images/${grade}+star.png`
  return `/gacha/images/${grade}star.png`
}
function evolutionBadge(evo: string | null) {
  const e = EVOLUTION_LIST.find(x => x.value === evo)
  return e ?? EVOLUTION_LIST[0]
}
function typeImg(type: string | null): string | null {
  return TYPE_LIST.find(x => x.value === type)?.img ?? null
}
const ELEM_ALIAS: Record<string, string> = {
  tree: 'wood', nature: 'wood', earth: 'wood', plant: 'wood',
  holy: 'light', shadow: 'dark',
}
function elementImg(elem: string | null): string | null {
  if (!elem) return null
  const key = ELEM_ALIAS[elem.toLowerCase()] ?? elem.toLowerCase()
  return ELEMENT_LIST.find(x => x.value === key)?.img ?? null
}
function roleBadge(role: string | null) {
  return ROLE_LIST.find(x => x.value === role) ?? null
}

interface Filters {
  grades: number[]
  evolutions: string[]
  types: string[]
  roles: string[]
  elements: string[]
}
const EMPTY_FILTERS: Filters = { grades: [], evolutions: [], types: [], roles: [], elements: [] }

function toggleItem<T>(arr: T[], item: T): T[] {
  return arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item]
}


export default function AdminRangerBookPage() {
  const [rangers, setRangers] = useState<RangerRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [search, setSearch] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [detailRanger, setDetailRanger] = useState<RangerRecord | null>(null)
  const [pageSize, setPageSize] = useState(25)
  const [page, setPage] = useState(0)

  // Load from DB
  useEffect(() => {
    adminFetch('/api/admin/ranger-book')
      .then(r => r.json())
      .then(d => { setRangers(d.rangers ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  // Reset page when search/filter/pageSize changes
  useEffect(() => { setPage(0) }, [search, filters, pageSize])

  // ล็อก body scroll บนมือถือเมื่อเปิด Filter popup (PC เลื่อนได้ปกติ)
  useEffect(() => {
    if (!filterOpen) return
    if (!window.matchMedia('(max-width: 639px)').matches) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [filterOpen])

  // Sync handler
  async function handleSync() {
    setSyncing(true)
    setSyncMsg('')
    try {
      const res = await adminFetch('/api/admin/ranger-book/sync', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setSyncMsg(`✓ ${data.message}`)
        const r2 = await adminFetch('/api/admin/ranger-book')
        const d2 = await r2.json()
        setRangers(d2.rangers ?? [])
      } else {
        setSyncMsg(`✗ ${data.error ?? 'เกิดข้อผิดพลาด'}`)
      }
    } catch {
      setSyncMsg('✗ เชื่อมต่อไม่ได้')
    } finally {
      setSyncing(false)
    }
  }

  // Filtered + searched list
  const displayed = useMemo(() => {
    let list = [...rangers].sort((a, b) => {
      const aSpecial = a.sortOrder > 2000
      const bSpecial = b.sortOrder > 2000
      if (aSpecial !== bSpecial) return aSpecial ? 1 : -1
      return b.sortOrder - a.sortOrder
    })
    const q = search.trim().toLowerCase()
    if (q) list = list.filter(r => r.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q))
    if (filters.grades.length > 0)     list = list.filter(r => r.grade != null && filters.grades.includes(r.grade))
    if (filters.evolutions.length > 0) list = list.filter(r => filters.evolutions.includes(r.evolution ?? 'normal'))
    if (filters.types.length > 0)      list = list.filter(r => r.type != null && filters.types.includes(r.type))
    if (filters.roles.length > 0)      list = list.filter(r => r.role != null && filters.roles.includes(r.role))
    if (filters.elements.length > 0)   list = list.filter(r => filters.elements.includes(r.element ?? 'none'))
    return list
  }, [rangers, search, filters])

  const totalPages = Math.max(1, Math.ceil(displayed.length / pageSize))
  const safePage = Math.min(page, totalPages - 1)
  const pageRows = displayed.slice(safePage * pageSize, (safePage + 1) * pageSize)
  const startRow = safePage * pageSize + 1
  const endRow = Math.min((safePage + 1) * pageSize, displayed.length)

  const activeFilterCount = filters.grades.length + filters.evolutions.length + filters.types.length + filters.roles.length + filters.elements.length

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-white">Ranger Book</h1>
          <p className="text-sm text-gray-400 mt-0.5">เรนเจอร์ทั้งหมด {rangers.length} ตัว</p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-60 text-white font-bold text-sm transition-colors"
        >
          <span className={`material-icons-round text-base ${syncing ? 'animate-spin' : ''}`}>
            {syncing ? 'refresh' : 'cloud_download'}
          </span>
          {syncing ? 'กำลังอัพเดต...' : 'อัพเดต Ranger Book'}
        </button>
      </div>

      {/* Sync status */}
      {syncMsg && (
        <div className={`mb-4 px-4 py-2 rounded-xl text-sm font-semibold ${
          syncMsg.startsWith('✓') ? 'bg-green-500/15 text-green-300' : 'bg-red-500/15 text-red-300'
        }`}>
          {syncMsg}
        </div>
      )}

      {/* ── Sticky Search + Filter bar ── */}
      <div className="sticky top-0 z-20 -mx-4 px-4 py-2.5 bg-[#1A0A2E]/95 backdrop-blur-md border-b border-white/10 mb-4">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <span className="material-icons-round absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg pointer-events-none">search</span>
            <input
              type="text"
              placeholder="ค้นหาชื่อหรือ ID เรนเจอร์..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-9 py-2 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-purple-500/50 transition-all"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
              >
                <span className="material-icons-round text-base">close</span>
              </button>
            )}
          </div>
          <button
            onClick={() => setFilterOpen(v => !v)}
            className={`h-[38px] flex items-center gap-1 px-3 rounded-xl border text-xs font-bold transition-colors shrink-0 ${
              activeFilterCount > 0
                ? 'border-purple-400 bg-purple-500/20 text-purple-300'
                : 'border-white/20 bg-white/5 text-gray-400 hover:border-purple-400/50 hover:text-purple-300'
            }`}
          >
            <span className="material-icons-round leading-none" style={{ fontSize: 16 }}>tune</span>
            <span className="hidden sm:inline">FILTER</span>
            {activeFilterCount > 0 && (
              <span className="bg-purple-500 text-white text-[10px] leading-none rounded-full w-4 h-4 flex items-center justify-center shrink-0">
                {activeFilterCount}
              </span>
            )}
          </button>
          {activeFilterCount > 0 && (
            <button
              onClick={() => setFilters(EMPTY_FILTERS)}
              className="h-[38px] w-[38px] flex items-center justify-center rounded-xl bg-white/5 border border-white/15 text-gray-400 hover:text-white transition-colors shrink-0"
              aria-label="ล้าง filter"
            >
              <span className="material-icons-round leading-none" style={{ fontSize: 18 }}>filter_alt_off</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Filter Modal (floating overlay) ── */}
      {filterOpen && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) setFilterOpen(false) }}
        >
          <div className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl bg-[#1A0A2E] border border-white/15 shadow-2xl">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div className="flex items-center gap-2">
                <span className="material-icons-round text-purple-400 text-lg">tune</span>
                <span className="font-bold text-white text-sm">Filter</span>
                {activeFilterCount > 0 && (
                  <span className="bg-purple-500 text-white text-xs rounded-full px-1.5 py-0.5">{activeFilterCount}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {activeFilterCount > 0 && (
                  <button
                    onClick={() => setFilters(EMPTY_FILTERS)}
                    className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                  >
                    ล้างทั้งหมด
                  </button>
                )}
                <button onClick={() => setFilterOpen(false)} className="text-gray-400 hover:text-white transition-colors">
                  <span className="material-icons-round text-xl">close</span>
                </button>
              </div>
            </div>

            {/* Filter sections */}
            <div className="p-5 space-y-5">
              {/* Grade */}
              <div>
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-2">Grade</p>
                <div className="flex flex-wrap gap-2">
                  {GRADE_LIST.map(g => (
                    <button key={g}
                      onClick={() => setFilters(f => ({ ...f, grades: toggleItem(f.grades, g) }))}
                      className={`p-1 rounded-lg border transition-colors ${filters.grades.includes(g) ? 'border-yellow-400 bg-yellow-400/20' : 'border-white/15 bg-white/5 hover:border-white/30'}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={gradeImg(g)} alt={`${g}★`} className="h-4 object-contain" onError={e => { (e.target as HTMLImageElement).style.display='none' }} />
                    </button>
                  ))}
                </div>
              </div>
              {/* Evolution */}
              <div>
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-2">Evolution</p>
                <div className="flex flex-wrap gap-2">
                  {EVOLUTION_LIST.map(evo => (
                    <button key={evo.value}
                      onClick={() => setFilters(f => ({ ...f, evolutions: toggleItem(f.evolutions, evo.value) }))}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors ${filters.evolutions.includes(evo.value) ? evo.color : 'border-white/15 bg-white/5 text-gray-400 hover:border-white/30'}`}
                    >
                      {evo.label}
                    </button>
                  ))}
                </div>
              </div>
              {/* Type */}
              <div>
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-2">Type</p>
                <div className="flex flex-wrap gap-2">
                  {TYPE_LIST.map(t => (
                    <button key={t.value}
                      onClick={() => setFilters(f => ({ ...f, types: toggleItem(f.types, t.value) }))}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-colors ${filters.types.includes(t.value) ? 'border-yellow-400 bg-yellow-400/20 text-yellow-200' : 'border-white/15 bg-white/5 text-gray-300 hover:border-white/30'}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={t.img} alt={t.value} className="h-4 object-contain" />
                      {t.value}
                    </button>
                  ))}
                </div>
              </div>
              {/* Element */}
              <div>
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-2">Element</p>
                <div className="flex flex-wrap gap-2">
                  {ELEMENT_LIST.map(el => (
                    <button key={el.value}
                      onClick={() => setFilters(f => ({ ...f, elements: toggleItem(f.elements, el.value) }))}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-colors ${filters.elements.includes(el.value) ? 'border-yellow-400 bg-yellow-400/20 text-yellow-200' : 'border-white/15 bg-white/5 text-gray-300 hover:border-white/30'}`}
                    >
                      {el.img
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={el.img} alt={el.label} className="h-4 object-contain" />
                        : null}
                      {el.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-center py-16">
          <span className="material-icons-round text-5xl text-purple-400 animate-pulse">shield</span>
          <p className="text-gray-400 text-sm mt-3">กำลังโหลด...</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && rangers.length === 0 && (
        <div className="card-glass rounded-2xl p-12 text-center">
          <span className="material-icons-round text-5xl text-gray-600">menu_book</span>
          <p className="text-gray-400 mt-3">ยังไม่มีข้อมูลเรนเจอร์</p>
          <p className="text-gray-500 text-sm mt-1">กด "อัพเดต Ranger Book" เพื่อดึงข้อมูลจาก lerico.net</p>
        </div>
      )}

      {/* Table */}
      {!loading && rangers.length > 0 && (
        <>
          {/* ── Rows per page + info ── */}
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span>Rows:</span>
              {PAGE_SIZE_OPTIONS.map(n => (
                <button
                  key={n}
                  onClick={() => setPageSize(n)}
                  className={`px-2.5 py-1 rounded-lg border font-semibold transition-colors ${
                    pageSize === n
                      ? 'border-purple-400 bg-purple-500/20 text-purple-300'
                      : 'border-white/15 bg-white/5 text-gray-400 hover:border-white/30'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500">
              {displayed.length > 0 ? `${startRow}–${endRow} จาก ${displayed.length} ตัว` : '0 ตัว'}
              {(search || activeFilterCount > 0) && rangers.length !== displayed.length && ` (กรอง ${rangers.length} ตัว)`}
            </p>
          </div>

          <div className="card-glass rounded-2xl overflow-hidden">
            <table className="w-full text-sm table-fixed">
              <colgroup>
                <col className="w-7 sm:w-9" />           {/* # */}
                <col className="w-11 sm:w-12" />          {/* รูป */}
                <col className="w-28 sm:w-40" />          {/* ชื่อ/ID — กำหนด max ไม่ให้กินพื้นที่ */}
                <col className="w-12 hidden sm:table-column" /> {/* Grade */}
                <col className="w-20 hidden sm:table-column" /> {/* Evolution */}
                <col className="w-9 sm:w-11" />           {/* Type */}
                <col className="w-20 hidden sm:table-column" /> {/* Role */}
                <col className="w-9 sm:w-11" />           {/* Element */}
              </colgroup>
              <thead>
                <tr className="border-b border-white/10 text-xs text-gray-400 uppercase tracking-wider">
                  <th className="py-3 px-2 text-left">#</th>
                  <th className="py-3 px-1 text-left">รูป</th>
                  <th className="py-3 px-2 text-left">ชื่อ / ID</th>
                  <th className="py-3 px-2 text-center hidden sm:table-cell">Grade</th>
                  <th className="py-3 px-2 text-center hidden sm:table-cell">Evolution</th>
                  <th className="py-3 px-2 text-center">Type</th>
                  <th className="py-3 px-2 text-center hidden sm:table-cell">Role</th>
                  <th className="py-3 px-2 text-center">Elem</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r, idx) => {
                  const evo = evolutionBadge(r.evolution)
                  const tImg = typeImg(r.type)
                  const rBadge = roleBadge(r.role)
                  const eImg = elementImg(r.element)
                  return (
                    <tr
                      key={r.id}
                      onClick={() => setDetailRanger(r)}
                      className="border-b border-white/5 hover:bg-white/10 active:bg-white/15 cursor-pointer transition-colors"
                    >
                      <td className="py-2 px-2 text-gray-500 text-xs">{startRow + idx}</td>
                      <td className="py-2 px-1">
                        <div className="w-9 h-12 rounded-lg bg-white/5 overflow-hidden flex items-center justify-center">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`https://rangers.lerico.net/res/${r.id}/${r.id}-thum.png`} alt={r.name}
                            className="max-h-full max-w-full object-contain"
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                        </div>
                      </td>
                      <td className="py-2 px-2 min-w-0">
                        <p className="text-white font-semibold leading-tight text-xs sm:text-sm break-words">{r.name}</p>
                        {/* mobile: grade star เท่านั้น ไม่แสดง ID */}
                        {r.grade != null && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={gradeImg(r.grade, r.evolution)} alt={`${r.grade}★`}
                            className="h-3 mt-0.5 object-contain sm:hidden"
                            onError={e => { (e.target as HTMLImageElement).style.display='none' }} />
                        )}
                        {/* desktop: แสดง ID */}
                        <p className="text-gray-500 text-[10px] truncate mt-0.5 hidden sm:block">{r.id}</p>
                      </td>
                      {/* Grade — desktop only */}
                      <td className="py-2 px-2 text-center hidden sm:table-cell">
                        {r.grade != null ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={gradeImg(r.grade, r.evolution)} alt={`${r.grade}★`} className="h-5 sm:h-6 object-contain mx-auto"
                            onError={e => { (e.target as HTMLImageElement).style.display='none' }} />
                        ) : <span className="text-gray-600">—</span>}
                      </td>
                      {/* Evolution — desktop only */}
                      <td className="py-2 px-2 text-center hidden sm:table-cell">
                        <span className={`text-xs font-bold px-2 py-1 rounded border ${evo.color}`}>
                          {evo.label === 'Normal Ranger' ? 'Normal' : evo.label === 'Ultra Ranger' ? 'Ultra' : 'Hyper'}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-center">
                        {tImg
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={tImg} alt={r.type ?? ''} className="h-5 sm:h-7 object-contain mx-auto" />
                          : <span className="text-gray-600">—</span>}
                      </td>
                      {/* Role — desktop only */}
                      <td className="py-2 px-2 text-center hidden sm:table-cell">
                        {rBadge
                          ? <span className={`text-xs font-bold px-2 py-1 rounded border ${rBadge.color}`}>{rBadge.label}</span>
                          : <span className="text-gray-600">—</span>}
                      </td>
                      <td className="py-2 px-2 text-center">
                        {eImg
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={eImg} alt={r.element ?? ''} className="h-5 sm:h-7 object-contain mx-auto" />
                          : <span className="text-gray-500 text-xs">—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* ── Pagination ── */}
          {totalPages > 1 && <Pagination page={safePage} totalPages={totalPages} onChange={setPage} className="mt-5" />}
        </>
      )}

      {/* Ranger Detail Popup */}
      {detailRanger && (
        <GachaRangerDetailPopup
          rangerId={detailRanger.id}
          rangerName={detailRanger.name}
          rangerImageUrl={`https://rangers.lerico.net/res/${detailRanger.id}/${detailRanger.id}-thum.png`}
          onClose={() => setDetailRanger(null)}
        />
      )}
    </div>
  )
}
