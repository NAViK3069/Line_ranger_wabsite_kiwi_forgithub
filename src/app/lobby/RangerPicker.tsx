'use client'

// ====================================================
// RangerPicker — ป๊อปอัพเลือกเรนเจอร์ลงช่องทีมของหน้า /lobby
// ฟิลเตอร์ชุดเดียวกับ Ranger Book (ดาว / ร่าง / ชนิด / บทบาท / ธาตุ)
// + ค้นหาชื่อไทย / อังกฤษ / ID ได้ทุกโหมดภาษา (src/lib/rangerSearch.ts)
// ต่างกันตรงเป็นตารางกริดรูปให้กดเลือก ไม่ใช่ลิสต์ข้อมูล
// ====================================================

import { apiFetch } from '@/lib/staticApi'
import { makeRangerMatcher, useRangerNames } from '@/lib/rangerSearch'
import { useEffect, useMemo, useState } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'
import Pagination from '@/components/Pagination'

export interface RangerRow {
  id: string
  name: string
  grade: number | null
  evolution: string | null
  type: string | null
  role: string | null
  element: string | null
  elementOpen: string | null
  sortOrder: number
}

// รายชื่อเรนเจอร์ทั้งเล่ม — โหลดครั้งเดียวต่อ session แล้วใช้ร่วมกันทุกช่อง
let bookCache: RangerRow[] | null = null
let bookPromise: Promise<RangerRow[]> | null = null
export function loadRangerBook(): Promise<RangerRow[]> {
  if (bookCache) return Promise.resolve(bookCache)
  if (!bookPromise) {
    bookPromise = apiFetch('/api/ranger-book')
      .then(r => r.json())
      .then((d: { rangers?: RangerRow[] }) => {
        bookCache = d.rangers ?? []
        return bookCache
      })
      .catch(() => [])
  }
  return bookPromise
}


const GRADES = [1, 2, 3, 4, 5, 6, 7, 8, 9]
const EVOLUTIONS = [
  { value: 'normal', label: 'Normal', cls: 'text-yellow-300 border-yellow-500 bg-yellow-500/20' },
  { value: 'ultra',  label: 'Ultra',  cls: 'text-cyan-300 border-cyan-500 bg-cyan-500/20' },
  { value: 'hyper',  label: 'Hyper',  cls: 'text-pink-300 border-pink-500 bg-pink-500/20' },
]
const TYPES = [
  { value: 'AGI', img: '/gacha/images/Agi.png' },
  { value: 'STR', img: '/gacha/images/Str.png' },
  { value: 'INT', img: '/gacha/images/Int.png' },
]
const ROLES = [
  { value: 'ATTACK',  label: 'Attack',  cls: 'text-red-300 border-red-500 bg-red-500/20' },
  { value: 'SPLASH',  label: 'Splash',  cls: 'text-orange-300 border-orange-500 bg-orange-500/20' },
  { value: 'HP',      label: 'HP',      cls: 'text-green-300 border-green-500 bg-green-500/20' },
  { value: 'SPEED',   label: 'Speed',   cls: 'text-yellow-300 border-yellow-500 bg-yellow-500/20' },
  { value: 'BALANCE', label: 'Balance', cls: 'text-blue-300 border-blue-500 bg-blue-500/20' },
  { value: 'SUPPORT', label: 'Support', cls: 'text-purple-300 border-purple-500 bg-purple-500/20' },
  { value: 'SPECIAL', label: 'Special', cls: 'text-pink-300 border-pink-500 bg-pink-500/20' },
]
const ELEMENTS = [
  { value: 'fire',  label: 'Fire',  img: '/gacha/images/Fire.png' },
  { value: 'water', label: 'Water', img: '/gacha/images/Water.png' },
  { value: 'wood',  label: 'Wood',  img: '/gacha/images/Tree.png' },
  { value: 'light', label: 'Light', img: '/gacha/images/Light.png' },
  { value: 'dark',  label: 'Dark',  img: '/gacha/images/Dark.png' },
  { value: 'none',  label: 'None',  img: null },
]

