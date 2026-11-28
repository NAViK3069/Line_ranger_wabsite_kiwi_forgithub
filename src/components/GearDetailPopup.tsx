'use client'

// ====================================================
// GearDetailPopup - Popup แสดง Ranger ที่ใส่เกียร์ชิ้นนี้
// ====================================================

import { apiFetch } from '@/lib/staticApi'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { pickAutoSwitchable, effectKey, type RangerContext } from '@/lib/switchableSelector'
import { skillPlusHits, hasSkillPlusRows, type SkillGame } from '@/lib/rangerGameCalc'
import { aggregateGearBonuses } from '@/lib/gearEffectParser'
import { useLanguage } from '@/contexts/LanguageContext'
import { useSound } from '@/contexts/SoundContext'
import GearSpecSection from '@/components/GearSpecSection'
import {
  splitSliderLevel, recalcGearEffects, effectAmount,
  type BasicEffectGrowth, type SwitchableEffectGrowth, type SkillPlusEffectGrowth,
} from '@/lib/gearLevelCalc'

interface RangerUsage {
  rangerId: string
  name: string
  imageUrl: string
  slot: string
  count: number
  sampled: number
  pct: number
}

interface GearEffect {
  name: string
  value: string
  nameKey?: string
  // raw growth params — ใช้คำนวณ value ใหม่ที่ level ใดๆ ฝั่ง client (ดู gearLevelCalc.ts)
  basicGrowth?: BasicEffectGrowth
  switchableGrowth?: SwitchableEffectGrowth
  skillPlusGrowth?: SkillPlusEffectGrowth
}

interface GearEffects {
  itemCode: string
  basic: GearEffect[]
  switchable: {
    trigType: string | null
    effect: GearEffect | null
    allEffects: { trigType: string | null; effect: GearEffect }[]
  } | null
  skillPlus: GearEffect[]
}

// icon สำหรับ unitEquipRandOptTrigType
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

interface Props {
  gearName: string
  gearIconUrl: string
  gearGrade: number | string | null
  gearSlot: string
  league: number
  onClose: () => void
  onInstall?: () => void           // picker preview → ปุ่ม "ติดตั้งเกียร์นี้"
  onRemove?:  () => void           // installed gear → ปุ่ม "ถอดเกียร์" (แดง)
  onReplace?: () => void           // installed gear → ปุ่ม "เปลี่ยนเกียร์" (ฟ้า)
  hideRangerUsage?: boolean
  effectLevel?: number | 'max'   // 0-4 หรือ 'max' (default = 'max')
  rangerCtx?: RangerContext        // context ของเรนเจอร์ → คำนวณ selected effect จาก effects ที่ popup fetch เอง
  // ── Lock-in: ชื่อ effect ที่ slot อื่น lock ไว้ ──
  // popup ใช้กรองออปชั่นพวกนี้ออกตอน auto-pick → ตรงกับ installed state เสมอ
  otherSlotsLockedNames?: string[]
  // ── Lock ของ slot ที่ popup แสดง (สำหรับ installed gear) ──
  // ถ้ามี → popup ใช้ค่านี้แสดงตรงๆ ไม่ re-compute (ป้องกัน display drift เมื่อ slot อื่นเปลี่ยน)
  // ถ้าไม่มี (เช่น picker preview) → popup คำนวณ auto pick เอง
  lockedAutoSelectionName?: string | null
  switchableInactiveReason?: 'duplicate' | 'type_mismatch'  // ถ้า Switchable Effect ใช้งานไม่ได้ → แสดง overlay (ใช้สำหรับ installed gear)
  rangerSkills?: SkillGame[]                                  // สกิลของเรนเจอร์ (ตาราง skill) → จับคู่ SKILL+ ด้วย eqip_skl_plus_grp
  skillPlusOverriddenBy?: Record<string, string>             // effectName → slot ที่ชนะ ('WPN'/'AMR'/'ACC') — ถ้ามี → effect นั้นถูก override โดย slot อื่น (ใช้สำหรับ installed gear)
  // ── picker preview context (ตรวจเงื่อนไขก่อนติดตั้ง) ──
  occupiedSwitchableTypes?: string[]                         // trigTypes ที่ถูก slot อื่นครอบครองแล้ว (ใช้ใน expanded options dimming)
  existingSkillPlus?: Array<{ group: number; amount: number; slot: string }> // SKILL+ จาก slot อื่นที่ใส่แล้ว (กลุ่มเดียวกัน → ค่าสูงกว่าชนะ)
  compareBasicEffects?: Array<{ name: string; value: string }>  // Basic Effect ของเกียร์ที่ใส่อยู่ปัจจุบัน → เทียบค่า up/down/equal
  // ── installed gear switchable override ──
  selectedSwitchableOverride?: string | null                 // effectName ที่ user เลือกเอง (installed gear)
  onSwitchableSelect?: (effectName: string) => void          // callback เมื่อ user กดเลือก option
  zIndex?: number                  // z-index ของ overlay (default 50) — ใช้เมื่อต้องการซ้อนบน popup อื่น
  showLevelSlider?: boolean        // เปิด slider เลื่อน level ของแต่ละ effect (เริ่มต้น 0) — ใช้ใน gear-book
  // ── controlled slider (optional) — ให้ parent ยก state ขึ้นไปคุมเอง (เช่น Ranger Book ที่ต้อง sync
  //    level กับการคำนวณค่าเรนเจอร์จริง) ถ้าไม่ส่งมา popup จะจัดการ state เองแบบเดิม (uncontrolled) ──
  sliderLevel?: number
  onSliderLevelChange?: (level: number) => void
  // ── Spec+ (เกียร์ 9★) — controlled เช่นเดียวกับ sliderLevel ปลดล็อกได้ก็ต่อเมื่อ sliderLevel ถึง 15 (max) แล้วเท่านั้น ──
  specLevel?: number
  onSpecLevelChange?: (level: number) => void
}

