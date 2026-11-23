'use client'

// ====================================================
// Admin Gear Book — แสดงเกียร์ทั้งหมดที่ sync ไว้ใน DB
// ====================================================

import { adminFetch } from '@/lib/adminApi'
import { useState, useEffect, useMemo } from 'react'
import GearDetailPopup from '@/components/GearDetailPopup'
import Pagination from '@/components/Pagination'

// ── Types ─────────────────────────────────────────────
interface GearBookItem {
  id:             string
  name:           string
  grade:          number | null
  slot:           string | null
  iconUrl:        string
  switchableType: string | null
  syncedAt:       string
  updatedAt:      string
}

interface GearFilters {
  grades:      number[]
  slots:       string[]
  switchables: string[]
}

interface SelectedGear {
  id:      string
  name:    string
  iconUrl: string
  grade:   number | null
  slot:    string
}

// ── Constants ─────────────────────────────────────────
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

const GRADE_LIST  = [1, 2, 3, 4, 5, 6, 7, 8, 9]
const SLOT_LIST   = ['WPN', 'AMR', 'ACC']
const SWITCH_LIST = ['STR', 'AGI', 'INT', 'FIRE', 'TREE', 'WATER', 'LIGHT', 'DARK']

const SLOT_IMG: Record<string, string> = {
  WPN: '/gacha/images/gear_weapon.png',
  AMR: '/gacha/images/gear_armor.png',
  ACC: '/gacha/images/gear_accessory.png',
}
const STAR_IMG: Record<number, string> = {
  1: '/gacha/images/1star.png', 2: '/gacha/images/2star.png',
  3: '/gacha/images/3star.png', 4: '/gacha/images/4star.png',
  5: '/gacha/images/5star.png', 6: '/gacha/images/6star.png',
  7: '/gacha/images/7star.png', 8: '/gacha/images/8star.png',
  9: '/gacha/images/9star.png',
}
const TRIG_IMG: Record<string, string> = {
  STR:   '/gacha/images/Str.png',
  AGI:   '/gacha/images/Agi.png',
  INT:   '/gacha/images/Int.png',
  FIRE:  '/gacha/images/Fire.png',
  TREE:  '/gacha/images/Tree.png',
  WATER: '/gacha/images/Water.png',
  LIGHT: '/gacha/images/Light.png',
  DARK:  '/gacha/images/Dark.png',
}

const EMPTY_FILTERS: GearFilters = { grades: [], slots: [], switchables: [] }

// ── Helpers ────────────────────────────────────────────
function toggleItem<T>(arr: T[], item: T): T[] {
  return arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item]
}


// ── Sub-components ─────────────────────────────────────
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

