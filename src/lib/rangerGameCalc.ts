// ====================================================
// rangerGameCalc — ค่าพลังของเรนเจอร์ตามกฎของเกมจริง (pure function, ไม่มี I/O — ใช้ได้ทั้ง server/client)
//
// ทุกสูตรมาจาก libgame.so (v12.4.2) + ตารางเกม (.gamedata) — ไม่อ่าน/เดาจากข้อความใดๆ
//   • ค่าพลังตามเลเวล     fn 0xd55400  — (initial + perLv×(min(L,cap)−1) + perLvMax×max(0,L−cap)) × (1 + rate×n)
//                          rate = game_factor LEVEL_EXPANSION_{ATK,DEF,HP}_INCREASE_RATE(_TRANSCENDENT)
//                          n = จำนวนครั้งปลดลิมิต = floor((L − cap) / LEVEL_EXPANSION_AMOUNT)
//   • โบนัสเกียร์           fn 0x1124d64 — bonus = trunc(base × Σ% + Σflat) · % ทุกแหล่งรวมกันก่อนคูณ
//   • รวมค่าจากหลายชิ้น     fn 0x111d8c8 — Basic บวกกันทุกชิ้น · Switchable นับเฉพาะที่ผ่านเงื่อนไข และเฉพาะค่า |สูงสุด| ตัวเดียวต่อชนิด
//                          ชนิดคูณ (0x111da60: SUMMON_ENGY_MUL, RE_DMG_MUL) = Π(1−|basic|) × (1 − max|sw|)
//   • ความเร็วโจมตี        fn 0xd5d490  — attackDelay' = trunc(delay + r×(−1/(1+r))×delay) (float32)
//   • ความเร็วเดิน          fn 0xd5d490  — movingSpeed += trunc(r×speed + Σflat)
//   • ระยะโจมตี             fn 0xd5d490  — attackRange += trunc(r × range)
//   • ค่าแร่                 fn 0xd5e054  — max(UNIT_MIN_SUMMON_ENERGY, trunc(cost + (r − 1)×cost))
//   • เวลาเกิดใหม่           0x1124f0c + UI 0x132f114 — T' = T + r×T×(1−X) · แสดง max(1.3, T'×(1−X))
//                          X = unit_level_expansion.productionSpeedDecreaseRate[evolutionType][n]
//   • คูลดาวน์สกิล (หน้าข้อมูล) UI 0x132d2c0 — cd × (1 + SKDELAY_PROB_MUL)
// ====================================================

import { effectAmount, effectType, type GearEffectLike, type SkillPlusEffectGrowth } from './gearLevelCalc'

// ── ข้อมูลเกมที่ต้องใช้ (มาจาก /api/meta/ranger-stats → buildRangerStats.ts) ──────────

/** แถวของตาราง skill ที่ใช้คำนวณ (หลัก + สกิลย่อย) */
export interface SkillGame {
  code: string
  skillType: string
  factorType: string
  factorApplyType: string
  factor: number
  buffFactorType: string
  buffFactor: number
  subFactorType: string
  subFactor: number
  probability: number
  delay: number
  range: number
  targetType: string
  subs?: SkillGame[]
}

/** กฎปลดลิมิตของเรนเจอร์ตัวนี้ (game_factor + unit_level_expansion) */
export interface LevelRules {
  /** evolution (8★/9★ ธรรมดา) · transcend (อัลตร้า) · hyper (ไฮเปอร์) */
  evolutionType: string
  /** LEVEL_EXPANSION_AMOUNT — เลเวลต่อการปลดลิมิต 1 ครั้ง */
  step: number
  /** จำนวนครั้งปลดลิมิตสูงสุด */
  maxCount: number
  atkRate: number
  defRate: number
  hpRate: number
  /** productionSpeedDecreaseRate[n] — index 0 = ยังไม่ปลด */
  decreaseRates: number[]
  /** UNIT_PRODUCTION_SPEED_MIN_LIMIT */
  productionMin: number
  /** UNIT_MIN_SUMMON_ENERGY */
  minSummonEnergy: number
}

