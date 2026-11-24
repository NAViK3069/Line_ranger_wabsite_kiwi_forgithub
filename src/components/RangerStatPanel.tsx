'use client'

// ====================================================
// RangerStatPanel — Ranger Detail (ตามดีไซน์ใหม่)
// 3 columns: portrait+gear / quick info+speed+skill / detailed stat panel
// ====================================================

import { apiFetch } from '@/lib/staticApi'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { GearEffect, GearEffects } from '@/lib/pvpScraper'
import {
  aggregateGearBonuses,
  aggregateTalentBonuses,
  mergeStatBonusMaps,
  applyBonus,
  inGameMineral,
  type StatBonus,
  type StatBonusMap,
} from '@/lib/gearEffectParser'
import GearDetailPopup from '@/components/GearDetailPopup'
import RangerAnimationPopup from '@/components/RangerAnimationPopup'
import { selectSwitchableEffects, absNumericValue, DEFAULT_SLOT_ORDER, type RangerContext, type SwitchableResultMap, type SlotOrder } from '@/lib/switchableSelector'
import { recalcGearEffects, splitSliderLevel } from '@/lib/gearLevelCalc'
import GearPickerModal, { type GearBookItem } from '@/components/GearPickerModal'
import { useLanguage } from '@/contexts/LanguageContext'
import { usePro } from '@/contexts/ProContext'
import { useSound } from '@/contexts/SoundContext'
import type { AwakenAbility } from '@/server/api/ranger/awakening/[id]/route'
import type { TriggerBasis } from '@/lib/rangerTriggerBasis'
import { calcRangerLevelStats, type RangerGrowthInput } from '@/lib/rangerLevelCalc'

// ── Types from /api/meta/ranger-stats ────────────────
interface SkillSlot {
  slot: 'skill1' | 'skill2' | 'skill3' | 'passive'
  code: string
  name: string
  description?: string
  iconUrl: string
  probability?: number
  cooldown?: number
  area?: number
  triggerBasis?: TriggerBasis
}

interface AbilitySlot {
  slot: 'group' | 'ability1' | 'ability2'
  code: string
  name: string
  description?: string
  iconUrl: string
  activeOnType?:    string
  activeWhenType?:  string
  searchType?:      string
  condition1Type?:  string
  condition1Value?: string
  condition2Type?:  string
  condition2Value?: string
  probability?:     number
}

interface RangerStatsResponse {
  id: string
  imageUrl: string
  tier: 'base8' | 'ultra' | 'hyper' | 'base9'
  tierLabel: string
  tierIconKey: string
  grade: number | null
  maxLevel: number
  playerMaxLevel: number
  unlimitMax: number
  category: string | null
  categoryLabel: string | null
  element: string | null
  mineral: number | null
  leonardMax: number | null
  attackRange: number | null
  attackScope: number | null
  splashRadius: number | null
  attackSpeedType: string | null
  moveSpeedType: string | null
  movingSpeed: number | null
  baseStats: {
    phyAtk: number
    magAtk: number
    phyDef: number
    magDef: number
    hp: number
    phyDps: number
    cooldown: number
    attackDelayFrames: number
    attackDelaySec: number
    atMaxUnlimit: boolean
    limitBreakTier: number
  }
  growth: RangerGrowthInput
  rates: {
    critRate: number
    critDamage: number
    evadeRate: number
    skillEvadeRate: number
    skillResistance: number
    hitRate: number
    skillHitRate: number
  }
  skills: SkillSlot[]
  abilities: AbilitySlot[]
}

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

type SlotKey = 'WPN' | 'AMR' | 'ACC'

// ── Constants ───────────────────────────────────────
// element key → asset (รับได้ทั้ง lowercase / uppercase / alias)
const ELEMENT_ICON: Record<string, string> = {
  fire: '/gacha/images/Fire.png',
  water: '/gacha/images/Water.png',
  wood: '/gacha/images/Tree.png',
  tree: '/gacha/images/Tree.png',
  nature: '/gacha/images/Tree.png',
  earth: '/gacha/images/Tree.png',
  plant: '/gacha/images/Tree.png',
  light: '/gacha/images/Light.png',
  holy: '/gacha/images/Light.png',
  dark: '/gacha/images/Dark.png',
  shadow: '/gacha/images/Dark.png',
}
const ELEMENT_LABEL: Record<string, string> = {
  fire: 'Fire', water: 'Water',
  wood: 'Wood', tree: 'Wood', nature: 'Wood', earth: 'Wood', plant: 'Wood',
  light: 'Light', holy: 'Light',
  dark: 'Dark', shadow: 'Dark',
}

// แปลงค่า raw element เป็น key มาตรฐาน (ตัด whitespace + lowercase)
function normalizeElement(raw: string | null | undefined): string | null {
  if (!raw) return null
  const k = raw.trim().toLowerCase()
  return k || null
}
const CATEGORY_ICON: Record<string, string> = {
  STR: '/gacha/images/Str.png',
  AGI: '/gacha/images/Agi.png',
  INT: '/gacha/images/Int.png',
}
const SPEED_LABEL: Record<string, string> = {
  VERY_SLOW: 'Very Slow', SLOW: 'Slow', NORMAL: 'Normal',
  FAST: 'Fast', VERY_FAST: 'Very Fast', SUPER_FAST: 'Super Fast',
}
// ── Helpers ─────────────────────────────────────────
function fmtCompact(n: number): string {
  const v = Math.round(n)
  if (v >= 100_000_000) return `${Math.round(v / 1000)}K`
  if (v >= 10_000_000) return `${Math.round(v / 1000)}K`
  return v.toString()
}

function fmtRaw(n: number): string {
  return Math.round(n).toString()
}

function fmtBonus(delta: number): string {
  if (delta === 0) return ''
  const v = Math.round(delta)
  return (v > 0 ? '+' : '') + v.toString()
}

function speedLabel(type: string | null | undefined): string {
  if (!type) return '—'
  // normalize: ตัด underscore, space, ทำเป็น UPPER → match ได้ทั้ง "VERY_FAST", "veryfast", "Very Fast"
  const normalized = type.replace(/[\s_]/g, '').toUpperCase()
  const map: Record<string, string> = {
    VERYSLOW:  'Very Slow',
    SLOW:      'Slow',
    NORMAL:    'Normal',
    FAST:      'Fast',
    VERYFAST:  'Very Fast',
    SUPERFAST: 'Super Fast',
  }
  return map[normalized] ?? type
}

function pctText(v: number, digits = 1): string {
  return `${(v * 100).toFixed(digits)}%`
}

// ─ Gear upgrade icon ตาม gear level ปัจจุบัน (0-15) + Spec+ level (0-5, เกียร์ 9★ เท่านั้น) ─
// level 0        → ไม่แสดงไอคอน (ยังไม่ได้อัพเลย)
// level 1-5      → Basic_Effect (component level = ตัวเลข slider ตรงๆ)
// level 6-10     → Switchable_Effect (component level = slider - 5)
// level 11-15    → SKILL+ (component level = slider - 10)
// เกียร์ 9★ + slider เต็ม 15 + specLevel > 0 → เปลี่ยนไปโชว์ Spac+ (component level = specLevel) แทน SKILL+
function effectLevelIconUrl(prefix: string, componentLevel: number): string {
  const suffix = componentLevel >= 5 ? 'max' : `+${componentLevel}`
  return `/gacha/images/${prefix}_${suffix}.png`
}
function gearLevelIcon(grade: number | null, level: number, specLevel: number): string | null {
  const is9Star = grade === 9
  if (is9Star && level >= 15 && specLevel > 0) return effectLevelIconUrl('Spac+', specLevel)
  if (level <= 0) return null
  if (level <= 5) return effectLevelIconUrl('Basic_Effect', level)
  if (level <= 10) return effectLevelIconUrl('Switchable_Effect', level - 5)
  return effectLevelIconUrl('SKILL+', level - 10)
}
// ── Meta/Gacha mode: ไม่มี concept เลเวลเกียร์ (คำนวณที่ MAX เสมอ) → โชว์ไอคอน max ตาม grade แบบเดิม ──
function gearMaxIconByGrade(grade: number | null): string | null {
  if (!grade) return null
  if (grade <= 6) return '/gacha/images/Basic_Effect_max.png'
  if (grade === 7) return '/gacha/images/Switchable_Effect_max.png'
  if (grade === 9) return '/gacha/images/Spac+_max.png'
  return '/gacha/images/SKILL+_max.png'
}

// ─ Tier asset URLs ─
// tierIconKey ∈ "1".."9" | "7+"/"8+" | "8#" ฯลฯ — encode "+"/"#" สำหรับใช้เป็น URL
function tierStarUrl(tierIconKey: string): string {
  return `/gacha/images/${encodeURIComponent(tierIconKey)}star.png`
}
function tierUnlimitIconUrl(tierIconKey: string, n: number): string {
  // รูป evolution stage มีแค่ 4 ชุด: 8_N (normal), 8+_N (ultra), 8#_N (hyper), 9_N (9★)
  // 1-7★ ทุก type ใช้รูปชุดเดียวกับ 8★ ของ type นั้น
  let prefix: string
  if (tierIconKey === '9')            prefix = '9'
  else if (tierIconKey.endsWith('#')) prefix = '8#'
  else if (tierIconKey.endsWith('+')) prefix = '8+'
  else                                prefix = '8'
  return `/gacha/images/${encodeURIComponent(prefix)}_${n}.png`
}

// ── Level display: label + icon ตาม level ที่เลือก (ceil-based tier, ตรงกับ limitBreakTier ฝั่ง server) ──
//   level ≤ maxLevel        → "Level : {level}/{maxLevel}" ไม่มีไอคอน (ยังไม่ปลดลิมิต)
//   maxLevel < level < max  → "{level}/{tierEnd}" + ไอคอน N_tier.png (กำลังไล่ tier)
//   level = playerMaxLevel  → "Level MAX : {level}/{level}" + ไอคอน N_max.png
function levelDisplayInfo(
  stats: { maxLevel: number; playerMaxLevel: number; unlimitMax: number; tierIconKey: string; tierLabel: string },
  level: number,
) {
  const { maxLevel, playerMaxLevel, unlimitMax, tierIconKey, tierLabel } = stats
  const clamped = Math.min(playerMaxLevel, Math.max(1, level))
  const tier = Math.min(unlimitMax, Math.ceil(Math.max(0, clamped - maxLevel) / 5))
  const tierEnd = tier > 0 ? Math.min(playerMaxLevel, maxLevel + tier * 5) : maxLevel
  // "Level : n/tierEnd" เสมอ (ไม่มีคำ MAX แยก — รูป + คำว่า MAX ในไอคอนบอกอยู่แล้วตอนเต็ม)
  const label = `Level : ${clamped}/${tierEnd}`
  return {
    level: clamped, tier, label,
    showIcon: tier > 0,
    iconUrl: tier > 0 ? tierUnlimitIconUrl(tierIconKey, tier) : '',
    iconAlt: `${tierLabel} +${tier}`,
  }
}

// ── ธีมสี popup ปรับเลเวล ตาม tier: Normal(base8/base9)=ทอง, Ultra=ฟ้า, Hyper=ชมพู ──
function levelPopupTheme(tier: 'base8' | 'ultra' | 'hyper' | 'base9'): { accent: string; text: string } {
  if (tier === 'ultra') return { accent: 'accent-sky-400', text: 'text-sky-300' }
  if (tier === 'hyper') return { accent: 'accent-pink-400', text: 'text-pink-300' }
  return { accent: 'accent-yellow-400', text: 'text-yellow-300' }
}

// ─ Bonus formatters (ใช้ใน stat panel ส่วนล่าง) ─
function bonusPctText(b: StatBonus | undefined): string {
  if (!b || b.pct === 0) return ''
  const v = b.pct * 100
  const rounded = Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(1)
  return `(${v >= 0 ? '+' : ''}${rounded}%)`
}
function bonusFlatText(b: StatBonus | undefined): string {
  if (!b || b.flat === 0) return ''
  const v = Math.round(b.flat)
  return `(${v >= 0 ? '+' : ''}${v})`
}
function bonusEither(b: StatBonus | undefined): string {
  if (!b) return ''
  // ใช้ pct ก่อน ถ้าไม่มีค่อย fallback flat
  return bonusPctText(b) || bonusFlatText(b)
}

// ── Module-level caches (ลด request ซ้ำเมื่อกดสลับเรนเจอร์) ──
// TTL 10 นาที: ป้องกัน stale data หลัง server deploy (ไม่งั้นข้อมูลค้างตลอด browser session)
const CACHE_TTL_MS = 10 * 60 * 1000
const statsCache     = new Map<string, { data: RangerStatsResponse; ts: number }>()
const effectsCache   = new Map<string, { data: GearEffects | null; ts: number }>()
type CastEntry = Record<string, { frames: number; seconds: number } | null>
type SkillTiming = {
  cast:     { frames: number; seconds: number } | null
  recovery: { frames: number; seconds: number } | null
}
const castTimeCache  = new Map<string, CastEntry>()

// ── Prefetch helper (เรียกจากภายนอก เช่น onMouseEnter ของ ranger row) ──
// ดึงล่วงหน้าก่อนเปิด popup เพื่อให้ cast time พร้อมทันทีที่เปิด tooltip
const pendingFetches = new Set<string>()
export function prefetchCastTime(rangerId: string): void {
  if (!rangerId || castTimeCache.has(rangerId) || pendingFetches.has(rangerId)) return
  pendingFetches.add(rangerId)
  apiFetch(`/api/ranger-cast-time/${encodeURIComponent(rangerId)}`)
    .then(r => r.ok ? r.json() : null)
    .then(j => {
      const entry: CastEntry = {
        skill1: j?.skill1 ?? null, skill2: j?.skill2 ?? null,
        recovery1: j?.recovery1 ?? null, recovery2: j?.recovery2 ?? null,
      }
      castTimeCache.set(rangerId, entry)
    })
    .catch(() => {})
    .finally(() => { pendingFetches.delete(rangerId) })
}

