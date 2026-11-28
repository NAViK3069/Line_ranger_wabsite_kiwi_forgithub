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
import { resolveFactor } from './skillDetail'

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
  // ── สำหรับตารางรายละเอียดสกิล (skillDetail.ts) ──
  subFactorApplyType?: string
  rsearchRatio?: number
  /** ใช้ได้ในสเตจอีเวนต์ / กับผู้พิทักษ์ (Guardian) / กับโคลอสซัส */
  affectEventStage?: number
  affectGuardian?: number
  affectColossus?: number
  /** ไอคอนเหนือหัวของผลนี้ (skill.attackedEffect = ชื่อเฟรมในชีต skill_effect_icon) */
  attackedEffect?: string
  /** ท่าของไอคอน (skill.skillEffectIconType: MOVE / SCALE / ROTATE / TINT / SHAKE / FLASH) */
  effectIconType?: string
  /**
   * สกิลที่เกมบังคับใช้หน้าป้อมตอนเรนเจอร์ออกจากป้อม (skill.timeSkillProb / timeSkillCnt > 0)
   * delay = skill.timeSkillDelay (วินาทีหลังออกจากป้อม) — ไม่มีช่องนี้ = สกิลปกติ
   */
  spawnCast?: { delay: number; count: number }
}

/** ศักยภาพ 1 ช่อง (potential_stat_group.stat_idN → potential_stat_info) — ช่องที่ N ใช้วัสดุ pt-00N */
export interface PotentialSlot {
  order: number
  id: string
  name: { en: string; th: string }
  /** เลเวลสูงสุดของช่อง (max_lv) */
  max: number
  /** ชนิดค่าพลัง (ชนิดเดียวกับเกียร์) + ค่าต่อ 1 เลเวล */
  types: { type: string; per: number; label: { en: string; th: string } }[]
}

/**
 * ค่าศักยภาพ → รายการ { ชนิด, ค่า } เข้ากองเดียวกับเกียร์ (Basic)
 * libgame: ค่า = grth_val × เลเวล (float32, 0xe797xx) · หน้าข้อมูลรวม Σ% = เกียร์ + ศักยภาพ + … แล้วคิดโบนัสครั้งเดียว (0xe9c2xx)
 */
export function potentialValues(slots: PotentialSlot[] | null | undefined, levels: number[]): { type: string; value: number }[] {
  if (!slots) return []
  return slots.flatMap((s, i) => {
    const lv = Math.max(0, Math.min(s.max, levels[i] ?? 0))
    return lv ? s.types.map(t => ({ type: t.type, value: Math.fround(Math.fround(t.per) * lv) })) : []
  })
}

/** แถวของตาราง ability (+ ความสามารถย่อย) */
export interface AbilityGame {
  code: string
  actionType: string
  aptitudeType: string
  searchType: string
  activeOnType: string
  activeWhenType: string
  cond1Type: string
  cond1Value: string
  cond2Type: string
  cond2Value: string
  probability: number
  factorType: string
  factorApplyType: string
  buffFactorType: string
  buffFactor: number
  subBuffFactor: number
  subs?: AbilityGame[]
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
  /** ต้านสตัน / ต้านการถอยกลับ / ต้านห้ามใช้สกิล (unit.antiStunProb …) */
  antiStun?: number; antiKnockback?: number; antiSilence?: number
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
    antiStun: (b.antiStun ?? 0) + s('ANTI_STUN_MUL'),
    antiKnockback: (b.antiKnockback ?? 0) + s('ANTI_KNOCKBACK_MUL'),
    antiSilence: (b.antiSilence ?? 0) + s('ANTI_SILENCE_MUL'),
    skillProbAdd: s('SKL_PROB_MUL'),
    skillDelayMul: 1 + s('SKDELAY_PROB_MUL'),
  }
}

/** โอกาสใช้สกิลจริง (SkillData 0xd38934): ≥ 0.95 → 95% */
export const skillUseChance = (p: number) => Math.min(0.95, Math.max(0, p))

// ── 4) SKILL+ ↔ สกิลของเรนเจอร์ (eqip_skl_plus_grp) ────────────────────