// ── Browser-side cache สำหรับ effectsOnly requests (picker preview) ──
// ลด serverless invocations เมื่อเปิดเกียร์เดิมซ้ำใน session เดียวกัน
// TTL 10 นาที + cap 50 entries (FIFO eviction) — ป้องกัน memory leak ใน session ยาว
const _effectsCache = new Map<string, { data: unknown; ts: number }>()
const EFFECTS_CACHE_TTL = 10 * 60 * 1000 // 10 min
const EFFECTS_CACHE_MAX = 50

function effectsCacheSet(key: string, data: unknown): void {
  // evict entry เก่าที่สุดถ้าเกิน cap
  if (_effectsCache.size >= EFFECTS_CACHE_MAX) {
    const oldest = _effectsCache.keys().next().value
    if (oldest) _effectsCache.delete(oldest)
  }
  _effectsCache.set(key, { data, ts: Date.now() })
}

async function fetchGearDetailCached(qs: string, effectsOnly: boolean): Promise<Response> {
  if (!effectsOnly) return apiFetch(`/api/meta/gear-detail?${qs}`, { cache: 'no-store' })
  const cached = _effectsCache.get(qs)
  if (cached && Date.now() - cached.ts < EFFECTS_CACHE_TTL) {
    return new Response(JSON.stringify(cached.data), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  const res = await apiFetch(`/api/meta/gear-detail?${qs}`, { cache: 'no-store' })
  if (res.ok) {
    const cloned = res.clone()
    cloned.json().then(d => effectsCacheSet(qs, d)).catch(() => {})
  }
  return res
}

// helper: สร้าง URL รูป upgrade level icon
function effectLevelIcon(prefix: string, level: number | 'max' | undefined): string {
  // ทำ map ให้ 5 = 'max' (ชื่อไฟล์ตามคอนเวนชั่น) → ไม่ต้องมีไฟล์ +5.png แยก
  const lv = (level === undefined || level === 5) ? 'max' : level
  const suffix = lv === 'max' ? 'max' : `+${lv}`
  return `/gacha/images/${prefix}_${suffix}.png`
}

// helper: เทียบค่า Basic Effect กับเกียร์ที่ใส่อยู่
function parseGearValue(v: string): number {
  const m = v.match(/-?\d+(?:\.\d+)?/)
  return m ? parseFloat(m[0]) : 0
}
type CmpResult = 'up' | 'down' | 'equal'
function compareEffect(newVal: string, curEffects: Array<{ name: string; value: string }>, name: string): CmpResult {
  const cur = curEffects.find(c => c.name === name)
  if (!cur) return 'up'  // เกียร์ปัจจุบันไม่มีค่านี้ → ได้ค่าใหม่ = up
  const nv = Math.abs(parseGearValue(newVal))
  const cv = Math.abs(parseGearValue(cur.value))
  if (nv > cv) return 'up'
  if (nv < cv) return 'down'
  return 'equal'
}
const CMP_ICON: Record<CmpResult, string> = {
  up:    '/gacha/images/Gear_up.png',
  down:  '/gacha/images/Gear_down.png',
  equal: '/gacha/images/Gear_equal.png',
}

const SLOT_COLORS: Record<string, { text: string; bar: string }> = {
  WPN: { text: 'text-red-300',    bar: 'from-red-400 to-orange-500'   },
  AMR: { text: 'text-blue-300',   bar: 'from-blue-400 to-cyan-500'    },
  ACC: { text: 'text-yellow-300', bar: 'from-yellow-400 to-orange-400' },
}

const SLOT_IMG: Record<string, string> = {
  WPN: '/gacha/images/gear_weapon.png',
  AMR: '/gacha/images/gear_armor.png',
  ACC: '/gacha/images/gear_accessory.png',
}

const SLOT_LABEL: Record<string, string> = {
  WPN: 'Weapon',
  AMR: 'Armor',
  ACC: 'Accessory',
}

const STAR_IMG: Record<number, string> = {
  1: '/gacha/images/1star.png', 2: '/gacha/images/2star.png',
  3: '/gacha/images/3star.png', 4: '/gacha/images/4star.png',
  5: '/gacha/images/5star.png', 6: '/gacha/images/6star.png',
  7: '/gacha/images/7star.png', 8: '/gacha/images/8star.png',
  9: '/gacha/images/9star.png',
}

function SlotImage({ slot, className = 'h-5 object-contain' }: { slot: string; className?: string }) {
  const src = SLOT_IMG[slot]
  if (!src) return <span className="text-xs text-gray-400">{slot}</span>
  // eslint-disable-next-line @next/next/no-img-element
  return <img loading="lazy" decoding="async" src={src} alt={slot} className={className} />
}

function StarImage({ grade, className = 'h-4 object-contain' }: { grade: number | string | null; className?: string }) {
  if (grade === null || grade === undefined) return null
  // string เช่น '7+star', '8#star' → ใช้เป็นชื่อไฟล์ตรงๆ
  // number เช่น 5 → ไปที่ STAR_IMG[5]
  // ต้อง encode ชื่อไฟล์: '#' ใน URL คือตัวเริ่ม fragment เบราว์เซอร์จะขอ "/gacha/images/8"
  // แล้วทิ้ง "#star.png" ทิ้ง → ดาวกลุ่ม # ไม่ขึ้นเลย (8%23star.png ตอบ 200 / 8#star.png ตอบ 404)
  const src = typeof grade === 'string'
    ? `/gacha/images/${encodeURIComponent(grade)}.png`
    : STAR_IMG[grade]
  if (!src) return null
  // eslint-disable-next-line @next/next/no-img-element
  return <img loading="lazy" decoding="async" src={src} alt={`${grade}★`} className={className} />
}
// format ค่า SKILL+ — ถ้าเป็นตัวเลขล้วน (ไม่มี %) → หน่วยวินาที ต่อท้ายด้วย "sec"
// เช่น "+3.5" → "+3.5sec", "+80.0%" → "+80.0%" (ไม่เปลี่ยน)
function fmtSkillPlusValue(value: string): string {
  const v = value.trim()
  return /^[+\-]?[\d.]+$/.test(v) ? v + 'sec' : v
}

export default function GearDetailPopup({ gearName, gearIconUrl, gearGrade, gearSlot, league, onClose, onInstall, onRemove, onReplace, hideRangerUsage, effectLevel, rangerCtx, otherSlotsLockedNames, lockedAutoSelectionName, switchableInactiveReason, rangerSkills, skillPlusOverriddenBy, occupiedSwitchableTypes, existingSkillPlus, compareBasicEffects, selectedSwitchableOverride, onSwitchableSelect, zIndex, showLevelSlider, sliderLevel: sliderLevelProp, onSliderLevelChange, specLevel, onSpecLevelChange }: Props) {
  const { t, tGear, tRanger, tUnit, tStat } = useLanguage()
  const { play, tick } = useSound()
  const handleClose = () => { play('click_collect_cancel.ogg'); onClose() }
  const displayGearName = tGear(gearIconUrl, gearName)
  // itemCode จาก iconUrl (เช่น .../gear_icon/eq_2607_acc_29_icon.png → eq_2607_acc_29) — ใช้กับ Spec+
  // เฉพาะเกียร์ 9★ เท่านั้น (กันไม่ให้ wrapper ว่างๆ render กับเกียร์ทั่วไป → body ไม่ scroll เกิน)
  const is9Star = gearGrade === 9 || (typeof gearGrade === 'string' && gearGrade.startsWith('9'))
  const specItemCode = is9Star ? (gearIconUrl.match(/\/gear_icon\/(.+)_icon\.png$/)?.[1] ?? null) : null
  const [rangers, setRangers] = useState<RangerUsage[]>([])
  // rawEffects = ค่าที่ fetch มาจริง (ตอน showLevelSlider จะ fetch ที่ max เสมอ พร้อม growth metadata)
  const [rawEffects, setRawEffects] = useState<GearEffects | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [switchExpanded, setSwitchExpanded] = useState(false)
  // Slider level (0-15) — ใช้เฉพาะเมื่อ showLevelSlider = true (gear-book)
  // controlled (sliderLevelProp ส่งมา) → parent คุม state เอง (เช่น Ranger Book) / ไม่งั้น uncontrolled ใน popup เอง
  const [internalSliderLevel, setInternalSliderLevel] = useState(0)
  const sliderLevel = sliderLevelProp ?? internalSliderLevel
  const setSliderLevel = (level: number) => {
    if (onSliderLevelChange) onSliderLevelChange(level)
    else setInternalSliderLevel(level)
  }
  const sliderLevels = splitSliderLevel(sliderLevel)
  // Icon level สำหรับแต่ละ effect: ถ้าเปิด slider → ใช้ level ของ effect นั้นๆ
  //                                   ถ้าไม่เปิด → ใช้ effectLevel prop เหมือนเดิม
  const iconLevels = showLevelSlider
    ? { basic: sliderLevels.basic, switchable: sliderLevels.switchable, skillPlus: sliderLevels.skillPlus }
    : { basic: effectLevel, switchable: effectLevel, skillPlus: effectLevel }

  // ── effects ที่ใช้แสดงจริง — คำนวณสดจาก rawEffects + sliderLevels ฝั่ง client (ไม่ fetch ซ้ำ) ──
  //   ใช้ growth metadata (basicGrowth/switchableGrowth/skillPlusGrowth) ที่ API แนบมาให้ครั้งเดียว
  //   ถ้าไม่มี slider (effectLevel คงที่) → ใช้ rawEffects ตรงๆ (fetch มาที่ level นั้นแล้ว)
  const effects = useMemo((): GearEffects | null => {
    if (!rawEffects) return null
    if (!showLevelSlider) return rawEffects
    return recalcGearEffects(rawEffects, sliderLevel)
  }, [rawEffects, showLevelSlider, sliderLevel])

  const slotColors = SLOT_COLORS[gearSlot] ?? SLOT_COLORS.WPN

  // คำนวณ Switchable Effect ที่ควรเลือกสำหรับเรนเจอร์นี้
  // ใช้ข้อมูลที่ popup fetch เองแทนการรับค่ามาจาก parent (หลีกเลี่ยงปัญหา batch endpoint cache)
  const selectedSwitchableEffect = useMemo(() => {
    if (!effects?.switchable?.allEffects?.length) return null

    // ── Installed gear: ใช้ lock จาก parent ตรงๆ — ไม่ re-compute ──
    // ป้องกัน display drift เมื่อ slot อื่นถูก install/remove ทำให้ otherSlotsLockedNames เปลี่ยน
    // (lock ของ slot นี้ถูก compute แล้วใน parent — backend คือ source of truth)
    if (lockedAutoSelectionName) {
      const opt = effects.switchable.allEffects.find(o => o.effect?.name === lockedAutoSelectionName)
      return opt?.effect ?? null
    }

    // ── Picker preview (ไม่มี lock): compute auto pick เอง ──
    if (!rangerCtx) return null
    const slot = gearSlot as 'WPN' | 'AMR' | 'ACC'
    if (slot !== 'WPN' && slot !== 'AMR' && slot !== 'ACC') return null
    // augment ctx ด้วย own basic effects (rangerCtx มี ranger + other slots basic อยู่แล้ว)
    const ownBasic = aggregateGearBonuses([effects], [null])
    const fullCtx: RangerContext = {
      ...rangerCtx,
      skillEvadeRate:  rangerCtx.skillEvadeRate  + (ownBasic.skillEvadeRate?.pct  ?? 0),
      skillResistance: rangerCtx.skillResistance + (ownBasic.skillResistance?.pct ?? 0),
    }
    return pickAutoSwitchable(slot, effects, fullCtx, otherSlotsLockedNames ?? []).effect
  }, [effects, rangerCtx, gearSlot, otherSlotsLockedNames, lockedAutoSelectionName])

  // ── Effective switchable inactive reason ─────────────────────────────
  // ลำดับ: prop (installed gear, รวม duplicate) → type_mismatch เท่านั้น (picker preview)
  // หมายเหตุ: duplicate ตรวจจาก RangerStatPanel → ส่งมาทาง prop สำหรับ installed gear
  //           picker preview: ปิดแค่ type_mismatch (ธาตุ/สายไม่ตรง) — duplicate ไม่ต้องตรวจ
  const effectiveSwitchableInactiveReason = useMemo((): 'duplicate' | 'type_mismatch' | undefined => {
    // 1. ถ้า parent ส่งมาตรงๆ (installed gear รวม duplicate) → ใช้เลย
    if (switchableInactiveReason) return switchableInactiveReason
    // 2. ถ้าไม่มี switchable effects → ไม่มีอะไรให้แสดง
    if (!effects?.switchable?.allEffects?.length) return undefined
    // 3. type_mismatch: มี rangerCtx แต่ไม่มี selectedSwitchableEffect (ธาตุ/สายไม่ตรงเรนเจอร์)
    if (rangerCtx && !selectedSwitchableEffect) return 'type_mismatch'
    return undefined
  }, [switchableInactiveReason, effects, rangerCtx, selectedSwitchableEffect])

  // ── Effective SKILL+ overridden-by map ────────────────────────────────
  // ลำดับ: prop (installed gear) → compute จาก existingSkillPlus (picker preview)
  const effectiveSkillPlusOverriddenBy = useMemo((): Record<string, string> => {
    // 1. ถ้า parent ส่งมาและมีค่า → ใช้เลย (installed gear)
    if (skillPlusOverriddenBy && Object.keys(skillPlusOverriddenBy).length > 0) return skillPlusOverriddenBy
    // 2. ถ้าไม่มี existingSkillPlus หรือไม่มี SKILL+ → ไม่มี override
    if (!existingSkillPlus?.length || !effects?.skillPlus?.length) return {}
    const result: Record<string, string> = {}
    for (const sp of effects.skillPlus) {
      // SKILL+ กลุ่มเดียวกัน (attrNumberGroup ของเกม) — ชิ้นที่ใส่อยู่แล้วชนะถ้าค่า ≥ ชิ้นนี้
      const group = sp.skillPlusGrowth?.group ?? sp.skillPlusGrowth?.attrNo
      if (group == null) continue
      const other = existingSkillPlus.find(o => o.group === group)
      if (other && Math.abs(other.amount) >= Math.abs(effectAmount(sp))) result[sp.name] = other.slot
    }
    return result
  }, [skillPlusOverriddenBy, existingSkillPlus, effects?.skillPlus])

  // ตรวจว่า SKILL+ ของเกียร์นี้ตรงกับสกิลของเรนเจอร์หรือไม่
  // ถ้า false → แสดง overlay มืดบน SKILL+ section
  const skillPlusHasMatch = useMemo(() => {
    if (!rangerSkills?.length) return true        // ไม่มี context → ไม่เตือน
    if (!effects?.skillPlus?.length) return true  // ไม่มี SKILL+ → ไม่เตือน
    // จับคู่ด้วยตารางเกม: skillType + factorType + buffFactorType ของสกิลหลัก/ย่อย (eqip_skl_plus_grp)
    return effects.skillPlus.some(sp => !hasSkillPlusRows(sp.skillPlusGrowth) || skillPlusHits(sp.skillPlusGrowth, rangerSkills).length > 0)
  }, [effects?.skillPlus, rangerSkills])

  useEffect(() => {
    let cancelled = false
    const fetch_ = async () => {
      try {
        // ถ้าเปิด slider → fetch ที่ max เสมอ (5,5,5 — ไฟล์ static ชุดเดียวกับ path อื่น) ครั้งเดียว
        //   แล้วคำนวณทุก level 0-15 เองฝั่ง client จาก growth metadata ที่แนบมา (ดู useMemo ด้านบน)
        //   ไม่ต้อง fetch ซ้ำเวลาลากสไลเดอร์อีกต่อไป
        // ถ้าไม่เปิด → ส่ง level เดียวแบบเดิม (backward compat)
        const effectsOnly = !!hideRangerUsage
        const levelQs = showLevelSlider
          ? `basicLevel=5&switchLevel=5&skillPlusLevel=5`
          : `level=${effectLevel === undefined ? 'max' : effectLevel === 'max' ? 'max' : String(effectLevel)}`
        const qs = effectsOnly
          ? `iconUrl=${encodeURIComponent(gearIconUrl)}&effectsOnly=true&${levelQs}`
          : `iconUrl=${encodeURIComponent(gearIconUrl)}&league=${league}&${levelQs}`
        const res = await fetchGearDetailCached(qs, effectsOnly)
        const json = await res.json()
        if (cancelled) return
        if (!res.ok) throw new Error(json.error ?? 'เกิดข้อผิดพลาด')
        setRangers(json.rangers ?? [])
        setRawEffects(json.effects ?? null)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetch_()
    return () => { cancelled = true }
  }, [gearIconUrl, league, hideRangerUsage, effectLevel, showLevelSlider])

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

  const maxCount = rangers[0]?.count ?? 1

  // ── ล็อกความสูง body = core content (เหมือน RangerDetailPopup) ──
  //   → popup คงสัดส่วนทุกระดับซูม, Spec+ อยู่ใต้ fold ให้เลื่อนลงดู (เหมือน Talent)
  const mainContentRef = useRef<HTMLDivElement>(null)
  // base height = เนื้อหาปกติ (ไม่รวม Switchable "+ เพิ่มเติม" ที่กางออก) — grow-only
  // กันกระตุกตอนข้อมูล effects/rangers ทยอยโหลดเข้ามา
  const baseHeightRef = useRef<number>(0)
  const [bodyMaxHeight, setBodyMaxHeight] = useState<string | undefined>(undefined)

  useLayoutEffect(() => {
    if (!mainContentRef.current || loading) return
    const el = mainContentRef.current
    // mainContentRef = แค่ effects (core) → ล็อกความสูงแค่นี้ แล้วเผย divider แรกใต้ fold ให้เห็น
    // divider แรก = Spec+ (9★) หรือ "เรนเจอร์ที่ใส่มากสุด" (meta) — เหมือน rangerbook/gearbook
    // (วัดจริง: pt-1 4px + แถว divider 20px + mb-3 12px ≈ 34px)
    const hasBelowFold = !!specItemCode || !hideRangerUsage
    const peek = hasBelowFold ? 34 : 0
    const update = () => {
      const h = el.offsetHeight + peek
      if (switchExpanded) {
        // "+ เพิ่มเติม" กางอยู่ → ขยายตามเนื้อหาจริงสดๆ (ไม่ผูกกับ base เพื่อให้ยุบกลับได้)
        setBodyMaxHeight(`${h}px`)
      } else {
        // ปกติ → grow-only เทียบกับ base เดิม แล้วใช้ base เสมอ (ยุบกลับเมื่อปิด "+ เพิ่มเติม")
        if (h > baseHeightRef.current) baseHeightRef.current = h
        setBodyMaxHeight(`${baseHeightRef.current}px`)
      }
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [loading, effects, rangers, specItemCode, switchExpanded])

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      style={{ zIndex: zIndex ?? 50 }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}
    >
      <div className="lr-detail-zone card-glass w-full max-h-[90vh] flex flex-col rounded-2xl relative overflow-hidden" style={{ maxWidth: '42rem' }}>

        {/* Close */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors z-10"
        >
          <span className="material-icons-round">close</span>
        </button>

        {/* Header — คงที่ ไม่ scroll ตาม body */}
        <div className="flex items-center gap-4 p-4 sm:p-6 pb-4 border-b border-white/10 shrink-0">
          {/* Gear icon */}
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-white/5 shrink-0 flex items-center justify-center overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img loading="lazy" decoding="async"
              src={gearIconUrl}
              alt={displayGearName}
              className="w-full h-full object-contain"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          </div>

          <div className="min-w-0 flex-1 pr-8">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <SlotImage slot={gearSlot} className="h-5 object-contain" />
              <span className="text-xs text-gray-400">{tStat(SLOT_LABEL[gearSlot] ?? gearSlot)}</span>
              <StarImage grade={gearGrade} className="h-4 object-contain" />
            </div>
            <h2 className="text-base sm:text-xl font-black text-white leading-snug break-words">{displayGearName}</h2>
            {!loading && !error && !hideRangerUsage && (
              <p className="text-xs text-gray-400 mt-1">
                {tStat('Rangers using this gear:')}{' '}
                <span className={`font-semibold ${slotColors.text}`}>{rangers.length} {tStat('units')}</span>
              </p>
            )}
          </div>
        </div>

        {/* ── Body: scroll ได้ + ล็อกความสูง = core content (Spec+ อยู่ใต้ fold เหมือน Talent) ── */}
        <div className="flex-1 overflow-y-auto" style={{ maxHeight: bodyMaxHeight }}>
          <div ref={mainContentRef}>

        {/* Effects Section */}
        {!loading && !error && effects && (
          (effects.basic.length > 0 || effects.switchable?.allEffects.length || selectedSwitchableEffect || effects.skillPlus.length > 0) && (
            <div className={`px-4 sm:px-6 pt-4 space-y-2 ${hideRangerUsage ? (specItemCode ? 'pb-2' : 'pb-5 sm:pb-6') : ''}`}>
              {showLevelSlider ? (() => {
                // คำนวณ max slider value จาก effects ที่มีอยู่
                //   มีแค่ Basic         → max 5
                //   + Switchable        → max 10
                //   + SKILL+            → max 15
                const hasSwitch = !!effects.switchable && effects.switchable.allEffects.length > 0
                const hasSkillPlus = effects.skillPlus.length > 0
                const sliderMax = hasSkillPlus ? 15 : hasSwitch ? 10 : 5
                // กัน slider เกิน max (เช่นเริ่มต้น 0 ไม่เกิน, แต่ถ้าเคยเลื่อนสูงแล้วเกียร์เปลี่ยน)
                const clampedSlider = Math.min(sliderLevel, sliderMax)

                return (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-400">{tStat('Gear value at level')}</span>
                      <span className="text-yellow-300 font-semibold font-mono">
                        +{clampedSlider}
                        {clampedSlider === sliderMax && ` (Max)`}
                        {clampedSlider === 0 && ` (${tStat('Initial')})`}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={sliderMax}
                      step={1}
                      value={clampedSlider}
                      onChange={(e) => { tick(); setSliderLevel(parseInt(e.target.value, 10)) }}
                      className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-yellow-400"
                    />
                  </div>
                )
              })() : (
                <p className="text-xs text-gray-500">
                  {tStat('Gear value at level')}{' '}
                  {effectLevel === 0
                    ? <span className="text-gray-300 font-semibold">+0 ({tStat('Initial')})</span>
                    : effectLevel === 'max' || effectLevel === undefined
                    ? <span className="text-yellow-300 font-semibold">+5 Max</span>
                    : <span className="text-yellow-300 font-semibold">+{effectLevel}</span>
                  }
                </p>
              )}

              {/* Basic Effect (blue) */}
              {effects.basic.length > 0 && (
                <div className="rounded-xl border border-blue-500/30 bg-blue-500/15 p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="text-xs font-bold text-blue-300 uppercase tracking-wider">Basic Effect</span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img loading="lazy" decoding="async" src={effectLevelIcon('Basic_Effect', iconLevels.basic)} alt="" className="h-5 object-contain ml-0.5"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  </div>
                  <div className="space-y-1.5">
                    {effects.basic.map((e, i) => {
                      const cmp = compareBasicEffects ? compareEffect(e.value, compareBasicEffects, e.name) : null
                      return (
                        <div key={i} className="flex items-center justify-between gap-2 text-sm">
                          <span className="text-blue-200 truncate">{e.nameKey ? t('equip', e.nameKey, e.name) : e.name}</span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="font-bold text-white">{tUnit(e.value)}</span>
                            {cmp && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img loading="lazy" decoding="async"
                                src={CMP_ICON[cmp]}
                                alt={cmp}
                                className="h-5 w-5 object-contain scale-[2] shrink-0"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                              />
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Switchable Effect (orange) */}
              {effects.switchable && effects.switchable.allEffects.length > 0 && (() => {
                // ── ลำดับความสำคัญ: user override > auto-select > fallback option แรก ──
                const overrideOpt = selectedSwitchableOverride
                  ? effects.switchable!.allEffects.find(o => o.effect.name === selectedSwitchableOverride)
                  : undefined
                const mainEffect = overrideOpt?.effect ?? selectedSwitchableEffect ?? effects.switchable.effect
                if (!mainEffect) return null

                // หา trigType ของ option ที่แสดง
                const mainOpt = overrideOpt
                  ?? (selectedSwitchableEffect
                    ? effects.switchable!.allEffects.find(o => o.effect.name === selectedSwitchableEffect.name)
                    : null)
                const mainTrigType = mainOpt?.trigType ?? effects.switchable.trigType

                // options สำหรับ static expanded view (picker preview / meta) — ยกเว้น main
                const otherOptions = effects.switchable.allEffects.filter(o => o.effect.name !== mainEffect.name)

                return (
                  <>
                    {/* ── กล่องส้ม: header + main effect (มี overlay ครอบทั้งกล่องเมื่อ inactive) ── */}
                    <div className="rounded-xl border border-orange-500/30 bg-orange-500/15 p-3 relative">
                      {effectiveSwitchableInactiveReason && (
                        <div className="absolute inset-0 rounded-xl bg-black/70 z-10 pointer-events-none" />
                      )}
                      <div className="flex items-center gap-1.5 mb-2">
                        {mainTrigType && TRIG_IMG[mainTrigType] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img loading="lazy" decoding="async"
                            src={TRIG_IMG[mainTrigType]}
                            alt={mainTrigType}
                            className="h-4 object-contain"
                          />
                        ) : (
                          <span className="material-icons-round text-orange-300 text-base">cached</span>
                        )}
                        <span className="text-xs font-bold text-orange-300 uppercase tracking-wider">Switchable Effect</span>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img loading="lazy" decoding="async" src={effectLevelIcon('Switchable_Effect', iconLevels.switchable)} alt="" className="h-5 object-contain ml-0.5"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                        {effects.switchable.allEffects.length > 1 && (
                          <button
                            onClick={() => setSwitchExpanded((v) => !v)}
                            className="ml-auto text-[10px] font-semibold text-orange-300 hover:text-orange-200 transition-colors relative z-20"
                          >
                            {switchExpanded ? tStat('− More') : tStat('+ More')}
                          </button>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="text-orange-200 truncate">{mainEffect.nameKey ? t('equip', mainEffect.nameKey, mainEffect.name) : mainEffect.name}</span>
                        <span className="font-bold text-white shrink-0">{tUnit(mainEffect.value)}</span>
                      </div>
                    </div>

                    {/* ── Expanded options (นอกกล่องส้ม → ไม่โดน overlay) ── */}
                    {switchExpanded && (onSwitchableSelect
                      ? effects.switchable.allEffects.length > 0
                      : otherOptions.length > 0
                    ) && (
                      <div className="mt-1 rounded-xl border border-orange-500/20 bg-orange-500/10 px-3 py-2">
                        {onSwitchableSelect ? (
                          /* ── Installed gear mode: เลือกได้ ── */
                          <div className="space-y-1">
                            {effects.switchable.allEffects.map((o, i) => {
                              const trig = o.trigType?.toUpperCase()
                              const isSelected = o.effect.name === mainEffect.name
                              const isOccupied = !!(occupiedSwitchableTypes?.includes(effectKey(o.effect)))
                              return (
                                <button
                                  key={i}
                                  type="button"
                                  onClick={() => { onSwitchableSelect(o.effect.name); setSwitchExpanded(false) }}
                                  className={`w-full flex items-center gap-2 text-sm rounded-lg px-2 py-1.5 transition-colors text-left
                                    ${isSelected
                                      ? 'bg-orange-500/25 ring-1 ring-orange-400/40'
                                      : 'hover:bg-white/5'
                                    }`}
                                >
                                  {trig && TRIG_IMG[trig] ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img loading="lazy" decoding="async" src={TRIG_IMG[trig]} alt={trig}
                                      className={`h-3.5 w-3.5 object-contain shrink-0 ${isOccupied && !isSelected ? 'opacity-40' : ''}`} />
                                  ) : null}
                                  <span className={`truncate flex-1 leading-snug text-xs ${isOccupied && !isSelected ? 'text-orange-200/40' : 'text-orange-200'}`}>
                                    {o.effect.nameKey ? t('equip', o.effect.nameKey, o.effect.name) : o.effect.name}
                                  </span>
                                  <span className={`font-bold shrink-0 text-sm ${isOccupied && !isSelected ? 'text-white/40' : 'text-white'}`}>
                                    {tUnit(o.effect.value)}
                                  </span>
                                  {/* Badge "In use" — แสดงเมื่อ option นี้ถูก slot อื่นใช้อยู่ (ไม่ใช่ slot ปัจจุบัน) */}
                                  {isOccupied && !isSelected && (
                                    <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-500/30 text-red-200 border border-red-400/40">
                                      {tStat('In use')}
                                    </span>
                                  )}
                                  {isSelected && (
                                    <span className="material-icons-round text-orange-400 shrink-0" style={{ fontSize: '16px' }}>check_circle</span>
                                  )}
                                </button>
                              )
                            })}
                          </div>
                        ) : (
                          /* ── Picker preview / meta: แสดงแบบ static ── */
                          <div className="space-y-1.5">
                            {otherOptions.map((o, i) => (
                              <div key={i} className="flex items-center gap-2 text-sm">
                                {o.trigType && TRIG_IMG[o.trigType] ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img loading="lazy" decoding="async" src={TRIG_IMG[o.trigType]} alt={o.trigType} className="h-3.5 object-contain shrink-0" />
                                ) : null}
                                <span className="text-orange-200 truncate flex-1">{o.effect.nameKey ? t('equip', o.effect.nameKey, o.effect.name) : o.effect.name}</span>
                                <span className="font-bold text-white shrink-0">{tUnit(o.effect.value)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )
              })()}

              {/* SKILL+ (green) */}
              {effects.skillPlus.length > 0 && (
                <div className="rounded-xl border border-green-500/30 bg-green-500/15 p-3 relative">
                  {/* overlay มืดทั้งกล่อง เฉพาะเมื่อไม่มี SKILL+ ตัวไหนใช้ได้เลย · ใช้ได้บางตัว → หรี่เป็นรายบรรทัดด้านล่าง */}
                  {!skillPlusHasMatch && (
                    <div className="absolute inset-0 rounded-xl bg-black/70 z-10" />
                  )}
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="text-xs font-bold text-green-300 uppercase tracking-wider">SKILL+</span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img loading="lazy" decoding="async" src={effectLevelIcon('SKILL+', iconLevels.skillPlus)} alt="" className="h-5 object-contain ml-0.5"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  </div>
                  <div className="space-y-1.5">
                    {effects.skillPlus.map((e, i) => {
                      // แต่ละบรรทัด: ตรงกับผลของสกิลเรนเจอร์ไหม (eqip_skl_plus_grp) · ถูกเกียร์อื่นในกลุ่มเดียวกันทับไหม
                      const noMatch = !!rangerSkills?.length && hasSkillPlusRows(e.skillPlusGrowth)
                        && skillPlusHits(e.skillPlusGrowth, rangerSkills).length === 0
                      const overBy = effectiveSkillPlusOverriddenBy[e.name]
                      const off = noMatch || !!overBy
                      return (
                        <div key={i} className={`flex items-center justify-between gap-2 text-sm ${off ? 'opacity-40' : ''}`}>
                          <span className="text-green-200 leading-snug">
                            {e.nameKey ? t('equip', e.nameKey, e.name) : e.name}
                            {skillPlusHasMatch && off && (
                              <span className="ml-1.5 text-[10px] font-semibold text-gray-300">
                                ({noMatch ? tStat('No matching skill') : `${tStat('Overridden by')} ${overBy}`})
                              </span>
                            )}
                          </span>
                          {e.value && <span className="font-bold text-white shrink-0">{tUnit(fmtSkillPlusValue(e.value))}</span>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

            </div>
          )
        )}

        {/* ── ปุ่มติดตั้ง / ถอด+เปลี่ยน (book mode) ── */}
        {(onInstall || onRemove || onReplace) && !loading && !error && (
          <div className="px-4 sm:px-6 pt-3 pb-5">
            {/* picker preview → ติดตั้ง */}
            {onInstall && (
              <button
                onClick={onInstall}
                className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-500 active:scale-95 text-white font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-purple-900/40"
              >
                <span className="material-icons-round text-lg">check_circle</span>
                {tStat('Install this gear')}
              </button>
            )}
            {/* installed gear → ถอด + เปลี่ยน */}
            {(onRemove || onReplace) && (
              <div className="flex gap-3">
                {onRemove && (
                  <button
                    onClick={onRemove}
                    className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-500 active:scale-95 text-white font-bold text-sm transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-red-900/40"
                  >
                    <span className="material-icons-round text-lg">remove_circle</span>
                    {tStat('Remove gear')}
                  </button>
                )}
                {onReplace && (
                  <button
                    onClick={onReplace}
                    className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold text-sm transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-blue-900/40"
                  >
                    <span className="material-icons-round text-lg">swap_horiz</span>
                    {tStat('Replace gear')}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

          </div>{/* /mainContentRef = core (effects) — ล็อกความสูง popup */}

        {/* ── ใต้ fold (peek): divider แรกโผล่ให้เห็น — Spec+ (9★) ขึ้นก่อน, ไม่งั้น "เรนเจอร์ที่ใส่มากสุด" ── */}
        {/* Spec+ (เกียร์ 9★) — ขึ้นก่อน "เรนเจอร์ที่ใส่มากสุด" (self-hide ถ้าไม่ใช่ 9★) */}
        {specItemCode && (
          <div className="px-4 sm:px-6 pt-1 pb-4">
            <GearSpecSection
              itemCode={specItemCode}
              grade={gearGrade}
              // Spec+ ปลดล็อกได้ก็ต่อเมื่อเกียร์ 9★ เลเวลเต็ม 15 ก่อนเท่านั้น — ต่ำกว่านั้นล็อกที่ 0 (ยังไม่ปลด)
              interactive={showLevelSlider ? sliderLevel >= 15 : !!showLevelSlider}
              lockedLevel={showLevelSlider ? (sliderLevel >= 15 ? 5 : 0) : (effectLevel === undefined || effectLevel === 'max' ? 5 : effectLevel)}
              specLevel={specLevel}
              onSpecLevelChange={onSpecLevelChange}
            />
          </div>
        )}

        {/* Content — ซ่อนทั้ง div เมื่อ hideRangerUsage + ไม่มี loading/error */}
        {(loading || !!error || !hideRangerUsage) && (
        <div className="px-4 sm:px-6 pt-1 pb-4 sm:pb-6">

          {/* Loading */}
          {loading && (
            <div className="text-center py-10">
              <span className="material-icons-round text-5xl text-yellow-400 animate-pulse">shield</span>
              <p className="text-gray-400 text-sm mt-3">{tStat('Fetching data...')}</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="text-red-400 text-sm bg-red-500/10 rounded-xl p-4 flex items-center gap-2">
              <span className="material-icons-round">warning</span>
              {error}
            </div>
          )}

          {/* Empty */}
          {!loading && !error && !hideRangerUsage && rangers.length === 0 && (
            <div className="text-center py-10 text-gray-500">
              <span className="material-icons-round text-4xl">search_off</span>
              <p className="mt-2 text-sm">{tStat('No Ranger uses this gear in this League')}</p>
            </div>
          )}

          {/* Rangers list */}
          {!loading && !error && !hideRangerUsage && rangers.length > 0 && (
            <div className="space-y-2">
              {/* ── Divider: ─── เรนเจอร์ที่ใส่มากสุด ─── (margin เท่า Spec+: mt-1 + mb-2.5) ── */}
              <div className="flex items-center gap-3 mt-1 mb-2.5">
                <div className="flex-1 h-px bg-white/15"></div>
                <span className={`font-bold text-xs tracking-wider ${slotColors.text}`}>
                  {tStat('Most-used by Rangers')}
                </span>
                <div className="flex-1 h-px bg-white/15"></div>
              </div>
              <p className="text-xs text-gray-500 mb-3 text-center">
                {tStat('Sorted by most-installed — % is based on every detected instance of each Ranger')}
              </p>

              {rangers.map((r, index) => {
                const barPct = maxCount > 0 ? (r.count / maxCount) * 100 : 0
                const pctStr = r.pct.toFixed(1)
                const isTop3 = index < 3

                return (
                  <div
                    key={r.rangerId}
                    className={`flex items-center gap-3 p-2 sm:p-3 rounded-xl transition-colors ${
                      isTop3 ? 'bg-yellow-500/5 border border-yellow-500/10' : 'bg-white/5'
                    }`}
                  >
                    {/* Rank */}
                    <div className="w-6 sm:w-8 shrink-0 text-center">
                      {index === 0 && <span className="material-icons-round text-yellow-400 text-lg">looks_one</span>}
                      {index === 1 && <span className="material-icons-round text-gray-300 text-lg">looks_two</span>}
                      {index === 2 && <span className="material-icons-round text-orange-400 text-lg">looks_3</span>}
                      {index >= 3 && <span className="text-gray-500 text-xs font-bold">#{index + 1}</span>}
                    </div>

                    {/* Ranger image */}
                    <div className="w-8 h-11 sm:w-10 sm:h-14 rounded-lg bg-white/5 overflow-hidden flex items-center justify-center shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img loading="lazy" decoding="async"
                        src={r.imageUrl}
                        alt={r.name}
                        className="max-h-full max-w-full object-contain"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                    </div>

                    {/* Name + bar */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-xs sm:text-sm font-medium text-white truncate">{tRanger(r.rangerId, r.name)}</span>
                        <span className="text-xs text-gray-400 shrink-0">
                          {r.count}
                          <span className="text-gray-600"> / {r.sampled} {tStat('units')}</span>
                        </span>
                      </div>
                      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-1.5 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full"
                          style={{ width: `${barPct}%` }}
                        />
                      </div>
                    </div>

                    {/* Pct */}
                    <div className={`shrink-0 text-right w-12 sm:w-14`}>
                      <span className={`font-bold text-sm sm:text-base ${isTop3 ? slotColors.text : 'text-gray-300'}`}>
                        {pctStr}%
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        )}
        </div>{/* /body */}
      </div>
    </div>
  )
}
