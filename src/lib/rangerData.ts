// ====================================================
// Ranger Data — Lazy-loaded stats, skills, abilities, translations
//
// โหลดครั้งเดียวจากข้อมูลเกมของเราเอง (src/lib/gameData.ts — ถอดจากไฟล์ทางการของเกมรุ่นล่าสุด):
//   • เรนเจอร์ทั้งหมด (ตาราง unit + unit_reinforce_rate)
//   • สกิลทั้งหมด (ตาราง skill)
//   • ความสามารถ + บัฟกลุ่ม (ตาราง ability + group_buff)
//   • ข้อความภาษาอังกฤษของสกิล / ความสามารถ / PROPERTIES (ไฟล์ภาษาของเกม)
// (เดิมดึง JSON จาก API ของ lerico — เลิกใช้แล้ว)
// ใช้ in-flight promise guard กันโหลดซ้ำ
// ====================================================

import { calcRangerLevelStats } from './rangerLevelCalc'
import { gameAbilities, gameRangersBasics, gameSkills, gameText } from './gameData'

// =========== Types ===========

export interface RawRanger {
  unitCode?: string
  unitNameCode?: string
  grade?: number
  unitType?: string                  // ATTACK / HP / DEFENSE / SUPPORT
  unitCategoryType?: string          // STR / AGI / INT
  isTranscendentUnit?: number | boolean
  isHyperUnit?: number | boolean
  isAdventUnit?: number | boolean
  maxLevel?: number
  unitElement?: string               // water / fire / wood / light / dark
  elementOpen?: string               // "1" หรือ "2" — จำนวนช่องธาตุที่เปิดใช้ (ใช้ตัดสินว่าเรนเจอร์นี้แสดง badge ธาตุไหม)

  // Stat growth
  initialAttack?: number
  attackIncreaseAmount?: number
  attackIncreaseAmountMax?: number
  specialAttack?: number
  specialAttackDelta?: number
  specialAttackDeltaMax?: number
  defence?: number
  generalDefenceDelta?: number
  generalDefenceDeltaMax?: number
  specialDefence?: number
  specialDefenceDelta?: number
  specialDefenceDeltaMax?: number
  initialHp?: number
  hpIncreaseAmount?: number
  hpIncreaseAmountMax?: number

  // Combat
  attackDelay?: number               // frames @ 30fps — game shows ATK Speed = 10000/frames, ATK per sec = ATK×30/frames
  attackRange?: number
  attackScope?: number
  projectileAttackScope?: number     // splash radius
  attackSpeedType?: string           // FAST/NORMAL/SLOW
  moveSpeedType?: string
  movingSpeed?: number               // raw speed value
  attackSpeed?: number               // override (usually 0)

  // Crit/Evade/Hit/Skill resist
  criticalProbability?: number       // crit rate (0..1)
  criticalRatio?: number             // crit damage multiplier (1 = no bonus)
  avoidProbability?: number          // evade rate (0..1)
  skillAvoidProbability?: number     // skill evade (0..1)
  skillResistance?: number           // skill resist (0..1)
  antiAvoidProb?: number             // anti-evade (= "Hit Rate" %)
  antiSkillAvoidProb?: number        // anti-skill-evade (= "Skill Hit Rate" %)

  // Cost / cooldown
  productionSpeed?: number           // Norm CD (sec) — /2 ที่ max unlimit
  summonEnergy?: number              // Mineral cost
  maxLeonardPoint?: number
  energyReinforcementRate?: number

  // Skills
  skillCode?: string
  skillCode2?: string
  skillCode3?: string
  iconSkillCode?: string
  iconSkillCode2?: string
  iconSkillCode3?: string
  passiveSkillCode?: string

  // Abilities
  abilityCode?: string
  abilityCode2?: string
  abilityCode3?: string
  iconAbilityCode?: string
  iconAbilityCode2?: string
  abilityCategoryCode?: string
  abilityCategoryCode2?: string

  // Crystal gain
  extractionCrystal1Gain?: number
  extractionCrystal2Gain?: number
  extractionCrystal3Gain?: number

  [key: string]: unknown
}

export interface RawSkill {
  skillCode: string
  probability?: number          // 0..1 — Use Rate
  skillDelayTime?: number       // seconds — Cooldown
  nameCode?: string
  descriptionCode?: string
  iconResourcePath?: string     // e.g. skill_icon_sk1587_es.png
  [key: string]: unknown
}

