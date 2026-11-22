'use client'

// ====================================================
// Public Ranger Book — ดูข้อมูลเรนเจอร์ทั้งหมด (ไม่ต้อง login)
// ====================================================

import { apiFetch } from '@/lib/staticApi'
import { makeRangerMatcher, useRangerNames } from '@/lib/rangerSearch'
import { useState, useEffect, useMemo } from 'react'
import GachaRangerDetailPopup from '@/components/GachaRangerDetailPopup'
import type { AbilityOption } from '@/server/api/ranger-abilities/route'
import type { SkillFxPayload } from '@/server/api/ranger-skill-effects/route'
import { useLanguage } from '@/contexts/LanguageContext'
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
  return EVOLUTION_LIST.find(x => x.value === evo) ?? EVOLUTION_LIST[0]
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
  abilities: string[]      // เก็บเป็น ability code
  skillFx: string[]        // โค้ดเอฟเฟกต์สกิล (fx<index>) — ผูกกับภาษาที่โหลดมา
  /** OR = มีอันใดอันหนึ่ง / AND = ต้องมีครบ — ใช้กับทั้ง Ability และความสามารถสกิล (แต่ละหมวดคิดแยก แล้วต้องผ่านทั้งสองหมวด) */
  fxMode: 'or' | 'and'
}
const EMPTY_FILTERS: Filters = { grades: [], evolutions: [], types: [], roles: [], elements: [], abilities: [], skillFx: [], fxMode: 'or' }

/** กล่องติ๊กเลือกแบบเดียวกับตัวกรองค่าเกียร์ใน Gear Book — กดหัวกล่องเพื่อพับ/กาง (เริ่มต้นพับไว้) */
function CheckGrid({ title, loading, loadingText, searchText, options, selected, onToggle, modeToggle }: {
  title: string
  loading: boolean
  loadingText: string
  searchText: string
  options: { code: string; label: string; badge?: string; icon?: string; count?: number }[]
  selected: string[]
  onToggle: (code: string) => void
  modeToggle?: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  // ค้นหาในกล่อง — โชว์หลังกางกล่องแล้วเท่านั้น
  const [q, setQ] = useState('')
  const shown = useMemo(() => {
    const k = q.trim().toLowerCase()
    return k ? options.filter(o => o.label.toLowerCase().includes(k)) : options
  }, [options, q])
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => setOpen(o => !o)} className="flex-1 flex items-center gap-1.5 min-w-0 text-left text-xs text-gray-300 hover:text-white font-bold">
          <span className={`material-icons-round transition-transform ${open ? 'rotate-90' : ''}`} style={{ fontSize: 18 }}>chevron_right</span>
          <span className="truncate">{title}</span>
          {selected.length > 0 && (
            <span className="bg-purple-500 text-white text-[10px] rounded-full px-1.5 py-0.5 shrink-0">{selected.length}</span>
          )}
        </button>
        {modeToggle}
      </div>
      {!open ? null : loading && options.length === 0 ? (
        <p className="text-xs text-gray-500 py-2 mt-2">{loadingText}</p>
      ) : (
        <>
          <div className="relative mt-2">
            <span className="material-icons-round absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" style={{ fontSize: 16 }}>search</span>
            <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder={searchText}
              className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-purple-500/50" />
          </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 mt-2">
          {shown.map(o => {
            const on = selected.includes(o.code)
            return (
              <label key={o.code} title={o.label}
                className={`flex items-center gap-2 min-w-0 cursor-pointer text-sm py-0.5 px-1.5 -mx-1.5 rounded-md transition-colors ${on ? 'bg-purple-500/20 text-yellow-200' : 'text-gray-300 hover:text-white hover:bg-white/5'}`}>
                <input type="checkbox" checked={on} onChange={() => onToggle(o.code)} className="w-4 h-4 shrink-0 accent-purple-500" />
                {o.icon && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={o.icon} alt="" loading="lazy" className="w-6 h-6 object-contain shrink-0"
                    onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden' }} />
                )}
                <span className="truncate">{o.label}</span>
                {o.badge && (
                  <span className="shrink-0 text-[9px] font-bold px-1 rounded bg-amber-400/20 text-amber-300 border border-amber-400/30">{o.badge}</span>
                )}
                {/* จำนวนเรนเจอร์ — ชิดขวาสุดของแถว */}
                {o.count != null && (
                  <span className="ml-auto pl-2 shrink-0 text-[11px] text-gray-500 tabular-nums">{o.count}</span>
                )}
              </label>
            )
          })}
        </div>
        </>
      )}
    </div>
  )
}

