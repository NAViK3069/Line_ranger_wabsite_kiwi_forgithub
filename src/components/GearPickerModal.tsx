'use client'

// ====================================================
// GearPickerModal — เลือกเกียร์ใส่ใน Ranger Book
// กดเกียร์ → เปิด GearDetailPopup → กด "ติดตั้ง" เพื่อยืนยัน
// Tier logic: grade + switchableType + SKILL+ ตรงเรนเจอร์
//   - skillPlusNames มาจาก lazy batch fetch (gear-effects-batch)
//   - API enrichment (gear-book v2) ใช้เป็น fallback ก่อน fetch เสร็จ
// ====================================================

import { apiFetch } from '@/lib/staticApi'
import { useEffect, useRef, useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import GearDetailPopup from '@/components/GearDetailPopup'
import type { RangerContext } from '@/lib/switchableSelector'
import { skillPlusHits, hasSkillPlusRows, type SkillGame } from '@/lib/rangerGameCalc'
import type { SkillPlusEffectGrowth } from '@/lib/gearLevelCalc'
import { useLanguage } from '@/contexts/LanguageContext'
import { useSound } from '@/contexts/SoundContext'

export interface GearBookItem {
  id:              string
  name:            string
  grade:           number | null
  slot:            string | null
  iconUrl:         string
  switchableType:  string | null
  skillPlusNames?: string[]   // จาก gear-book API v2 (fallback ก่อน lazy fetch เสร็จ)
}

export type SlotKey = 'WPN' | 'AMR' | 'ACC'

export interface GearPickerModalProps {
  slot:                     SlotKey
  rangerElement:            string | null
  rangerCategory:           string | null
  rangerCtx?:               RangerContext
  rangerSkills?:            SkillGame[]   // สกิลของเรนเจอร์ (ตาราง skill) → จับคู่ SKILL+ ด้วยตาราง eqip_skl_plus_grp
  rangerAbilityCodes?:      string[]      // โค้ด Ability ของเรนเจอร์ → ab201_flight = บินได้ (เกียร์พื้นฐาน)
  // ── picker preview context — ตรวจเงื่อนไขก่อนติดตั้ง ──
  otherSlotsLockedNames?:   string[]                                        // ชื่อ effect ที่ slot อื่น lock ไว้ → preview กรองออก
  occupiedSwitchableTypes?: string[]                                        // trigTypes ที่ slot อื่นครอบครองแล้ว
  existingSkillPlus?:       Array<{ group: number; amount: number; slot: string }> // SKILL+ จาก slot อื่น (attrNumberGroup + ค่า)
  currentGearBasicEffects?: Array<{ name: string; value: string }>          // Basic Effect ของเกียร์ที่ใส่อยู่ → เปรียบเทียบ up/down/equal
  onSelect:                 (gear: GearBookItem, level: number, specLevel: number) => void   // level (0-15) / specLevel (0-5, 9★) = ค่าที่ตั้งไว้ตอน preview ก่อนกดติดตั้ง
  onClose:                  () => void
}

// ── Constants ─────────────────────────────────────────
const ELEM_TO_SWITCH: Record<string, string> = {
  fire: 'FIRE', water: 'WATER',
  wood: 'TREE', tree: 'TREE', nature: 'TREE', earth: 'TREE', plant: 'TREE',
  light: 'LIGHT', holy: 'LIGHT',
  dark: 'DARK', shadow: 'DARK',
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
const SLOT_LABEL: Record<SlotKey, string> = { WPN: 'Weapon', AMR: 'Armor', ACC: 'Accessory' }
const SLOT_IMG: Record<SlotKey, string> = {
  WPN: '/gacha/images/gear_weapon.png',
  AMR: '/gacha/images/gear_armor.png',
  ACC: '/gacha/images/gear_accessory.png',
}
// tier 1-2 = 8★/9★ + SKILL+ ตรง (best → green button)
// tier 3-4 = 8★/9★ ไม่มี SKILL+ ตรง
// tier 5-6 = ≤7★ (เดิม tier 3-4)
// หมายเหตุ: label ไม่ใส่เลขดาวตายตัว (เดิมเขียน "8★" แข็งๆ ทำให้เกียร์ 9★ ขึ้นป้ายผิดเกรด)
//   → เลขดาวต่อ dynamic จาก gear.grade ตอน render แทน (ดู renderTierBadge ด้านล่าง)
const TIER_CONFIG = {
  1: { label: 'Element Match',  color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50', showGrade: true  },
  2: { label: 'Category Match', color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50',       showGrade: true  },
  3: { label: 'Element Match',  color: 'bg-amber-500/20 text-amber-300 border-amber-500/50',    showGrade: true  },
  4: { label: 'Category Match', color: 'bg-blue-500/20 text-blue-300 border-blue-500/50',       showGrade: true  },
  5: { label: 'Element Match',  color: 'bg-orange-500/20 text-orange-300 border-orange-500/50', showGrade: false },
  6: { label: 'Category Match', color: 'bg-purple-500/20 text-purple-300 border-purple-500/50', showGrade: false },
} as const

// ── Module-level gear-list cache ───────────────────────
let _gearCache: GearBookItem[] | null = null
let _gearFetch: Promise<GearBookItem[]> | null = null

function getGearBookData(): Promise<GearBookItem[]> {
  if (_gearCache) return Promise.resolve(_gearCache)
  if (!_gearFetch) {
    _gearFetch = apiFetch('/api/gear-book')
      .then(r => r.json())
      .then(d => { _gearCache = Array.isArray(d.items) ? d.items : []; return _gearCache! })
      .catch(() => { _gearFetch = null; return [] })
  }
  return _gearFetch
}

// ── Tier logic ────────────────────────────────────────
// tier 1 = 8★/9★ + SKILL+ ตรง + ธาตุตรง    (ดีที่สุด → เขียว)
// tier 2 = 8★/9★ + SKILL+ ตรง + สายตรง     (ดีมาก   → เขียว)
// tier 3 = 8★/9★ ธาตุตรง (SKILL+ ไม่ตรง)   (รองมา)
// tier 4 = 8★/9★ สายตรง  (SKILL+ ไม่ตรง)   (รองมา)
// tier 5 = ≤7★ ธาตุตรง
// tier 6 = ≤7★ สายตรง
// 9★ ใช้เงื่อนไขเดียวกับ 8★ เป๊ะๆ (ต่างกันแค่เกรด ไม่มีกฎพิเศษเพิ่ม)
// sp: undefined = ยังไม่รู้ (ไม่กรอง) / [] หรือไม่มีแถวจับคู่ = ไม่มีข้อมูล (ไม่กรอง) / [...] = จับคู่ด้วยตารางเกม
function getRecommendTier(
  gear: GearBookItem,
  elemSw: string | null,
  catSw: string | null,
  rangerSkills: SkillGame[],
  sp: SkillPlusEffectGrowth[] | undefined,
): 1 | 2 | 3 | 4 | 5 | 6 | null {
  const sw = gear.switchableType?.toUpperCase() ?? ''
  const elemMatch = elemSw ? sw === elemSw : false
  const catMatch  = catSw  ? sw === catSw.toUpperCase() : false
  // 9★ ใช้เงื่อนไขเดียวกับ 8★ เป๊ะๆ — เกียร์ระดับสูงสุดทั้งคู่ ไม่มีกฎแยก
  const isTopGrade = gear.grade === 8 || gear.grade === 9

  if (isTopGrade) {
    // ranger ไม่มี skill เลย → SKILL+ ไม่มีทางตรง → ไม่ได้ tier 1/2 เด็ดขาด
    const hasSkills = rangerSkills.length > 0
    const canCheck  = hasSkills && sp != null && sp.some(hasSkillPlusRows)
    const skillPlusMatch = hasSkills && (!canCheck || sp!.some(g => skillPlusHits(g, rangerSkills).length > 0))
    if (skillPlusMatch) {
      if (elemMatch) return 1
      if (catMatch)  return 2
    }
    // 8★/9★ แต่ SKILL+ ไม่ตรง (หรือยังไม่มีข้อมูล) → tier 3/4
    if (elemMatch) return 3
    if (catMatch)  return 4
  }
  // ไม่ใช่ 8★/9★
  if (elemMatch) return 5
  if (catMatch)  return 6
  return null
}

// ── Basic gear recommendations ──────────────────────────
// รายการ gear ID พื้นฐานที่แนะนำตาม slot + category + ability ของเรนเจอร์
// ใช้แสดงใน section "พื้นฐาน" ด้านล่างสุดของ picker
function getBasicGearIds(slot: SlotKey, category: string | null, abilityCodes: string[]): string[] {
  const cat = category?.toUpperCase()
  const hasFlyer = abilityCodes.includes('ab201_flight')
  const ids: string[] = []

  if (slot === 'WPN') {
    if (cat !== 'INT') {
      // ไม่ใช่ INT → แนะนำพื้นฐาน 2 ชิ้น
      ids.push('eq_wpn_evt_106', 'eq_wpn_0046')
    }
    if (cat === 'INT') ids.push('eq_wpn_0106')
    if (cat === 'AGI') ids.push('eq_wpn_0036')
    if (cat === 'STR') ids.push('eq_wpn_0056')
  } else if (slot === 'AMR') {
    ids.push('eq_amr_0046', 'eq_amr_evt_056')
  } else if (slot === 'ACC') {
    ids.push('eq_acc_evt_106', 'eq_acc_0086')
    if (cat === 'INT') ids.push('eq_acc_evt_086')
    if (hasFlyer) ids.push('eq_acc_0076')
  }

  return ids
}

const EMPTY_SKILLS: SkillGame[] = []
const EMPTY_CODES: string[] = []

// ── Component ─────────────────────────────────────────
export default function GearPickerModal({
  slot, rangerElement, rangerCategory, rangerCtx, rangerSkills = EMPTY_SKILLS,
  rangerAbilityCodes = EMPTY_CODES,
  otherSlotsLockedNames,
  occupiedSwitchableTypes, existingSkillPlus, currentGearBasicEffects,
  onSelect, onClose,
}: GearPickerModalProps) {
  const { tStat } = useLanguage()
  const { play } = useSound()
  const [gears, setGears]     = useState<GearBookItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [isMounted, setIsMounted] = useState(false)

  // ── Filter state ──────────────────────────────────────
  const [filterOpen,       setFilterOpen]       = useState(false)
  const [filterGrades,     setFilterGrades]     = useState<number[]>([])   // เปล่า = ทั้งหมด
  const [filterSwitchable, setFilterSwitchable] = useState<string[]>([])   // เปล่า = ทั้งหมด

  // ── Lazy SKILL+ fetch — gear-effects-batch สำหรับเกียร์ 8★ ในสล็อตนี้ ──
  // Map: iconUrl → SKILL+ growth (ข้อมูลจับคู่จากตารางเกม) — มีค่าแล้ว = fetch เสร็จ
  const [skillPlusMap, setSkillPlusMap] = useState<Map<string, SkillPlusEffectGrowth[]>>(new Map())

  // ── Detail preview ─────────────────────────────────
  const [previewGear, setPreviewGear] = useState<GearBookItem | null>(null)
  const previewGearRef = useRef(previewGear)
  useEffect(() => { previewGearRef.current = previewGear }, [previewGear])
  // เกียร์ที่กำลัง preview เริ่มที่ level 0 เสมอ — เลื่อน slider ปรับได้ก่อนติดตั้งจริง (ค่าที่ตั้งไว้ตอนกด "ติดตั้ง" คือ level ที่จะใส่)
  const [previewLevel, setPreviewLevel] = useState(0)
  const [previewSpecLevel, setPreviewSpecLevel] = useState(0)
  useEffect(() => { setPreviewLevel(0); setPreviewSpecLevel(0) }, [previewGear])

  // ── Lock body scroll ตลอดเวลาที่ modal เปิด ────────────
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  useEffect(() => { setIsMounted(true) }, [])

  // เสียงเปิด popup (ครั้งเดียวตอน mount; ref guard กัน StrictMode เล่นซ้ำ)
  const openedRef = useRef(false)
  useEffect(() => {
    if (openedRef.current) return
    openedRef.current = true
    play('click_giftbox.ogg')
  }, [])

  useEffect(() => {
    getGearBookData().then(data => { setGears(data); setLoading(false) })
  }, [])

  // Escape handler
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (previewGearRef.current) setPreviewGear(null)
      else onClose()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  // Lazy fetch SKILL+ names สำหรับ 8★/9★ gears ในสล็อตนี้ (เงื่อนไข Recommended เดียวกัน)
  useEffect(() => {
    if (!gears.length) return

    const targets = gears.filter(g =>
      (g.grade === 8 || g.grade === 9) && (!g.slot || g.slot.toUpperCase() === slot)
    )
    if (!targets.length) return

    // chunk 20 URLs ต่อ request (หลีกเลี่ยง URL ยาวเกิน)
    const CHUNK = 20
    const chunks: string[][] = []
    for (let i = 0; i < targets.length; i += CHUNK) {
      chunks.push(targets.slice(i, i + CHUNK).map(g => g.iconUrl))
    }

    const ctrl = new AbortController()
    Promise.all(
      chunks.map(urls =>
        apiFetch(`/api/meta/gear-effects-batch?iconUrls=${encodeURIComponent(urls.join(','))}`, {
          cache: 'no-store',
          signal: ctrl.signal,
        })
          .then(r => r.json())
          .catch(e => (e?.name === 'AbortError' ? null : { effects: {} }))
      )
    ).then(results => {
      if (ctrl.signal.aborted) return
      const map = new Map<string, SkillPlusEffectGrowth[]>()
      for (const res of results) {
        if (!res) continue
        const { effects = {} } = res as { effects?: Record<string, unknown> }
        for (const [url, eff] of Object.entries(effects)) {
          const spArr = (eff as { skillPlus?: Array<{ skillPlusGrowth?: SkillPlusEffectGrowth }> } | null)?.skillPlus
          map.set(url, (spArr ?? []).map(sp => sp.skillPlusGrowth).filter((g): g is SkillPlusEffectGrowth => !!g))
        }
      }
      setSkillPlusMap(map)
    })

    return () => { ctrl.abort() }
  }, [gears, slot])

  const elemSw = rangerElement ? (ELEM_TO_SWITCH[rangerElement.toLowerCase()] ?? null) : null
  const catSw  = rangerCategory?.toUpperCase() ?? null

  const { recommended, others } = useMemo(() => {
    const q = search.toLowerCase().trim()
    const slotGears = gears.filter(g => {
      if (!(!g.slot || g.slot.toUpperCase() === slot)) return false
      if (q && !g.name.toLowerCase().includes(q)) return false
      if (filterGrades.length > 0 && (g.grade == null || !filterGrades.includes(g.grade))) return false
      const sw = g.switchableType?.toUpperCase() ?? ''
      if (filterSwitchable.length > 0 && !filterSwitchable.includes(sw)) return false
      return true
    })

    const recommended: Array<GearBookItem & { tier: 1 | 2 | 3 | 4 | 5 | 6 }> = []
    const others: GearBookItem[] = []

    for (const g of slotGears) {
      // ยังโหลด SKILL+ ไม่เสร็จ → undefined (ไม่กรอง)
      const tier = getRecommendTier(g, elemSw, catSw, rangerSkills, skillPlusMap.get(g.iconUrl))
      if (tier !== null) recommended.push({ ...g, tier })
      else others.push(g)
    }

    recommended.sort((a, b) => a.tier - b.tier || (b.grade ?? 0) - (a.grade ?? 0))
    others.sort((a, b) => (b.grade ?? 0) - (a.grade ?? 0))

    return { recommended, others }
  }, [gears, slot, search, elemSw, catSw, rangerSkills, skillPlusMap, filterGrades, filterSwitchable])

  // ── Basic section: เกียร์พื้นฐานแนะนำ (ต่อจากแนะนำ) ──
  // เกียร์ที่อยู่ใน basicSection จะถูกกรองออกจาก others ไม่ให้ซ้ำกัน
  const basicSection = useMemo(() => {
    const ids = getBasicGearIds(slot, rangerCategory, rangerAbilityCodes)
    const byId = new Map(gears.map(g => [g.id, g]))
    return ids.map(id => byId.get(id)).filter((g): g is GearBookItem => !!g)
  }, [gears, slot, rangerCategory, rangerAbilityCodes])

  const basicIds = useMemo(() => new Set(basicSection.map(g => g.id)), [basicSection])

  // กรอง others: ตัดเกียร์ที่อยู่ใน basicSection ออก (ไม่ให้แสดงซ้ำในส่วน "เพิ่มเติม")
  const filteredOthers = useMemo(
    () => others.filter(g => !basicIds.has(g.id)),
    [others, basicIds]
  )

  if (!isMounted) return null

  return createPortal(
    <>
      {/* ── Picker overlay ── */}
      <div
        className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
        onClick={e => { if (e.target === e.currentTarget) onClose() }}
      >
        <div className="w-full max-w-md bg-[#13102a] border border-purple-500/30 rounded-2xl shadow-2xl flex flex-col"
          style={{ maxHeight: '85vh' }}>

          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img loading="lazy" decoding="async" src={SLOT_IMG[slot]} alt={slot} className="h-6 object-contain shrink-0" />
            <h3 className="text-white font-bold flex-1 text-sm">{tStat('Select Gear')} — {tStat(SLOT_LABEL[slot])}</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
              <span className="material-icons-round text-xl">close</span>
            </button>
          </div>

          {/* Search + Filter button */}
          <div className="px-4 pt-3 pb-2 shrink-0 flex items-center gap-2">
            <input
              type="text"
              placeholder={tStat('Search gear name...')}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-purple-500/50 transition-colors"
              autoFocus
            />
            <button
              onClick={() => setFilterOpen(v => !v)}
              className={`shrink-0 flex items-center gap-1 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors ${
                filterGrades.length > 0 || filterSwitchable.length > 0
                  ? 'bg-purple-500/25 border-purple-500/60 text-purple-300'
                  : 'bg-white/5 border-white/10 text-gray-400 hover:text-white hover:border-white/20'
              }`}
            >
              <span className="material-icons-round text-sm">tune</span>
              {tStat('Filter')}
              {(filterGrades.length > 0 || filterSwitchable.length > 0) && (
                <span className="bg-purple-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] leading-none">
                  {filterGrades.length + filterSwitchable.length}
                </span>
              )}
            </button>
          </div>

          {/* List */}
          <div className="overflow-y-auto flex-1 px-4 pb-4 space-y-3">
            {loading ? (
              <p className="text-gray-500 text-sm text-center py-8">{tStat('Loading...')}</p>
            ) : (
              <>
                {recommended.length > 0 && (
                  <div>
                    <p className="text-yellow-400 font-bold text-xs mb-2 flex items-center gap-1 pt-1">
                      <span className="material-icons-round text-sm">star</span>
                      {tStat('Recommended')}
                    </p>
                    <div className="space-y-1.5">
                      {recommended.map(g => (
                        <GearRow key={g.id} gear={g} tier={g.tier} onPreview={setPreviewGear} />
                      ))}
                    </div>
                  </div>
                )}

                {/* ── พื้นฐาน — อยู่ต่อจากแนะนำ ── */}
                {basicSection.length > 0 && (
                  <>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-px bg-white/10" />
                      <span className="text-gray-500 text-xs">{tStat('Basic')}</span>
                      <div className="flex-1 h-px bg-white/10" />
                    </div>
                    <div className="space-y-1.5">
                      {basicSection.map(g => (
                        <GearRow key={g.id} gear={g} tier={null} badge="Basic" onPreview={setPreviewGear} />
                      ))}
                    </div>
                  </>
                )}

                {(recommended.length > 0 || basicSection.length > 0) && filteredOthers.length > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-px bg-white/10" />
                    <span className="text-gray-500 text-xs">{tStat('More')}</span>
                    <div className="flex-1 h-px bg-white/10" />
                  </div>
                )}

                {filteredOthers.length > 0 && (
                  <div className="space-y-1.5">
                    {filteredOthers.map(g => (
                      <GearRow key={g.id} gear={g} tier={null} onPreview={setPreviewGear} />
                    ))}
                  </div>
                )}

                {recommended.length === 0 && filteredOthers.length === 0 && basicSection.length === 0 && (
                  <p className="text-gray-500 text-sm text-center py-8">ไม่พบเกียร์</p>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Filter Overlay — z-[90] ซ้อนบน picker ── */}
      {filterOpen && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) setFilterOpen(false) }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-[#1a1635] border border-white/15 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div className="flex items-center gap-2">
                <span className="material-icons-round text-purple-400 text-lg">tune</span>
                <span className="font-bold text-white text-sm">{tStat('Filter')}</span>
                {(filterGrades.length > 0 || filterSwitchable.length > 0) && (
                  <span className="bg-purple-500 text-white text-xs rounded-full px-1.5 py-0.5">
                    {filterGrades.length + filterSwitchable.length}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {(filterGrades.length > 0 || filterSwitchable.length > 0) && (
                  <button
                    onClick={() => { setFilterGrades([]); setFilterSwitchable([]) }}
                    className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                  >ล้างทั้งหมด</button>
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
                  {[9, 8, 7, 6, 5, 4, 3, 2, 1].map(gr => {
                    const active = filterGrades.includes(gr)
                    return (
                      <button
                        key={gr}
                        onClick={() => setFilterGrades(prev =>
                          active ? prev.filter(x => x !== gr) : [...prev, gr]
                        )}
                        className={`p-1 rounded-lg border transition-colors ${
                          active ? 'border-yellow-400 bg-yellow-400/20' : 'border-white/15 bg-white/5 hover:border-white/30'
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img loading="lazy" decoding="async" src={`/gacha/images/${gr}star.png`} alt={`${gr}★`}
                          className="h-4 object-contain"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Switchable */}
              <div>
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-2">Switchable</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(TRIG_IMG).map(([sw, imgSrc]) => {
                    const active = filterSwitchable.includes(sw)
                    return (
                      <button
                        key={sw}
                        onClick={() => setFilterSwitchable(prev =>
                          active ? prev.filter(x => x !== sw) : [...prev, sw]
                        )}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-colors ${
                          active
                            ? 'border-yellow-400 bg-yellow-400/20 text-yellow-200'
                            : 'border-white/15 bg-white/5 text-gray-300 hover:border-white/30'
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img loading="lazy" decoding="async" src={imgSrc} alt={sw} className="h-4 w-4 object-contain" />
                        {sw}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── GearDetailPopup — ซ้อนบน picker (z-[80]) ── */}
      {previewGear && (
        <GearDetailPopup
          gearName={previewGear.name}
          gearIconUrl={previewGear.iconUrl}
          gearGrade={previewGear.grade}
          gearSlot={slot}
          league={0}
          hideRangerUsage
          showLevelSlider
          sliderLevel={previewLevel}
          onSliderLevelChange={(lv) => {
            setPreviewLevel(lv)
            // เลเวลหลุดจาก 15 (max) → Spec+ ที่ปรับไว้ต้องรีเซ็ต (ต้องเลเวลเต็มใหม่ถึงปลดล็อกได้อีก)
            if (lv < 15) setPreviewSpecLevel(0)
          }}
          specLevel={previewSpecLevel}
          onSpecLevelChange={setPreviewSpecLevel}
          rangerCtx={rangerCtx}
          otherSlotsLockedNames={otherSlotsLockedNames}
          rangerSkills={rangerSkills}
          occupiedSwitchableTypes={occupiedSwitchableTypes}
          existingSkillPlus={existingSkillPlus}
          compareBasicEffects={currentGearBasicEffects}
          zIndex={80}
          onClose={() => setPreviewGear(null)}
          onInstall={() => onSelect(previewGear, previewLevel, previewSpecLevel)}
        />
      )}
    </>,
    document.body
  )
}

// ── GearRow ────────────────────────────────────────────
function GearRow({ gear, tier, badge, onPreview }: {
  gear:      GearBookItem
  tier:      1 | 2 | 3 | 4 | 5 | 6 | null
  badge?:    string   // label badge กรณีไม่มี tier (เช่น "พื้นฐาน")
  onPreview: (g: GearBookItem) => void
}) {
  const { tGear, tStat } = useLanguage()
  const displayName = tGear(gear.iconUrl, gear.name)
  const sw = gear.switchableType?.toUpperCase() ?? ''
  const isBest = tier === 1 || tier === 2
  return (
    <button
      onClick={() => onPreview(gear)}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-colors text-left ${
        isBest
          ? 'bg-green-500/15 hover:bg-green-500/25 ring-1 ring-green-500/30'
          : 'bg-white/5 hover:bg-white/10'
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img loading="lazy" decoding="async" src={gear.iconUrl} alt={displayName}
        className="w-10 h-10 object-contain shrink-0"
        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />

      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-semibold truncate leading-tight">{displayName}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          {gear.grade != null && (
            // eslint-disable-next-line @next/next/no-img-element
            <img loading="lazy" decoding="async" src={`/gacha/images/${gear.grade}star.png`} alt={`${gear.grade}★`}
              className="h-3 object-contain"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          )}
          {sw && TRIG_IMG[sw] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img loading="lazy" decoding="async" src={TRIG_IMG[sw]} alt={sw} className="h-3.5 w-3.5 object-contain"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          )}
        </div>
      </div>

      {tier !== null && (
        <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded border ${TIER_CONFIG[tier].color}`}>
          {TIER_CONFIG[tier].showGrade && gear.grade != null ? `${gear.grade}★ ` : ''}
          {tStat(TIER_CONFIG[tier].label)}
        </span>
      )}
      {tier === null && badge && (
        <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded border bg-purple-500/20 text-purple-300 border-purple-500/50">
          {tStat(badge)}
        </span>
      )}
    </button>
  )
}
