// ====================================================
// gearLevelCalc — สูตรคำนวณ Gear Effect ตาม enchant/unlimit level (pure function, ไม่มี I/O)
// ใช้ร่วมกันทั้งฝั่ง server (pvpScraper.ts → buildBasicEffect/buildSwitchableEffect/buildSkillPlusEffect)
// และฝั่ง client (GearDetailPopup.tsx ปรับสไลเดอร์ 0-15 ของ gear-book) — คำนวณสดในเบราว์เซอร์ได้เลย
// ไม่ต้องยิง fetch ซ้ำทุกครั้งที่ลากสไลเดอร์
// ====================================================

export interface BasicEffectGrowth {
  maxValue: number
  reinforceType: string
}

export interface SwitchableEffectGrowth {
  baseMax: number
  unlimitStep: number
  reinforceType: string
}

export interface SkillPlusEffectGrowth {
  base: number
  statIncAmt: number[]
  isPct: boolean
  isSec: boolean
}

export function formatValueByReinforce(raw: number, reinforceType: string): string {
  const isPct = /_MUL\b/.test(reinforceType) || /_PCT\b/.test(reinforceType) || /_PROB\b/.test(reinforceType)
  const abs = Math.abs(raw)
  const disp = isPct ? (abs * 100).toFixed(1) : Math.round(abs).toString()
  const sign = raw < 0 ? '-' : '+'
  return `${sign}${disp}${isPct ? '%' : ''}`
}

// Basic Effect: value = maxValue × (enchant + 1)  — enchant 0-5 → คูณ 1x-6x
export function calcBasicEffectValue(g: BasicEffectGrowth, enchant: number): string {
  const raw = g.maxValue * (enchant + 1)
  return formatValueByReinforce(raw, g.reinforceType)
}

// Switchable Effect: value = baseMax + unlimitStep × unlimitLevel  (unlimitLevel 0-5)
export function calcSwitchableEffectValue(g: SwitchableEffectGrowth, unlimitLevel: number): string {
  const total = g.baseMax + g.unlimitStep * unlimitLevel
  return formatValueByReinforce(total, g.reinforceType)
}

// SKILL+: value = base + sum(statIncAmt[0..enchant-1])  (enchant 0-5)
export function calcSkillPlusEffectValue(g: SkillPlusEffectGrowth, enchant: number): string {
  let bonus = 0
  for (let i = 0; i < Math.min(enchant, g.statIncAmt.length); i++) bonus += g.statIncAmt[i] ?? 0
  const total = g.base + bonus
  const abs = Math.abs(total)
  const disp = g.isPct ? (abs * 100).toFixed(1) : (Math.round(abs * 10) / 10).toString()
  const sign = total < 0 ? '-' : '+'
  return `${sign}${disp}${g.isPct ? '%' : g.isSec ? 'sec' : ''}`
}

// ── รวม logic แปลง slider 0-15 → recompute ทั้งชุด GearEffects ──
// ใช้ร่วมกันทั้ง GearDetailPopup (gear-book slider) และ RangerStatPanel (Ranger Book gear level)

// แปลง slider value (0-15) → 3 component levels
// slider 0-5  → basic=N,    switch=0,   skill+=0
// slider 6-10 → basic=5,    switch=N-5, skill+=0
// slider 11-15→ basic=5,    switch=5,   skill+=N-10
export function splitSliderLevel(overall: number): { basic: number; switchable: number; skillPlus: number } {
  return {
    basic:      Math.max(0, Math.min(5, overall)),
    switchable: Math.max(0, Math.min(5, overall - 5)),
    skillPlus:  Math.max(0, Math.min(5, overall - 10)),
  }
}

// ── เลเวลเกียร์รวม 0–20 ตามเกม (game_item_equip: maxEnchant 5 + maxLimitExp 5 + maxSkillPlusUpgrade 5 + maxSpecialUpgrade 5) ──
//   +1–5 Basic Effect (ทุกเกียร์) · +6–10 Switchable Effect (7★+) · +11–15 SKILL+ (8★+) · +16–20 Spec+ (9★)
export const GEAR_LEVEL_STAGES = ['Basic_Effect', 'Switchable_Effect', 'SKILL+', 'Spac+'] as const
export type GearLevelStage = typeof GEAR_LEVEL_STAGES[number]

/** เลเวลสูงสุดของเกียร์ตามดาว: ≤6★ = 5 · 7★ = 10 · 8★ = 15 · 9★ = 20 */
export const gearMaxLevel = (grade: number) => (grade >= 9 ? 20 : grade >= 8 ? 15 : grade >= 7 ? 10 : 5)

/** เลเวลของช่วงนั้น (0–5) ที่เลเวลรวม level — เช่น level 7 → Basic 5 · Switchable 2 */
export const stageLevel = (level: number, stageIndex: number) => Math.max(0, Math.min(5, level - stageIndex * 5))

/** รูปป้ายเลเวลมุมไอคอนเกียร์ (/gacha/images) ของเลเวลรวม 1–20 · 0 = ไม่มีป้าย */
export function gearLevelBadgeUrl(level: number): string | null {
  if (level <= 0) return null
  const i = Math.min(3, Math.floor((level - 1) / 5))
  const n = stageLevel(level, i)
  return `/gacha/images/${GEAR_LEVEL_STAGES[i]}_${n >= 5 ? 'max' : '+' + n}.png`
}

export interface GearEffectLike {
  name: string
  value: string
  nameKey?: string
  basicGrowth?: BasicEffectGrowth
  switchableGrowth?: SwitchableEffectGrowth
  skillPlusGrowth?: SkillPlusEffectGrowth
}

export interface GearEffectsLike<E extends GearEffectLike> {
  itemCode: string
  basic: E[]
  switchable: {
    trigType: string | null
    effect: E | null
    allEffects: { trigType: string | null; effect: E }[]
  } | null
  skillPlus: E[]
}

// คำนวณ GearEffects ทั้งชุดใหม่ที่ sliderLevel (0-15) ใดๆ จาก growth metadata ที่ fetch มาครั้งเดียว (ไม่ fetch ซ้ำ)
export function recalcGearEffects<E extends GearEffectLike>(raw: GearEffectsLike<E>, sliderLevel: number): GearEffectsLike<E> {
  const levels = splitSliderLevel(sliderLevel)
  const recalc = (e: E): E => {
    if (e.basicGrowth) return { ...e, value: calcBasicEffectValue(e.basicGrowth, levels.basic) }
    if (e.switchableGrowth) return { ...e, value: calcSwitchableEffectValue(e.switchableGrowth, levels.switchable) }
    if (e.skillPlusGrowth) return { ...e, value: calcSkillPlusEffectValue(e.skillPlusGrowth, levels.skillPlus) }
    return e
  }
  return {
    ...raw,
    basic: raw.basic.map(recalc),
    switchable: raw.switchable ? {
      ...raw.switchable,
      effect: raw.switchable.effect ? recalc(raw.switchable.effect) : null,
      allEffects: raw.switchable.allEffects.map(o => ({ ...o, effect: recalc(o.effect) })),
    } : null,
    skillPlus: raw.skillPlus.map(recalc),
  }
}