interface AbilityData {
  abilities: AbilityOption[]
  /** unitCode → index ของ ability ใน abilities[] */
  byRanger: Record<string, number[]>
}
// โหลดครั้งเดียวต่อ session — 55KB ไม่ต้องยิงซ้ำทุกครั้งที่เปิดป๊อปอัพ
let abilityCache: AbilityData | null = null

// ⚠️ ต้องบวกเลขนี้ทุกครั้งที่แก้วิธีตั้งชื่อ/จัดกลุ่ม ability ใน /api/ranger-abilities
// คำตอบของ API ถูก cache ในเบราว์เซอร์ 7 วัน แก้ฝั่ง server เฉยๆ คนที่เคยเปิดจะยังเห็นของเก่า
// จนกว่าจะหมดอายุ — เลขนี้อยู่ใน URL พอเปลี่ยนก็กลายเป็นคนละรายการ cache ทันที
// (เคยเจอมาแล้วกับ /res สมัยที่ยังเป็น API บนเซิร์ฟเวอร์)
// v2 = เลิกเชื่อ nameCode ก่อน `${code}_nm` ซึ่งทำให้กลุ่มคนละเรื่องถูกยุบรวมกัน
//      (Delicious in Dungeon โดนรวมเข้า Chained Soldier / Attack on Titan2 เข้า Re:ZERO
//       / GACHIAKUTA เข้า CHAINSAW MAN)
// v3 = รวม Awakening ability (aab*) เข้ามาด้วย + เพิ่ม nameCode/group/awaken ในแต่ละตัวเลือก
const ABILITY_RULES_VERSION = 3

// ตัวกรองความสามารถสกิล (ไม่สนตัวเลข) — แยกตามภาษา, โหลดตอนเปิดป๊อปอัพครั้งแรก
// ⚠ แก้วิธีแตกข้อความใน /api/ranger-skill-effects เมื่อไหร่ต้องบวกเลขนี้ (เหตุผลเดียวกับ ABILITY_RULES_VERSION)
const SKILL_FX_RULES_VERSION = 5
const skillFxCache: Record<string, SkillFxPayload> = {}

function toggleItem<T>(arr: T[], item: T): T[] {
  return arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item]
}