export interface UnitGrowth {
  initialAttack: number; attackIncreaseAmount: number; attackIncreaseAmountMax: number
  specialAttack: number; specialAttackDelta: number; specialAttackDeltaMax: number
  defence: number; generalDefenceDelta: number; generalDefenceDeltaMax: number
  specialDefence: number; specialDefenceDelta: number; specialDefenceDeltaMax: number
  initialHp: number; hpIncreaseAmount: number; hpIncreaseAmountMax: number
  productionSpeed: number
  attackDelay: number
}

// ── 1) ค่าพลังตามเลเวล ──────────────────────────────────────────

export interface LevelStats {
  level: number
  /** จำนวนครั้งที่ปลดลิมิตครบแล้ว (ใช้คูณค่าพลัง + ลดเวลาเกิดใหม่) */
  expansion: number
  phyAtk: number; magAtk: number; phyDef: number; magDef: number; hp: number
  /** productionSpeedDecreaseRate ที่ใช้อยู่ */
  decreaseRate: number
}

export function levelStats(g: UnitGrowth, rules: LevelRules, cap: number, level: number): LevelStats {
  const L = Math.max(1, Math.min(level, cap + rules.step * rules.maxCount))
  const i = Math.min(L, cap) - 1
  const j = Math.max(0, L - cap)
  const n = Math.min(rules.maxCount, Math.floor(j / rules.step))
  const stat = (init: number, per: number, perMax: number, rate: number) =>
    Math.trunc((init + per * i + perMax * j) * (1 + rate * n))
  return {
    level: L,
    expansion: n,
    phyAtk: stat(g.initialAttack, g.attackIncreaseAmount, g.attackIncreaseAmountMax, rules.atkRate),
    magAtk: stat(g.specialAttack, g.specialAttackDelta, g.specialAttackDeltaMax, rules.atkRate),
    phyDef: stat(g.defence, g.generalDefenceDelta, g.generalDefenceDeltaMax, rules.defRate),
    magDef: stat(g.specialDefence, g.specialDefenceDelta, g.specialDefenceDeltaMax, rules.defRate),
    hp: stat(g.initialHp, g.hpIncreaseAmount, g.hpIncreaseAmountMax, rules.hpRate),
    decreaseRate: rules.decreaseRates[n] ?? 0,
  }
}

// ── 2) รวมค่าจากเกียร์ / พรสวรรค์ ─────────────────────────────────

/** ชนิดที่รวมแบบคูณ (libgame 0x111da60) */
const MULTIPLICATIVE = new Set(['SUMMON_ENGY_MUL', 'RE_DMG_MUL'])

export interface SwitchableInput {
  effect: GearEffectLike
  /** unit_eqip_attr.unitEquipRandOptTrigType — null = ใช้ได้ทุกเรนเจอร์ */
  trigType: string | null
}

/** เงื่อนไขของ Switchable Effect: STR/AGI/INT ต้องตรงสาย · FIRE/WATER/TREE/LIGHT/DARK ต้องตรงธาตุ */
export function switchableConditionMet(trigType: string | null, category: string | null, element: string | null): boolean {
  if (!trigType) return true
  const t = trigType.toUpperCase()
  if (t === 'STR' || t === 'AGI' || t === 'INT') return t === (category ?? '').toUpperCase()
  return t === (element ?? '').toUpperCase()
}

export interface StatTotals {
  /** ค่ารวมต่อชนิด (ชนิดบวก) */
  sum: Record<string, number>
  /** ตัวคูณต่อชนิด (ชนิดคูณ) — ไม่มี = 1 */
  mult: Record<string, number>
}

/**
 * รวมค่าตามกฎเกม: basic (เกียร์ทุกชิ้น + พรสวรรค์) บวกกัน · switchable ที่ผ่านเงื่อนไข นับเฉพาะค่า |สูงสุด| ต่อชนิด
 * switchable ที่ส่งเข้ามาต้องผ่านเงื่อนไขแล้ว (ใช้ switchableConditionMet)
 */