export interface RawAbility {
  abilityCode: string
  nameCode?: string
  descriptionCode?: string
  iconResourcePath?: string
  // ── Activate / Condition / Probability metadata ──
  actionType?: string
  searchType?: string
  talentType?: string
  activeOnType?: string
  activeWhenType?: string
  activeCondition1Type?: string
  activeCondition1Value?: string
  activeCondition2Type?: string
  activeCondition2Value?: string
  activeProbability?: number
  [key: string]: unknown
}

export interface RawGroupBuff {
  grp_id?: string
  bff_factor_tp?: string
  bff_apply_tp?: string
  rangers?: string[]
  [key: string]: unknown
}

export type RangerTier = 'base8' | 'ultra' | 'hyper' | 'base9'

export interface ComputedStats {
  phyAtk: number
  magAtk: number
  phyDef: number
  magDef: number
  hp: number
  phyDps: number
  cooldown: number           // sec
  attackDelaySec: number
  attackDelayFrames: number  // raw
  combineCount: number
  // ระดับ limit-break ปัจจุบัน (ceil-based, ตรงกับเลข N ของไอคอน {8|8+|8#|9}_N.png และ breakpoint ของ regen time)
  // ต่างจาก combineCount (floor-based, ใช้เฉพาะคูณโบนัส ATK/HP ของ tier base8)
  limitBreakTier: number
  tier: RangerTier
  playerMaxLevel: number
  atMaxUnlimit: boolean
}

// =========== Caches ===========

const rawRangerCache   = new Map<string, RawRanger>()
const rawSkillCache    = new Map<string, RawSkill>()
const rawAbilityCache  = new Map<string, RawAbility>()
const groupBuffsByRanger = new Map<string, RawGroupBuff>()

const skillTranslate    = new Map<string, string>()
const abilityTranslate  = new Map<string, string>()
const propertyTranslate = new Map<string, string>()
const customTranslate   = new Map<string, string>()

let bundleLoaded = false
let bundleLoadingPromise: Promise<void> | null = null

// =========== Bundle loader (lazy + in-flight guard) ===========

export async function ensureRangerBundle(): Promise<void> {
  if (bundleLoaded) return
  if (!bundleLoadingPromise) {
    bundleLoadingPromise = loadRangerBundle().finally(() => { bundleLoadingPromise = null })
  }
  await bundleLoadingPromise
}

async function loadRangerBundle(): Promise<void> {
  console.log('[RangerBundle] loading from game data: rangers + skills + abilities + translations…')
  try {
    rawRangerCache.clear()
    for (const r of gameRangersBasics() as RawRanger[]) if (r.unitCode) rawRangerCache.set(r.unitCode, r)

    rawSkillCache.clear()
    for (const s of gameSkills() as RawSkill[]) if (s.skillCode) rawSkillCache.set(s.skillCode, s)

    const { abilities, groupBuffs } = gameAbilities() as { abilities: RawAbility[]; groupBuffs: RawGroupBuff[] }
    rawAbilityCache.clear()
    groupBuffsByRanger.clear()
    for (const a of abilities) if (a.abilityCode) rawAbilityCache.set(a.abilityCode, a)
    for (const gb of groupBuffs) for (const rId of gb.rangers ?? []) groupBuffsByRanger.set(rId, gb)

    loadTranslationMap(gameText('en', 'SKILL'), skillTranslate)
    loadTranslationMap(gameText('en', 'ABILITY'), abilityTranslate)
    loadTranslationMap(gameText('en', 'PROPERTIES'), propertyTranslate)
    // customTranslate: ข้อความที่ lerico เขียนเอง (ไม่ได้มาจากเกม) — เลิกใช้ ไม่มีที่ไหนเรียก

    bundleLoaded = true
    console.log(
      `[RangerBundle] ready — ${rawRangerCache.size} rangers · ${rawSkillCache.size} skills · ` +
      `${rawAbilityCache.size} abilities · ${groupBuffsByRanger.size} ranger→groupBuff · ` +
      `translations skill/ability/props: ${skillTranslate.size}/${abilityTranslate.size}/${propertyTranslate.size}`
    )
  } catch (err) {
    console.error('[RangerBundle] load failed:', err)
    // Don't flip bundleLoaded — allow retry on next call
  }
}

function loadTranslationMap(data: Record<string, string>, target: Map<string, string>): void {
  target.clear()
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === 'string') target.set(k, v.replace(/\\n/g, ' ').replace(/\n/g, ' ').trim())
  }
}