export interface SkillPlusHit {
  /** สกิลที่ติดตั้ง (หลัก) ที่มีผลนั้นอยู่ */
  skill: SkillGame
  /** ผลของสกิลที่ SKILL+ ไปเพิ่มค่า — ตัวสกิลหลักเอง หรือสกิลย่อยตัวใดก็ได้ในต้นไม้ของมัน */
  node: SkillGame
}

/**
 * สกิลที่ SKILL+ ตัวนี้ได้ผล (eqip_skl_plus_grp)
 *   ไล่ "ทุกผล" ในต้นไม้สกิล (สกิลหลัก + สกิลย่อยทุกตัว) — ผลใดที่ skillType + factorType + buffFactorType
 *   ตรงกับแถวใดแถวหนึ่ง = ได้ผล
 *   targetFactor ไม่ได้แปลว่าสกิลหลัก/ย่อย แต่บอก "ค่าไหนของผลนั้น" ที่ถูกเพิ่ม:
 *     MAIN = factor (ความแรง — คู่กับ MUL ทุกแถว) · SUB = subFactor (ระยะเวลา — คู่กับ ADD วินาที)
 *   เช่น หมวกไวเซอร์สายฟ้า (200370 BUFF/FIXED/SPEED · MAIN) → Yor u1554e ผลย่อย hsk1553_yf_a (BUFF/FIXED/SPEED) ✓
 *   ตรวจกับตัวจับข้อความเดิมทั้งเกม: ตรงกัน 98.4% — ที่ต่างคือข้อความเดิมจับผิด (เช่น "Evade Rate" ไปติด Skill Evade Rate)
 */
export function skillPlusHits(g: SkillPlusEffectGrowth | undefined, skills: SkillGame[]): SkillPlusHit[] {
  const rows = g?.rows ?? []
  if (!rows.length) return []
  const out: SkillPlusHit[] = []
  for (const sk of skills) {
    for (const node of [sk, ...(sk.subs ?? [])]) {
      const hit = rows.some(r => node.skillType === r.skillType && node.factorType === r.factorType && node.buffFactorType === r.buffFactorType)
      if (hit && !out.some(h => h.node === node)) out.push({ skill: sk, node })
    }
  }
  return out
}

/** มีข้อมูลจับคู่จากตารางเกมหรือไม่ (ไฟล์เกียร์รุ่นเก่ายังไม่มี rows) */
export const hasSkillPlusRows = (g: SkillPlusEffectGrowth | undefined) => !!g?.rows?.length

/**
 * ค่าของผลนั้นก่อน → หลัง SKILL+:
 *   MAIN (factor) → เฉพาะความเสียหาย/ฟื้นฟู ที่ factorType = ATTACK / HP (คำอธิบายเกมเขียน "ATK x N%" = factor × 100 ตรงๆ)
 *                   บัฟ/ดีบัฟ (FIXED/GRADE) คำอธิบายเกมแปลงค่าต่างกันไปแต่ละชนิด → แสดงเฉพาะค่าที่เพิ่ม
 *   SUB (subFactor = ระยะเวลา) → ระยะเวลาจริงของผลนั้น (FIXED / GRADE / LEVEL คิดแบบเกม) + วินาทีที่เพิ่ม
 */
export function skillPlusPower(
  g: SkillPlusEffectGrowth, hit: SkillPlusHit, amount: number, grade: number, level: number,
): { before: number; after: number; unit: '%' | 's' | '' } | null {
  const n = hit.node
  if (g.target === 'MAIN') {
    if (n.factorType !== 'ATTACK' && n.factorType !== 'HP') return null
    return { before: n.factor, after: n.factor + amount, unit: '%' }
  }
  if (g.target === 'SUB') {
    const dur = resolveFactor(n.subFactorType, n.subFactorApplyType, n.subFactor, grade, level)
    if (dur == null || dur <= 0) return null
    return { before: dur, after: dur + amount, unit: 's' }
  }
  return null
}

/** มีสกิลโจมตี (factorType ATTACK) ทั้งหลัก/ย่อย — ใช้เลือก Switchable ธาตุ (Prowess vs Hit) */
export const hasAttackFactorSkill = (skills: SkillGame[]) =>
  skills.some(s => s.factorType === 'ATTACK' || (s.subs ?? []).some(x => x.factorType === 'ATTACK'))