export default function PublicRangerBookPage() {
  const { t, lang, tRanger, tStat, tAbility } = useLanguage()
  const [rangers, setRangers] = useState<RangerRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [detailRanger, setDetailRanger] = useState<RangerRecord | null>(null)
  const [pageSize, setPageSize] = useState(25)
  const [page, setPage] = useState(0)
  const [abilityData, setAbilityData] = useState<AbilityData | null>(abilityCache)
  const [abilityLoading, setAbilityLoading] = useState(false)
  const [skillFxData, setSkillFxData] = useState<SkillFxPayload | null>(null)
  const [skillFxLoading, setSkillFxLoading] = useState(false)

  useEffect(() => {
    apiFetch('/api/ranger-book')
      .then(r => r.json())
      .then(d => { setRangers(d.rangers ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { setPage(0) }, [search, filters, pageSize])

  // ชื่อไทย + อังกฤษ สำหรับค้นข้ามภาษา — โหลดตอนเริ่มพิมพ์ค้นหาครั้งแรก (src/lib/rangerSearch.ts)
  const names = useRangerNames(search.trim() !== '')

  // โหลดตอนเปิดหน้าต่าง Filter ครั้งแรกเท่านั้น — คนที่ไม่ได้ใช้ตัวกรองไม่ต้องโหลดอะไรเพิ่ม
  useEffect(() => {
    if (!filterOpen || abilityCache) return
    setAbilityLoading(true)
    let cancelled = false
    apiFetch(`/api/ranger-abilities?v=${ABILITY_RULES_VERSION}`)
      .then(r => r.json() as Promise<AbilityData>)
      .then(d => {
        if (!d?.abilities?.length) return
        // ⚠ ห้ามเรียง abilities ใหม่ตรงนี้ — byRanger อ้างถึงตำแหน่งในอาเรย์นี้
        //   ขยับลำดับเมื่อไหร่ ตัวกรองจะไปจับ ability ผิดตัวทันที
        //   (การเรียงเพื่อแสดงผลทำใน abilityOptions ซึ่งใช้ code เป็นตัวอ้างอิง ไม่ใช่ index)
        abilityCache = d
        if (!cancelled) setAbilityData(d)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setAbilityLoading(false) })
    return () => { cancelled = true }
  }, [filterOpen])

  // เปลี่ยนภาษา = รายการเอฟเฟกต์คนละชุด (โค้ดไม่ตรงกัน) → ล้างตัวที่เลือกไว้แล้วโหลดใหม่เมื่อจำเป็น
  useEffect(() => {
    setSkillFxData(skillFxCache[lang] ?? null)
    setFilters(f => (f.skillFx.length ? { ...f, skillFx: [] } : f))
  }, [lang])

  useEffect(() => {
    if (!filterOpen || skillFxCache[lang]) return
    setSkillFxLoading(true)
    let cancelled = false
    apiFetch(`/api/ranger-skill-effects?lang=${lang}&v=${SKILL_FX_RULES_VERSION}`)
      .then(r => r.json() as Promise<SkillFxPayload>)
      .then(d => {
        if (!d?.abilities?.length) return
        skillFxCache[lang] = d
        if (!cancelled) setSkillFxData(d)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setSkillFxLoading(false) })
    return () => { cancelled = true }
  }, [filterOpen, lang])

  useEffect(() => {
    if (!filterOpen) return
    if (!window.matchMedia('(max-width: 639px)').matches) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [filterOpen])

  const displayed = useMemo(() => {
    let list = [...rangers].sort((a, b) => {
      const aSpecial = a.sortOrder > 2000
      const bSpecial = b.sortOrder > 2000
      if (aSpecial !== bSpecial) return aSpecial ? 1 : -1
      return b.sortOrder - a.sortOrder
    })
    // ค้นได้ทั้งชื่อไทย ชื่ออังกฤษ และ id ไม่ว่าอยู่โหมดภาษาไหน
    const match = makeRangerMatcher(search, names)
    if (match) list = list.filter(r => match(r.id, r.name, tRanger(r.id, r.name)))
    if (filters.grades.length > 0)     list = list.filter(r => r.grade != null && filters.grades.includes(r.grade))
    if (filters.evolutions.length > 0) list = list.filter(r => filters.evolutions.includes(r.evolution ?? 'normal'))
    if (filters.types.length > 0)      list = list.filter(r => r.type != null && filters.types.includes(r.type))
    if (filters.roles.length > 0)      list = list.filter(r => r.role != null && filters.roles.includes(r.role))
    if (filters.elements.length > 0)   list = list.filter(r => filters.elements.includes(r.element ?? 'none'))
    // ability เก็บเป็น code แต่ byRanger เก็บเป็น index — แปลงเป็น set ของ index ก่อนแล้วค่อยกรอง
    // (เลือกได้หลายอัน = มีอันใดอันหนึ่งก็ผ่าน เหมือนตัวกรองกลุ่มอื่น)
    if (filters.abilities.length > 0 && abilityData) {
      const want = new Set<number>()
      abilityData.abilities.forEach((a, i) => { if (filters.abilities.includes(a.code)) want.add(i) })
      list = list.filter(r => {
        const mine = abilityData.byRanger[r.id] ?? []
        return filters.fxMode === 'and' ? [...want].every(i => mine.includes(i)) : mine.some(i => want.has(i))
      })
    }
    // เอฟเฟกต์สกิล: OR = มีอันใดอันหนึ่ง / AND = ต้องมีครบทุกอัน
    if (filters.skillFx.length > 0 && skillFxData) {
      const want: number[] = []
      skillFxData.abilities.forEach((a, i) => { if (filters.skillFx.includes(a.code)) want.push(i) })
      list = list.filter(r => {
        const mine = skillFxData.byRanger[r.id] ?? []
        return filters.fxMode === 'and' ? want.every(i => mine.includes(i)) : want.some(i => mine.includes(i))
      })
    }
    return list
  }, [rangers, search, filters, names, tRanger, abilityData, skillFxData])

  const totalPages = Math.max(1, Math.ceil(displayed.length / pageSize))
  const safePage = Math.min(page, totalPages - 1)
  const pageRows = displayed.slice(safePage * pageSize, (safePage + 1) * pageSize)
  const startRow = safePage * pageSize + 1
  const endRow = Math.min((safePage + 1) * pageSize, displayed.length)
  // ตัวเลือกในกล่องติ๊ก — เรียงเพื่อแสดงผลเท่านั้น (อ้างด้วย code ไม่ใช่ index)
  // ability: ปกติ (เรียงชื่อ) → ability กลุ่มอยู่ล่างสุด / awakening มีป้ายกำกับเพราะชื่อซ้ำกับ ability ปกติ
  const abilityOptions = useMemo(() => {
    if (!abilityData) return []
    return [...abilityData.abilities]
      .map(a => ({ code: a.code, label: tAbility(a.nameCode, a.name), count: a.count, group: !!a.group, badge: a.awaken ? tStat('Awakening') : undefined }))
      .sort((a, b) => (a.group !== b.group ? (a.group ? 1 : -1) : a.label.localeCompare(b.label, lang)))
  }, [abilityData, tAbility, tStat, lang])

  // แยกเป็นสกิลโจมตี / สกิลบัฟ + รูปสกิลตัวอย่าง (สกิลที่มีเอฟเฟกต์นี้บ่อยสุด)
  const skillFxOptions = useMemo(() => {
    type Opt = { code: string; label: string; icon: string; count: number }
    const out = { atk: [] as Opt[], buff: [] as Opt[] }
    for (const a of skillFxData?.abilities ?? []) out[a.kind === 'buff' ? 'buff' : 'atk'].push({ code: a.code, label: a.name, icon: a.icon, count: a.count })
    out.atk.sort((a, b) => a.label.localeCompare(b.label, lang))
    out.buff.sort((a, b) => a.label.localeCompare(b.label, lang))
    return out
  }, [skillFxData, lang])

  const activeFilterCount = filters.grades.length + filters.evolutions.length + filters.types.length + filters.roles.length + filters.elements.length + filters.abilities.length + filters.skillFx.length

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-black text-white flex items-center gap-2">
          <span className="material-icons-round text-yellow-400">menu_book</span>
          Ranger Book
        </h1>
        <p className="text-sm text-gray-400 mt-0.5">{tStat('All rangers')} {rangers.length} {tStat('rangers')}</p>
      </div>

      {/* Sticky Search + Filter */}
      <div className="sticky top-12 z-20 -mx-4 px-4 py-2.5 bg-[#1A0A2E]/95 backdrop-blur-md border-b border-white/10 mb-4">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <span className="material-icons-round absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg pointer-events-none">search</span>
            <input
              type="text"
              placeholder={tStat('Search ranger name or ID...')}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-9 py-2 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-purple-500/50 transition-all"
            />
            {search && (
              <button onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors">
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
            <span className="hidden sm:inline">{tStat('Filter').toUpperCase()}</span>
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

      {/* Filter Modal */}
      {filterOpen && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) setFilterOpen(false) }}
        >
          <div className="w-full max-w-4xl max-h-[85vh] overflow-y-auto rounded-2xl bg-[#1A0A2E] border border-white/15 shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div className="flex items-center gap-2">
                <span className="material-icons-round text-purple-400 text-lg">tune</span>
                <span className="font-bold text-white text-sm">{tStat('Filter')}</span>
                {activeFilterCount > 0 && (
                  <span className="bg-purple-500 text-white text-xs rounded-full px-1.5 py-0.5">{activeFilterCount}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {activeFilterCount > 0 && (
                  <button onClick={() => setFilters(EMPTY_FILTERS)}
                    className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
                    {tStat('Clear all')}
                  </button>
                )}
                <button onClick={() => setFilterOpen(false)} className="text-gray-400 hover:text-white transition-colors">
                  <span className="material-icons-round text-xl">close</span>
                </button>
              </div>
            </div>
            <div className="p-5 space-y-5">
              {/* Grade */}
              <div>
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-2">{tStat('Grade')}</p>
                <div className="flex flex-wrap gap-2">
                  {GRADE_LIST.map(g => (
                    <button key={g}
                      onClick={() => setFilters(f => ({ ...f, grades: toggleItem(f.grades, g) }))}
                      className={`p-1 rounded-lg border transition-colors ${filters.grades.includes(g) ? 'border-yellow-400 bg-yellow-400/20' : 'border-white/15 bg-white/5 hover:border-white/30'}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={gradeImg(g)} alt={`${g}★`} className="h-4 object-contain"
                        onError={e => { (e.target as HTMLImageElement).style.display='none' }} />
                    </button>
                  ))}
                </div>
              </div>
              {/* Evolution */}
              <div>
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-2">{tStat('Evolution')}</p>
                <div className="flex flex-wrap gap-2">
                  {EVOLUTION_LIST.map(evo => (
                    <button key={evo.value}
                      onClick={() => setFilters(f => ({ ...f, evolutions: toggleItem(f.evolutions, evo.value) }))}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors ${filters.evolutions.includes(evo.value) ? evo.color : 'border-white/15 bg-white/5 text-gray-400 hover:border-white/30'}`}
                    >
                      {tStat(evo.label)}
                    </button>
                  ))}
                </div>
              </div>
              {/* Type */}
              <div>
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-2">{tStat('Type')}</p>
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
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-2">{tStat('Element')}</p>
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
                      {tStat(el.label)}
                    </button>
                  ))}
                </div>
              </div>
              {/* Ability + ความสามารถสกิล — กล่องติ๊กแบบเดียวกับค่าเกียร์ใน Gear Book */}
              <CheckGrid
                title={tStat('Ability')}
                loading={abilityLoading} loadingText={tStat('Loading...')} searchText={tStat('Search')}
                options={abilityOptions}
                selected={filters.abilities}
                onToggle={c => setFilters(f => ({ ...f, abilities: toggleItem(f.abilities, c) }))}
                modeToggle={
                  <div className="flex rounded-lg overflow-hidden border border-white/15 text-xs font-bold shrink-0">
                    {(['or', 'and'] as const).map(m => (
                      <button key={m}
                        onClick={() => setFilters(f => ({ ...f, fxMode: m }))}
                        title={tStat(m === 'or' ? 'Match any (OR)' : 'Match all (AND)')}
                        className={`px-3 py-1 transition-colors ${filters.fxMode === m ? 'bg-purple-500 text-white' : 'bg-white/5 text-gray-400 hover:text-white'}`}
                      >
                        {m.toUpperCase()}
                      </button>
                    ))}
                  </div>
                }
              />
              {/* ความสามารถสกิล — จากบรรทัด "* ..." ในคำอธิบายสกิล ตัดตัวเลขทิ้งแล้ว */}
              {([['atk', 'Attack Skill Effect'], ['buff', 'Buff Skill Effect']] as const).map(([k, title]) => (
                <CheckGrid key={k}
                  title={tStat(title)}
                  loading={skillFxLoading} loadingText={tStat('Loading...')} searchText={tStat('Search')}
                  options={skillFxOptions[k]}
                  selected={filters.skillFx.filter(c => skillFxOptions[k].some(o => o.code === c))}
                  onToggle={c => setFilters(f => ({ ...f, skillFx: toggleItem(f.skillFx, c) }))}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-center py-16">
          <span className="material-icons-round text-5xl text-yellow-400 animate-pulse">menu_book</span>
          <p className="text-gray-400 text-sm mt-3">{tStat('Loading...')}</p>
        </div>
      )}

      {/* Empty */}
      {!loading && rangers.length === 0 && (
        <div className="card-glass rounded-2xl p-12 text-center">
          <span className="material-icons-round text-5xl text-gray-600">menu_book</span>
          <p className="text-gray-400 mt-3">{tStat('No ranger data')}</p>
        </div>
      )}

      {/* Table */}
      {!loading && rangers.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span>Rows:</span>
              {PAGE_SIZE_OPTIONS.map(n => (
                <button key={n} onClick={() => setPageSize(n)}
                  className={`px-2.5 py-1 rounded-lg border font-semibold transition-colors ${
                    pageSize === n
                      ? 'border-purple-400 bg-purple-500/20 text-purple-300'
                      : 'border-white/15 bg-white/5 text-gray-400 hover:border-white/30'
                  }`}>
                  {n}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500">
              {displayed.length > 0 ? `${startRow}–${endRow} ${tStat('of')} ${displayed.length} ${tStat('rangers')}` : `0 ${tStat('rangers')}`}
              {(search || activeFilterCount > 0) && rangers.length !== displayed.length && ` (${tStat('filtered')} ${rangers.length} ${tStat('rangers')})`}
            </p>
          </div>

          <div className="card-glass rounded-2xl overflow-hidden">
            <table className="w-full text-sm table-fixed">
              <colgroup>
                <col className="w-7 sm:w-9" />
                <col className="w-11 sm:w-12" />
                <col className="w-28 sm:w-40" />
                <col className="w-12 hidden sm:table-column" />
                <col className="w-20 hidden sm:table-column" />
                <col className="w-9 sm:w-11" />
                <col className="w-20 hidden sm:table-column" />
                <col className="w-9 sm:w-11" />
              </colgroup>
              <thead>
                <tr className="border-b border-white/10 text-xs text-gray-400 uppercase tracking-wider">
                  <th className="py-3 px-2 text-left">#</th>
                  <th className="py-3 px-1 text-left">{tStat('Img')}</th>
                  <th className="py-3 px-2 text-left">{tStat('Name / ID')}</th>
                  <th className="py-3 px-2 text-center hidden sm:table-cell">{tStat('Grade')}</th>
                  <th className="py-3 px-2 text-center hidden sm:table-cell">{tStat('Evolution')}</th>
                  <th className="py-3 px-2 text-center">{tStat('Type')}</th>
                  <th className="py-3 px-2 text-center hidden sm:table-cell">{tStat('Role')}</th>
                  <th className="py-3 px-2 text-center">{tStat('Elem')}</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r, idx) => {
                  const evo = evolutionBadge(r.evolution)
                  const tImg = typeImg(r.type)
                  const rBadge = roleBadge(r.role)
                  const eImg = elementImg(r.element)
                  return (
                    <tr key={r.id}
                      onClick={() => setDetailRanger(r)}
                      className="border-b border-white/5 hover:bg-white/10 active:bg-white/15 cursor-pointer transition-colors">
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
                        <p className="text-white font-semibold leading-tight text-xs sm:text-sm break-words">{t('unit', `${r.id}_nm`, r.name)}</p>
                        {r.grade != null && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={gradeImg(r.grade, r.evolution)} alt={`${r.grade}★`}
                            className="h-3 mt-0.5 object-contain sm:hidden"
                            onError={e => { (e.target as HTMLImageElement).style.display='none' }} />
                        )}
                        <p className="text-gray-500 text-[10px] truncate mt-0.5 hidden sm:block">{r.id}</p>
                      </td>
                      <td className="py-2 px-2 text-center hidden sm:table-cell">
                        {r.grade != null ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={gradeImg(r.grade, r.evolution)} alt={`${r.grade}★`} className="h-5 sm:h-6 object-contain mx-auto"
                            onError={e => { (e.target as HTMLImageElement).style.display='none' }} />
                        ) : <span className="text-gray-600">—</span>}
                      </td>
                      <td className="py-2 px-2 text-center hidden sm:table-cell">
                        <span className={`text-xs font-bold px-2 py-1 rounded border ${evo.color}`}>
                          {tStat(evo.label === 'Normal Ranger' ? 'Normal' : evo.label === 'Ultra Ranger' ? 'Ultra' : 'Hyper')}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-center">
                        {tImg
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={tImg} alt={r.type ?? ''} className="h-5 sm:h-7 object-contain mx-auto" />
                          : <span className="text-gray-600">—</span>}
                      </td>
                      <td className="py-2 px-2 text-center hidden sm:table-cell">
                        {rBadge
                          ? <span className={`text-xs font-bold px-2 py-1 rounded border ${rBadge.color}`}>{tStat(rBadge.label)}</span>
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

          {/* Pagination */}
          {totalPages > 1 && <Pagination page={safePage} totalPages={totalPages} onChange={setPage} className="mt-5" />}
        </>
      )}

      {/* Ranger Detail Popup */}
      {detailRanger && (
        <GachaRangerDetailPopup
          rangerId={detailRanger.id}
          rangerName={detailRanger.name}
          rangerImageUrl={`https://rangers.lerico.net/res/${detailRanger.id}/${detailRanger.id}-thum.png`}
          mode="book"
          onClose={() => setDetailRanger(null)}
        />
      )}
    </div>
  )
}