// =========== Per-ranger fetcher (cache lookup) ===========

export async function getRawRanger(unitCode: string): Promise<RawRanger | null> {
  await ensureRangerBundle()
  return rawRangerCache.get(unitCode) ?? null
}

export function getRawRangerSync(unitCode: string): RawRanger | null {
  return rawRangerCache.get(unitCode) ?? null
}

// =========== Skills / Abilities / Translations ===========

export function getRawSkill(skillCode: string): RawSkill | null {
  return rawSkillCache.get(skillCode) ?? null
}

export function getRawAbility(abilityCode: string): RawAbility | null {
  return rawAbilityCache.get(abilityCode) ?? null
}

export function getGroupBuffForRanger(unitCode: string): RawGroupBuff | null {
  return groupBuffsByRanger.get(unitCode) ?? null
}

export function translateSkill(key: string): string {
  return skillTranslate.get(key) ?? ''
}

export function translateAbility(key: string): string {
  return abilityTranslate.get(key) ?? ''
}

export function translateProperty(key: string): string {
  return propertyTranslate.get(key) ?? ''
}

export function translateCustom(key: string): string {
  return customTranslate.get(key) ?? ''
}

// =========== Tier detection ===========

export function getTier(raw: RawRanger): RangerTier {
  if (raw.isHyperUnit) return 'hyper'
  if (raw.isTranscendentUnit) return 'ultra'
  if (raw.grade === 9) return 'base9'
  return 'base8'
}

export function getTierInfo(raw: RawRanger): {
  tier: RangerTier
  combineMax: number          // 4 (base) / 20 (ultra+hyper)
  maxLevel: number            // raw maxLevel (before unlimit)
  playerMaxLevel: number      // with max unlimit
  tierLabel: string           // เช่น "7★", "7+★", "8★", "8+★", "8#★", "9★"
  tierIconKey: string         // เช่น "7" | "7+" | "8" | "8+" | "8#" | "9"
} {
  const tier = getTier(raw)
  const combineMax = (tier === 'ultra' || tier === 'hyper') ? 20 : 4
  const maxLevel = raw.maxLevel ?? 120
  const playerMaxLevel = maxLevel + combineMax * 5

  // คำนวณ icon key จาก grade จริง + flag ปลดร่าง — รองรับเกรดทั่วไป (1..9)
  // ไฟล์ที่มี: {n}star.png (1..7), {n}+star.png (7,8), 8#star.png, 9star.png
  const grade = typeof raw.grade === 'number' ? raw.grade : 8
  let tierIconKey: string
  let tierLabel: string
  if (raw.isHyperUnit) {
    tierIconKey = `${grade}#`
    tierLabel = `${grade}#★`
  } else if (raw.isTranscendentUnit) {
    tierIconKey = `${grade}+`
    tierLabel = `${grade}+★`
  } else {
    tierIconKey = String(grade)
    tierLabel = `${grade}★`
  }

  return { tier, combineMax, maxLevel, playerMaxLevel, tierLabel, tierIconKey }
}

