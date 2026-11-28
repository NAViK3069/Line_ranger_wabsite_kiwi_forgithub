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

/** แถวของ eqip_skl_plus_grp — สกิล (หลัก = MAIN / ย่อย = SUB) ที่ SKILL+ ตัวนี้ได้ผล */
export interface SkillPlusMatchRow {
  skillType: string
  factorType: string
  buffFactorType: string
  target: string   // 'MAIN' | 'SUB'
}

export interface SkillPlusEffectGrowth {
  base: number
  statIncAmt: number[]
  isPct: boolean
  isSec: boolean
  // ── ข้อมูลเกมสำหรับจับคู่กับสกิลของเรนเจอร์ (unit_eqip_skl_plus_attr + eqip_skl_plus_grp) ──
  attrNo?: number
  /** attrNumberGroup — SKILL+ กลุ่มเดียวกันจากหลายชิ้นนับตัวที่ค่าสูงสุด */
  group?: number
  /** targetFactor: MAIN = สกิลหลัก · SUB = สกิลย่อย */
  target?: string
  /** skillFactorApplyType: MUL = บวกเข้าตัวคูณของสกิล (%) · ADD = บวกค่าตรงๆ (สกิลย่อย = วินาที) */
  applyType?: string
  rows?: SkillPlusMatchRow[]
}

export function formatValueByReinforce(raw: number, reinforceType: string): string {
  const isPct = /_MUL\b/.test(reinforceType) || /_PCT\b/.test(reinforceType) || /_PROB\b/.test(reinforceType)
  const abs = Math.abs(raw)
  const disp = isPct ? (abs * 100).toFixed(1) : Math.round(abs).toString()
  const sign = raw < 0 ? '-' : '+'
  return `${sign}${disp}${isPct ? '%' : ''}`
}

// ── ค่าตัวเลขดิบ (ใช้คำนวณ) — สูตรเดียวกับข้อความที่แสดง ──
/** GEAR_ENCHANT_ATTR_INCREASE_RATIO (game_factor) = 1.0 → ค่าพื้นฐาน × (1 + 1.0 × enchant) — libgame 0x112df84 */
export const GEAR_ENCHANT_ATTR_INCREASE_RATIO = 1.0
export const basicEffectAmount = (g: BasicEffectGrowth, enchant: number) =>
  g.maxValue * (1 + GEAR_ENCHANT_ATTR_INCREASE_RATIO * enchant)
/** Switchable: ค่าฐาน + ขั้นปลดลิมิต × จำนวนครั้ง (eqip_unlimit.stat_inc_amt) */
export const switchableEffectAmount = (g: SwitchableEffectGrowth, unlimitLevel: number) =>
  g.baseMax + g.unlimitStep * unlimitLevel
/** SKILL+: ค่าฐาน + ผลรวม eqip_skl_plus_upgrd.stat_inc_amt ของขั้นที่อัปแล้ว */
export function skillPlusEffectAmount(g: SkillPlusEffectGrowth, enchant: number): number {
  let bonus = 0
  for (let i = 0; i < Math.min(enchant, g.statIncAmt.length); i++) bonus += g.statIncAmt[i] ?? 0
  return g.base + bonus
}

export function calcBasicEffectValue(g: BasicEffectGrowth, enchant: number): string {
  return formatValueByReinforce(basicEffectAmount(g, enchant), g.reinforceType)
}

export function calcSwitchableEffectValue(g: SwitchableEffectGrowth, unlimitLevel: number): string {
  return formatValueByReinforce(switchableEffectAmount(g, unlimitLevel), g.reinforceType)
}

export function calcSkillPlusEffectValue(g: SkillPlusEffectGrowth, enchant: number): string {
  const total = skillPlusEffectAmount(g, enchant)
  const abs = Math.abs(total)
  const disp = g.isPct ? (abs * 100).toFixed(1) : (Math.round(abs * 10) / 10).toString()
  const sign = total < 0 ? '-' : '+'
  return `${sign}${disp}${g.isPct ? '%' : g.isSec ? 'sec' : ''}`
}

// ── รวม logic แปลง slider 0-15 → recompute ทั้งชุด GearEffects ──
// ใช้ร่วมกันทั้ง GearDetailPopup (gear-book slider) และ RangerStatPanel (Ranger Book gear level)

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
  /** ค่าตัวเลขดิบของ value (เช่น 0.084 = +8.4%) — ใช้คำนวณ ไม่ต้องแกะจากข้อความ */
  amount?: number
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
    if (e.basicGrowth) return { ...e, value: calcBasicEffectValue(e.basicGrowth, levels.basic), amount: basicEffectAmount(e.basicGrowth, levels.basic) }
    if (e.switchableGrowth) return { ...e, value: calcSwitchableEffectValue(e.switchableGrowth, levels.switchable), amount: switchableEffectAmount(e.switchableGrowth, levels.switchable) }
    if (e.skillPlusGrowth) return { ...e, value: calcSkillPlusEffectValue(e.skillPlusGrowth, levels.skillPlus), amount: skillPlusEffectAmount(e.skillPlusGrowth, levels.skillPlus) }
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

/** ค่าตัวเลขของ effect — ใช้ amount ถ้ามี · ไฟล์เก่าที่ยังไม่มี amount คิดจาก growth ที่ระดับสูงสุดของไฟล์ (+5) */
export function effectAmount(e: GearEffectLike): number {
  if (typeof e.amount === 'number') return e.amount
  if (e.basicGrowth) return basicEffectAmount(e.basicGrowth, 5)
  if (e.switchableGrowth) return switchableEffectAmount(e.switchableGrowth, 5)
  if (e.skillPlusGrowth) return skillPlusEffectAmount(e.skillPlusGrowth, 5)
  return 0
}

/** reinforceType ของ effect (Basic / Switchable) — ชนิดค่าพลังตามตาราง unit_eqip_attr */
export const effectType = (e: GearEffectLike): string | null =>
  e.basicGrowth?.reinforceType ?? e.switchableGrowth?.reinforceType ?? null
