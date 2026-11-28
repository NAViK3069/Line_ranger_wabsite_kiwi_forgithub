'use client'

// ====================================================
// RangerStatPanel — Ranger Detail (ตามดีไซน์ใหม่)
// 3 columns: portrait+gear / quick info+speed+skill / detailed stat panel
// ====================================================

import { apiFetch } from '@/lib/staticApi'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { GearEffect, GearEffects } from '@/lib/pvpScraper'
import GearDetailPopup from '@/components/GearDetailPopup'
import RangerAnimationPopup from '@/components/RangerAnimationPopup'
import SkillDetailSheet from '@/components/SkillDetailSheet'
import PotentialSection, { PotentialMedal } from '@/components/PotentialSection'
import { selectSwitchableEffects, absEffectValue, effectKey, DEFAULT_SLOT_ORDER, type RangerContext, type SwitchableResultMap, type SlotOrder } from '@/lib/switchableSelector'
import { recalcGearEffects, splitSliderLevel, effectAmount } from '@/lib/gearLevelCalc'
import {
  levelStats, totalsOf, typedValues, finalStats, switchableConditionMet, skillUseChance,
  skillPlusHits, skillPlusPower, hasAttackFactorSkill,
  potentialValues,
  type SkillGame, type AbilityGame, type LevelRules, type PotentialSlot, type UnitBase, type FinalStats, type StatTotals,
} from '@/lib/rangerGameCalc'
import GearPickerModal, { type GearBookItem } from '@/components/GearPickerModal'
import { useLanguage } from '@/contexts/LanguageContext'
import { usePro } from '@/contexts/ProContext'
import { useSound } from '@/contexts/SoundContext'
import type { AwakenAbility } from '@/server/api/ranger/awakening/[id]/route'
import type { TriggerBasis } from '@/lib/rangerTriggerBasis'
import type { RangerGrowthInput } from '@/lib/rangerLevelCalc'

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
  game?: SkillGame
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
  game?:            AbilityGame
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
  game: {
    levelRules: LevelRules
    attackDelay: number
    movingSpeed: number
    attackRange: number
    splash: number
    summonEnergy: number
    productionSpeed: number
    critRatio: number
    antiStun?: number
    antiKnockback?: number
    antiSilence?: number
  }
  potential?: PotentialSlot[] | null
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
/** ส่วนต่างเปอร์เซ็นต์ (สีเขียว) — ว่างถ้าไม่ต่าง */
function pctDelta(d: number): string {
  if (Math.abs(d) < 1e-9) return ''
  const v = d * 100
  return `${v >= 0 ? '+' : ''}${Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(1)}%`
}
/** วินาที — ตัด 0 ท้ายทศนิยม (2.27 / 4 / 1.3) */
function secText(v: number): string {
  return `${+v.toFixed(2)}s`
}
function secDelta(d: number): string {
  if (Math.abs(d) < 0.005) return ''
  return `${d >= 0 ? '+' : ''}${+d.toFixed(2)}s`
}