// =========== Stat formula ===========
// Reverse-engineered from lerico handbook app.js (calcRangerStat):
//
//   i = min(unitLevel - 1, maxLevel - 1)            // normal levels
//   j = max(0, unitLevel - maxLevel)                // unlimit levels
//   f = combineCount = (playerUnitMaxLevel - maxLevel) / 5
//   k = 1 + (trans||hyper||grade==9 ? 0 : 0.2) × f  // base8 only gets combine bonus
//
//   stat = (initial + delta × i + deltaMax × j) × k
//
//   Ranger Regeneration Time — reverse-engineered จาก rangerbook.warmycat.com assets/js/ranger.js
//   (respawnTimeAtLevel): step-tier ตาม limit break, ไม่ใช่ลดครึ่งเดียวตอน MAX เท่านั้น
//     limitBreakTier = min(combineMax, ceil(max(0, level - maxLevel) / 5))   ← ceil ตรงกับไอคอน N_x.png
//     rates(evolved: ultra/hyper) = [0,.01,.02,.03,.05,.07,.09,.12,.15,.18,.20,.22,.24,.26,.28,.30,.33,.36,.40,.45,.50]
//     rates(base8/base9)          = [0, .20, .30, .40, .50]
//     cooldown = max(1.3, productionSpeed × (1 - rates[combineCount]))
//
//   สูตรตัวจริงอยู่ใน rangerLevelCalc.ts (pure function ใช้ร่วมกับฝั่ง client — ปรับเลเวล Ranger Book
//   คำนวณสดในเบราว์เซอร์ได้เลย ไม่ต้องยิง fetch ซ้ำทุกครั้งที่ลากสไลเดอร์)
export function calcRangerStat(raw: RawRanger, unitLevelOverride?: number): ComputedStats {
  const { tier, combineMax, maxLevel, playerMaxLevel } = getTierInfo(raw)

  const r = calcRangerLevelStats(
    {
      initialAttack: raw.initialAttack ?? 0,
      attackIncreaseAmount: raw.attackIncreaseAmount ?? 0,
      attackIncreaseAmountMax: raw.attackIncreaseAmountMax ?? 0,
      specialAttack: raw.specialAttack ?? 0,
      specialAttackDelta: raw.specialAttackDelta ?? 0,
      specialAttackDeltaMax: raw.specialAttackDeltaMax ?? 0,
      defence: raw.defence ?? 0,
      generalDefenceDelta: raw.generalDefenceDelta ?? 0,
      generalDefenceDeltaMax: raw.generalDefenceDeltaMax ?? 0,
      specialDefence: raw.specialDefence ?? 0,
      specialDefenceDelta: raw.specialDefenceDelta ?? 0,
      specialDefenceDeltaMax: raw.specialDefenceDeltaMax ?? 0,
      initialHp: raw.initialHp ?? 0,
      hpIncreaseAmount: raw.hpIncreaseAmount ?? 0,
      hpIncreaseAmountMax: raw.hpIncreaseAmountMax ?? 0,
      productionSpeed: raw.productionSpeed ?? 0,
      attackDelay: raw.attackDelay ?? 30,
    },
    { tier, combineMax, maxLevel, playerMaxLevel },
    unitLevelOverride,
  )

  return { ...r, tier, playerMaxLevel }
}

// =========== Asset URL helpers ===========
//
// ⚠ ห้ามสร้าง URL จาก code อย่างเดียว — ชื่อไฟล์จริงมี descriptor แทรก
// เช่น ab227 → ab227_st_kback_icon.png (ไม่ใช่ ab227_icon.png)
// ใช้ iconResourcePath จาก raw skill/ability เป็นตัวหลัก ถ้าไม่มีค่อย fallback

export function skillIconUrl(skillCode: string, iconResourcePath?: string): string {
  if (iconResourcePath) {
    return `https://rangers.lerico.net/res/skill_icon/${iconResourcePath}`
  }
  // fallback: skill_icon_<code>.png (รูปแบบมาตรฐาน)
  return `https://rangers.lerico.net/res/skill_icon/skill_icon_${skillCode}.png`
}

export function abilityIconUrl(abilityCode: string, iconResourcePath?: string): string {
  if (iconResourcePath) {
    return `https://rangers.lerico.net/res/ability_icon/${iconResourcePath}`
  }
  // fallback: <code>_icon.png (มักผิด แต่เก็บไว้เผื่อกรณีไม่มี iconResourcePath)
  return `https://rangers.lerico.net/res/ability_icon/${abilityCode}_icon.png`
}

// คืน URL จาก raw object โดยตรง (สะดวกกว่า ใช้แทนการเรียก *IconUrl ทุกที่)
export function skillIconUrlFromRaw(raw: RawSkill | null | undefined, code: string): string {
  return skillIconUrl(code, raw?.iconResourcePath)
}

export function abilityIconUrlFromRaw(raw: RawAbility | null | undefined, code: string): string {
  return abilityIconUrl(code, raw?.iconResourcePath)
}

// =========== Category translations ===========
// unitCategoryType (STR/AGI/INT) → "Strength Type" / "Agility Type" / "Intelligence Type"
// keys: ARENA_TYPE_STR / ARENA_TYPE_AGI / ARENA_TYPE_INT

export function categoryLabel(category: string | undefined | null): string | null {
  if (!category) return null
  const key = `ARENA_TYPE_${category.toUpperCase()}`
  const v = propertyTranslate.get(key)
  if (v) return v.replace(/\s+Type$/i, '')   // "Strength Type" → "Strength"
  return category
}

// =========== Ranger Book helpers ===========

export function getAllRawRangers(): RawRanger[] {
  return Array.from(rawRangerCache.values())
}

export function getRawRangerCount(): number {
  return rawRangerCache.size
}