// รูปดาวของแถวนั้น — ร่างอัลตร้า/ไฮเปอร์ใช้ไฟล์คนละชุด ('#' ต้อง encode ไม่งั้นกลายเป็น fragment)
function starImg(grade: number | null, evo: string | null): string | null {
  if (!grade) return null
  const sfx = evo === 'hyper' ? '#' : evo === 'ultra' ? '+' : ''
  return `/gacha/images/${encodeURIComponent(`${grade}${sfx}star`)}.png`
}
const thumb = (id: string) => `https://rangers.lerico.net/res/${id}/${id}-thum.png`

interface Filters { grades: number[]; evolutions: string[]; types: string[]; roles: string[]; elements: string[] }
const NO_FILTERS: Filters = { grades: [], evolutions: [], types: [], roles: [], elements: [] }

// สิ่งที่ผู้ใช้ "หา" ไว้ — หน้าเพจเป็นคนถือ ป๊อปอัพจึงกลับมาที่เดิมได้ตอนเปิดใหม่
// (ถ้าเก็บใน state ของป๊อปอัพเอง มันจะหายทุกครั้งที่ปิด เพราะคอมโพเนนต์ถูก unmount)
// รีเซ็ตเองตอนออกจาก /lobby เพราะ state อยู่กับหน้านั้น
export interface PickerView {
  search: string
  filters: Filters
  page: number
}
export const PICKER_VIEW_DEFAULT: PickerView = { search: '', filters: NO_FILTERS, page: 0 }
const toggle = <T,>(arr: T[], v: T): T[] => (arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v])

const PAGE_SIZE = 48

// เอาเฉพาะเรนเจอร์ปกติ — ไอดีต้องขึ้นต้นด้วย u ตามด้วยเลข แล้วปิดท้ายด้วยตัวบอกร่าง e / u / h
//   u286e-brown (ธรรมดา) · u286u-brown (อัลตร้า) · u286h-brown (ไฮเปอร์)
// ที่เหลือในตารางเป็นของที่ไม่ได้เอามาวางในล็อบบี้: มอนสเตอร์กับบอสในด่าน (g001-ssonya),
// ลีโอนาร์ด (u001s-leonard), ตัวที่สกิลเรียกออกมาอย่างก้อนหิน (u1009hsk-sally) ฯลฯ
// ตรวจแล้วกฎนี้เหลือ 2,097 จาก 3,081 ตัว
const RANGER_ID_RE = /^u\d+[euh]-/

interface Props {
  title: string
  /** true = ไม่กรองไอดี เลือกได้ทุกตัวในตาราง (ใช้ในหน้าแอดมิน) */
  allowAll?: boolean
  /** ดาวขั้นต่ำ — ต่ำกว่านี้ไม่โชว์ในตารางเลย และปุ่มฟิลเตอร์ดาวที่ต่ำกว่าก็ซ่อนด้วย (ไม่ใส่ = ไม่จำกัด) */
  minGrade?: number
  view: PickerView
  onViewChange: (next: Partial<PickerView>) => void
  onPick: (r: RangerRow) => void
  onClose: () => void
  /** เรนเจอร์ที่ยังไม่อยู่ใน Ranger Book (ตัวใหม่) — แสดงต่อท้ายพร้อมป้าย NEW · ถ้า Book มีแล้วใช้ของ Book */
  extraRows?: RangerRow[]
}