export function totalsOf(basic: { type: string; value: number }[], switchable: { type: string; value: number }[]): StatTotals {
  const basicBy = new Map<string, number[]>()
  for (const b of basic) basicBy.set(b.type, [...(basicBy.get(b.type) ?? []), b.value])
  const swBy = new Map<string, number>()
  for (const s of switchable) {
    const cur = swBy.get(s.type)
    if (cur === undefined || Math.abs(s.value) > Math.abs(cur)) swBy.set(s.type, s.value)
  }
  const sum: Record<string, number> = {}
  const mult: Record<string, number> = {}
  for (const t of new Set([...basicBy.keys(), ...swBy.keys()])) {
    const bs = basicBy.get(t) ?? []
    const sw = swBy.get(t)
    if (MULTIPLICATIVE.has(t)) {
      let r = 1
      for (const v of bs) r *= 1 - Math.abs(v)
      if (sw !== undefined) r *= 1 - Math.abs(sw)
      mult[t] = r
    } else {
      sum[t] = bs.reduce((a, v) => a + v, 0) + (sw ?? 0)
    }
  }
  return { sum, mult }
}

/** basic effects ของเกียร์ → รายการ { ชนิด, ค่า } */
export const typedValues = (effects: GearEffectLike[] | undefined): { type: string; value: number }[] =>
  (effects ?? []).flatMap(e => {
    const type = effectType(e)
    return type ? [{ type, value: effectAmount(e) }] : []
  })

// ── 3) ค่าสุดท้ายที่หน้าข้อมูลเรนเจอร์แสดง ────────────────────────────

export interface UnitBase {
  phyAtk: number; magAtk: number; phyDef: number; magDef: number; hp: number
  attackDelay: number      // เฟรม (30 fps)
  movingSpeed: number
  attackRange: number
  splash: number           // unit.projectileAttackScope
  summonEnergy: number
  productionSpeed: number  // วินาที
  decreaseRate: number     // X ของเลเวลปัจจุบัน
  critRate: number; critRatio: number
  avoid: number; antiAvoid: number
  skillAvoid: number; antiSkillAvoid: number; skillResist: number
}

export interface FinalStats extends Omit<UnitBase, 'decreaseRate'> {
  /** เวลาเกิดใหม่ที่หน้าข้อมูลแสดง (วินาที) */
  regen: number
  /** บวกโอกาสใช้สกิล (SKL_PROB_MUL) */
  skillProbAdd: number
  /** ตัวคูณคูลดาวน์สกิลที่หน้าข้อมูลแสดง (1 + SKDELAY_PROB_MUL) */
  skillDelayMul: number
}

const f32 = Math.fround

export function finalStats(b: UnitBase, t: StatTotals, minRegen: number, minEnergy: number): FinalStats {
  const s = (k: string) => t.sum[k] ?? 0
  const m = (k: string) => t.mult[k] ?? 1
  // bonus = trunc(base × Σ% + Σflat) — ALL_ATK (Overall ATK) เข้าทั้งกายภาพและเวท
  const add = (base: number, pct: number, flat: number) => base + Math.trunc(base * pct + flat)
  const atkSpd = s('ATK_SPE_MUL')
  const delay = atkSpd !== 0
    ? Math.trunc(f32(b.attackDelay + f32(f32(atkSpd * f32(-1 / (1 + atkSpd))) * b.attackDelay)))
    : b.attackDelay
  const prd = s('PRD_SPE_MUL')
  const X = b.decreaseRate
  const tPrime = b.productionSpeed + prd * b.productionSpeed * (1 - X)
  const energyR = m('SUMMON_ENGY_MUL')
  return {
    phyAtk: add(b.phyAtk, s('GATK_MUL') + s('ALL_ATK_MUL'), s('GATK_ADD') + s('ALL_ATK_ADD')),
    magAtk: add(b.magAtk, s('SATK_MUL') + s('ALL_ATK_MUL'), s('SATK_ADD') + s('ALL_ATK_ADD')),
    phyDef: add(b.phyDef, s('GDEF_MUL'), s('GDEF_ADD')),
    magDef: add(b.magDef, s('SDEF_MUL'), s('SDEF_ADD')),
    hp: add(b.hp, s('HP_MUL'), s('HP_ADD')),
    attackDelay: delay,
    movingSpeed: b.movingSpeed + Math.trunc(s('SPE_MUL') * b.movingSpeed + s('SPE_ADD')),
    attackRange: b.attackRange + Math.trunc(s('ATK_RNGE_MUL') * b.attackRange),
    splash: b.splash + Math.trunc(s('ATK_SCOPE_ADD')),
    summonEnergy: Math.max(minEnergy, Math.trunc(b.summonEnergy + (energyR - 1) * b.summonEnergy)),
    productionSpeed: b.productionSpeed,
    regen: Math.max(minRegen, tPrime * (1 - X)),
    critRate: b.critRate + s('CRI_PROB_MUL'),
    critRatio: b.critRatio + s('CRI_DMG_MUL'),
    avoid: b.avoid + s('AVD_PROB_MUL'),
    antiAvoid: b.antiAvoid + s('ANTI_AVD_PROB_MUL'),
    skillAvoid: b.skillAvoid + s('SKLAVD_PROB_MUL'),
    antiSkillAvoid: b.antiSkillAvoid + s('ANTI_SKLAVD_PROB_MUL'),
    skillResist: b.skillResist + s('SKLRE_PROB_MUL'),
    skillProbAdd: s('SKL_PROB_MUL'),
    skillDelayMul: 1 + s('SKDELAY_PROB_MUL'),
  }
}