function TrigImage({ trigType }: { trigType: string | null }) {
  if (!trigType) return <span className="text-gray-600">—</span>
  const src = TRIG_IMG[trigType]
  if (!src) return <span className="text-xs text-gray-400">{trigType}</span>
  return (
    <div className="flex flex-col items-center gap-0.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img loading="lazy" decoding="async" src={src} alt={trigType} className="h-5 sm:h-6 object-contain mx-auto" />
      <span className="text-[9px] text-gray-400 hidden sm:block">{trigType}</span>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────
export default function AdminGearBookPage() {
  const [items, setItems]           = useState<GearBookItem[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')
  const [search, setSearch]         = useState('')
  const [filters, setFilters]       = useState<GearFilters>(EMPTY_FILTERS)
  const [filterOpen, setFilterOpen] = useState(false)
  const [selectedGear, setSelectedGear] = useState<SelectedGear | null>(null)
  const [pageSize, setPageSize]     = useState(25)
  const [page, setPage]             = useState(0)

  // โหลดข้อมูลจาก API
  useEffect(() => {
    setLoading(true)
    adminFetch('/api/admin/gear-book')
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return }
        setItems(data.items ?? [])
      })
      .catch(() => setError('โหลดข้อมูลล้มเหลว'))
      .finally(() => setLoading(false))
  }, [])

  // ล็อก body scroll บนมือถือเมื่อเปิด Filter popup
  useEffect(() => {
    if (!filterOpen) return
    if (!window.matchMedia('(max-width: 639px)').matches) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [filterOpen])

  // Reset page เมื่อ search/filters/pageSize เปลี่ยน
  const activeFilterCount =
    filters.grades.length + filters.slots.length + filters.switchables.length

  useEffect(() => { setPage(0) }, [search, filters, pageSize])

  // Filter items
  const filtered = useMemo(() => {
    let list = items
    if (filters.grades.length > 0)
      list = list.filter(i => i.grade != null && filters.grades.includes(i.grade))
    if (filters.slots.length > 0)
      list = list.filter(i => i.slot != null && filters.slots.includes(i.slot))
    if (filters.switchables.length > 0)
      list = list.filter(i => i.switchableType != null && filters.switchables.includes(i.switchableType))
    if (search.trim()) {
      const q = search.toLowerCase().trim()
      list = list.filter(i =>
        i.name.toLowerCase().includes(q) ||
        i.id.toLowerCase().includes(q)
      )
    }
    return list
  }, [items, filters, search])

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage   = Math.min(page, totalPages - 1)
  const pageRows   = filtered.slice(safePage * pageSize, (safePage + 1) * pageSize)
  const startRow   = safePage * pageSize + 1
  const endRow     = Math.min((safePage + 1) * pageSize, filtered.length)

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-2">
            <span className="material-icons-round text-purple-400">inventory_2</span>
            Gear Book
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            เกียร์ทั้งหมด {items.length} ชิ้น — เรียงจากใหม่ไปเก่า
          </p>
        </div>
      </div>

      {/* ── Sticky Search + Filter bar ── */}
      <div className="sticky top-0 z-20 -mx-4 px-4 py-2.5 bg-[#1A0A2E]/95 backdrop-blur-md border-b border-white/10 mb-4">
        <div className="flex gap-2">
          {/* Search input */}
          <div className="relative flex-1">
            <span className="material-icons-round absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg pointer-events-none">search</span>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อเกียร์ หรือ ID…"
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

          {/* Filter button */}
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
                      {STAR_IMG[g]
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img loading="lazy" decoding="async" src={STAR_IMG[g]} alt={`${g}★`} className="h-4 object-contain" onError={e => { (e.target as HTMLImageElement).style.display='none' }} />
                        : <span className="text-xs text-gray-400 px-1">{g}★</span>
                      }
                    </button>
                  ))}
                </div>
              </div>

              {/* Slot */}
              <div>
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-2">Slot</p>
                <div className="flex flex-wrap gap-2">
                  {SLOT_LIST.map(s => (
                    <button key={s}
                      onClick={() => setFilters(f => ({ ...f, slots: toggleItem(f.slots, s) }))}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors ${filters.slots.includes(s) ? 'border-yellow-400 bg-yellow-400/20 text-yellow-200' : 'border-white/15 bg-white/5 text-gray-300 hover:border-white/30'}`}
                    >
                      <SlotImage slot={s} className="h-4 object-contain" />
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Switchable */}
              <div>
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-2">Switchable</p>
                <div className="flex flex-wrap gap-2">
                  {SWITCH_LIST.map(sw => (
                    <button key={sw}
                      onClick={() => setFilters(f => ({ ...f, switchables: toggleItem(f.switchables, sw) }))}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-colors ${filters.switchables.includes(sw) ? 'border-yellow-400 bg-yellow-400/20 text-yellow-200' : 'border-white/15 bg-white/5 text-gray-300 hover:border-white/30'}`}
                    >
                      {TRIG_IMG[sw]
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img loading="lazy" decoding="async" src={TRIG_IMG[sw]} alt={sw} className="h-4 object-contain" />
                        : null}
                      {sw}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Loading / Error / Empty */}
      {loading && (
        <div className="text-center py-16">
          <span className="material-icons-round text-5xl text-purple-400 animate-pulse">inventory_2</span>
          <p className="text-gray-400 text-sm mt-3">กำลังโหลด...</p>
        </div>
      )}
      {!loading && error && (
        <div className="card-glass p-8 text-center text-red-400">
          <span className="material-icons-round text-2xl block mb-2">error</span>
          {error}
        </div>
      )}
      {!loading && !error && items.length === 0 && (
        <div className="card-glass rounded-2xl p-12 text-center">
          <span className="material-icons-round text-5xl text-gray-600">inventory_2</span>
          <p className="text-gray-400 mt-3">ยังไม่มีข้อมูล Gear Book</p>
          <p className="text-gray-500 text-sm mt-1">กด <strong>อัพเดต Ranger Book</strong> ในหน้า Ranger Book เพื่อ sync</p>
        </div>
      )}

      {/* Table */}
      {!loading && !error && items.length > 0 && (
        <>
          {/* Rows per page + info */}
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
              {filtered.length > 0 ? `${startRow}–${endRow} จาก ${filtered.length} ชิ้น` : '0 ชิ้น'}
              {(search || activeFilterCount > 0) && items.length !== filtered.length && ` (กรอง ${items.length} ชิ้น)`}
            </p>
          </div>

          {filtered.length === 0 ? (
            <div className="card-glass rounded-2xl p-8 text-center text-gray-400">
              ไม่พบเกียร์ที่ตรงกับการค้นหา
            </div>
          ) : (
            <div className="card-glass rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-xs text-gray-400 uppercase tracking-wider">
                      <th className="py-3 px-2 sm:px-3 text-left w-12 sm:w-14">รูป</th>
                      <th className="py-3 px-1 sm:px-4 text-left">ชื่อเกียร์</th>
                      <th className="py-3 px-2 sm:px-4 text-center hidden sm:table-cell">Slot</th>
                      <th className="py-3 px-2 sm:px-4 text-center">Switchable</th>
                      <th className="py-3 px-2 sm:px-4 text-right hidden sm:table-cell text-[10px]">Item Code</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((item) => (
                      <tr
                        key={item.id}
                        onClick={() => setSelectedGear({
                          id:      item.id,
                          name:    item.name,
                          iconUrl: item.iconUrl,
                          grade:   item.grade,
                          slot:    item.slot ?? 'WPN',
                        })}
                        className="border-b border-white/5 hover:bg-white/10 transition-colors cursor-pointer"
                      >
                        {/* Icon */}
                        <td className="py-1.5 sm:py-2 px-2 sm:px-3">
                          <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-lg bg-white/5 overflow-hidden flex items-center justify-center">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img loading="lazy" decoding="async"
                              src={item.iconUrl}
                              alt={item.name}
                              style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                            />
                          </div>
                        </td>

                        {/* Name + mobile slot/grade */}
                        <td className="py-2 sm:py-3 px-1 sm:px-4">
                          <div className="font-medium text-white text-xs sm:text-base leading-snug break-words hover:text-yellow-300 transition-colors">
                            {item.name}
                          </div>
                          {/* Mobile: slot icon + grade stars */}
                          <div className="flex items-center gap-1.5 mt-1 sm:hidden">
                            {item.slot && <SlotImage slot={item.slot} className="h-3.5 object-contain" />}
                            <StarImage grade={item.grade} className="h-3 object-contain" />
                          </div>
                        </td>

                        {/* Slot + Grade (PC) */}
                        <td className="py-2 sm:py-3 px-2 sm:px-4 text-center hidden sm:table-cell">
                          <div className="flex flex-col items-center gap-1">
                            {item.slot && <SlotImage slot={item.slot} className="h-5 object-contain" />}
                            <StarImage grade={item.grade} className="h-3.5 object-contain" />
                          </div>
                        </td>

                        {/* Switchable Type */}
                        <td className="py-2 sm:py-3 px-2 sm:px-4 text-center">
                          <TrigImage trigType={item.switchableType} />
                        </td>

                        {/* Item Code (PC) */}
                        <td className="py-2 sm:py-3 px-2 sm:px-4 text-right hidden sm:table-cell">
                          <span className="text-[10px] text-gray-500 font-mono">{item.id}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && <Pagination page={safePage} totalPages={totalPages} onChange={setPage} className="mt-5" />}
        </>
      )}

      {/* Gear Detail Popup */}
      {selectedGear && (
        <GearDetailPopup
          gearName={selectedGear.name}
          gearIconUrl={selectedGear.iconUrl}
          gearGrade={selectedGear.grade}
          gearSlot={selectedGear.slot}
          league={0}
          hideRangerUsage
          onClose={() => setSelectedGear(null)}
        />
      )}
    </div>
  )
}