export default function RangerPicker({ title, allowAll = false, minGrade = 0, view, onViewChange, onPick, onClose, extraRows }: Props) {
  const { tRanger, tStat } = useLanguage()
  const [rows, setRows] = useState<RangerRow[]>(bookCache ?? [])
  const [loading, setLoading] = useState(!bookCache)
  const [filterOpen, setFilterOpen] = useState(false)

  const { search, filters, page } = view
  const setSearch = (v: string) => onViewChange({ search: v, page: 0 })
  const setFilters = (f: Filters | ((prev: Filters) => Filters)) =>
    onViewChange({ filters: typeof f === 'function' ? f(filters) : f, page: 0 })
  const setPage = (p: number | ((prev: number) => number)) =>
    onViewChange({ page: typeof p === 'function' ? p(page) : p })

  useEffect(() => { loadRangerBook().then(r => { setRows(r); setLoading(false) }) }, [])
  // ตัวใหม่ที่ Book ยังไม่มี (ไม่ซ้ำกับของ Book)
  const extraIds = useMemo(() => {
    const inBook = new Set(rows.map(r => r.id))
    return new Set((extraRows ?? []).filter(r => !inBook.has(r.id)).map(r => r.id))
  }, [rows, extraRows])
  const allRows = useMemo(() => (extraIds.size ? [...rows, ...(extraRows ?? []).filter(r => extraIds.has(r.id))] : rows), [rows, extraRows, extraIds])

  // ชื่อไทย + อังกฤษ สำหรับค้นข้ามภาษา — โหลดตอนเริ่มพิมพ์ค้นหาครั้งแรก
  const names = useRangerNames(search.trim() !== '')

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  // ล็อกไม่ให้หน้าข้างหลังเลื่อนตามขณะเปิดตารางอยู่ (ตารางข้างในยังเลื่อนได้ปกติ)
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // ลำดับเดียวกับ Ranger Book: ตัวใหม่อยู่ก่อน (sortOrder มากไปน้อย)
  // ส่วนตัวพิเศษ (sortOrder > 2000 เช่นเรนเจอร์ทดสอบ/ตัวระบบ) ถูกดันไปท้ายสุดทั้งก้อน
  const filtered = useMemo(() => {
    let list = allRows
      .filter(r => allowAll || RANGER_ID_RE.test(r.id))
      .filter(r => !minGrade || (r.grade ?? 0) >= minGrade)
      .sort((a, b) => {
      const aSpecial = a.sortOrder > 2000
      const bSpecial = b.sortOrder > 2000
      if (aSpecial !== bSpecial) return aSpecial ? 1 : -1
      return b.sortOrder - a.sortOrder
    })
    const match = makeRangerMatcher(search, names)
    if (match) list = list.filter(r => match(r.id, r.name, tRanger(r.id, r.name)))
    if (filters.grades.length > 0)     list = list.filter(r => r.grade != null && filters.grades.includes(r.grade))
    if (filters.evolutions.length > 0) list = list.filter(r => filters.evolutions.includes(r.evolution ?? 'normal'))
    if (filters.types.length > 0)      list = list.filter(r => r.type != null && filters.types.includes(r.type))
    if (filters.roles.length > 0)      list = list.filter(r => r.role != null && filters.roles.includes(r.role))
    if (filters.elements.length > 0)   list = list.filter(r => filters.elements.includes(r.element ?? 'none'))
    return list
  }, [allRows, allowAll, minGrade, search, filters, names, tRanger])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const pageRows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)
  const activeCount = Object.values(filters).reduce((n, a) => n + a.length, 0)


  const chip = (on: boolean, cls?: string) =>
    `h-7 px-2 rounded-lg border text-xs inline-flex items-center gap-1 transition-colors ${
      on ? (cls ?? 'text-cyan-200 border-cyan-500 bg-cyan-500/20') : 'text-gray-400 border-slate-700 bg-slate-800 hover:bg-slate-700'
    }`

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* ล็อกความสูงตายตัว (h ไม่ใช่ max-h) — หน้าที่มีเรนเจอร์ไม่กี่ตัวจะได้ไม่หุบลง
          ตัวกริดข้างในเป็น flex-1 + scroll อยู่แล้ว กรอบจึงคงขนาดเดิมทุกหน้า */}
      <div className="card-glass w-full h-[88vh] flex flex-col rounded-2xl relative overflow-hidden" style={{ maxWidth: '56rem' }}>
        <button onClick={onClose} className="absolute top-3 right-3 text-gray-400 hover:text-white z-10" aria-label="close">
          <span className="material-icons-round">close</span>
        </button>

        <div className="px-4 sm:px-5 pt-4 pb-3 border-b border-white/10 shrink-0">
          <h3 className="text-white font-bold text-sm mb-2 pr-8">{title}</h3>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <span className="material-icons-round absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 text-base">search</span>
              <input
                type="text" value={search} onChange={e => setSearch(e.target.value)} autoFocus
                placeholder={tStat('Search ranger name or ID...')}
                className="w-full h-9 pl-8 pr-2 rounded-lg bg-slate-900 border border-slate-700 text-gray-100 text-sm focus:outline-none focus:border-cyan-500"
              />
            </div>
            <button
              type="button" onClick={() => setFilterOpen(o => !o)}
              className={chip(activeCount > 0) + ' h-9 px-3'}
            >
              <span className="material-icons-round text-base">tune</span>
              {activeCount > 0 ? activeCount : ''}
            </button>
            {activeCount > 0 && (
              <button type="button" onClick={() => setFilters(NO_FILTERS)}
                className="h-9 px-2 rounded-lg border border-slate-700 bg-slate-800 text-gray-400 text-xs hover:bg-slate-700">
                {tStat('Clear')}
              </button>
            )}
          </div>

          {filterOpen && (
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap gap-1">
                {GRADES.filter(g => g >= minGrade).map(g => (
                  <button key={g} type="button" className={chip(filters.grades.includes(g))}
                    onClick={() => setFilters(f => ({ ...f, grades: toggle(f.grades, g) }))}>
                    {g}★
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1">
                {EVOLUTIONS.map(e => (
                  <button key={e.value} type="button" className={chip(filters.evolutions.includes(e.value), e.cls)}
                    onClick={() => setFilters(f => ({ ...f, evolutions: toggle(f.evolutions, e.value) }))}>
                    {tStat(e.label)}
                  </button>
                ))}
                {TYPES.map(t => (
                  <button key={t.value} type="button" className={chip(filters.types.includes(t.value))}
                    onClick={() => setFilters(f => ({ ...f, types: toggle(f.types, t.value) }))}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={t.img} alt={t.value} className="h-4 w-4 object-contain" />
                    {t.value}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1">
                {ROLES.map(r => (
                  <button key={r.value} type="button" className={chip(filters.roles.includes(r.value), r.cls)}
                    onClick={() => setFilters(f => ({ ...f, roles: toggle(f.roles, r.value) }))}>
                    {tStat(r.label)}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1">
                {ELEMENTS.map(e => (
                  <button key={e.value} type="button" className={chip(filters.elements.includes(e.value))}
                    onClick={() => setFilters(f => ({ ...f, elements: toggle(f.elements, e.value) }))}>
                    {e.img && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={e.img} alt={e.label} className="h-4 w-4 object-contain" />
                    )}
                    {tStat(e.label)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4">
          {loading ? (
            <div className="text-gray-400 text-sm flex items-center gap-2 justify-center py-10">
              <span className="material-icons-round text-sm animate-spin">autorenew</span> Loading...
            </div>
          ) : pageRows.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-10">{tStat('No results')}</p>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
              {pageRows.map(r => {
                const star = starImg(r.grade, r.evolution)
                return (
                  <button
                    key={r.id} type="button"
                    onClick={() => onPick(r)}
                    className="rounded-xl p-1.5 border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/25 active:scale-95 transition-all"
                  >
                    <div className="w-full aspect-square flex items-center justify-center relative">
                      {extraIds.has(r.id) && (
                        <span className="absolute top-0 right-0 z-10 px-1 rounded bg-pink-500 text-[9px] font-black leading-[14px] text-white shadow" title="ตัวใหม่ — ยังไม่มีข้อมูลใน Ranger Book">NEW</span>
                      )}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={thumb(r.id)} alt={r.name}
                        className="max-h-full max-w-full object-contain pointer-events-none"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                    </div>
                    {star && (
                      <div className="flex justify-center mt-0.5">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={star} alt="" className="h-3 object-contain pointer-events-none"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                      </div>
                    )}
                    <div className="mt-0.5 text-[10px] leading-tight text-center text-gray-300 line-clamp-2 min-h-[2.2em]">
                      {tRanger(r.id, r.name)}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-white/10 shrink-0">
          <Pagination
            page={safePage} totalPages={totalPages} onChange={setPage}
            info={<>{filtered.length ? safePage * PAGE_SIZE + 1 : 0}–{Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} / {filtered.length}</>}
          />
        </div>
      </div>
    </div>
  )
}