/** โอกาสใช้สกิลจริง (SkillData 0xd38934): ≥ 0.95 → 95% */
export const skillUseChance = (p: number) => Math.min(0.95, Math.max(0, p))

// ── 4) SKILL+ ↔ สกิลของเรนเจอร์ (eqip_skl_plus_grp) ────────────────────

export interface SkillPlusHit {
  /** สกิลหลักที่ได้ผล */
  skill: SkillGame
  /** สกิลย่อยที่ได้ผล (SKILL+ แบบ SUB) */
  sub?: SkillGame
}

/** สกิลที่ SKILL+ ตัวนี้ได้ผล — skillType + factorType + buffFactorType ต้องตรงกับแถวใดแถวหนึ่งของ eqip_skl_plus_grp */
export function skillPlusHits(g: SkillPlusEffectGrowth | undefined, skills: SkillGame[]): SkillPlusHit[] {
  const rows = g?.rows ?? []
  if (!rows.length) return []
  const same = (s: SkillGame, r: (typeof rows)[number]) =>
    s.skillType === r.skillType && s.factorType === r.factorType && s.buffFactorType === r.buffFactorType
  const out: SkillPlusHit[] = []
  for (const sk of skills) {
    for (const r of rows) {
      if (r.target === 'MAIN') {
        if (same(sk, r) && !out.some(h => h.skill === sk && !h.sub)) out.push({ skill: sk })
      } else {
        for (const sub of sk.subs ?? []) if (same(sub, r) && !out.some(h => h.sub === sub)) out.push({ skill: sk, sub })
      }
    }
  }
  return out
}

/** มีข้อมูลจับคู่จากตารางเกมหรือไม่ (ไฟล์เกียร์รุ่นเก่ายังไม่มี rows) */
export const hasSkillPlusRows = (g: SkillPlusEffectGrowth | undefined) => !!g?.rows?.length

/**
 * ค่าของสกิลก่อน/หลัง SKILL+ — เฉพาะกรณีที่ตารางบอกตรงๆ:
 *   MUL (สกิลหลัก) → บวกเข้า skill.factor (แสดงเป็น %) เมื่อ factorType = ATTACK/HP/FIXED
 *   ADD + SUB       → บวกเข้า subFactor (วินาที) ของสกิลย่อย เมื่อ subFactorType = FIXED
 * กรณีอื่น (factor แบบ GRADE/LEVEL ที่เกมคูณตามระดับ) คืน null = แสดงเฉพาะค่าที่เพิ่ม
 */
export function skillPlusPower(g: SkillPlusEffectGrowth, hit: SkillPlusHit, amount: number): { before: number; after: number; unit: '%' | 's' | '' } | null {
  if (g.applyType === 'MUL' && !hit.sub) {
    const s = hit.skill
    if (!['ATTACK', 'HP', 'FIXED'].includes(s.factorType)) return null
    return { before: s.factor, after: s.factor + amount, unit: '%' }
  }
  if (g.applyType === 'ADD' && hit.sub) {
    if (hit.sub.subFactorType !== 'FIXED') return null
    return { before: hit.sub.subFactor, after: hit.sub.subFactor + amount, unit: 's' }
  }
  return null
}

/** มีสกิลโจมตี (factorType ATTACK) ทั้งหลัก/ย่อย — ใช้เลือก Switchable ธาตุ (Prowess vs Hit) */
export const hasAttackFactorSkill = (skills: SkillGame[]) =>
  skills.some(s => s.factorType === 'ATTACK' || (s.subs ?? []).some(x => x.factorType === 'ATTACK'))