/** SKILL+ ที่ได้ผลกับสกิลหนึ่ง (จับคู่ด้วย eqip_skl_plus_grp) */
interface SkillPlusLine {
  effect: GearEffect
  /** โค้ดสกิลย่อยที่ได้ผล (SKILL+ แบบ SUB) */
  sub: string | null
  /** ค่าของสกิลก่อน/หลัง SKILL+ (null = เกมคูณตามระดับ แสดงเฉพาะค่าที่เพิ่ม) */
  power: { before: number; after: number; unit: '%' | 's' | '' } | null
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
  stats: { maxLevel: number; playerMaxLevel: number; unlimitMax: number; tierIconKey: string; tierLabel: string; step: number },
  level: number,
) {
  const { maxLevel, playerMaxLevel, unlimitMax, tierIconKey, tierLabel, step } = stats
  const clamped = Math.min(playerMaxLevel, Math.max(1, level))
  const tier = Math.min(unlimitMax, Math.ceil(Math.max(0, clamped - maxLevel) / step))
  const tierEnd = tier > 0 ? Math.min(playerMaxLevel, maxLevel + tier * step) : maxLevel
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
export type RangerPanelMode = 'meta' | 'gacha' | 'book' | 'tower'

/**
 * ค่าของศัตรูในหอคอยอนันต์ (endless_product_line ของเกม) — mode='tower' ใช้แทนค่าพลังของยูนิต
 * คอลัมน์ตรงกับที่ buildRangerStats อ่านจากตาราง unit: attackScope ↔ unit.attackRange · attackSplash ↔ unit.attackScope
 */
export interface TowerUnitStats {
  level: number
  hp: number; attack: number; specialAttack: number; defence: number; specialDefence: number
  range: number; splash: number
  critRate: number; critRatio: number; avoid: number; skillAvoid: number; skillResist: number
  antiAvoid: number; antiSkillAvoid: number
}

/** ค่าของหอคอย → ค่าพื้นฐานของยูนิต (ทับเฉพาะที่หอคอยกำหนด — สกิล/ความสามารถ/ความเร็วคงเดิม) */
function towerBase(b: UnitBase, t: TowerUnitStats): UnitBase {
  return {
    ...b,
    phyAtk: t.attack, magAtk: t.specialAttack, phyDef: t.defence, magDef: t.specialDefence, hp: t.hp,
    // t.splash = unit.attackScope (จำนวนเป้า) ไม่ใช่รัศมีสแปลช (projectileAttackScope) — คงค่ายูนิตเดิม
    attackRange: t.range,
    critRate: t.critRate, critRatio: t.critRatio,
    avoid: t.avoid, skillAvoid: t.skillAvoid, skillResist: t.skillResist,
    antiAvoid: t.antiAvoid, antiSkillAvoid: t.antiSkillAvoid,
  }
}

interface Props {
  rangerId: string
  rangerName: string
  rangerImageUrl: string
  topSets?: GearSet[]
  gear?: GearRanking
  mode?: RangerPanelMode    // 'meta' (default) = ใช้ MAX level + เกียร์จริง / 'gacha' = level 1, ไม่ปลดลิมิต, ไม่มีเกียร์
  league?: number           // league สำหรับแสดง ranger usage ใน GearDetailPopup (default = 0 = Legend)
  talentLevel?: number      // ระดับพรสวรรค์ 0-4 จาก slider ใน TalentSection (mode='book' เท่านั้น) — เพิ่มค่าพลังเหมือนเกียร์
  tower?: TowerUnitStats    // mode='tower': ค่าของศัตรูในหอคอย (ล็อก ไม่มีเกียร์/เลเวล/พรสวรรค์ให้ปรับ)
}

const EMPTY_GEAR: GearRanking = { WPN: [], AMR: [], ACC: [] }

export default function RangerStatPanel({
  rangerId, rangerName, rangerImageUrl,
  topSets = [],
  gear = EMPTY_GEAR,
  mode = 'meta',
  league = 0,
  talentLevel = 0,
  tower,
}: Props) {
  const { tRanger, tGear, tStat, lang } = useLanguage()
  const { play } = useSound()
  const { isPro } = usePro()
  const isGacha = mode === 'gacha'
  const isBook  = mode === 'book'
  const isTower = mode === 'tower' && !!tower

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
  // แผ่นรายละเอียดสกิล/ความสามารถ (ปุ่มมุมขวาบนของ tooltip)
  // ── ศักยภาพ 5 ช่อง (0 – max_lv ต่อช่อง) — เริ่มที่ 0 ทุกโหมด (ไม่มีข้อมูลของผู้เล่น) ──
  const [potentialLv, setPotentialLv] = useState<number[]>([0, 0, 0, 0, 0])
  useEffect(() => { setPotentialLv([0, 0, 0, 0, 0]) }, [rangerId])
  const [detail, setDetail] = useState<{ kind: 'skill' | 'ability' | 'awaken'; code: string } | null>(null)
  const openDetail = (kind: 'skill' | 'ability' | 'awaken', code: string) => { play('click_global.ogg'); setIconPinnedKey(null); setDetail({ kind, code }) }
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
    const out: Record<SlotKey, GearEffects | null> = { WPN: null, AMR: null, ACC: null }
    for (const s of ['WPN', 'AMR', 'ACC'] as SlotKey[]) {
      const raw = effectsBySlot[s]
      // Meta: เกียร์ที่คนใช้ = เลเวลเต็ม (Basic 5 + Switchable 5 + SKILL+ 5)
      out[s] = raw ? recalcGearEffects(raw, isBook ? gearLevel[s] : 15) : null
    }
    return out
  }, [effectsBySlot, gearLevel, isBook])

  // ── สกิลของเรนเจอร์ตามตาราง skill (หลัก + ย่อย) — ใช้จับคู่ SKILL+ / เลือก Switchable ──
  const skillGames = useMemo(
    () => (stats?.skills ?? []).map(s => s.game).filter((g): g is SkillGame => !!g),
    [stats],
  )
  // ค่า Basic ของเกียร์แต่ละชิ้นแยกตามชนิด (reinforceType ของเกม)
  const basicBySlot = useMemo(() => ({
    WPN: typedValues(computedEffectsBySlot.WPN?.basic),
    AMR: typedValues(computedEffectsBySlot.AMR?.basic),
    ACC: typedValues(computedEffectsBySlot.ACC?.basic),
  }), [computedEffectsBySlot])

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
    // ── ctx: รวม basic effects ของ "ทุก slot" ที่ติดตั้งอยู่ ──
    // threshold (95%) คือ "total rate (รวม basic ของทุกชิ้น) เกินแล้วหรือยัง?"
    const all = totalsOf([...basicBySlot.WPN, ...basicBySlot.AMR, ...basicBySlot.ACC], []).sum
    const ctx: RangerContext = {
      category: stats.category,
      element: normalizeElement(stats.element),
      hasDamageSkill: hasAttackFactorSkill(skillGames),
      skillEvadeRate:  stats.rates.skillEvadeRate  + (all.SKLAVD_PROB_MUL ?? 0),
      skillResistance: stats.rates.skillResistance + (all.SKLRE_PROB_MUL ?? 0),
    }

    return selectSwitchableEffects(
      { WPN: computedEffectsBySlot.WPN, AMR: computedEffectsBySlot.AMR, ACC: computedEffectsBySlot.ACC },
      ctx,
      installOrder,
    )
  }, [stats, computedEffectsBySlot, basicBySlot, skillGames, isGacha, installOrder])

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

    // ── มี override → คำนวณใหม่ (เงื่อนไขของ unit_eqip_attr.unitEquipRandOptTrigType) ──
    const checkCompat = (trigType: string | null): boolean =>
      switchableConditionMet(trigType, stats?.category ?? null, stats?.element ?? null)

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

    // Step 3: ชนิดเดียวกันหลายชิ้น — เกมนับเฉพาะ Switchable ค่า |สูงสุด| (libgame 0x111d8c8)
    // เท่ากันถึงตัดสินด้วย install order (ติดตั้งก่อนชนะ) — ตรงกับ selectSwitchableEffects
    const activeSlots = slots.filter(s => result[s].active && result[s].effect)
    const byName = new Map<string, SlotKey[]>()
    for (const s of activeSlots) {
      const key = effectKey(result[s].effect!)
      byName.set(key, [...(byName.get(key) ?? []), s])
    }
    for (const group of byName.values()) {
      if (group.length < 2) continue
      const winner = group.reduce((best, s) => {
        const vBest = absEffectValue(result[best].effect!)
        const vS = absEffectValue(result[s].effect!)
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

  // ── เลเวลเรนเจอร์ (วงล้อเลือกเลเวล) — คำนวณค่าพลังสดจากตาราง unit/unit_reinforce_rate ──
  //   Meta เริ่มที่ MAX · Gacha / Ranger Book เริ่มที่ Lv.1 · หอคอยใช้เลเวลของศัตรู (ปรับไม่ได้)
  const [sliderLevel, setSliderLevel] = useState<number | null>(null)
  const [levelPopupOpen, setLevelPopupOpen] = useState(false)
  const levelPopupRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setSliderLevel(isBook || isGacha ? 1 : null); setLevelPopupOpen(false)
  }, [rangerId, isBook, isGacha])

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
    const cacheKey = rangerId
    const cached = statsCache.get(cacheKey)
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      setStats(cached.data); setStatsLoading(false); setStatsError('')
      return
    }

    const ctrl = new AbortController()
    setStats(null); setStatsLoading(true); setStatsError('')
    const apiUrl = `/api/meta/ranger-stats?id=${encodeURIComponent(rangerId)}`
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
  }, [rangerId])

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

  // ── พรสวรรค์เสริม (tlnt.enhanceType + enhanceVal ของเกม) — ระดับ 2–4 ปลดทีละตัว ──
  const [talentStats, setTalentStats] = useState<{ type: string; value: number }[]>([])
  useEffect(() => {
    // Meta ก็ต้องโหลดด้วย — ใช้คำนวณค่าพลังจาก topTalentCode (Talent Release Status อันดับ 1) อัตโนมัติ
    if (mode !== 'book' && mode !== 'meta') { setTalentStats([]); return }
    let cancelled = false
    apiFetch(`/api/ranger/talents/${encodeURIComponent(rangerId)}?v=3`).then(r => r.json()).catch(() => ({ hasTalent: false }))
      .then((data: { enhancedStats?: { type: string; value: number }[] }) => {
        if (!cancelled) setTalentStats(Array.isArray(data.enhancedStats) ? data.enhancedStats : [])
      }).catch(() => { if (!cancelled) setTalentStats([]) })
    return () => { cancelled = true }
  }, [mode, rangerId])

  // ระดับพรสวรรค์ที่ใช้จริง: book = ปรับเองจาก slider / meta = อัตโนมัติจาก Talent Release Status อันดับ 1 / gacha = 0
  const effectiveTalentLevel =
    mode === 'book' ? talentLevel
    : mode === 'meta' ? (topTalentCode ? parseInt(topTalentCode, 10) || 0 : 0)
    : 0

  // ── รวมค่าจากเกียร์ + พรสวรรค์ ตามกฎเกม: Basic บวกกัน · Switchable ที่ผ่านเงื่อนไข นับค่าสูงสุดต่อชนิด ──
  const totals: StatTotals = useMemo(() => {
    if (isTower) return { sum: {}, mult: {} }
    const basic = [
      ...basicBySlot.WPN, ...basicBySlot.AMR, ...basicBySlot.ACC,
      // ระดับ 1 = ปลด Major Talent เฉยๆ (ไม่มีค่าพลัง) / ระดับ 2-4 = Enhanced Talent ตัวที่ 1..N
      ...talentStats.slice(0, Math.max(0, effectiveTalentLevel - 1)),
      // ศักยภาพ: grth_val × เลเวล เข้า Σ เดียวกับเกียร์ (libgame 0xe9c2xx: เกียร์ + ศักยภาพ + … แล้วคิดโบนัสครั้งเดียว)
      ...potentialValues(stats?.potential, potentialLv),
    ]
    const sw = (['WPN', 'AMR', 'ACC'] as SlotKey[]).flatMap(s => {
      const e = effectiveSwitchable[s]
      return e.active && e.effect ? typedValues([e.effect]) : []
    })
    return totalsOf(basic, sw)
  }, [isTower, basicBySlot, talentStats, effectiveTalentLevel, effectiveSwitchable, stats, potentialLv])

  // SKILL+ deduplication — ป้องกัน tooltip โชว์ effect ซ้ำข้ามสล็อต
  const skillPlusDedup = useMemo(() => deduplicateSkillPlus(computedEffectsBySlot), [computedEffectsBySlot])
  // SKILL+ ที่ใช้ได้จริง → สกิล (หลัก/ย่อย) ที่ได้ผลตามตาราง eqip_skl_plus_grp
  const skillPlusBySkill = useMemo(() => {
    const m = new Map<string, SkillPlusLine[]>()
    for (const { effect } of skillPlusDedup.activeEffects) {
      const g = effect.skillPlusGrowth
      if (!g) continue
      const amount = effectAmount(effect)
      for (const hit of skillPlusHits(g, skillGames)) {
        const list = m.get(hit.skill.code) ?? []
        list.push({ effect, sub: hit.sub?.code ?? null, power: skillPlusPower(g, hit, amount) })
        m.set(hit.skill.code, list)
      }
    }
    return m
  }, [skillPlusDedup, skillGames])

  // ── ชื่อ effect ที่ slot อื่นกำลังใช้อยู่จริง (override > auto lock) ──
  const usedEffectNameOf = (s: SlotKey): string | null => {
    const ov = switchableOverrides[s]
    const eff = ov
      ? computedEffectsBySlot[s]?.switchable?.allEffects?.find(o => o.effect?.name === ov)?.effect
      : switchableResults?.[s]?.effect
    return eff ? effectKey(eff) : null
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
    const SLOTS: SlotKey[] = ['WPN', 'AMR', 'ACC']
    const result: Partial<Record<SlotKey, RangerContext>> = {}
    for (const slot of SLOTS) {
      const bb = totalsOf(SLOTS.filter(s => s !== slot).flatMap(s => basicBySlot[s]), []).sum
      result[slot] = {
        category: stats.category,
        element: normalizeElement(stats.element),
        hasDamageSkill: hasAttackFactorSkill(skillGames),
        skillEvadeRate:  stats.rates.skillEvadeRate  + (bb.SKLAVD_PROB_MUL ?? 0),
        skillResistance: stats.rates.skillResistance + (bb.SKLRE_PROB_MUL ?? 0),
      }
    }
    return result
  }, [stats, basicBySlot, skillGames])

  const rangerCtxForSlot = (excludeSlot: SlotKey): RangerContext | undefined =>
    rangerCtxBySlot[excludeSlot]

  // ── Picker preview context ─────────────────────────────────────────────
  // เมื่อเปิด picker สำหรับ slot หนึ่ง → ส่งข้อมูลจาก slot อื่นที่ใส่เกียร์แล้ว
  // เพื่อให้ preview popup แสดง inactive switchable + override SKILL+ ได้ถูกต้อง

  // SKILL+ จาก slot อื่น (ไม่ใช่ pickerSlot) ที่ใส่เกียร์แล้ว
  const pickerExistingSkillPlus = useMemo((): Array<{ group: number; amount: number; slot: string }> => {
    if (!pickerSlot) return []
    const others = (['WPN', 'AMR', 'ACC'] as SlotKey[]).filter(s => s !== pickerSlot)
    const result: Array<{ group: number; amount: number; slot: string }> = []
    for (const s of others) {
      for (const sp of computedEffectsBySlot[s]?.skillPlus ?? []) {
        const group = sp.skillPlusGrowth?.group ?? sp.skillPlusGrowth?.attrNo
        if (group != null) result.push({ group, amount: effectAmount(sp), slot: s })
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

  // ── ค่าพลังตามเลเวล (libgame 0xd55400) ──
  const rules = stats.game.levelRules
  const playerMaxLevel = stats.maxLevel + rules.step * rules.maxCount
  const displayLevel = isTower ? tower!.level : Math.min(playerMaxLevel, sliderLevel ?? playerMaxLevel)
  const lv = levelStats({ ...stats.growth, attackDelay: stats.game.attackDelay }, rules, stats.maxLevel, isTower ? 1 : displayLevel)
  const unitBase: UnitBase = {
    phyAtk: lv.phyAtk, magAtk: lv.magAtk, phyDef: lv.phyDef, magDef: lv.magDef, hp: lv.hp,
    attackDelay: stats.game.attackDelay,
    movingSpeed: stats.game.movingSpeed,
    attackRange: stats.game.attackRange,
    splash: stats.game.splash,
    summonEnergy: stats.game.summonEnergy,
    productionSpeed: stats.game.productionSpeed,
    decreaseRate: lv.decreaseRate,
    critRate: stats.rates.critRate, critRatio: stats.game.critRatio,
    avoid: stats.rates.evadeRate, antiAvoid: stats.rates.hitRate,
    skillAvoid: stats.rates.skillEvadeRate, antiSkillAvoid: stats.rates.skillHitRate, skillResist: stats.rates.skillResistance,
    antiStun: stats.game.antiStun ?? 0, antiKnockback: stats.game.antiKnockback ?? 0, antiSilence: stats.game.antiSilence ?? 0,
  }
  const baseForCalc = isTower ? towerBase(unitBase, tower!) : unitBase
  // ค่าไม่รวมเกียร์ (ตัวเลขหลัก) กับค่ารวมเกียร์/พรสวรรค์ (ส่วนต่างสีเขียว)
  const base: FinalStats = finalStats(baseForCalc, { sum: {}, mult: {} }, rules.productionMin, rules.minSummonEnergy)
  const fin: FinalStats = finalStats(baseForCalc, totals, rules.productionMin, rules.minSummonEnergy)
  const dps = (f: FinalStats) => (f.attackDelay > 0 ? (f.phyAtk + f.magAtk) / (f.attackDelay / 30) : 0)
  const levelInfo = levelDisplayInfo({ maxLevel: stats.maxLevel, playerMaxLevel, unlimitMax: rules.maxCount, tierIconKey: stats.tierIconKey, tierLabel: stats.tierLabel, step: rules.step }, displayLevel)

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

          {/* 3 gear slots — ล็อคที่ 200px (match LEFT column desktop) ไม่ยืดตามคอลัมน์/จอ · หอคอย: ศัตรูไม่มีเกียร์ */}
          {!isTower && <div className="grid grid-cols-3 gap-2 mx-auto" style={{ maxWidth: '200px' }}>
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
          </div>}
        </div>

        {/* ─── TOP RIGHT: quick-info ───
            มือถือ 2 คอลัมน์: สาย|เลโอนาร์ด / ATK|แร่ / HP|DEF / ศักยภาพ (เต็มแถว)
            จอใหญ่ 12 ช่อง: แถวบน สาย|แร่|เลโอนาร์ด|ศักยภาพ (3 ช่องละ) · แถวล่าง ATK|HP|DEF (4 ช่องละ) */}
        <div className="grid grid-cols-2 sm:grid-cols-12 gap-1.5">
          <div className="order-1 sm:col-span-3">
            <InfoBox iconUrl={categoryIcon} value={stats.categoryLabel ?? '—'} />
          </div>
          {!isTower && <div className="order-4 sm:order-2 sm:col-span-3">
            <InfoBox
              iconUrl="/gacha/images/mineral.png"
              value={fmtRaw(fin.summonEnergy)}
            />
          </div>}
          {!isTower && <div className="order-2 sm:order-3 sm:col-span-3">
            <InfoBox iconUrl="/gacha/images/leonardpoint.png" value={stats.leonardMax != null ? `Max: ${stats.leonardMax}` : '—'} />
          </div>}
          {!isTower && <div className="order-7 sm:order-4 col-span-2 sm:col-span-3">
            {/* ระดับศักยภาพ = ผลรวมเลเวลทั้ง 5 ช่อง (POTENTIAL_TIP_DESC) */}
            <div className="bg-white/5 rounded-lg px-2 py-2 sm:py-2.5 flex items-center gap-1.5 sm:gap-2 min-w-0 h-full">
              <PotentialMedal order={1} size={24} dim={!stats.potential} />
              <span className="text-white text-[12px] sm:text-[16px] font-semibold truncate">
                {stats.potential
                  ? <>{tStat('Potential')} <span className="tabular-nums">{potentialLv.reduce((a, v) => a + v, 0)}</span></>
                  : tStat('Potential') + ' —'}
              </span>
            </div>
          </div>}
          <div className="order-3 sm:order-5 sm:col-span-4">
            <InfoBox iconUrl="/gacha/images/atk.png" value={fmtCompact(dps(fin))} />
          </div>
          <div className="order-5 sm:order-6 sm:col-span-4">
            <InfoBox iconUrl="/gacha/images/hp.png" value={fmtCompact(fin.hp)} />
          </div>
          <div className="order-6 sm:order-7 sm:col-span-4">
            <InfoBox iconUrl="/gacha/images/def.png" value={fmtCompact(fin.phyDef + fin.magDef)} />
          </div>
        </div>

        {/* ─── BOTTOM RIGHT: middle (level/speed/skill/ability) + stat panel ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-3">

          {/* MIDDLE */}
          <div className="space-y-2">
            {/* Level row + ไอคอนปลดลิมิต — กดเปิดวงล้อเลือกเลเวล (หอคอย: เลเวลศัตรู ปรับไม่ได้) */}
            <div ref={levelPopupRef} className="relative">
              <button
                type="button"
                disabled={isTower}
                onClick={() => { play('click_global.ogg'); setLevelPopupOpen(o => !o) }}
                aria-haspopup="dialog"
                aria-expanded={levelPopupOpen}
                className={`w-full bg-white/5 rounded-lg px-3 py-2 flex items-center transition-colors ${isTower ? 'cursor-default' : 'hover:bg-white/10'}`}
              >
                {/* แถวสูงคงที่ (h-8) กันปุ่มขยับตอนสลับมี/ไม่มีรูป */}
                <div className="w-full h-8 flex items-center justify-center gap-2">
                  <span className="text-white font-bold text-sm sm:text-base tabular-nums">
                    {isTower ? `Level : ${displayLevel}` : levelInfo.label}
                  </span>
                  {!isTower && levelInfo.showIcon && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={levelInfo.iconUrl} alt={levelInfo.iconAlt} className="h-7 w-auto object-contain" />
                  )}
                </div>
              </button>
              {levelPopupOpen && !isTower && (
                // สไลเดอร์ปรับเลเวล (แบบเดิม) — ค่าพลังคำนวณสดตามเลเวลที่ลาก
                <div
                  role="dialog"
                  aria-label={lang === 'th' ? 'ปรับเลเวล' : 'Adjust level'}
                  className="absolute left-1/2 -translate-x-1/2 mt-1.5 w-64 rounded-xl bg-gray-900/95 backdrop-blur border border-white/10 shadow-xl z-50 p-3.5"
                >
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-xs font-semibold text-gray-300">{lang === 'th' ? 'เลเวล' : 'Level'}</span>
                    <span className={`text-xs font-bold tabular-nums ${levelPopupTheme(stats.tier).text}`}>{displayLevel}/{playerMaxLevel}</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={playerMaxLevel}
                    step={1}
                    value={displayLevel}
                    onChange={(e) => setSliderLevel(parseInt(e.target.value, 10))}
                    onPointerUp={() => play('click_global.ogg')}
                    onKeyUp={() => play('click_global.ogg')}
                    className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer bg-white/15 ${levelPopupTheme(stats.tier).accent}`}
                    aria-label="Ranger level"
                  />
                  {/* ปุ่มลัด: Lv.1 / เลเวลสูงสุดก่อนปลดลิมิต / เลเวลสูงสุดหลังปลดลิมิตครบ */}
                  <div className="flex gap-1.5 mt-3">
                    {[...new Set([1, stats.maxLevel, playerMaxLevel])].map(lv => (
                      <button
                        key={lv}
                        type="button"
                        onClick={() => { play('click_global.ogg'); setSliderLevel(lv) }}
                        className={`flex-1 rounded-md py-1 text-xs font-bold tabular-nums transition-colors ${
                          lv === displayLevel ? `bg-white/20 ${levelPopupTheme(stats.tier).text}` : 'bg-white/5 text-gray-300 hover:bg-white/10'
                        }`}
                      >
                        Lv.{lv}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

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
                onOpenDetail={code => openDetail('skill', code)}
                skillPlusBySkill={skillPlusBySkill}
                castTimesMap={castTimesMap}
              />
            )}

            {/* Ability row */}
            {stats.abilities.length > 0 && (
              <PillIconRow label="Ability" items={stats.abilities} kind="ability"
                pinnedKey={iconPinnedKey} onSetPinnedKey={setIconPinnedKey}
                onOpenDetail={code => openDetail('ability', code)}
                extraEnd={awakenAbilities && awakenAbilities.length > 0
                  ? <AwakenAbilityButton
                      abilities={awakenAbilities}
                      topCode={topAwakenCode}
                      selectable={mode !== 'meta'}
                      isPinned={iconPinnedKey === 'awaken-ability'}
                      suppressHover={iconPinnedKey !== null && iconPinnedKey !== 'awaken-ability'}
                      onPinToggle={() => { play('click_global.ogg'); setIconPinnedKey(iconPinnedKey === 'awaken-ability' ? null : 'awaken-ability') }}
                      onOpenDetail={() => openDetail('awaken', topAwakenCode ?? awakenAbilities[0].code)}
                    />
                  : undefined
                }
              />
            )}
          </div>

          {/* DETAIL STAT PANEL — ตัวเลขหลัก = ค่าของเรนเจอร์ที่เลเวลนี้ · (+สีเขียว) = เกียร์/พรสวรรค์ ตามกฎรวมค่าของเกม */}
          <div className="bg-white/5 rounded-xl p-3 self-start max-h-[252px] overflow-y-auto space-y-1.5 text-sm">
            <DetailRow label="ATK per sec" value={fmtRaw(dps(base))} bonus={fmtBonus(dps(fin) - dps(base))} />
            <DetailRow label="ATK" value={fmtRaw(base.phyAtk + base.magAtk)} bonus={fmtBonus(fin.phyAtk + fin.magAtk - base.phyAtk - base.magAtk)} />
            <div className="bg-black/20 rounded overflow-hidden">
              <DetailRow label="Physical ATK" value={fmtRaw(base.phyAtk)} bonus={fmtBonus(fin.phyAtk - base.phyAtk)} sub />
              <DetailRow label="Magical ATK"  value={fmtRaw(base.magAtk)} bonus={fmtBonus(fin.magAtk - base.magAtk)} sub />
            </div>
            <DetailRow label="HP" value={fmtRaw(base.hp)} bonus={fmtBonus(fin.hp - base.hp)} />
            <DetailRow label="DEF" value={fmtRaw(base.phyDef + base.magDef)} bonus={fmtBonus(fin.phyDef + fin.magDef - base.phyDef - base.magDef)} />
            <div className="bg-black/20 rounded overflow-hidden">
              <DetailRow label="Physical DEF" value={fmtRaw(base.phyDef)} bonus={fmtBonus(fin.phyDef - base.phyDef)} sub />
              <DetailRow label="Magical DEF"  value={fmtRaw(base.magDef)} bonus={fmtBonus(fin.magDef - base.magDef)} sub />
            </div>

            <Divider />

            {/* attackDelay (เฟรม 30 fps) → วินาทีต่อการโจมตี — เกียร์ ATK Speed ลด delay ตามสูตร libgame 0xd5d490 */}
            <DetailRow label="ATK Interval (sec)" value={secText(base.attackDelay / 30)} bonus={secDelta(fin.attackDelay / 30 - base.attackDelay / 30)} />
            <DetailRow label="Move Speed" value={fmtRaw(base.movingSpeed)} bonus={fmtBonus(fin.movingSpeed - base.movingSpeed)} />
            <DetailRow label="ATK Range" value={fmtRaw(base.attackRange)} bonus={fmtBonus(fin.attackRange - base.attackRange)} />
            <DetailRow label="Splash Radius" value={fmtRaw(base.splash)} bonus={fmtBonus(fin.splash - base.splash)} />

            <Divider />

            <DetailRow label="Critical Rate" value={pctText(base.critRate)} bonus={pctDelta(fin.critRate - base.critRate)} />
            {/* criticalRatio = ตัวคูณดาเมจตอนคริ (libgame 0xcecfec: max(1, ratio)) */}
            <DetailRow label="Critical Damage" value={`×${+base.critRatio.toFixed(2)}`} bonus={fin.critRatio !== base.critRatio ? `+${+(fin.critRatio - base.critRatio).toFixed(3)}` : ''} />
            <DetailRow label="Evade Rate" value={pctText(base.avoid)} bonus={pctDelta(fin.avoid - base.avoid)} />
            <DetailRow label="Hit Rate" value={pctText(base.antiAvoid)} bonus={pctDelta(fin.antiAvoid - base.antiAvoid)} />

            <Divider />

            {/* สกิลที่ใช้งานได้ (ตาราง skill: probability / skillDelayTime) — โอกาสใช้จริงสูงสุด 95% */}
            {stats.skills.filter(sk => sk.slot !== 'passive').slice(0, 2).map((sk, i) => {
              const p = sk.game?.probability ?? sk.probability ?? 0
              const cd = sk.game?.delay ?? sk.cooldown ?? 0
              return (
                <div key={sk.code} className="space-y-1.5">
                  <DetailRow label={`Skill Use Rate ${i + 1}`} value={pctText(p)}
                    bonus={fin.skillProbAdd ? `${pctDelta(fin.skillProbAdd)} → ${pctText(skillUseChance(p + fin.skillProbAdd))}` : ''} />
                  <DetailRow label={`Skill Cooldown ${i + 1}`} value={secText(cd)}
                    bonus={fin.skillDelayMul !== 1 ? secDelta(cd * fin.skillDelayMul - cd) : ''} />
                </div>
              )
            })}

            <Divider />

            <DetailRow label="Skill Evade Rate" value={pctText(base.skillAvoid)} bonus={pctDelta(fin.skillAvoid - base.skillAvoid)} />
            <DetailRow label="Skill Hit Rate" value={pctText(base.antiSkillAvoid)} bonus={pctDelta(fin.antiSkillAvoid - base.antiSkillAvoid)} />
            <DetailRow label="Skill Resistance" value={pctText(base.skillResist)} bonus={pctDelta(fin.skillResist - base.skillResist)} />
            {((fin.antiStun ?? 0) > 0 || (fin.antiKnockback ?? 0) > 0 || (fin.antiSilence ?? 0) > 0) && <Divider />}
            {(fin.antiStun ?? 0) > 0 && <DetailRow label="Stun Resistance" value={pctText(base.antiStun ?? 0)} bonus={pctDelta((fin.antiStun ?? 0) - (base.antiStun ?? 0))} />}
            {(fin.antiKnockback ?? 0) > 0 && <DetailRow label="Knockback Resistance" value={pctText(base.antiKnockback ?? 0)} bonus={pctDelta((fin.antiKnockback ?? 0) - (base.antiKnockback ?? 0))} />}
            {(fin.antiSilence ?? 0) > 0 && <DetailRow label="Silence Resistance" value={pctText(base.antiSilence ?? 0)} bonus={pctDelta((fin.antiSilence ?? 0) - (base.antiSilence ?? 0))} />}

            <Divider />

            {/* เวลาเกิดใหม่: productionSpeed × (1 − X) โดย X = unit_level_expansion ของเลเวลนี้ · ขั้นต่ำ 1.3 วิ */}
            <DetailRow label="Ranger Regeneration Time (sec)" value={secText(base.regen)} bonus={secDelta(fin.regen - base.regen)} />
            <DetailRow label="Ranger Mineral Cost" value={fmtRaw(base.summonEnergy)} bonus={fmtBonus(fin.summonEnergy - base.summonEnergy)} />
          </div>
        </div>
      </div>

      {/* ── ศักยภาพ (5 ช่อง) — กดการ์ดเพื่อปรับเลเวล · ค่าเข้าการคำนวณเหมือนเกียร์ ── */}
      {!isTower && stats.potential && (
        <PotentialSection
          slots={stats.potential}
          levels={potentialLv}
          onChange={setPotentialLv}
          onTick={() => play('click_global.ogg')}
        />
      )}

      {/* ── GearPickerModal — book mode เท่านั้น ── */}
      {isBook && pickerSlot && stats && (
        <GearPickerModal
          slot={pickerSlot}
          rangerElement={normalizeElement(stats.element)}
          rangerCategory={stats.category}
          rangerCtx={rangerCtxForSlot(pickerSlot)}
          rangerSkills={skillGames}
          rangerAbilityCodes={stats.abilities.map(a => a.code)}
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
          rangerSkills={skillGames}
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
          rangerSkills={skillGames}
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
      {detail && (
        <SkillDetailSheet
          kind={detail.kind}
          focusCode={detail.code}
          grade={stats.grade ?? 0}
          level={displayLevel}
          onClose={() => setDetail(null)}
          skills={stats.skills.map(sk => ({
            slot: sk.slot, code: sk.code, name: sk.name, description: sk.description, iconUrl: sk.iconUrl, game: sk.game,
            castSec: sk.slot === 'passive' ? null
              : (sk.slot === 'skill1' ? castTimesMap?.skill1 : (castTimesMap?.[sk.slot] ?? castTimesMap?.skill2))?.seconds ?? null,
          }))}
          // ความสามารถ กับ ความสามารถปลุกพลัง แยกแผ่นกัน — แต่ละปุ่มเปิดเฉพาะกลุ่มของตัวเอง
          abilities={detail.kind === 'awaken'
            ? (awakenAbilities ?? []).map(ab => ({
                code: ab.code,
                name: lang === 'en' ? (ab.nameEn || ab.nameZh) : ab.nameZh,
                description: lang === 'en' ? (ab.descEn || ab.descZh) : ab.descZh,
                iconUrl: ab.iconUrl, game: ab.game,
              }))
            : stats.abilities.map(ab => ({ code: ab.code, name: ab.name, description: ab.description, iconUrl: ab.iconUrl, game: ab.game }))}
        />
      )}

      {showAnimation && (() => {
        const animSkills = (stats?.skills ?? []).filter(sk => sk.slot !== 'passive')
        return createPortal(
        <RangerAnimationPopup
          rangerId={rangerId}
          rangerName={rangerName}
          attackRange={fin.attackRange}
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
function AwakenAbilityButton({ abilities, topCode, selectable = false, isPinned, suppressHover, onPinToggle, onOpenDetail }: {
  abilities: AwakenAbility[]
  topCode?: string | null   // code ของ Awakening Ability ที่คนใช้เยอะสุดใน Meta PVP — ถ้ามี ใช้ไอคอนตัวนี้แทน default
  selectable?: boolean      // true = ไม่ใช่ Meta → ให้กดเลือก/ถอด Awakening Ability เองได้ (แทน topCode ที่มาจากสถิติ)
  isPinned: boolean
  suppressHover: boolean
  onPinToggle: () => void
  onOpenDetail?: () => void
}) {
  const { tAbility, tAbilityDesc, tStat, lang } = useLanguage()
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
          {/* Header + ปุ่มรายละเอียด */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="font-bold leading-tight text-[14px] sm:text-[18px] text-yellow-300">
              {lang === 'en' ? 'Awakening Ability' : 'ความสามารถปลุกพลัง'}
            </div>
            {onOpenDetail && (
              <button type="button" onClick={(e) => { e.stopPropagation(); onOpenDetail() }}
                className="shrink-0 inline-flex items-center gap-0.5 rounded-md bg-white/10 hover:bg-white/20 ring-1 ring-white/15 px-1.5 py-0.5 text-[11px] font-semibold text-gray-100">
                <span className="material-icons-round text-[14px]">table_view</span>
                {tStat('Details')}
              </button>
            )}
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
  label, items, kind, pinnedKey, onSetPinnedKey, onOpenDetail, skillPlusBySkill, castTimesMap, extraEnd,
}: {
  label: string
  items: (SkillSlot | AbilitySlot)[]
  kind: 'skill' | 'ability'
  pinnedKey: string | null
  onSetPinnedKey: (key: string | null) => void
  skillPlusBySkill?: Map<string, SkillPlusLine[]>
  onOpenDetail?: (code: string) => void
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
              onOpenDetail={onOpenDetail ? () => onOpenDetail(it.code) : undefined}
              skillPlusLines={kind === 'skill' ? skillPlusBySkill?.get(it.code) : undefined}
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

// ── SKILL+ ซ้ำข้ามชิ้น ─────────────────────────────────
// SKILL+ กลุ่มเดียวกัน (unit_eqip_skl_plus_attr.attrNumberGroup) จากหลายชิ้น → นับตัวที่ค่าสูงสุด
// เท่ากัน → ชิ้นที่มาก่อนตามลำดับ WPN > AMR > ACC
interface SkillPlusEntry { effect: GearEffect; slot: SlotKey }

function deduplicateSkillPlus(eff: Record<SlotKey, GearEffects | null>): {
  activeEffects: SkillPlusEntry[]
  overriddenSlots: Set<SlotKey>
  overriddenBySlot: Map<SlotKey, Map<string, SlotKey>>  // slot → (effectName → winning slot)
} {
  const ORDER: SlotKey[] = ['WPN', 'AMR', 'ACC']
  const groups = new Map<string, SkillPlusEntry[]>()
  for (const slot of ORDER) {
    for (const e of eff[slot]?.skillPlus ?? []) {
      const key = String(e.skillPlusGrowth?.group ?? e.skillPlusGrowth?.attrNo ?? e.nameKey ?? e.name)
      groups.set(key, [...(groups.get(key) ?? []), { effect: e, slot }])
    }
  }
  const activeEffects: SkillPlusEntry[] = []
  const overriddenSlots = new Set<SlotKey>()
  const overriddenBySlot = new Map<SlotKey, Map<string, SlotKey>>()
  for (const entries of groups.values()) {
    let best = entries[0]
    for (const e of entries.slice(1)) if (Math.abs(effectAmount(e.effect)) > Math.abs(effectAmount(best.effect))) best = e
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

/** ค่าของสกิลก่อน → หลัง SKILL+ (factor ของสกิล = เท่าของ ATK → แสดงเป็น %) */
function fmtPower(v: number, unit: '%' | 's' | ''): string {
  if (unit === '%') return `${+(v * 100).toFixed(1)}%`
  if (unit === 's') return `${+v.toFixed(2)}s`
  return `${+v.toFixed(2)}`
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
  item, kind, isPinned, suppressHover, onPinToggle, onOpenDetail, skillPlusLines, skillTiming,
}: {
  item: SkillSlot | AbilitySlot
  kind: 'skill' | 'ability'
  isPinned: boolean
  suppressHover: boolean
  onPinToggle: () => void
  onOpenDetail?: () => void
  skillPlusLines?: SkillPlusLine[]
  skillTiming?: SkillTiming | null
}) {
  const { t, tSkill, tSkillDesc, tAbility, tAbilityDesc, tStat, lang } = useLanguage()
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

  const descParts = displayDesc ? splitDescription(displayDesc) : []

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
          {/* Header: ชื่อ + ปุ่มรายละเอียด (มุมขวาบน) — ไม่มีชื่อในไฟล์ภาษา → แสดงประเภทแทนโค้ด */}
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className={`font-bold leading-tight text-[14px] sm:text-[18px] min-w-0 ${
              kind === 'skill' ? 'text-yellow-300' : isGroup ? 'text-pink-300' : 'text-cyan-300'
            }`}>
              {displayName && displayName !== item.code ? displayName : tStat(kind === 'skill' ? 'Skill' : 'Ability')}
            </div>
            {onOpenDetail && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onOpenDetail() }}
                className={`shrink-0 inline-flex items-center gap-0.5 rounded-md bg-white/10 hover:bg-white/20 ring-1 ring-white/15 px-1.5 py-0.5 text-[11px] font-semibold text-gray-100 ${isPinned ? '' : 'opacity-80'}`}
              >
                <span className="material-icons-round text-[14px]">table_view</span>
                {tStat('Details')}
              </button>
            )}
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
                // ใส่เส้นคั่นก่อน bullet ตัวแรก (ถ้ามี bullet และไม่ใช่บรรทัดแรกสุด)
                const showDivider = firstBulletIdx > 0 && i === firstBulletIdx
                return (
                  <div key={i}>
                    {showDivider && (
                      <div className="border-t border-white/15 my-1.5" aria-hidden />
                    )}
                    <div>{displayPart}</div>
                  </div>
                )
              })}
            </div>
            )
          })()}

          {/* SKILL+ ที่ได้ผลกับสกิลนี้ — จับคู่ด้วยตาราง eqip_skl_plus_grp (skillType + factorType + buffFactorType
              ของสกิลหลัก/ย่อย) · ค่าก่อน → หลัง เมื่อตารางบอกค่าพลังของสกิลตรงๆ */}
          {skillPlusLines && skillPlusLines.length > 0 && (
            <div className="mt-1.5 pt-1.5 border-t border-green-400/20 space-y-0.5 font-line text-[12px]">
              {skillPlusLines.map((l, j) => (
                <div key={j} className="flex items-baseline justify-between gap-2 text-green-400">
                  <span className="min-w-0">
                    <span className="font-bold mr-1">SKILL+</span>
                    {(l.effect.nameKey ? t('equip', l.effect.nameKey, l.effect.name) : l.effect.name).replace(/\\n|\n/g, ' ')}
                  </span>
                  <span className="shrink-0 tabular-nums text-right">
                    {l.power
                      ? <>{fmtPower(l.power.before, l.power.unit)} → <b>{fmtPower(l.power.after, l.power.unit)}</b></>
                      : l.effect.value}
                  </span>
                </div>
              ))}
            </div>
          )}

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