// ดึง gear effects หลายชิ้นพร้อมกันใน 1 request (cache-aware + TTL)
async function fetchGearEffectsBatch(
  iconUrls: string[],
  signal?: AbortSignal
): Promise<Map<string, GearEffects | null>> {
  const out = new Map<string, GearEffects | null>()
  const need: string[] = []
  const now = Date.now()
  for (const u of iconUrls) {
    if (!u) continue
    const entry = effectsCache.get(u)
    if (entry && now - entry.ts < CACHE_TTL_MS) {
      out.set(u, entry.data)   // ยังไม่หมดอายุ — ใช้ cache
    } else {
      need.push(u)             // หมดอายุหรือไม่มี — ต้อง fetch ใหม่
    }
  }
  if (need.length === 0) return out

  try {
    const url = `/api/meta/gear-effects-batch?iconUrls=${encodeURIComponent(need.join(','))}`
    // cache: 'no-store' — ข้าม browser HTTP cache ทั้งหมด ใช้ module TTL แทน
    const res = await apiFetch(url, { signal, cache: 'no-store' })
    const json = await res.json() as { effects?: Record<string, GearEffects | null> }
    const eff = json.effects ?? {}
    for (const u of need) {
      const v = eff[u] ?? null
      effectsCache.set(u, { data: v, ts: now })
      out.set(u, v)
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw err
    for (const u of need) {
      if (!out.has(u)) out.set(u, null)
    }
  }
  return out
}

// ── Component ───────────────────────────────────────
export type RangerPanelMode = 'meta' | 'gacha' | 'book'

interface Props {
  rangerId: string
  rangerName: string
  rangerImageUrl: string
  topSets?: GearSet[]
  gear?: GearRanking
  mode?: RangerPanelMode    // 'meta' (default) = ใช้ MAX level + เกียร์จริง / 'gacha' = level 1, ไม่ปลดลิมิต, ไม่มีเกียร์
  league?: number           // league สำหรับแสดง ranger usage ใน GearDetailPopup (default = 0 = Legend)
  talentLevel?: number      // ระดับพรสวรรค์ 0-4 จาก slider ใน TalentSection (mode='book' เท่านั้น) — เพิ่มค่าพลังเหมือนเกียร์
}

const EMPTY_GEAR: GearRanking = { WPN: [], AMR: [], ACC: [] }

export default function RangerStatPanel({
  rangerId, rangerName, rangerImageUrl,
  topSets = [],
  gear = EMPTY_GEAR,
  mode = 'meta',
  league = 0,
  talentLevel = 0,
}: Props) {
  const { tRanger, tGear, tStat, lang } = useLanguage()
  const { play } = useSound()
  const { isPro } = usePro()
  const isGacha = mode === 'gacha'
  const isBook  = mode === 'book'

  const [stats, setStats] = useState<RangerStatsResponse | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [statsError, setStatsError] = useState('')

  // ── Awakening Abilities (9★+) ──────────────────────
  const [awakenAbilities, setAwakenAbilities] = useState<AwakenAbility[] | null>(null)
  useEffect(() => {
    if (!stats?.grade || stats.grade < 9) { setAwakenAbilities(null); return }
    apiFetch(`/api/ranger/awakening/${encodeURIComponent(rangerId)}`)
      .then(r => r.json())
      .then(d => setAwakenAbilities(d.abilities?.length ? d.abilities : null))
      .catch(() => setAwakenAbilities(null))
  }, [rangerId, stats?.grade])

  // ── Top-used Awakening Ability (เฉพาะ Meta PVP) — เอาไอคอนตัวที่คนใช้เยอะสุดมาแทนไอคอน default ──
  const [topAwakenCode, setTopAwakenCode] = useState<string | null>(null)
  useEffect(() => {
    if (mode !== 'meta' || !awakenAbilities || awakenAbilities.length === 0) { setTopAwakenCode(null); return }
    apiFetch(`/api/ranger/usage-ranking/${encodeURIComponent(rangerId)}?league=${league}`)
      .then(r => r.json())
      .then(d => setTopAwakenCode(d.awakeningUsage?.[0]?.code ?? null))
      .catch(() => setTopAwakenCode(null))
  }, [mode, rangerId, league, awakenAbilities])

  // ── Top-used Talent level (เฉพาะ Meta PVP) — เอาระดับพรสวรรค์ที่คนใช้เยอะสุดจาก Talent Release Status มาใช้อัตโนมัติ ──
  const [topTalentCode, setTopTalentCode] = useState<string | null>(null)
  useEffect(() => {
    if (mode !== 'meta') { setTopTalentCode(null); return }
    apiFetch(`/api/ranger/usage-ranking/${encodeURIComponent(rangerId)}?league=${league}`)
      .then(r => r.json())
      .then(d => setTopTalentCode(d.talentUsage?.[0]?.code ?? null))
      .catch(() => setTopTalentCode(null))
  }, [mode, rangerId, league])

  // ── Gear Detail Popup ─────────────────────────────
  const [detailGear, setDetailGear] = useState<GearItem | null>(null)
  // animation popup: เปิดเมื่อกดรูปเรนเจอร์
  const [showAnimation, setShowAnimation] = useState(false)
  // ── Book mode: picker + installed-gear detail ─────
  const [pickerSlot, setPickerSlot]       = useState<SlotKey | null>(null)
  const [bookDetailSlot, setBookDetailSlot] = useState<SlotKey | null>(null)

  const [selected, setSelected] = useState<Record<SlotKey, GearItem | null>>(() => {
    if (isGacha || isBook) return { WPN: null, AMR: null, ACC: null }
    // แสดง Top 1 ของแต่ละช่องแยกกัน (ไม่ใช่ Top Set รวม)
    return {
      WPN: gear.WPN[0] ?? null,
      AMR: gear.AMR[0] ?? null,
      ACC: gear.ACC[0] ?? null,
    }
  })
  // raw effects จาก server ที่ level max เสมอ (พร้อม growth metadata) — ห้ามใช้ตรงๆ ในการคำนวณ/แสดงผล
  // ใช้ computedEffectsBySlot แทนเสมอ (คำนวณสดตาม gearLevel ของแต่ละ slot)
  const [effectsBySlot, setEffectsBySlot] = useState<Record<SlotKey, GearEffects | null>>({
    WPN: null, AMR: null, ACC: null,
  })
  // ── Gear level ต่อ slot (0-15, เริ่มต้น 0 ตอนใส่เกียร์ใหม่) — ปรับได้ผ่าน slider ใน GearDetailPopup ──
  const [gearLevel, setGearLevel] = useState<Record<SlotKey, number>>({ WPN: 0, AMR: 0, ACC: 0 })
  // ── Spec+ level ต่อ slot (0-5, เกียร์ 9★ เท่านั้น) — ปลดล็อกได้ก็ต่อเมื่อ gearLevel[slot] ถึง 15 (max) ก่อน ──
  const [gearSpecLevel, setGearSpecLevel] = useState<Record<SlotKey, number>>({ WPN: 0, AMR: 0, ACC: 0 })
  // เปลี่ยนเรนเจอร์ → reset level ทุก slot กลับ 0
  useEffect(() => {
    setGearLevel({ WPN: 0, AMR: 0, ACC: 0 })
    setGearSpecLevel({ WPN: 0, AMR: 0, ACC: 0 })
  }, [rangerId])

  // ── effects ที่ใช้จริงทุกที่ (bonus, switchable, display) ──
  // book mode: คำนวณสดตาม gearLevel ของแต่ละ slot (ผู้ใช้ปรับเองได้ เริ่มที่ 0)
  // meta/gacha mode: ไม่มี concept เลเวล → ใช้ effectsBySlot (raw, max) ตรงๆ เหมือนเดิมเสมอ
  const computedEffectsBySlot = useMemo((): Record<SlotKey, GearEffects | null> => {
    if (!isBook) return effectsBySlot
    const out: Record<SlotKey, GearEffects | null> = { WPN: null, AMR: null, ACC: null }
    for (const s of ['WPN', 'AMR', 'ACC'] as SlotKey[]) {
      const raw = effectsBySlot[s]
      out[s] = raw ? recalcGearEffects(raw, gearLevel[s]) : null
    }
    return out
  }, [effectsBySlot, gearLevel, isBook])

  // ── Install Order (book mode) ────────────────────────
  // ลำดับการติดตั้งเกียร์ — slot ที่ install ก่อนมีค่าน้อยกว่า → ชนะ tiebreak ใน duplicate resolution
  // PvP meta (ไม่ใช่ book): ใช้ DEFAULT_SLOT_ORDER (WPN < AMR < ACC) เพราะระบบเลือกเองทั้ง 3 slot พร้อมกัน
  // ค่าที่ยังไม่ install (slot ว่าง): ใช้ default → ไม่กระทบเพราะ effect = null ไม่เข้า duplicate detection
  const [installOrder, setInstallOrder] = useState<SlotOrder>(DEFAULT_SLOT_ORDER)
  // counter สำหรับ assign install order ครั้งถัดไป (เริ่ม 100 เพื่อให้ใหญ่กว่า default 0/1/2)
  const installCounterRef = useRef(100)

  // เมื่อเปลี่ยน ranger → reset install order
  useEffect(() => {
    setInstallOrder(DEFAULT_SLOT_ORDER)
    installCounterRef.current = 100
  }, [rangerId])

  // helper: assign next install order ให้ slot
  const assignInstallOrder = (s: SlotKey) => {
    const next = installCounterRef.current++
    setInstallOrder(prev => ({ ...prev, [s]: next }))
  }

  // ── Switchable Effect selection — เทียบค่าตัวเลขจริงเหมือนหน้า Meta (selectSwitchableEffects) ──
  // ค่าสูงกว่าชนะ (คำนวณสดตาม gear level ของแต่ละชิ้น) — ค่าเท่ากันถึงตัดสินด้วย install order
  // เป็น pure computation ล้วน (ไม่ lock-in) → level/เกียร์ชิ้นไหนเปลี่ยน re-compute ใหม่ถูกต้องเสมอ
  const switchableResults = useMemo((): SwitchableResultMap | null => {
    if (isGacha || !stats) return null
    const hasDamageSkill = stats.skills.some(s => s.description?.includes('ATK x'))

    // ── ctx: รวม basic effects ของ "ทุก slot" ที่ติดตั้งอยู่ ──
    // เหตุผล: threshold (95%) คือ "total rate (รวม basic ของทุกชิ้น) เกินแล้วหรือยัง?"
    // ถ้าเกินแล้ว → ไม่ต้อง pick stat นั้นใน switchable (เพราะจะเกินไป ไม่มีประโยชน์)
    const basicBonusesAll = aggregateGearBonuses(
      [computedEffectsBySlot.WPN, computedEffectsBySlot.AMR, computedEffectsBySlot.ACC],
      [null, null, null]
    )
    const ctx: RangerContext = {
      category: stats.category,
      element: normalizeElement(stats.element),
      hasDamageSkill,
      skillEvadeRate:  stats.rates.skillEvadeRate  + (basicBonusesAll.skillEvadeRate?.pct  ?? 0),
      skillResistance: stats.rates.skillResistance + (basicBonusesAll.skillResistance?.pct ?? 0),
    }

    return selectSwitchableEffects(
      { WPN: computedEffectsBySlot.WPN, AMR: computedEffectsBySlot.AMR, ACC: computedEffectsBySlot.ACC },
      ctx,
      installOrder,
    )
  }, [stats, computedEffectsBySlot, isGacha, installOrder])

  // ── User switchable override — book mode เท่านั้น (เลือก option เอง) ──
  const [switchableOverrides, setSwitchableOverrides] = useState<Record<SlotKey, string | null>>({
    WPN: null, AMR: null, ACC: null,
  })

  // Reset overrides เมื่อเปลี่ยน ranger
  useEffect(() => { setSwitchableOverrides({ WPN: null, AMR: null, ACC: null }) }, [rangerId])

  // Reset override ของ slot ที่ถอดเกียร์ออก
  useEffect(() => {
    setSwitchableOverrides(prev => {
      const next = { ...prev }
      let changed = false
      for (const s of ['WPN', 'AMR', 'ACC'] as SlotKey[]) {
        if (!selected[s] && next[s] !== null) { next[s] = null; changed = true }
      }
      return changed ? next : prev
    })
  }, [selected])

  // ── Effective switchable per slot (auto + user override + duplicate detection) ──
  // ใช้แทน switchableResults ทุกที่ เพื่อรองรับการเปลี่ยน option โดย user
  type EffSwSlot = {
    active: boolean
    effect: GearEffect | null
    trigType: string | null           // สำหรับ icon display เท่านั้น
    inactiveReason?: 'duplicate' | 'type_mismatch'
  }
  const effectiveSwitchable = useMemo((): Record<SlotKey, EffSwSlot> => {
    const EMPTY: EffSwSlot = { active: false, effect: null, trigType: null }
    const slots: SlotKey[] = ['WPN', 'AMR', 'ACC']
    if (!switchableResults) return { WPN: EMPTY, AMR: EMPTY, ACC: EMPTY }

    // helper: trigType ของ effect ใน slot (สำหรับ icon เท่านั้น)
    const getTrig = (slot: SlotKey, eff: GearEffect | null): string | null => {
      if (!eff) return null
      const opt = computedEffectsBySlot[slot]?.switchable?.allEffects?.find(o => o.effect?.name === eff.name)
      return opt?.trigType?.toUpperCase() ?? null
    }

    // ── ไม่มี override → ใช้ switchableResults โดยตรง (คำนวณถูกต้องโดย selectSwitchableEffects) ──
    // สำคัญ: duplicate detection ใน selectSwitchableEffects ใช้ EFFECT NAME ไม่ใช่ trigType
    const hasOverrides = slots.some(s => switchableOverrides[s] !== null)
    if (!hasOverrides) {
      const result: Record<SlotKey, EffSwSlot> = { WPN: EMPTY, AMR: EMPTY, ACC: EMPTY }
      for (const s of slots) {
        const auto = switchableResults[s]
        result[s] = {
          active: auto.active,
          effect: auto.effect,
          trigType: getTrig(s, auto.effect),
          inactiveReason: auto.inactiveReason,
        }
      }
      return result
    }

    // ── มี override → คำนวณใหม่ ──
    // ตรวจ type_mismatch ตามกฎ matchesTrigType ใน switchableSelector:
    //   null trigType → works for all, CATEGORY → match category, ELEMENT → match element
    const CATEGORY_TYPES = new Set(['STR', 'AGI', 'INT'])
    const ELEM_TRIG_MAP: Record<string, string[]> = {
      FIRE: ['fire'], WATER: ['water'],
      TREE: ['wood', 'tree', 'nature', 'earth', 'plant'],
      LIGHT: ['light', 'holy'], DARK: ['dark', 'shadow'],
    }
    const checkCompat = (trigType: string | null): boolean => {
      if (!trigType) return true
      if (CATEGORY_TYPES.has(trigType)) return trigType === stats?.category?.toUpperCase()
      const targets = ELEM_TRIG_MAP[trigType]
      if (targets) {
        const ek = normalizeElement(stats?.element ?? null)
        return ek ? targets.includes(ek) : false
      }
      return false   // unknown trigType → ไม่ compatible
    }

    // Step 1: หา selected effect + trigType (override > auto)
    type SelInfo = { effect: GearEffect | null; trigType: string | null }
    const sel: Record<SlotKey, SelInfo> = {
      WPN: { effect: null, trigType: null },
      AMR: { effect: null, trigType: null },
      ACC: { effect: null, trigType: null },
    }
    for (const s of slots) {
      const ov = switchableOverrides[s]
      const allOpts = computedEffectsBySlot[s]?.switchable?.allEffects ?? []
      if (ov) {
        const opt = allOpts.find(o => o.effect?.name === ov)
        if (opt) { sel[s] = { effect: opt.effect, trigType: opt.trigType?.toUpperCase() ?? null }; continue }
      }
      // auto
      const auto = switchableResults[s]
      sel[s] = { effect: auto.effect, trigType: getTrig(s, auto.effect) }
    }

    // Step 2: check type_mismatch
    const result: Record<SlotKey, EffSwSlot> = { WPN: EMPTY, AMR: EMPTY, ACC: EMPTY }
    for (const s of slots) {
      const { effect, trigType } = sel[s]
      if (!effect) { result[s] = EMPTY; continue }
      const compat = checkCompat(trigType)
      result[s] = { active: compat, effect, trigType, inactiveReason: compat ? undefined : 'type_mismatch' }
    }

    // Step 3: duplicate detection โดย EFFECT NAME — เทียบค่าตัวเลขจริง (สูงกว่าชนะ)
    // เท่ากันถึงตัดสินด้วย install order (ติดตั้งก่อนชนะ) — ตรงกับ selectSwitchableEffects
    const activeSlots = slots.filter(s => result[s].active && result[s].effect)
    const byName = new Map<string, SlotKey[]>()
    for (const s of activeSlots) {
      const name = result[s].effect!.name
      byName.set(name, [...(byName.get(name) ?? []), s])
    }
    for (const group of byName.values()) {
      if (group.length < 2) continue
      const winner = group.reduce((best, s) => {
        const vBest = absNumericValue(result[best].effect!.value)
        const vS = absNumericValue(result[s].effect!.value)
        if (vS !== vBest) return vS > vBest ? s : best
        return (installOrder[s] ?? 999) < (installOrder[best] ?? 999) ? s : best
      })
      for (const s of group) {
        if (s !== winner) result[s] = { ...result[s], active: false, inactiveReason: 'duplicate' }
      }
    }
    return result
  }, [switchableResults, switchableOverrides, computedEffectsBySlot, stats, installOrder])

  // ── Shared pin state ข้าม Skill + Ability row ──────────────
  // ถ้า icon ไหนถูก pin → ทุก icon อื่น (รวมต่าง row) suppressHover
  const [iconPinnedKey, setIconPinnedKey] = useState<string | null>(null)
  useEffect(() => {
    if (!iconPinnedKey) return
    const onDown = (e: MouseEvent) => {
      if ((e.target as Element).closest('[data-icon-row]')) return
      if ((e.target as Element).closest('[data-icon-tooltip]')) return  // คลิกใน tooltip portal → ไม่ปิด
      setIconPinnedKey(null)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIconPinnedKey(null) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [iconPinnedKey])

  // ── Cast time (s_attack_ready / s2_attack_ready จาก .sam) ──────────────
  // null  = กำลังโหลด (แสดง "...")
  // {}    = โหลดแล้ว แต่ไม่มีข้อมูล (ranger ไม่มีไฟล์ .sam)
  // { skill1: {...}, skill2: {...} } = โหลดสำเร็จ
  const [castTimesMap, setCastTimesMap] = useState<CastEntry | null>(() => {
    const hit = castTimeCache.get(rangerId)
    return hit ?? null
  })
  useEffect(() => {
    if (!rangerId) return
    const hit = castTimeCache.get(rangerId)
    if (hit) { setCastTimesMap(hit); return }
    setCastTimesMap(null)   // reset loading state เมื่อ rangerId เปลี่ยน
    const ctrl = new AbortController()
    apiFetch(`/api/ranger-cast-time/${encodeURIComponent(rangerId)}`, { signal: ctrl.signal })
      .then(r => r.ok ? r.json() : null)
      .then(j => {
        if (ctrl.signal.aborted) return
        const entry: CastEntry = {
          skill1: j?.skill1 ?? null, skill2: j?.skill2 ?? null,
          recovery1: j?.recovery1 ?? null, recovery2: j?.recovery2 ?? null,
        }
        castTimeCache.set(rangerId, entry)
        setCastTimesMap(entry)
      })
      .catch(() => { setCastTimesMap({}) })   // error → empty (ไม่แสดงอะไร)
    return () => { ctrl.abort() }
  }, [rangerId])

  // ── ปรับเลเวลเรนเจอร์เอง (Ranger Book เท่านั้น) ──
  //   คำนวณค่าพลังสดฝั่ง client จาก stats.growth (ดู calcRangerLevelStats) — ลากสไลเดอร์ลื่นไหลได้เลย
  //   ไม่ต้องยิง fetch ซ้ำทุกครั้งที่ลาก (ต่างจาก warmycat ที่โหลด growth ทั้งก้อนมาตั้งแต่แรกเหมือนกัน)
  const [sliderLevel, setSliderLevel] = useState<number | null>(null)
  const [levelPopupOpen, setLevelPopupOpen] = useState(false)
  const levelPopupRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Ranger Book เริ่มที่ Level 1 เสมอ (ไม่ใช่ MAX) แล้วให้ผู้ใช้ปรับเองผ่านสไลเดอร์ — โหมดอื่นไม่เกี่ยว (fallback เป็น MAX ตามเดิม)
    setSliderLevel(isBook ? 1 : null); setLevelPopupOpen(false)
  }, [rangerId, isBook])

  // ปิด popup เมื่อคลิกข้างนอก
  useEffect(() => {
    if (!levelPopupOpen) return
    const onClick = (e: MouseEvent) => {
      if (levelPopupRef.current && !levelPopupRef.current.contains(e.target as Node)) setLevelPopupOpen(false)
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [levelPopupOpen])

  // ── Fetch ranger stats (cache + AbortController กันยิงซ้ำเมื่อกดรัว ๆ) — ครั้งเดียวต่อ ranger เสมอ ──
  useEffect(() => {
    // gacha mode: ใช้ level=1 (ไม่ปลดลิมิต ไม่บวกเลเวล) — แยก cache key กัน collide
    const cacheKey = isGacha ? `${rangerId}:lv1` : rangerId
    const cached = statsCache.get(cacheKey)
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      setStats(cached.data); setStatsLoading(false); setStatsError('')
      return
    }

    const ctrl = new AbortController()
    setStats(null); setStatsLoading(true); setStatsError('')
    const apiUrl = isGacha
      ? `/api/meta/ranger-stats?id=${encodeURIComponent(rangerId)}&level=1`
      : `/api/meta/ranger-stats?id=${encodeURIComponent(rangerId)}`
    apiFetch(apiUrl, { signal: ctrl.signal, cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (ctrl.signal.aborted) return
        if (j.error) { setStatsError(j.error); setStatsLoading(false); return }
        statsCache.set(cacheKey, { data: j as RangerStatsResponse, ts: Date.now() })
        setStats(j as RangerStatsResponse); setStatsLoading(false)
      })
      .catch((e) => {
        if (e?.name === 'AbortError') return
        setStatsError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด')
        setStatsLoading(false)
      })
    return () => { ctrl.abort() }
  }, [rangerId, isGacha])

  // ── Fetch gear effects แบบ batch (3 → 1 request) + cancellation ──
  // skip ถ้า gacha mode (ไม่มีเกียร์)
  useEffect(() => {
    if (isGacha) return
    const ctrl = new AbortController()
    const slots: SlotKey[] = ['WPN', 'AMR', 'ACC']
    const urls = slots.map((s) => selected[s]?.iconUrl).filter((u): u is string => !!u)

    fetchGearEffectsBatch(urls, ctrl.signal)
      .then((map) => {
        if (ctrl.signal.aborted) return
        const next: Record<SlotKey, GearEffects | null> = { WPN: null, AMR: null, ACC: null }
        for (const s of slots) {
          const url = selected[s]?.iconUrl
          next[s] = url ? (map.get(url) ?? null) : null
        }
        setEffectsBySlot(next)
      })
      .catch((e) => {
        if (e?.name !== 'AbortError') console.error('[RangerStatPanel] gear effects fetch failed:', e)
      })
    return () => { ctrl.abort() }
  }, [selected, isGacha])

  const gearBonuses: StatBonusMap = useMemo(
    () => aggregateGearBonuses(
      [computedEffectsBySlot.WPN, computedEffectsBySlot.AMR, computedEffectsBySlot.ACC],
      [
        effectiveSwitchable.WPN.active ? effectiveSwitchable.WPN.effect : null,
        effectiveSwitchable.AMR.active ? effectiveSwitchable.AMR.effect : null,
        effectiveSwitchable.ACC.active ? effectiveSwitchable.ACC.effect : null,
      ]
    ),
    [computedEffectsBySlot, effectiveSwitchable]
  )

  // ── Talent bonus (Ranger Book เท่านั้น) — Enhanced Talent ภาษาอังกฤษทางการของเกม (ชื่อสเตตัส GEAR_ATTR + ค่า
  //    เช่น "Physical ATK +300%") ให้ classify() จับ pattern ได้ตรงๆ
  //    แล้วรวมเข้ากับ bonuses ของเกียร์ด้วยโลจิกเดียวกันเป๊ะๆ ผ่าน aggregateTalentBonuses/mergeStatBonusMaps ──
  const [talentEnhancedEn, setTalentEnhancedEn] = useState<string[]>([])
  useEffect(() => {
    // Meta ก็ต้องโหลดด้วย — ใช้คำนวณค่าพลังจาก topTalentCode (Talent Release Status อันดับ 1) อัตโนมัติ
    if (mode !== 'book' && mode !== 'meta') { setTalentEnhancedEn([]); return }
    let cancelled = false
    apiFetch(`/api/ranger/talents/${encodeURIComponent(rangerId)}?v=3`).then(r => r.json()).catch(() => ({ hasTalent: false }))
      .then((data: { enhancedL?: ({ en?: string } | null)[] }) => {
        if (cancelled) return
        const lines = Array.isArray(data.enhancedL) ? data.enhancedL : []
        setTalentEnhancedEn(lines.map(l => l?.en ?? ''))
      }).catch(() => { if (!cancelled) setTalentEnhancedEn([]) })
    return () => { cancelled = true }
  }, [mode, rangerId])

  // ระดับพรสวรรค์ที่ใช้จริง: book = ปรับเองจาก slider / meta = อัตโนมัติจาก Talent Release Status อันดับ 1 / gacha = 0
  const effectiveTalentLevel =
    mode === 'book' ? talentLevel
    : mode === 'meta' ? (topTalentCode ? parseInt(topTalentCode, 10) || 0 : 0)
    : 0

  // ระดับ 1 = ปลด Major Talent เฉยๆ (ไม่มีค่าพลัง) / ระดับ 2-4 = สะสม Enhanced Talent ตัวที่ 1..N
  const talentBonuses: StatBonusMap = useMemo(
    () => effectiveTalentLevel > 0
      ? aggregateTalentBonuses(talentEnhancedEn.slice(0, Math.max(0, effectiveTalentLevel - 1)))
      : {},
    [effectiveTalentLevel, talentEnhancedEn]
  )

  const bonuses: StatBonusMap = useMemo(
    () => mergeStatBonusMaps(gearBonuses, talentBonuses),
    [gearBonuses, talentBonuses]
  )

  // SKILL+ deduplication — ป้องกัน tooltip โชว์ effect ซ้ำข้ามสล็อต
  const skillPlusDedup = useMemo(() => deduplicateSkillPlus(computedEffectsBySlot), [computedEffectsBySlot])

  // ── ชื่อ effect ที่ slot อื่นกำลังใช้อยู่จริง (override > auto lock) ──
  const usedEffectNameOf = (s: SlotKey): string | null => {
    const ov = switchableOverrides[s]
    if (ov) return ov
    return switchableResults?.[s]?.effect?.name ?? null
  }
  const otherSlotsLockedNamesFor = (currentSlot: SlotKey): string[] => {
    return (['WPN', 'AMR', 'ACC'] as SlotKey[])
      .filter(s => s !== currentSlot)
      .map(s => usedEffectNameOf(s))
      .filter((n): n is string => !!n)
  }

  // ── ctx ที่ส่งให้ popup: รวม basic ของ "slot อื่นๆ" เท่านั้น (ไม่รวม slot ที่ popup แสดง) ──
  // Memoize ทุก slot พร้อมกันใน object เดียว → aggregateGearBonuses ถูกเรียกแค่ตอน stats/effectsBySlot เปลี่ยน
  const rangerCtxBySlot = useMemo((): Partial<Record<SlotKey, RangerContext>> => {
    if (!stats) return {}
    const hasDamageSkill = stats.skills.some(s => s.description?.includes('ATK x'))
    const SLOTS: SlotKey[] = ['WPN', 'AMR', 'ACC']
    const result: Partial<Record<SlotKey, RangerContext>> = {}
    for (const slot of SLOTS) {
      const otherEffects = SLOTS.filter(s => s !== slot).map(s => computedEffectsBySlot[s])
      const bb = aggregateGearBonuses(otherEffects, [null, null, null])
      result[slot] = {
        category: stats.category,
        element: normalizeElement(stats.element),
        hasDamageSkill,
        skillEvadeRate:  stats.rates.skillEvadeRate  + (bb.skillEvadeRate?.pct  ?? 0),
        skillResistance: stats.rates.skillResistance + (bb.skillResistance?.pct ?? 0),
      }
    }
    return result
  }, [stats, computedEffectsBySlot])

  const rangerCtxForSlot = (excludeSlot: SlotKey): RangerContext | undefined =>
    rangerCtxBySlot[excludeSlot]

  // ── Picker preview context ─────────────────────────────────────────────
  // เมื่อเปิด picker สำหรับ slot หนึ่ง → ส่งข้อมูลจาก slot อื่นที่ใส่เกียร์แล้ว
  // เพื่อให้ preview popup แสดง inactive switchable + override SKILL+ ได้ถูกต้อง

  // SKILL+ จาก slot อื่น (ไม่ใช่ pickerSlot) ที่ใส่เกียร์แล้ว
  const pickerExistingSkillPlus = useMemo((): Array<{ name: string; value: string; slot: string }> => {
    if (!pickerSlot) return []
    const others = (['WPN', 'AMR', 'ACC'] as SlotKey[]).filter(s => s !== pickerSlot)
    const result: Array<{ name: string; value: string; slot: string }> = []
    for (const s of others) {
      for (const sp of computedEffectsBySlot[s]?.skillPlus ?? []) {
        result.push({ name: sp.name, value: sp.value, slot: s })
      }
    }
    return result
  }, [pickerSlot, computedEffectsBySlot])

  // ── Loading / Error ───────────────────────────────
  // statsLoading && !stats เท่านั้น (ไม่ใช่ statsLoading เฉยๆ) — กันจอกระพริบตอนแค่ปรับเลเวล (มีข้อมูลเก่าค้างอยู่)
  if (statsLoading && !stats) {
    return (
      <section className="bg-white/5 rounded-xl p-4 text-center">
        <span className="material-icons-round text-3xl text-yellow-400 animate-pulse">auto_awesome</span>
        <p className="text-xs text-gray-400 mt-2">{tStat('Loading Ranger data...')}</p>
      </section>
    )
  }
  if (statsError || !stats) {
    return (
      <section className="bg-red-500/10 rounded-xl p-3 text-xs text-red-300">
        ⚠ ไม่สามารถโหลด Ranger Detail: {statsError || 'unknown'}
      </section>
    )
  }

  // ── ค่าพลังที่ level ที่เลือกจริง (Ranger Book) — คำนวณสดฝั่ง client จาก stats.growth ──
  //   โหมดอื่น (gacha/meta) ใช้ stats.baseStats ตรงๆ เหมือนเดิม (เลเวลคงที่)
  const displayLevelForCalc = isBook ? (sliderLevel ?? stats.playerMaxLevel) : undefined
  const effectiveBaseStats = isBook
    ? calcRangerLevelStats(
        stats.growth,
        { tier: stats.tier, combineMax: stats.unlimitMax, maxLevel: stats.maxLevel, playerMaxLevel: stats.playerMaxLevel },
        displayLevelForCalc,
      )
    : stats.baseStats

  // ── Compute totals + bonuses ──────────────────────
  const phyAtk = applyBonus(effectiveBaseStats.phyAtk, bonuses.phyAtk)
  const magAtk = applyBonus(effectiveBaseStats.magAtk, bonuses.magAtk)
  const hp = applyBonus(effectiveBaseStats.hp, bonuses.hp)
  const phyDef = applyBonus(effectiveBaseStats.phyDef, bonuses.phyDef)
  const magDef = applyBonus(effectiveBaseStats.magDef, bonuses.magDef)
  // ATK Speed — คำนวณ effective delay หลังใส่เกียร์ที่เพิ่ม atkSpeed
  // attackDelayFrames = frames @ 30fps → delaySec = frames/30
  // ATK Speed display = 10000/frames (ตรงกับเกม)
  // atkSpeedPct เป็น fraction (0.63 = +63%) → attack ไวขึ้น = delay ลดลง
  const atkSpeedPct = bonuses.atkSpeed?.pct ?? 0
  const baseDelayFrames = effectiveBaseStats.attackDelayFrames  // frames @ 30fps
  const effectiveDelayFrames = baseDelayFrames > 0 ? baseDelayFrames / (1 + atkSpeedPct) : 0
  const effectiveDelaySec = effectiveDelayFrames > 0 ? effectiveDelayFrames / 30 : 0  // frames ÷ 30 = seconds
  // ATK per sec = (Phy ATK + Mag ATK) ÷ effective delay  — รวม Magical ATK ด้วย
  const totalDps = effectiveDelaySec > 0 ? (phyAtk + magAtk) / effectiveDelaySec : 0
  // ATK Speed display: 10000/frames → ตรงกับค่าในเกม
  const atkSpeedBase = baseDelayFrames > 0 ? Math.round(10000 / baseDelayFrames) : 0
  const atkSpeedEffective = effectiveDelayFrames > 0 ? Math.round(10000 / effectiveDelayFrames) : atkSpeedBase
  const atkSpeedDelta = atkSpeedEffective - atkSpeedBase
  const atkSpeedValueStr = atkSpeedBase > 0 ? `${atkSpeedBase}` : '—'
  const atkSpeedBonusStr = atkSpeedDelta !== 0
    ? `(${atkSpeedDelta >= 0 ? '+' : ''}${atkSpeedDelta})`
    : ''

  // totalDpsBase = base DPS ไม่มีเกียร์ (Phy+Mag ATK base ÷ base delay)
  const totalDpsBase = baseDelayFrames > 0
    ? (effectiveBaseStats.phyAtk + effectiveBaseStats.magAtk) / (baseDelayFrames / 30)
    : 0
  const totalAtk = phyAtk + magAtk
  const totalAtkBase = effectiveBaseStats.phyAtk + effectiveBaseStats.magAtk
  const totalDef = phyDef + magDef
  const totalDefBase = effectiveBaseStats.phyDef + effectiveBaseStats.magDef

  // element: ทนต่อ casing/alias + ถ้าไม่มี icon ตรงก็ยังแสดง label
  const elementKey = normalizeElement(stats.element)
  const elementIcon = elementKey ? ELEMENT_ICON[elementKey] : undefined
  const elementName = elementKey
    ? (ELEMENT_LABEL[elementKey] ?? (stats.element ?? '').replace(/^./, (c) => c.toUpperCase()))
    : null
  // log เคสไม่รู้จัก ช่วยขยายตาราง alias เพิ่มได้ทีหลัง
  if (elementKey && !elementIcon && typeof window !== 'undefined') {
    console.warn(`[RangerStatPanel] unknown element key: ${stats.element}`)
  }
  const categoryIcon = stats.category ? CATEGORY_ICON[stats.category.toUpperCase()] : undefined

  return (
    <>
    <section className="lr-detail-zone">
      <div className="grid grid-cols-1 md:grid-cols-[200px_minmax(0,1fr)] gap-3">

        {/* ─── LEFT (spans both rows on md+) ─── */}
        <div className="md:row-span-2 space-y-2 pb-3 md:pb-0">
          {/* Tier star image (ตามระดับเรนเจอร์) */}
          <div className="flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={tierStarUrl(stats.tierIconKey)}
              alt={stats.tierLabel}
              className="h-6 sm:h-8 object-contain"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          </div>

          {/* name — จองพื้นที่ 2 บรรทัด, centered แนวตั้ง+แนวนอน */}
          <div className="flex items-center justify-center min-h-[2.5rem] sm:min-h-[2.8rem]">
            <h3 className="text-center text-base sm:text-lg font-black text-white leading-tight line-clamp-2">
              {tRanger(rangerId, rangerName)}
            </h3>
          </div>

          {/* element badge — แสดงทุกตัวที่มี element แม้ icon ไม่ตรง map ก็ยังโชว์ label */}
          {elementName && (
            <div className="flex justify-center">
              <div className="flex items-center gap-1.5 bg-white/5 rounded-full pl-1 pr-3 py-0.5 shadow-md">
                {elementIcon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={elementIcon}
                    alt={elementName}
                    className="w-5 h-5 sm:w-6 sm:h-6 object-contain"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                ) : (
                  <span className="w-5 h-5 sm:w-6 sm:h-6 inline-flex items-center justify-center text-gray-400 text-xs">●</span>
                )}
                <span className="text-sm sm:text-base text-white font-bold">{tStat(elementName)}</span>
              </div>
            </div>
          )}

          {/* portrait — smaller card, centered; คลิก → เปิด animation popup
              เก็บดีไซน์เดิม แค่เพิ่ม hover scale + active scale (ไม่มี play icon / ring / bg change)
              w-full + max-width: ให้ button เต็ม parent (max 180px) เหมือน <div> เดิม
              ถ้าไม่มี w-full button จะ shrink-fit content (เล็กกว่า div) */}
          <button
            type="button"
            onClick={() => isPro && setShowAnimation(true)}
            className={`bg-white/5 rounded-xl p-1.5 mx-auto block w-full ${isPro ? 'transition-transform hover:scale-105 active:scale-95' : ''}`}
            style={{ maxWidth: 'clamp(140px, 100%, 180px)', cursor: isPro ? 'pointer' : 'default' }}
          >
            <div className="w-full aspect-square flex items-center justify-center relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={rangerImageUrl}
                alt={rangerName}
                className="max-h-full max-w-full object-contain pointer-events-none"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
              {/* Badge พรสวรรค์ — book: ตาม slider / meta: อัตโนมัติจาก Talent Release Status อันดับ 1 (0=Not Unlocked=ไม่โชว์)
                  รูปเปลี่ยนตามระดับ, ชิดซ้ายชิดบน, เลเยอร์สูงกว่ารูปเรนเจอร์ */}
              {effectiveTalentLevel > 0 && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/gacha/images/tlt${effectiveTalentLevel}.png`}
                  alt=""
                  className="absolute left-0 top-0 w-10 h-10 object-contain pointer-events-none z-10"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              )}
            </div>
          </button>

          {/* 3 gear slots — ล็อคที่ 200px (match LEFT column desktop) ไม่ยืดตามคอลัมน์/จอ */}
          <div className="grid grid-cols-3 gap-2 mx-auto" style={{ maxWidth: '200px' }}>
            {(['WPN', 'AMR', 'ACC'] as SlotKey[]).map((slot) => {
              const item = selected[slot]
              const handleClick = isBook
                ? item
                  ? () => setBookDetailSlot(slot)   // มีเกียร์ → เปิด Detail
                  : () => setPickerSlot(slot)         // ว่าง → เปิด Picker
                : (item ? () => setDetailGear(item) : undefined)
              return (
                <div key={slot}>
                  <div
                    aria-label={item?.name ?? slot}
                    onClick={handleClick}
                    className={`w-full aspect-square bg-white/5 rounded-lg flex items-center justify-center relative transition-colors ${(isBook || item) ? 'cursor-pointer hover:bg-white/10' : ''}`}
                  >
                    {item ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.iconUrl}
                        alt={item.name}
                        className="object-contain"
                        style={{ width: '3rem', height: '3rem' }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                    ) : (
                      <span className="material-icons-round text-gray-400 text-3xl">add</span>
                    )}
                    {/* ── ไอคอนเลเวลเกียร์ มุมบนขวา — book mode: ตาม gearLevel/gearSpecLevel จริง / meta-gacha: max เสมอ (ไม่มี slider) ── */}
                    {item && (() => {
                      const lvIcon = isBook
                        ? gearLevelIcon(item.grade, gearLevel[slot], gearSpecLevel[slot])
                        : gearMaxIconByGrade(item.grade)
                      return lvIcon ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={lvIcon}
                          alt=""
                          className="absolute w-auto max-w-none object-contain pointer-events-none"
                          style={{ height: '1.5rem', top: '-0.45rem', right: '-0.2rem' }}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                        />
                      ) : null
                    })()}
                  </div>
                  {/* ── ดาว Grade ด้านล่างช่องเกียร์ (overflow visible, ไม่ดันขอบ) ──
                      ⚠️ ต้อง render placeholder ที่ความสูง 0 + margin เดียวกัน "ทุกครั้ง"
                         (มี/ไม่มีเกียร์) — ถ้าไม่งั้น cell ที่ไม่มีเกียร์จะสูงกว่า cell ที่มีเกียร์
                         ทำให้ grid row height เปลี่ยน → mainContent หด ~10px เมื่อใส่เกียร์ครบ */}
                  <div className="flex justify-center" style={{ height: 0, overflow: 'visible', marginTop: '-0.65rem' }}>
                    {item?.grade != null && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/gacha/images/${item.grade}star.png`}
                        alt={`${item.grade}★`}
                        className="object-contain"
                        style={{ height: '1rem' }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ─── TOP RIGHT: 6 quick-info boxes (full width) ─── */}
        {/* mobile: 2 col, order = category|leonard / ATK|mineral / HP|DEF */}
        {/* desktop: 3 col, order = category|mineral|leonard / ATK|HP|DEF  */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          <div className="order-1">
            <InfoBox iconUrl={categoryIcon} value={stats.categoryLabel ?? '—'} />
          </div>
          <div className="order-4 sm:order-2">
            <InfoBox
              iconUrl="/gacha/images/mineral.png"
              value={stats.mineral != null ? fmtRaw(applyBonus(stats.mineral, bonuses.mineralCost)) : '—'}
              // ตัวเลขในเมนูกับตอนลงสนามรบไม่เท่ากัน (สมบัติลดแร่ + เกียร์รวมกันคนละแบบ)
              extra={stats.mineral != null ? `(${inGameMineral(stats.mineral, bonuses.mineralCost)})` : null}
            />
          </div>
          <div className="order-2 sm:order-3">
            <InfoBox iconUrl="/gacha/images/leonardpoint.png" value={stats.leonardMax != null ? `Max: ${stats.leonardMax}` : '—'} />
          </div>
          <div className="order-3 sm:order-4">
            <InfoBox iconUrl="/gacha/images/atk.png" value={fmtCompact(totalDps)} />
          </div>
          <div className="order-5">
            <InfoBox iconUrl="/gacha/images/hp.png" value={fmtCompact(hp)} />
          </div>
          <div className="order-6">
            <InfoBox iconUrl="/gacha/images/def.png" value={fmtCompact(totalDef)} />
          </div>
        </div>

        {/* ─── BOTTOM RIGHT: middle (level/speed/skill/ability) + stat panel ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-3">

          {/* MIDDLE */}
          <div className="space-y-2">
            {/* Level row + tier-unlimit icon (gacha: Lv.1 ไม่ปลดลิมิต / book: กดปรับเลเวลเองได้ / meta: ล็อก MAX) */}
            {isBook ? (
              <div ref={levelPopupRef} className="relative">
                <button
                  type="button"
                  onClick={() => { play('click_global.ogg'); setLevelPopupOpen(o => !o) }}
                  aria-haspopup="dialog"
                  aria-expanded={levelPopupOpen}
                  className="w-full bg-white/5 hover:bg-white/10 rounded-lg px-3 py-2 flex items-center transition-colors"
                >
                  {(() => {
                    const displayLevel = sliderLevel ?? stats.playerMaxLevel
                    const info = levelDisplayInfo(stats, displayLevel)
                    return (
                      // แถวสูงคงที่ (h-8) กันปุ่มขยับตอนสลับมี/ไม่มีรูป — ข้อความ+รูปอยู่กลางเป็นกลุ่มเดียวกัน ห่างกันแค่ gap-2
                      <div className="w-full h-8 flex items-center justify-center gap-2">
                        <span className="text-white font-bold text-sm sm:text-base">{info.label}</span>
                        {info.showIcon && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={info.iconUrl}
                            alt={info.iconAlt}
                            className="h-7 object-contain"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                          />
                        )}
                      </div>
                    )
                  })()}
                </button>

                {levelPopupOpen && (() => {
                  const displayLevel = sliderLevel ?? stats.playerMaxLevel
                  const theme = levelPopupTheme(stats.tier)
                  return (
                    <div
                      role="dialog"
                      aria-label={lang === 'th' ? 'ปรับเลเวล' : 'Adjust level'}
                      className="absolute left-1/2 -translate-x-1/2 mt-1.5 w-64 rounded-xl bg-gray-900/95 backdrop-blur border border-white/10 shadow-xl z-50 p-3.5"
                    >
                      <div className="flex items-center justify-between mb-2.5">
                        <span className="text-xs font-semibold text-gray-300">{lang === 'th' ? 'เลเวล' : 'Level'}</span>
                        <span className={`text-xs font-bold tabular-nums ${theme.text}`}>{displayLevel}/{stats.playerMaxLevel}</span>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={stats.playerMaxLevel}
                        step={1}
                        value={displayLevel}
                        onChange={(e) => setSliderLevel(parseInt(e.target.value, 10))}
                        onPointerUp={() => play('click_global.ogg')}
                        onKeyUp={() => play('click_global.ogg')}
                        className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer bg-white/15 ${theme.accent}`}
                        aria-label="Ranger level"
                      />
                    </div>
                  )
                })()}
              </div>
            ) : (() => {
              const info = levelDisplayInfo(stats, isGacha ? 1 : stats.playerMaxLevel)
              // โครงสร้างเดียวกับปุ่ม Ranger Book เป๊ะๆ (outer px-3 py-2 + inner h-8) แต่เป็น div เฉยๆ ไม่ใช่ button — กดไม่ได้
              return (
                <div className="bg-white/5 rounded-lg px-3 py-2 flex items-center">
                  <div className="w-full h-8 flex items-center justify-center gap-2">
                    <span className="text-white font-bold text-sm sm:text-base">{info.label}</span>
                    {info.showIcon && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={info.iconUrl}
                        alt={info.iconAlt}
                        className="h-7 object-contain"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                    )}
                  </div>
                </div>
              )
            })()}

            {/* Speed pills */}
            <PillRow label="ATK speed" value={speedLabel(stats.attackSpeedType)} />
            <PillRow
              label="Move speed"
              value={speedLabel(stats.moveSpeedType)}
            />

            {/* Skill row */}
            {stats.skills.length > 0 && (
              <PillIconRow label="Skill" items={stats.skills} kind="skill"
                pinnedKey={iconPinnedKey} onSetPinnedKey={setIconPinnedKey}
                skillPlusEffects={skillPlusDedup.activeEffects.map(e => e.effect)}
                castTimesMap={castTimesMap}
              />
            )}

            {/* Ability row */}
            {stats.abilities.length > 0 && (
              <PillIconRow label="Ability" items={stats.abilities} kind="ability"
                pinnedKey={iconPinnedKey} onSetPinnedKey={setIconPinnedKey}
                extraEnd={awakenAbilities && awakenAbilities.length > 0
                  ? <AwakenAbilityButton
                      abilities={awakenAbilities}
                      topCode={topAwakenCode}
                      selectable={mode !== 'meta'}
                      isPinned={iconPinnedKey === 'awaken-ability'}
                      suppressHover={iconPinnedKey !== null && iconPinnedKey !== 'awaken-ability'}
                      onPinToggle={() => { play('click_global.ogg'); setIconPinnedKey(iconPinnedKey === 'awaken-ability' ? null : 'awaken-ability') }}
                    />
                  : undefined
                }
              />
            )}
          </div>

          {/* DETAIL STAT PANEL — scrollable */}
          <div className="bg-white/5 rounded-xl p-3 self-start max-h-[252px] overflow-y-auto space-y-1.5 text-sm">
            {/* Combat */}
            <DetailRow label="ATK per sec" value={fmtRaw(totalDpsBase)} bonus={fmtBonus(totalDps - totalDpsBase)} />
            <DetailRow label="ATK"          value={fmtRaw(totalAtkBase)} bonus={fmtBonus(Math.floor(totalAtk) - totalAtkBase)} />
            <div className="bg-black/20 rounded overflow-hidden">
              <DetailRow label="Physical ATK" value={fmtRaw(effectiveBaseStats.phyAtk)} bonus={fmtBonus(Math.floor(phyAtk) - effectiveBaseStats.phyAtk)} sub />
              <DetailRow label="Magical ATK"  value={fmtRaw(effectiveBaseStats.magAtk)} bonus={fmtBonus(Math.floor(magAtk) - effectiveBaseStats.magAtk)} sub />
            </div>
            <DetailRow label="HP"           value={fmtRaw(effectiveBaseStats.hp)}     bonus={fmtBonus(Math.floor(hp) - effectiveBaseStats.hp)} />
            <DetailRow label="DEF"          value={fmtRaw(totalDefBase)} bonus={fmtBonus(Math.floor(totalDef) - totalDefBase)} />
            <div className="bg-black/20 rounded overflow-hidden">
              <DetailRow label="Physical DEF" value={fmtRaw(effectiveBaseStats.phyDef)} bonus={fmtBonus(Math.floor(phyDef) - effectiveBaseStats.phyDef)} sub />
              <DetailRow label="Magical DEF"  value={fmtRaw(effectiveBaseStats.magDef)} bonus={fmtBonus(Math.floor(magDef) - effectiveBaseStats.magDef)} sub />
            </div>

            <Divider />

            {/* Speed / Range */}
            <DetailRow label="ATK Speed"     value={atkSpeedValueStr} bonus={atkSpeedBonusStr} />
            <DetailRow label="Move Speed"    value={stats.movingSpeed != null ? `${stats.movingSpeed}` : '—'} bonus={bonusEither(bonuses.moveSpeed)} />
            {(() => {
              const base = stats.attackRange
              const atkRange = base != null ? applyBonus(base, bonuses.attackRange) : null
              const delta = (atkRange != null && base != null) ? Math.floor(atkRange) - base : 0
              return (
                <DetailRow
                  label="ATK Range"
                  value={base != null ? fmtRaw(base) : '—'}
                  bonus={fmtBonus(delta)}
                />
              )
            })()}
            <DetailRow label="Splash Radius" value={stats.splashRadius != null ? fmtRaw(stats.splashRadius) : '—'} bonus={bonusFlatText(bonuses.splashRadius)} />

            <Divider />

            {/* Crit / Evade / Hit */}
            <DetailRow label="Critical Rate"   value={pctText(stats.rates.critRate)}   bonus={bonusPctText(bonuses.critRate)} />
            <DetailRow label="Critical Damage" value={pctText(stats.rates.critDamage)} bonus={bonusPctText(bonuses.critDamage)} />
            <DetailRow label="Evade Rate"      value={pctText(stats.rates.evadeRate)}  bonus={bonusPctText(bonuses.evadeRate)} />
            <DetailRow label="Hit Rate"        value={pctText(stats.rates.hitRate)}    bonus={bonusPctText(bonuses.hitRate)} />

            <Divider />

            {/* Skill use rate / cooldown */}
            {(() => {
              const active = stats.skills.filter((s) => s.slot !== 'passive')
              const sk1 = active[0]
              const sk2 = active[1]
              return (
                <>
                  <DetailRow
                    label="Skill Use Rate 1"
                    value={sk1?.probability != null ? pctText(sk1.probability) : '—'}
                    bonus={sk1 ? bonusPctText(bonuses.skillUseRate) : ''}
                  />
                  <DetailRow
                    label="Skill Cooldown 1"
                    value={sk1?.cooldown != null ? `${sk1.cooldown}s` : '—'}
                    bonus={sk1 ? bonusPctText(bonuses.skillCooldown) : ''}
                  />
                  <DetailRow
                    label="Skill Use Rate 2"
                    value={sk2?.probability != null ? pctText(sk2.probability) : '—'}
                    bonus={sk2 ? bonusPctText(bonuses.skillUseRate) : ''}
                  />
                  <DetailRow
                    label="Skill Cooldown 2"
                    value={sk2?.cooldown != null ? `${sk2.cooldown}s` : '—'}
                    bonus={sk2 ? bonusPctText(bonuses.skillCooldown) : ''}
                  />
                </>
              )
            })()}

            <Divider />

            {/* Skill resist / hit / evade */}
            <DetailRow label="Skill Evade Rate" value={pctText(stats.rates.skillEvadeRate)}  bonus={bonusPctText(bonuses.skillEvadeRate)} />
            <DetailRow label="Skill Hit Rate"   value={pctText(stats.rates.skillHitRate)}    bonus={bonusPctText(bonuses.skillHitRate)} />
            <DetailRow label="Skill Resistance" value={pctText(stats.rates.skillResistance)} bonus={bonusPctText(bonuses.skillResistance)} />

            <Divider />

            {/* Cost / Regen */}
            {(() => {
              const baseRegen = effectiveBaseStats.cooldown
              // applyBonus: base × (1 + sum(pct)) → ใช้ในเกียร์ส่วนใหญ่ (linear stacking)
              // แต่ Ranger Regen Time มี **cap ที่ -88%** (เกมจริง: min regen time = 12% × base)
              // ตัวอย่าง Medici (11s): sum bonus -112.8% → linear ได้ -12.5s แต่เกม cap ที่ -9.7s
              // → max reduction = 88% × base, min remaining time = 12% × base
              const REGEN_MAX_REDUCTION = 0.88  // 88%
              const linearApplied = applyBonus(baseRegen, bonuses.cooldown)
              const linearDelta = linearApplied - baseRegen   // เป็นลบ (เกียร์ลดเวลา)
              const maxReduction = baseRegen * REGEN_MAX_REDUCTION
              // delta ติดลบ: cap absolute value ไม่ให้เกิน maxReduction
              const cappedDelta = linearDelta < -maxReduction ? -maxReduction : linearDelta
              const bonusText = Math.abs(cappedDelta) >= 0.05
                ? `${cappedDelta >= 0 ? '+' : ''}${cappedDelta.toFixed(1)}s`
                : ''
              return (
                <DetailRow
                  label="Ranger Regeneration Time (sec)"
                  value={`${baseRegen.toFixed(1)}s`}
                  bonus={bonusText}
                />
              )
            })()}
            {(() => {
              if (stats.mineral == null) {
                return <DetailRow label="Ranger Mineral Cost" value="—" bonus="" />
              }
              const baseMineral = stats.mineral
              const appliedMineral = applyBonus(baseMineral, bonuses.mineralCost)
              const delta = Math.round(appliedMineral - baseMineral)
              const bonusText = Math.abs(delta) >= 1
                ? `${delta >= 0 ? '+' : ''}${delta}`
                : ''
              return (
                <DetailRow
                  label="Ranger Mineral Cost"
                  value={fmtRaw(baseMineral)}
                  bonus={bonusText}
                />
              )
            })()}
          </div>
        </div>
      </div>

      {/* ── GearPickerModal — book mode เท่านั้น ── */}
      {isBook && pickerSlot && stats && (
        <GearPickerModal
          slot={pickerSlot}
          rangerElement={normalizeElement(stats.element)}
          rangerCategory={stats.category}
          rangerCtx={rangerCtxForSlot(pickerSlot)}
          rangerSkillDescriptions={stats.skills.map(s => s.description ?? '').filter(Boolean)}
          rangerAbilityNames={stats.abilities.map(a => a.name)}
          otherSlotsLockedNames={otherSlotsLockedNamesFor(pickerSlot)}
          existingSkillPlus={pickerExistingSkillPlus}
          currentGearBasicEffects={computedEffectsBySlot[pickerSlot]?.basic}
          onSelect={(gear: GearBookItem, level: number, specLevel: number) => {
            const item: GearItem = {
              slot: pickerSlot,
              name: gear.name,
              iconUrl: gear.iconUrl,
              grade: gear.grade,
              count: 0,
            }
            setSelected(prev => ({ ...prev, [pickerSlot]: item }))
            // reset override เสมอเมื่อติดตั้งเกียร์ใหม่ → ใช้ auto-selection ใหม่
            setSwitchableOverrides(prev => ({ ...prev, [pickerSlot]: null }))
            // เกียร์เข้ามาที่ level ที่ตั้งไว้ตอน preview ใน picker (เริ่มต้น 0 ถ้าไม่ได้เลื่อน)
            setGearLevel(prev => ({ ...prev, [pickerSlot]: level }))
            setGearSpecLevel(prev => ({ ...prev, [pickerSlot]: specLevel }))
            // assign install order — ทำให้ slot นี้ install หลังสุด (ค่ามากที่สุด)
            assignInstallOrder(pickerSlot)
            setPickerSlot(null)
          }}
          onClose={() => setPickerSlot(null)}
        />
      )}

      {/* ── Detail เกียร์ที่ใส่อยู่ (book mode) — พร้อม rangerCtx + ถอด/เปลี่ยน ── */}
      {isBook && bookDetailSlot && selected[bookDetailSlot] && stats && typeof document !== 'undefined' && createPortal(
        <GearDetailPopup
          gearName={selected[bookDetailSlot]!.name}
          gearIconUrl={selected[bookDetailSlot]!.iconUrl}
          gearGrade={selected[bookDetailSlot]!.grade}
          gearSlot={bookDetailSlot}
          league={league}
          hideRangerUsage
          showLevelSlider
          sliderLevel={gearLevel[bookDetailSlot]}
          onSliderLevelChange={(lv) => {
            // bump installOrder เฉพาะตอนเลื่อนเลเวลแล้วกระทบ "ส่วน switchable" ของ slider จริงๆ
            // (basic-only range เช่น 0→5 ไม่กระทบ switchable เลย → ไม่นับเป็นเลือกใหม่)
            const oldSwitch = splitSliderLevel(gearLevel[bookDetailSlot]).switchable
            const newSwitch = splitSliderLevel(lv).switchable
            setGearLevel(prev => ({ ...prev, [bookDetailSlot]: lv }))
            if (newSwitch !== oldSwitch) assignInstallOrder(bookDetailSlot)
            // เลเวลหลักหลุดจาก 15 (max) → Spec+ ที่ปลดล็อกไว้ต้องรีเซ็ต (ต้องเลเวลเต็มใหม่ถึงปลดล็อกได้อีก)
            if (lv < 15) setGearSpecLevel(prev => ({ ...prev, [bookDetailSlot]: 0 }))
          }}
          specLevel={gearSpecLevel[bookDetailSlot]}
          onSpecLevelChange={(lv) => setGearSpecLevel(prev => ({ ...prev, [bookDetailSlot]: lv }))}
          rangerCtx={rangerCtxForSlot(bookDetailSlot)}
          otherSlotsLockedNames={otherSlotsLockedNamesFor(bookDetailSlot)}
          lockedAutoSelectionName={switchableResults?.[bookDetailSlot]?.effect?.name ?? null}
          switchableInactiveReason={effectiveSwitchable[bookDetailSlot].inactiveReason}
          selectedSwitchableOverride={switchableOverrides[bookDetailSlot]}
          onSwitchableSelect={(name) => {
            setSwitchableOverrides(prev => ({ ...prev, [bookDetailSlot]: name }))
            // เลือก Switchable Effect เอง = "เลือกใหม่" เช่นกัน → bump ให้เป็นล่าสุดเหมือนกัน
            assignInstallOrder(bookDetailSlot)
          }}
          occupiedSwitchableTypes={otherSlotsLockedNamesFor(bookDetailSlot)}
          rangerSkillDescriptions={stats.skills.map(s => s.description ?? '').filter(Boolean)}
          skillPlusOverriddenBy={Object.fromEntries(skillPlusDedup.overriddenBySlot.get(bookDetailSlot) ?? [])}
          zIndex={60}
          onClose={() => setBookDetailSlot(null)}
          onRemove={() => {
            setSelected(prev => ({ ...prev, [bookDetailSlot]: null }))
            setGearLevel(prev => ({ ...prev, [bookDetailSlot]: 0 }))
            setGearSpecLevel(prev => ({ ...prev, [bookDetailSlot]: 0 }))
            setBookDetailSlot(null)
          }}
          onReplace={() => {
            setBookDetailSlot(null)
            setPickerSlot(bookDetailSlot)
          }}
        />,
        document.body
      )}

      {/* ── GearDetailPopup — render ที่ document.body ผ่าน Portal (ไม่ติดใน stacking context) ── */}
      {detailGear && typeof document !== 'undefined' && createPortal(
        <GearDetailPopup
          gearName={detailGear.name}
          gearIconUrl={detailGear.iconUrl}
          gearGrade={detailGear.grade}
          gearSlot={detailGear.slot}
          league={league}
          effectLevel="max"
          hideRangerUsage
          rangerCtx={rangerCtxForSlot(detailGear.slot as SlotKey)}
          otherSlotsLockedNames={otherSlotsLockedNamesFor(detailGear.slot as SlotKey)}
          lockedAutoSelectionName={switchableResults?.[detailGear.slot as SlotKey]?.effect?.name ?? null}
          switchableInactiveReason={
            detailGear
              ? effectiveSwitchable[detailGear.slot as SlotKey]?.inactiveReason
              : undefined
          }
          rangerSkillDescriptions={stats?.skills.map(s => s.description ?? '').filter(Boolean)}
          skillPlusOverriddenBy={
            detailGear
              ? Object.fromEntries(skillPlusDedup.overriddenBySlot.get(detailGear.slot as SlotKey) ?? [])
              : undefined
          }
          onClose={() => setDetailGear(null)}
        />,
        document.body
      )}

      {/* ── RangerAnimationPopup — เปิดเมื่อกดรูปเรนเจอร์ (z-60 ซ้อนทับ popup หลัก) ──
          anim "s_attack"/"s2_attack" หมายถึงสกิลที่ใช้งานได้ตัวที่ 1/2 "ตามลำดับ" ไม่ได้ผูกกับชื่อ slot
          เรนเจอร์ส่วนใหญ่ skillCode2 ว่าง สกิลที่สองไปอยู่ slot skill3 (เช่น u1273e-dwight, u1023h-brown)
          ถ้า map ตามชื่อ slot ตรงๆ สกิลที่สองจะไม่มีข้อมูลเลย → ต้องเรียงเอาเฉพาะสกิลที่ใช้งานได้
          isFlyer      = ability "ab201_flight"  (projectile_data มี render.flightYn แต่เป็น 0 ทั้ง 3081 ตัว ใช้แยกไม่ได้)
          isAirAmbush   = ability "ab217_airatk" (+ตัวแปร _X ของ hyper evolve) = "Attacks Flyer units" */}
      {showAnimation && (() => {
        const animSkills = (stats?.skills ?? []).filter(sk => sk.slot !== 'passive')
        return createPortal(
        <RangerAnimationPopup
          rangerId={rangerId}
          rangerName={rangerName}
          attackRange={stats?.attackRange != null ? applyBonus(stats.attackRange, bonuses.attackRange) : null}
          skillTargets={{ skill1: animSkills[0]?.triggerBasis?.type ?? null, skill2: animSkills[1]?.triggerBasis?.type ?? null }}
          skillAreas={{ skill1: animSkills[0]?.area ?? null, skill2: animSkills[1]?.area ?? null }}
          skillRearMul={{ skill1: animSkills[0]?.triggerBasis?.multiplier ?? null, skill2: animSkills[1]?.triggerBasis?.multiplier ?? null }}
          isFlyer={(stats?.abilities ?? []).some(ab => ab.code === 'ab201_flight')}
          isAirAmbush={(stats?.abilities ?? []).some(ab => ab.code === 'ab217_airatk' || ab.code === 'ab217_airatk_X')}
          onClose={() => setShowAnimation(false)}
        />,
        document.body
      )})()}

    </section>
    </>
  )
}

/* Note: TalentSection ถูกย้ายออกจากที่นี่
   ไป render ใน popup โดยตรง (RangerDetailPopup, GachaRangerDetailPopup)
   เพื่อให้ JS measurement สามารถ lock popup ขนาด = main details เท่านั้น
   โดยไม่นับรวมความสูงของ talent → popup จะไม่ยาวขึ้นเวลามี talent
   ────────────────────────────────────────────────────────────── */

// ─── Sub-components ──────────────────────────────────

function InfoBox({ iconUrl, value, extra }: { iconUrl?: string; value: string; extra?: string | null }) {
  const { tStat } = useLanguage()
  return (
    <div className="bg-white/5 rounded-lg px-2 py-2 sm:py-2.5 flex items-center gap-1.5 sm:gap-2 min-w-0">
      {iconUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={iconUrl}
          alt=""
          className="w-5 h-5 sm:w-7 sm:h-7 object-contain shrink-0"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
      )}
      {/* ใช้ arbitrary px เพื่อให้ไทย/อังกฤษเท่ากัน (ไม่โดน Thai boost ของ text-xs/text-sm) */}
      <span className="text-white text-[12px] sm:text-[16px] font-semibold truncate">{tStat(value)}</span>
      {/* ส่วนต่อท้าย เช่น ค่าแร่ตอนลงสนามรบ — shrink-0 กัน truncate กินตัวเลขในวงเล็บหาย */}
      {extra && (
        <span className="text-emerald-400 text-[12px] sm:text-[16px] font-semibold shrink-0 tabular-nums">
          {extra}
        </span>
      )}
    </div>
  )
}

function PillRow({ label, value }: { label: string; value: string }) {
  const { tStat } = useLanguage()
  return (
    <div className="bg-white/5 rounded-lg px-3 py-2 flex items-center justify-between">
      <span className="text-white font-semibold text-sm">{tStat(label)}</span>
      <span className="text-white text-sm font-medium">{tStat(value)}</span>
    </div>
  )
}

// ── Awakening Ability button (9★+) ─────────────────────
// ใช้ pattern เหมือน IconWithTooltip: hover=show, click=pin, พี่น้องที่ pin แล้ว=suppressHover
function AwakenAbilityButton({ abilities, topCode, selectable = false, isPinned, suppressHover, onPinToggle }: {
  abilities: AwakenAbility[]
  topCode?: string | null   // code ของ Awakening Ability ที่คนใช้เยอะสุดใน Meta PVP — ถ้ามี ใช้ไอคอนตัวนี้แทน default
  selectable?: boolean      // true = ไม่ใช่ Meta → ให้กดเลือก/ถอด Awakening Ability เองได้ (แทน topCode ที่มาจากสถิติ)
  isPinned: boolean
  suppressHover: boolean
  onPinToggle: () => void
}) {
  const { tAbility, tAbilityDesc, lang } = useLanguage()
  const { play } = useSound()
  const [hovered, setHovered] = useState(false)
  const [selectedCode, setSelectedCode] = useState<string | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number; placement: 'top' | 'bottom' } | null>(null)

  // highlightCode: Meta ใช้ topCode (มาจากสถิติ ผู้ใช้กดเลือกเองไม่ได้), โหมดอื่นใช้ selectedCode (กดเลือกเอง)
  const highlightCode = selectable ? selectedCode : (topCode ?? null)

  useEffect(() => { if (!isPinned) setHovered(false) }, [isPinned])

  const show = isPinned || (hovered && !suppressHover)

  const [maxH, setMaxH] = useState<number>(400)

  useEffect(() => {
    if (!show || !btnRef.current) { setTooltipPos(null); return }
    const update = () => {
      if (!btnRef.current) return
      const rect = btnRef.current.getBoundingClientRect()
      const spaceAbove = rect.top - 8
      const spaceBelow = window.innerHeight - rect.bottom - 8
      const placement: 'top' | 'bottom' = spaceAbove > spaceBelow ? 'top' : 'bottom'
      setMaxH(Math.max(120, placement === 'top' ? spaceAbove : spaceBelow))
      // ใช้ left positioning + center บนปุ่ม → clamp ไม่ให้ล้นทั้งสองข้าง
      const tooltipW = Math.min(window.innerWidth <= 640 ? 256 : 384, window.innerWidth - 16)
      const idealLeft = rect.left + rect.width / 2 - tooltipW / 2
      const clampedLeft = Math.max(8, Math.min(idealLeft, window.innerWidth - tooltipW - 8))
      setTooltipPos({ top: placement === 'top' ? rect.top - 4 : rect.bottom + 4, left: clampedLeft, placement })
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => { window.removeEventListener('scroll', update, true); window.removeEventListener('resize', update) }
  }, [show])

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={onPinToggle}
        className={`block rounded p-0.5 transition-colors bg-white/5 hover:bg-white/10 ${isPinned ? 'ring-2 ring-yellow-400' : ''}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={(highlightCode && abilities.find(a => a.code === highlightCode)?.iconUrl) || '/gacha/images/9star_ability.png'}
          alt="Awakening Ability"
          className={`w-8 h-8 object-contain ${highlightCode && abilities.find(a => a.code === highlightCode) ? '' : 'opacity-70'}`}
          onError={e => { (e.target as HTMLImageElement).src = '/gacha/images/9star_ability.png' }}
        />
      </button>

      {show && tooltipPos && typeof document !== 'undefined' && createPortal(
        <div
          data-icon-tooltip
          className={`fixed z-[100] w-64 sm:w-96 bg-slate-950 border border-white/15 rounded-lg p-2.5 shadow-2xl text-[11px] overflow-y-auto ${isPinned ? 'pointer-events-auto select-text' : 'pointer-events-none'}`}
          style={{
            top: tooltipPos.top,
            left: tooltipPos.left,
            transform: tooltipPos.placement === 'top' ? 'translateY(-100%)' : undefined,
            maxHeight: maxH,
          }}
        >
          {/* Header */}
          <div className="font-bold mb-2 leading-tight text-[14px] sm:text-[18px] text-yellow-300">
            {lang === 'en' ? 'Awakening Ability' : 'ความสามารถปลุกพลัง'}
          </div>
          {/* Ability list — ตัวที่ไฮไลท์ (topCode ใน Meta / selectedCode ที่กดเลือกเองในโหมดอื่น) มีกรอบ/พื้นหลังทองไฮไลท์
              โหมดอื่น (selectable) กดรูปซ้ำ = ถอด, กดตัวใหม่ = สลับ */}
          {abilities.map((ab, i) => {
            const isTop = highlightCode != null && ab.code === highlightCode
            return (
            <div
              key={ab.code}
              onClick={selectable ? () => { play('click_global.ogg'); setSelectedCode(prev => prev === ab.code ? null : ab.code) } : undefined}
              // จองพื้นที่ border/padding ไว้เสมอ (สลับแค่สี) กัน popup ขยายตอนกดไฮไลท์
              className={`rounded-lg border p-1.5 -mx-1.5 flex items-start gap-2 ${isTop ? 'border-yellow-400/50 bg-yellow-400/10' : 'border-transparent'} ${i > 0 ? 'mt-2' : ''} ${selectable ? 'cursor-pointer hover:bg-white/5' : ''}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={ab.iconUrl}
                alt=""
                className="w-8 h-8 object-contain shrink-0 mt-0.5"
                onError={e => { (e.target as HTMLImageElement).src = '/gacha/images/No_image_SkillorAbility.png' }}
              />
              <div className="min-w-0">
                <div className="font-bold text-[13px] text-cyan-300 leading-tight mb-0.5">
                  {lang === 'en' ? (ab.nameEn || ab.nameZh) : tAbility(ab.code, ab.nameZh)}
                </div>
                <div className="lr-tt-desc text-gray-200 leading-snug space-y-0.5">
                  {splitDescription(lang === 'en' ? (ab.descEn || ab.descZh) : tAbilityDesc(ab.code, ab.descZh))
                    .map((line, i) => <div key={i}>{line}</div>)}
                </div>
              </div>
            </div>
            )
          })}
        </div>,
        document.body
      )}
    </div>
  )
}

function PillIconRow({
  label, items, kind, pinnedKey, onSetPinnedKey, skillPlusEffects, castTimesMap, extraEnd,
}: {
  label: string
  items: (SkillSlot | AbilitySlot)[]
  kind: 'skill' | 'ability'
  pinnedKey: string | null
  onSetPinnedKey: (key: string | null) => void
  skillPlusEffects?: GearEffect[]
  castTimesMap?: CastEntry | null
  extraEnd?: React.ReactNode
}) {
  const { tStat } = useLanguage()
  const { play } = useSound()
  return (
    // data-icon-row: ให้ document mousedown handler รู้ว่าคลิกอยู่ใน row → ไม่ปิด pin
    <div data-icon-row className="bg-white/5 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
      <span className="text-white font-semibold text-sm shrink-0">{tStat(label)}</span>
      <div className="flex gap-1.5 flex-wrap justify-end">
        {items.map((it) => {
          const itemKey = `${it.slot}-${it.code}`
          const isThisPinned = pinnedKey === itemKey
          return (
            <IconWithTooltip
              key={itemKey}
              item={it}
              kind={kind}
              isPinned={isThisPinned}
              suppressHover={pinnedKey !== null && !isThisPinned}
              onPinToggle={() => { play('click_global.ogg'); onSetPinnedKey(pinnedKey === itemKey ? null : itemKey) }}
              skillPlusEffects={kind === 'skill' ? skillPlusEffects : undefined}
              skillTiming={(() => {
                if (kind !== 'skill') return null               // ability → ไม่แสดง
                if (castTimesMap == null) return undefined      // loading → แสดง "..."
                if (it.slot === 'passive') return null          // passive → ไม่มี timing
                if (it.slot === 'skill1') return {
                  cast:     castTimesMap['skill1']    ?? null,
                  recovery: castTimesMap['recovery1'] ?? null,
                }
                // skill2, skill3, skill4 ใน lerico API → ล้วนเป็นสกิล 2 จริงๆ ใน SAM
                return {
                  cast:     castTimesMap[it.slot] ?? castTimesMap['skill2'] ?? null,
                  recovery: castTimesMap['recovery2'] ?? null,
                }
              })()}
            />
          )
        })}
        {extraEnd}
      </div>
    </div>
  )
}

// ── SKILL+ helpers ────────────────────────────────────

// ── SKILL+ Deduplication ─────────────────────────────
// ถ้า WPN + ACC มี SKILL+ ชื่อเดียวกัน (เช่น "ATK x N% Area Damage") → แสดงได้แค่อันเดียว
// เลือก effect ที่ค่า (absolute) มากกว่า; ถ้าเท่ากัน → เรียงตามลำดับ WPN > AMR > ACC

function parseSkillPlusValue(value: string): number {
  const m = value.match(/[\d.]+/)
  return m ? parseFloat(m[0]) : 0
}

// normalize สำหรับ group: แทน N/n ด้วย token คงที่, collapse space, lowercase
function normSkillPlusName(name: string): string {
  return name.replace(/\b[Nn]\b/g, '__N__').replace(/\s+/g, ' ').trim().toLowerCase()
}

interface SkillPlusEntry { effect: GearEffect; slot: SlotKey }

function deduplicateSkillPlus(eff: Record<SlotKey, GearEffects | null>): {
  activeEffects: SkillPlusEntry[]          // effects ที่ควรแสดงใน tooltip
  overriddenSlots: Set<SlotKey>            // slots ที่มี SKILL+ ถูก override → แสดง badge !
  overriddenBySlot: Map<SlotKey, Map<string, SlotKey>>  // slot → (effectName → winning slot)
} {
  const ORDER: SlotKey[] = ['WPN', 'AMR', 'ACC']
  const all: SkillPlusEntry[] = []
  for (const slot of ORDER) {
    for (const e of eff[slot]?.skillPlus ?? []) all.push({ effect: e, slot })
  }

  // group by normalized name + unit
  // "HP +N%  +80.0%" (pct) และ "HP +N%  +3.5" (sec) มีชื่อเหมือนกันแต่หน่วยต่างกัน → ไม่นับว่าทับกัน
  const groups = new Map<string, SkillPlusEntry[]>()
  for (const entry of all) {
    const key = normSkillPlusName(entry.effect.name) + ':' + getSkillPlusUnit(entry.effect.value ?? '')
    const g = groups.get(key) ?? []; g.push(entry); groups.set(key, g)
  }

  const activeEffects: SkillPlusEntry[] = []
  const overriddenSlots = new Set<SlotKey>()
  const overriddenBySlot = new Map<SlotKey, Map<string, SlotKey>>()

  for (const entries of groups.values()) {
    if (entries.length === 1) { activeEffects.push(entries[0]); continue }
    // ชนะ = ค่าสูงสุด; ถ้าเท่ากัน → slot ที่มาก่อนใน ORDER (เนื่องจาก iterate ตาม ORDER แล้ว)
    let best = entries[0]
    for (let i = 1; i < entries.length; i++) {
      if (parseSkillPlusValue(entries[i].effect.value) > parseSkillPlusValue(best.effect.value)) {
        best = entries[i]
      }
    }
    activeEffects.push(best)
    for (const e of entries) {
      if (e === best) continue
      overriddenSlots.add(e.slot)
      const m = overriddenBySlot.get(e.slot) ?? new Map<string, SlotKey>()
      m.set(e.effect.name, best.slot)
      overriddenBySlot.set(e.slot, m)
    }
  }

  activeEffects.sort((a, b) => ORDER.indexOf(a.slot) - ORDER.indexOf(b.slot))
  return { activeEffects, overriddenSlots, overriddenBySlot }
}

// บาง SKILL+ ชื่อที่ API ให้มาเป็น label สั้นๆ ไม่ตรงกับคำใน skill description ตรงๆ
// (ปกติ template จะเป็นคำเดียวกับใน description แค่ตัด (N sec) ท้ายออก แต่บางตัว label ถูกเรียบเรียงใหม่)
// เช่น "Enemy Fear (sec)" ↔ "Fear effect on some enemies (4 sec)" / "Fear effect on 1 enemy (2 sec)"
// → ต้อง map ชื่อ (lowercase) ไปเป็น pattern ที่ match กับข้อความจริงแทนการเทียบ substring ตรงๆ
const SKILL_PLUS_ALIAS_PATTERN: Record<string, RegExp> = {
  'enemy fear (sec)': /\bfear effect on\b/i,
}

// ตรวจว่า SKILL+ template (มี 'N' placeholder) ตรงกับบรรทัดใน skill description หรือไม่
// เช่น template="ATK x N% Area Damage" ↔ descLine="*ATK x 3300% Area Damage" → true
// template="Applies charm effect to N enemies within range." ↔ "*Applies charm effect to 2 enemies within range. (10 sec)" → true
// → N ตัวใหญ่ (ตาม API), strip trailing (...) เพราะ description อาจมี "(10 sec)" ปิดท้าย
function matchSkillPlusTemplate(template: string, descLine: string): boolean {
  // ตัด * นำหน้า, ตัด (...) ที่อาจอยู่ท้าย เช่น "(10 sec)", "(8 sec)"
  const cleanDesc = descLine.replace(/^\*+/, '').replace(/\s*\([^)]*\)\s*$/, '').trim()
  // เช็ค alias พิเศษก่อน (ชื่อที่ไม่ตรงกับ description ตรงๆ)
  const aliasPattern = SKILL_PLUS_ALIAS_PATTERN[template.trim().toLowerCase()]
  if (aliasPattern) return aliasPattern.test(cleanDesc)
  // N-template: ใช้ regex match (N = wildcard ตัวเลข)
  // รองรับทั้ง N (ตัวใหญ่ จาก API ใหม่) และ n (ตัวเล็ก จาก cache เก่า)
  if (/\b[Nn]\b/.test(template)) {
    try {
      const escaped = template.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const pattern = escaped.replace(/\b[Nn]\b/g, '[\\d]+(?:\\.[\\d]+)?')
      return new RegExp(pattern, 'i').test(cleanDesc)
    } catch { return false }
  }
  // Non-N template (เช่น "Makes enemy skills unusable"): substring match (case-insensitive)
  return cleanDesc.toLowerCase().includes(template.toLowerCase())
}

// ตรวจหน่วยของ SKILL+ value:
//   "pct"  → มี % เช่น "+80.0%"
//   "sec"  → ตัวเลขล้วน (ไม่มี %) เช่น "+3.5" → หน่วยวินาที
//   "other" → รูปแบบอื่น
function getSkillPlusUnit(value: string): 'pct' | 'sec' | 'other' {
  const v = value.trim()
  if (v.endsWith('%')) return 'pct'
  if (/^[+\-]?[\d.]+$/.test(v)) return 'sec'
  return 'other'
}

// สร้างข้อความแสดง SKILL+ bonus: "+ATK x N% Area Damage  +1200.0%"
// ไม่แทน N ด้วยค่า — แสดง template ตามต้นฉบับ + ค่า enchant ด้านขวา
// ถ้า value เป็นตัวเลขล้วน (sec) → ต่อท้ายด้วย "sec"
function buildSkillPlusLine(template: string, value: string): string {
  const suffix = getSkillPlusUnit(value) === 'sec' ? 'sec' : ''
  return `*${template}  ${value}${suffix}`
}

// ── Ability tooltip helpers ──
// Map raw API enums → human-readable English strings (then tStat แปลเป็น Thai)
function formatActiveWhen(type: string | undefined): string {
  if (!type || type === 'NONE') return ''
  return ({
    BATTLE:     'During Battle',
    INSTANT:    'On Hit',
    STAGE:      'On Stage',
    DEPLOY:     'On Deploy',
    PRE_BATTLE: 'Before Battle',
  } as Record<string, string>)[type] ?? type
}
function formatActiveOn(type: string | undefined): string {
  if (!type || type === 'NONE') return ''
  return ({
    ALL: 'Any Game Type',
    PVP: 'PVP Only',
    PVE: 'PVE Only',
  } as Record<string, string>)[type] ?? type
}
function formatCondition(condType: string | undefined, condValue: string | undefined): { type: string; value: string } | null {
  if (!condType || condType === 'NONE') return null
  // Category: STR / AGI / INT
  if (condType === 'CATEGORY') {
    const v = condValue === 'STR' ? 'Strength'
            : condValue === 'AGI' ? 'Agility'
            : condValue === 'INT' ? 'Intelligence'
            : (condValue ?? '')
    return { type: 'Category', value: v }
  }
  return { type: condType, value: condValue ?? '' }
}

// แตก description ออกเป็นบรรทัด: ใช้ '*' หรือ '- ' เป็น bullet marker
// + รองรับ '\n' literal และ actual newline
function splitDescription(desc: string): string[] {
  if (!desc) return []
  // แปลง '\n' literal (backslash-n) → actual newline
  let norm = desc.replace(/\\n/g, '\n')
  // EN lerico ใช้ ' - ' (space-dash-space) เป็น bullet แทน '*'
  // แปลงให้เป็น newline + '- ' เพื่อ split เหมือนกัน
  norm = norm.replace(/\s+-\s+(?=[A-Za-z฀-๿])/g, '\n- ')
  const parts: string[] = []
  for (const line of norm.split(/\n+/)) {
    // ถ้ามี * อยู่กลางบรรทัด ให้ split ก่อน * เป็นบรรทัดใหม่
    const segs = line.split(/(?=\*)/g).map((s) => s.trim()).filter(Boolean)
    parts.push(...segs)
  }
  return parts
}

function IconWithTooltip({
  item, kind, isPinned, suppressHover, onPinToggle, skillPlusEffects, skillTiming,
}: {
  item: SkillSlot | AbilitySlot
  kind: 'skill' | 'ability'
  isPinned: boolean
  suppressHover: boolean
  onPinToggle: () => void
  skillPlusEffects?: GearEffect[]
  skillTiming?: SkillTiming | null
}) {
  const { t, tSkill, tSkillDesc, tAbility, tAbilityDesc, tStat, tUnit, lang } = useLanguage()
  const [hovered, setHovered] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  // ตำแหน่ง tooltip ใน viewport (position: fixed) — escape body overflow + popup header
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number; placement: 'top' | 'bottom' } | null>(null)
  const [tooltipMaxH, setTooltipMaxH] = useState(400)

  // มือถือ: browser จำลอง mouseenter ก่อน click เสมอ → hovered ค้างเป็น true
  // พอ unpin (isPinned → false) ต้อง reset hovered ไปด้วย ไม่งั้น tooltip ยังโชว์
  useEffect(() => {
    if (!isPinned) setHovered(false)
  }, [isPinned])

  const skillItem = kind === 'skill' ? (item as SkillSlot) : null
  const isGroup = kind === 'ability' && (item as AbilitySlot).slot === 'group'
  // แสดง tooltip เฉพาะเมื่อ: pin อยู่ หรือ hover แต่ไม่มีพี่น้องที่ pin แล้ว
  const show = isPinned || (hovered && !suppressHover)

  // เมื่อ show เปลี่ยนเป็น true → คำนวณตำแหน่ง tooltip จาก getBoundingClientRect
  // ใช้ position: fixed + portal เพื่อให้ tooltip ลอยอยู่ทุกอย่าง (ไม่ถูก popup header บัง)
  useEffect(() => {
    if (!show || !buttonRef.current) {
      setTooltipPos(null)
      return
    }
    const update = () => {
      if (!buttonRef.current) return
      const rect = buttonRef.current.getBoundingClientRect()
      // วางด้านที่มีพื้นที่มากกว่า (บน/ล่าง) + จำกัดสูงไม่ให้ล้นจอ — เหมือน AwakenAbility
      const spaceAbove = rect.top - 8
      const spaceBelow = window.innerHeight - rect.bottom - 8
      const placement: 'top' | 'bottom' = spaceAbove > spaceBelow ? 'top' : 'bottom'
      setTooltipMaxH(Math.max(120, placement === 'top' ? spaceAbove : spaceBelow))
      // center บนปุ่ม + clamp ไม่ให้ล้นทั้งสองข้าง
      const tooltipW = Math.min(window.innerWidth <= 640 ? 256 : 384, window.innerWidth - 16)
      const idealLeft = rect.left + rect.width / 2 - tooltipW / 2
      const clampedLeft = Math.max(8, Math.min(idealLeft, window.innerWidth - tooltipW - 8))
      setTooltipPos({
        top: placement === 'top' ? rect.top - 4 : rect.bottom + 4,
        left: clampedLeft,
        placement,
      })
    }
    update()
    window.addEventListener('scroll', update, true)   // capture phase → จับ scroll ทุก scroll-container
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [show])

  // แปลชื่อ + description ตามภาษาที่เลือก
  const displayName = kind === 'skill'
    ? tSkill(item.code, item.name)
    : tAbility(item.code, item.name)
  const displayDesc = item.description
    ? (kind === 'skill' ? tSkillDesc(item.code, item.description) : tAbilityDesc(item.code, item.description))
    : ''

  // descParts สำหรับ DISPLAY (ภาษาที่เลือก) — โชว์ใน tooltip
  const descParts = displayDesc ? splitDescription(displayDesc) : []
  // origDescParts สำหรับ MATCHING (อังกฤษเสมอ) — ใช้ match กับ SKILL+ templates ที่เป็น EN
  // ป้องกัน bug: ถ้าใช้ Thai description match กับ EN template → match ไม่เจอ → highlight ไม่ขึ้น
  const origDescParts = item.description ? splitDescription(item.description) : []

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={onPinToggle}
        className={`block rounded p-0.5 transition-colors ${
          isGroup ? 'bg-pink-500/20 hover:bg-pink-500/30' : 'bg-white/5 hover:bg-white/10'
        } ${isPinned ? 'ring-2 ring-yellow-400' : ''}`}
        type="button"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.iconUrl}
          alt={displayName}
          className="w-8 h-8 object-contain"
          onError={(e) => {
            const img = e.target as HTMLImageElement
            img.src = '/gacha/images/No_image_SkillorAbility.png'
            img.onerror = null
          }}
        />
      </button>
      {show && tooltipPos && typeof document !== 'undefined' && createPortal(
        /* Tooltip ใช้ portal + position: fixed → ลอยอยู่ทุกอย่าง (popup header, body overflow ไม่บัง)
           pointer-events-none: tooltip ไม่บัง mouseenter ของ icon ข้างๆ
           transform translateY(-100%) เมื่อวางด้านบน เพื่อให้ bottom edge อยู่ที่ tooltipPos.top */
        <div
          data-icon-tooltip
          className={`fixed z-[100] w-64 sm:w-96 bg-slate-950 border border-white/15 rounded-lg p-2.5 shadow-2xl text-[11px] overflow-y-auto ${isPinned ? 'pointer-events-auto select-text' : 'pointer-events-none'}`}
          style={{
            top: tooltipPos.top,
            left: tooltipPos.left,
            transform: tooltipPos.placement === 'top' ? 'translateY(-100%)' : undefined,
            maxHeight: tooltipMaxH,
          }}
        >
          {/* Header: skill/ability name — ใหญ่ๆ ทุกภาษา (mobile 14px / desktop 18px) */}
          <div className={`font-bold mb-1 leading-tight text-[14px] sm:text-[18px] ${
            kind === 'skill' ? 'text-yellow-300' : isGroup ? 'text-pink-300' : 'text-cyan-300'
          }`}>
            {displayName}
          </div>

          {/* Stat line: Use X% · CD Ys */}
          {skillItem && (typeof skillItem.probability === 'number' || typeof skillItem.cooldown === 'number') && (
            <div className="text-[12px] text-gray-400 mb-1.5 font-line">
              {typeof skillItem.probability === 'number' && <>{tStat('Use')} {Math.round(skillItem.probability * 100)}%</>}
              {typeof skillItem.probability === 'number' && typeof skillItem.cooldown === 'number' && <span className="mx-1">·</span>}
              {typeof skillItem.cooldown === 'number' && <>{tStat('CD')} {skillItem.cooldown}{tStat('s')}</>}
            </div>
          )}

          {/* Description: แต่ละบรรทัด/bullet แยก + SKILL+ bonus สีเขียว
              class "lr-tt-desc" สำหรับขยายขนาดบน desktop (ดู globals.css)
              firstBulletIdx = index แรกที่ขึ้นต้นด้วย * → ใส่เส้นคั่นก่อนหน้านั้น
              เพื่อแยกคำอธิบายหลักออกจาก bullet effects */}
          {descParts.length > 0 && (() => {
            const firstBulletIdx = descParts.findIndex(p => p.trim().startsWith('*'))
            return (
            <div className="lr-tt-desc space-y-1 text-gray-200 leading-snug">
              {descParts.map((displayPart, i) => {
                // ใช้ origDescParts (EN) สำหรับ match กับ SKILL+ template — ไม่ใช่ displayPart (อาจเป็น Thai)
                const origPart = origDescParts[i] ?? displayPart
                const matched = skillPlusEffects?.filter(sp =>
                  sp.value && matchSkillPlusTemplate(sp.name, origPart)
                )
                // ใส่เส้นคั่นก่อน bullet ตัวแรก (ถ้ามี bullet และไม่ใช่บรรทัดแรกสุด)
                const showDivider = firstBulletIdx > 0 && i === firstBulletIdx
                return (
                  <div key={i}>
                    {showDivider && (
                      <div className="border-t border-white/15 my-1.5" aria-hidden />
                    )}
                    <div>{displayPart}</div>
                    {matched?.map((sp, j) => (
                      <div key={j} className="text-green-400 pl-1">
                        {tUnit(sp.nameKey
                          ? buildSkillPlusLine(t('equip', sp.nameKey, sp.name), sp.value)
                          : buildSkillPlusLine(sp.name, sp.value))}
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
            )
          })()}

          {/* Trigger Basis (skill.targetType ของเกม) — เป้าหมายที่สกิลเล็ง: ตัวเอง/หน้า/หลัง(+ตัวคูณ)
              text size ใหญ่ขึ้นเฉพาะภาษาไทย (อ่านง่ายขึ้น) — ไม่กระทบ font-line ที่อื่นในเว็บ */}
          {skillItem?.triggerBasis && (
            <div className={`mt-1.5 pt-1.5 border-t border-white/10 text-cyan-200 font-line ${lang === 'th' ? 'text-[13.5px]' : 'text-[12px]'}`}>
              {skillItem.triggerBasis.type === 'self' && tStat('Self')}
              {skillItem.triggerBasis.type === 'front' && tStat('Front Enemy')}
              {skillItem.triggerBasis.type === 'rear' && (
                <>{tStat('Rear Enemy')} ({tStat('Multiplier')}: {skillItem.triggerBasis.multiplier}{tStat('×')})</>
              )}
            </div>
          )}

          {/* Area Skill — text size ใหญ่ขึ้นเฉพาะภาษาไทย เหมือนกัน */}
          {skillItem && typeof skillItem.area === 'number' && skillItem.area > 0 && (
            <div className={`text-cyan-200 font-line ${lang === 'th' ? 'text-[13.5px]' : 'text-[12px]'} ${
              skillItem?.triggerBasis ? 'mt-1' : 'mt-1.5 pt-1.5 border-t border-white/10'
            }`}>
              {tStat('Area Skill')} → {skillItem.area}{tStat('pt')}
            </div>
          )}

          {/* Skill Timing (จาก .sam animation)
              undefined = loading, null = ไม่มีข้อมูล/passive, SkillTiming = แสดงค่า
              text size ใหญ่ขึ้นเฉพาะภาษาไทย เหมือนกัน */}
          {skillItem && skillTiming !== null && (
            <div className={`font-line ${lang === 'th' ? 'text-[13.5px]' : 'text-[12px]'} ${
              (skillItem && typeof skillItem.area === 'number' && skillItem.area > 0) || skillItem?.triggerBasis
                ? 'mt-1'
                : 'mt-1.5 pt-1.5 border-t border-white/10'
            }`}>
              {skillTiming === undefined ? (
                <span className="text-gray-500">Cast / Recovery → ...</span>
              ) : (
                <div className="text-orange-300 space-y-0.5">
                  {skillTiming.cast && (
                    <div>{tStat('Cast Time')} → {skillTiming.cast.seconds}{tStat('s')}</div>
                  )}
                  {skillTiming.recovery && (
                    <div>{tStat('Recovery')} &nbsp;→ {skillTiming.recovery.seconds}{tStat('s')}</div>
                  )}
                  {skillTiming.cast && skillTiming.recovery && (
                    <div className="border-t border-orange-300/30 pt-0.5 mt-0.5">
                      {tStat('Total')} &nbsp;&nbsp;&nbsp;&nbsp;→ {(skillTiming.cast.seconds + skillTiming.recovery.seconds).toFixed(2)}{tStat('s')}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Ability detail (Activate / Condition / Probability) ── */}
          {kind === 'ability' && (() => {
            const ab = item as AbilitySlot
            const activeOn  = formatActiveOn(ab.activeOnType)
            const activeWhen = formatActiveWhen(ab.activeWhenType)
            const cond = formatCondition(ab.condition1Type, ab.condition1Value)
            const hasAny = activeOn || activeWhen || cond || (ab.probability != null && ab.probability !== 1)
            if (!hasAny) return null
            return (
              <div className="mt-1.5 pt-1.5 border-t border-white/10 text-[12px] font-line">
                <div className="text-cyan-200 space-y-0.5">
                  {(activeOn || activeWhen) && (
                    <div>
                      {tStat('Activate On')} → {[activeOn, activeWhen].filter(Boolean).map(s => tStat(s)).join(' · ')}
                    </div>
                  )}
                  <div>
                    {tStat('Condition')} → {cond ? `${tStat(cond.type)}: ${tStat(cond.value)}` : tStat('(None)')}
                  </div>
                  {ab.probability != null && (
                    <div>
                      {tStat('Probability')} → {(ab.probability * 100).toFixed(0)}%
                    </div>
                  )}
                </div>
              </div>
            )
          })()}
        </div>,
        document.body
      )}
    </div>
  )
}

function DetailRow({
  label, value, bonus, sub,
}: {
  label: string
  value: string
  bonus: string
  sub?: boolean
}) {
  const { tStat } = useLanguage()
  // bonus may already include "(...)" wrapping (from bonusPctText/bonusFlatText)
  // หรือเป็นเลข delta ดิบ (จาก fmtBonus) — ห่อด้วย () ถ้ายังไม่ห่อ
  const bonusDisplay = bonus
    ? bonus.startsWith('(') ? bonus : `(${bonus})`
    : ''
  return (
    <div className={`flex items-center justify-between ${sub ? 'pl-3 px-2 py-0.5' : 'font-semibold'}`}>
      <span className={`whitespace-pre-line ${sub ? 'text-gray-500 text-xs' : 'text-gray-200 text-sm'}`}>{tStat(label)}</span>
      <span className="text-right">
        <span className={`text-white font-line ${sub ? 'text-xs' : 'text-sm'}`}>{value}</span>
        {bonusDisplay && (
          <span className={`text-green-400 font-line ml-1 ${sub ? 'text-xs' : 'text-sm'}`}>
            {bonusDisplay}
          </span>
        )}
      </span>
    </div>
  )
}

function Divider() {
  return <div className="border-t border-white/5 my-1" />
}
