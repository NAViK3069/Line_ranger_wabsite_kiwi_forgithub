// ====================================================
// buildRangerStats — สร้าง RangerStatsResponse ของ /api/meta/ranger-stats (รันตอน build)
// ====================================================

import {
  getRawSkill,
  getRawAbility,
  getGroupBuffForRanger,
  translateSkill,
  translateAbility,
  getTierInfo,
  calcRangerStat,
  categoryLabel,
  skillIconUrlFromRaw,
  abilityIconUrlFromRaw,
  type RawRanger,
} from '@/lib/rangerData'
import { ensureTriggerBasisLoaded, getTriggerBasis, type TriggerBasis } from '@/lib/rangerTriggerBasis'
import type { RangerGrowthInput } from '@/lib/rangerLevelCalc'
import { gameTable, gameText, gameUnit } from '@/lib/gameData'
import type { AbilityGame, LevelRules, PotentialSlot, SkillGame } from '@/lib/rangerGameCalc'

// ── Response types ──────────────────────────────────

export interface SkillSlot {
  slot: 'skill1' | 'skill2' | 'skill3' | 'passive'
  code: string
  name: string
  description?: string
  iconUrl: string
  probability?: number   // 0..1
  cooldown?: number      // seconds
  area?: number
  triggerBasis?: TriggerBasis   // เป้าของสกิล (self / front enemy / rear enemy ×N) — skill.targetType ของเกม
  /** แถวของตาราง skill (+ สกิลย่อย) — ใช้จับคู่ SKILL+ และคำนวณพลังสกิล */
  game?: SkillGame
}

export interface AbilitySlot {
  slot: 'group' | 'ability1' | 'ability2'
  code: string
  name: string
  description?: string
  iconUrl: string
  // ── Raw ability fields (สำหรับแสดงตาราง Activate/Condition/Probability) ──
  activeOnType?: string         // เช่น "ALL"
  activeWhenType?: string       // เช่น "BATTLE", "INSTANT", "STAGE"
  searchType?: string           // เช่น "ENEMY", "SELF", "ALLY"
  condition1Type?: string       // เช่น "CATEGORY", "NONE"
  condition1Value?: string      // เช่น "INT", "NONE"
  condition2Type?: string
  condition2Value?: string
  probability?: number          // 0–1
  /** แถวของตาราง ability (+ ความสามารถย่อย) — ตารางรายละเอียดความสามารถ */
  game?: AbilityGame
}

export interface RangerStatsResponse {
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

  // raw growth deltas — ให้ client คำนวณค่าพลังที่ level ใดๆ เองได้ (ปรับเลเวล Ranger Book แบบ real-time
  // ไม่ต้องยิง fetch ซ้ำทุกครั้งที่ลากสไลเดอร์) ด้วย calcRangerLevelStats() จาก rangerLevelCalc.ts
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

  /** แล็บ: ของที่ได้จากการแปรรูป + วัสดุอัพเกรดแต่ละแบบ (ตาราง unit + unit_evln_mtrl + game_factor) */
  lab: RangerLab
  /** เอฟเฟกต์สีตอนร่ายสกิล 1 / 2 (unit.skillEffectColor1/2 → res/skill_effect_color/skill_effect_<สี>.sam) */
  skillEffectColors?: { skill1: string | null; skill2: string | null }

  /** ศักยภาพ 5 ช่อง (unit.potentialStatGroup → potential_stat_group → potential_stat_info) · null = ไม่มี */
  potential: PotentialSlot[] | null

  /** ข้อมูลเกมดิบสำหรับคำนวณฝั่งเว็บ (rangerGameCalc.ts) */
  game: {
    levelRules: LevelRules
    attackDelay: number
    movingSpeed: number
    attackRange: number
    splash: number
    summonEnergy: number
    productionSpeed: number
    critRatio: number
    antiStun: number
    antiKnockback: number
    antiSilence: number
  }
}

// ── ข้อมูลเกม: skill / game_factor / unit_level_expansion ─────────

let skillIndex: Map<string, Record<string, unknown>> | null = null
function skillRow(code: string): Record<string, unknown> | null {
  if (!skillIndex) skillIndex = new Map(gameTable('skill').map(s => [String(s.skillCode), s as Record<string, unknown>]))
  return skillIndex.get(code) ?? null
}
const n = (v: unknown, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d)
const str = (v: unknown) => (typeof v === 'string' ? v : '')

function skillGame(code: string, depth = 0): SkillGame | undefined {
  const r = skillRow(code)
  if (!r) return undefined
  const subs = depth === 0
    ? str(r.subSkills).split(',').map(c => c.trim()).filter(Boolean).map(c => skillGame(c, 1)).filter((x): x is SkillGame => !!x)
    : undefined
  return {
    code,
    skillType: str(r.skillType), factorType: str(r.factorType), factorApplyType: str(r.factorApplyType), factor: n(r.factor),
    buffFactorType: str(r.buffFactorType), buffFactor: n(r.buffFactor),
    subFactorType: str(r.subFactorType), subFactor: n(r.subFactor), subFactorApplyType: str(r.subFactorApplyType),
    probability: n(r.probability), delay: n(r.skillDelayTime), range: n(r.range), targetType: str(r.targetType),
    rsearchRatio: n(r.rsearchRatio),
    affectEventStage: n(r.affectEventStage), affectGuardian: n(r.affectGuardian), affectColossus: n(r.affectColossus),
    ...(str(r.attackedEffect) ? { attackedEffect: str(r.attackedEffect), effectIconType: str(r.skillEffectIconType) } : {}),
    ...(subs ? { subs } : {}),
  }
}

/**
 * ศักยภาพของเรนเจอร์: ช่องที่ N ใช้วัสดุ pt-00N (รูป potential_meterial_0N.png)
 * ค่าต่อเลเวล = potential_stat_info.grth_val (ชนิด grth_tp = ชนิดเดียวกับเกียร์) · สูงสุด max_lv ต่อช่อง
 * ชื่อทางการ: PROPERTIES POTENTIAL_TYPE_NAME_<stat_id>_nm · ชื่อย่อยของชนิด POTENTIAL_STAT_<type>_nm
 */
function potentialOf(groupId: string): PotentialSlot[] | null {
  if (!groupId) return null
  const g = gameTable('potential_stat_group').find(r => r.group_id === groupId)
  if (!g) return null
  const info = new Map(gameTable('potential_stat_info').map(r => [String(r.stat_id), r]))
  const en = gameText('en', 'PROPERTIES'), th = gameText('th', 'PROPERTIES')
  const clean = (v: string | undefined) => (v ?? '').replace(/\\n|\n/g, ' ').replace(/\s+/g, ' ').trim()
  const slots: PotentialSlot[] = []
  for (let i = 1; i <= 5; i++) {
    const id = str(g[`stat_id${i}`])
    const r = info.get(id)
    if (!r) continue
    const types = ([1, 2] as const)
      .map(k => ({ type: str(r[`grth_tp${k}`]), per: n(r[`grth_val${k}`]) }))
      .filter(t => t.type)
      .map(t => ({
        ...t,
        label: { en: clean(en[`POTENTIAL_STAT_${t.type}_nm`]), th: clean(th[`POTENTIAL_STAT_${t.type}_nm`]) },
      }))
    slots.push({
      order: i, id, max: n(r.max_lv, 500), types,
      name: { en: clean(en[`POTENTIAL_TYPE_NAME_${id}_nm`]) || id, th: clean(th[`POTENTIAL_TYPE_NAME_${id}_nm`]) },
    })
  }
  return slots.length ? slots : null
}

export interface LabMaterial {
  code: string
  count: number
  /** true = วัสดุเป็นเรนเจอร์ (รูป = ไอคอนเรนเจอร์) · false = ไอเทม (evolve_icon) */
  unit: boolean
  name: { en: string; th: string }
}
export interface LabEvolution {
  /** unit_evln_mtrl.evolveMaterialType: EVOLUTION / TRANSCEND / HYPER / ELEMENT / SWITCH_TRANSCEND / SWITCH_HYPER */
  kind: string
  /** ร่างที่ได้ (unitCodeAfterEvolution / …Transcendence / …Hyper) — null = ไม่เปลี่ยนร่าง */
  target: string | null
  targetName: { en: string; th: string } | null
  /** เหรียญที่ใช้ — game_factor EVOLUTION_NEED_COIN_GRADE<เกรด>[_TRANSCENDENT|_HYPER] · null = ไม่มีในตาราง */
  coin: number | null
  materials: LabMaterial[]
}
export interface RangerLab {
  /** ค่าพื้นฐานจากตาราง unit (extractionCrystal1–3Gain / extractionLeonardSoulGain) */
  extraction: { crystal1: number; crystal2: number; crystal3: number; leonardSoul: number }
  evolution: LabEvolution[]
}

/** ชื่อบรรทัดเดียว — ไทยต่อกันเลย (เกมตัดบรรทัดเพื่อจัดหน้า) · อังกฤษเว้นวรรค */
const oneLineName = (v: string | undefined, sep = ' ') =>
  (v ?? '').replace(/\s*(?:\\n|\n)\s*/g, sep).replace(/\s+/g, ' ').trim()

function labOf(u: Record<string, unknown> | null): RangerLab {
  const extraction = {
    crystal1: n(u?.extractionCrystal1Gain), crystal2: n(u?.extractionCrystal2Gain),
    crystal3: n(u?.extractionCrystal3Gain), leonardSoul: n(u?.extractionLeonardSoulGain),
  }
  if (!u) return { extraction, evolution: [] }
  const code = str(u.unitCode)
  const grade = n(u.grade)
  const unitEn = gameText('en', 'UNIT'), unitTh = gameText('th', 'UNIT')
  const itemEn = gameText('en', 'ITEM'), itemTh = gameText('th', 'ITEM')
  const unitName = (c: string) => ({ en: oneLineName(unitEn[`${c}_nm`]) || c, th: oneLineName(unitTh[`${c}_nm`], '') })
  const rows = gameTable('unit_evln_mtrl').filter(r => r.unitCode === code)
  const kinds = ['EVOLUTION', 'TRANSCEND', 'HYPER', 'ELEMENT', 'SWITCH_TRANSCEND', 'SWITCH_HYPER']
  const targetOf: Record<string, string> = {
    EVOLUTION: str(u.unitCodeAfterEvolution), TRANSCEND: str(u.unitCodeAfterTranscendence), HYPER: str(u.unitCodeAfterHyper),
  }
  const coinOf = (kind: string): number | null => {
    const suffix = kind === 'TRANSCEND' ? '_TRANSCENDENT' : kind === 'HYPER' ? '_HYPER' : kind === 'EVOLUTION' ? '' : null
    if (suffix == null) return null
    const v = factor(`EVOLUTION_NEED_COIN_GRADE${grade}${suffix}`, NaN)
    return isFinite(v) ? v : null
  }
  const evolution: LabEvolution[] = []
  for (const kind of kinds) {
    const list = rows.filter(r => r.evolveMaterialType === kind).sort((a, b) => n(a.sort) - n(b.sort))
    if (!list.length) continue
    const target = targetOf[kind] || null
    evolution.push({
      kind, target, targetName: target ? unitName(target) : null, coin: coinOf(kind),
      materials: list.map(r => {
        const c = str(r.materialItemCode)
        const isUnit = /^[ug]\d/.test(c)
        return {
          code: c, count: n(r.count), unit: isUnit,
          name: isUnit ? unitName(c) : { en: oneLineName(itemEn[`${c}_nm`]) || c, th: oneLineName(itemTh[`${c}_nm`], '') },
        }
      }),
    })
  }
  return { extraction, evolution }
}

let abilityIndex: Map<string, Record<string, unknown>> | null = null
function abilityGame(code: string, depth = 0): AbilityGame | undefined {
  if (!abilityIndex) abilityIndex = new Map(gameTable('ability').map(a => [String(a.code), a as Record<string, unknown>]))
  const r = abilityIndex.get(code)
  if (!r) return undefined
  const subs = depth < 2
    ? str(r.subAbilities).split(',').map(c => c.trim()).filter(Boolean).map(c => abilityGame(c, depth + 1)).filter((x): x is AbilityGame => !!x)
    : []
  return {
    code,
    actionType: str(r.actionType), aptitudeType: str(r.aptitudeType), searchType: str(r.searchType),
    activeOnType: str(r.activeOnType), activeWhenType: str(r.activeWhenType),
    cond1Type: str(r.activeCondition1Type), cond1Value: str(r.activeCondition1Value),
    cond2Type: str(r.activeCondition2Type), cond2Value: str(r.activeCondition2Value),
    probability: n(r.activeProbability, 1),
    factorType: str(r.factorType), factorApplyType: str(r.factorApplyType),
    buffFactorType: str(r.buffFactorType), buffFactor: n(r.buffFactor), subBuffFactor: n(r.subBuffFactor),
    ...(subs.length ? { subs } : {}),
  }
}
export { abilityGame }

let factorIndex: Map<string, string> | null = null
function factor(name: string, d: number): number {
  if (!factorIndex) factorIndex = new Map(gameTable('game_factor').map(f => [String(f.factor).trim(), String(f.val)]))
  const v = parseFloat(factorIndex.get(name) ?? '')
  return isFinite(v) ? v : d
}

/**
 * กฎปลดลิมิตตามชนิดเรนเจอร์:
 *   อัลตร้า (transcend) / ไฮเปอร์ (hyper) → ค่า *_TRANSCENDENT ของ game_factor + ตาราง 20 ขั้น
 *   8★ ธรรมดา (evolution) → LEVEL_EXPANSION_*_INCREASE_RATE (0.2 ต่อครั้ง) + ตาราง 4 ขั้น
 *   9★ ใช้ตาราง evolution (4 ขั้น) แต่ค่าพลังไม่คูณเพิ่ม (ยืนยันกับเกม: n=0 ได้ค่า Lv.180 ตรง)
 */
function levelRulesOf(tier: RangerStatsResponse['tier']): LevelRules {
  const evolutionType = tier === 'ultra' ? 'transcend' : tier === 'hyper' ? 'hyper' : 'evolution'
  const rows = gameTable('unit_level_expansion').filter(r => r.evolutionType === evolutionType)
  const maxCount = rows.reduce((m, r) => Math.max(m, n(r.levelExpansionCount)), 0)
  const decreaseRates = [0, ...Array.from({ length: maxCount }, (_, i) =>
    n(rows.find(r => n(r.levelExpansionCount) === i + 1)?.productionSpeedDecreaseRate))]
  const trans = evolutionType !== 'evolution'
  const noGrowth = trans || tier === 'base9'
  const rate = (k: string) => (noGrowth ? factor(`LEVEL_EXPANSION_${k}_INCREASE_RATE_TRANSCENDENT`, 0) : factor(`LEVEL_EXPANSION_${k}_INCREASE_RATE`, 0.2))
  return {
    evolutionType,
    step: trans ? factor('LEVEL_EXPANSION_AMOUNT_TRANSCENDENT', 5) : factor('LEVEL_EXPANSION_AMOUNT', 5),
    maxCount,
    atkRate: rate('ATK'), defRate: rate('DEF'), hpRate: rate('HP'),
    decreaseRates,
    productionMin: factor('UNIT_PRODUCTION_SPEED_MIN_LIMIT', 1.3),
    minSummonEnergy: factor('UNIT_MIN_SUMMON_ENERGY', 1),
  }
}

// ── Skill builder ───────────────────────────────────

export async function buildSkills(raw: RawRanger): Promise<SkillSlot[]> {
  const entries: { slot: SkillSlot['slot']; code?: string }[] = [
    { slot: 'skill1',  code: raw.skillCode         },
    { slot: 'skill2',  code: raw.skillCode2        },
    { slot: 'skill3',  code: raw.skillCode3        },
    { slot: 'passive', code: raw.passiveSkillCode  },
  ]

  const unitCode = raw.unitCode ?? ''
  await ensureTriggerBasisLoaded(unitCode)

  const out: SkillSlot[] = []
  for (const { slot, code } of entries) {
    if (!code) continue
    const rawSk = getRawSkill(code)
    const name = translateSkill(`${code}_nm`) || translateSkill(code) || code
    const description = translateSkill(`${code}_desc`) || undefined

    // ระยะสกิล = skill.range ของเกม
    const range = (rawSk as Record<string, unknown> | null)?.range
    const area = typeof range === 'number' && range > 0 ? range : undefined

    const triggerBasis = getTriggerBasis(unitCode, rawSk?.iconResourcePath) ?? undefined

    out.push({
      slot,
      code,
      name,
      description,
      iconUrl: skillIconUrlFromRaw(rawSk, code),
      probability:   typeof rawSk?.probability    === 'number' ? rawSk.probability    : undefined,
      cooldown:      typeof rawSk?.skillDelayTime === 'number' ? rawSk.skillDelayTime : undefined,
      area,
      triggerBasis,
      game: skillGame(code),
    })
  }
  return out
}

// ── Ability builder ─────────────────────────────────

export function buildAbilities(raw: RawRanger, unitCode: string): AbilitySlot[] {
  const out: AbilitySlot[] = []
  const seenCodes = new Set<string>()

  // Slot 1: Group Buff
  let groupCode: string | undefined
  if (raw.abilityCode && (raw.abilityCategoryCode === 'ab701_team' || raw.abilityCode.startsWith('ab701_team'))) {
    groupCode = raw.abilityCode
  } else if (raw.abilityCode2 && (raw.abilityCategoryCode2 === 'ab701_team' || raw.abilityCode2.startsWith('ab701_team'))) {
    groupCode = raw.abilityCode2
  } else {
    void getGroupBuffForRanger(unitCode) // side-effect lookup only; grp_id has no abilityCode equivalent
  }

  if (groupCode) {
    const rawGroupAb = getRawAbility(groupCode)
    out.push({
      slot: 'group',
      code: groupCode,
      name: translateAbility(`${groupCode}_nm`) || translateAbility(groupCode) || groupCode,
      description: translateAbility(`${groupCode}_desc`) || undefined,
      iconUrl: abilityIconUrlFromRaw(rawGroupAb, groupCode),
      activeOnType:    rawGroupAb?.activeOnType,
      activeWhenType:  rawGroupAb?.activeWhenType,
      searchType:      rawGroupAb?.searchType,
      condition1Type:  rawGroupAb?.activeCondition1Type,
      condition1Value: rawGroupAb?.activeCondition1Value,
      condition2Type:  rawGroupAb?.activeCondition2Type,
      condition2Value: rawGroupAb?.activeCondition2Value,
      probability:     rawGroupAb?.activeProbability,
      game:            abilityGame(groupCode),
    })
    seenCodes.add(groupCode)
  }

  // Slot 2 & 3: regular abilities
  const remaining = [raw.abilityCode, raw.abilityCode2, raw.abilityCode3].filter(
    (c): c is string => !!c && !seenCodes.has(c)
  )

  let abilityIdx: 1 | 2 = 1
  for (const code of remaining) {
    if (abilityIdx > 2) break
    const slot: AbilitySlot['slot'] = abilityIdx === 1 ? 'ability1' : 'ability2'
    const rawAb = getRawAbility(code)
    out.push({
      slot,
      code,
      name: translateAbility(`${code}_nm`) || translateAbility(code) || code,
      description: translateAbility(`${code}_desc`) || undefined,
      iconUrl: abilityIconUrlFromRaw(rawAb, code),
      activeOnType:    rawAb?.activeOnType,
      activeWhenType:  rawAb?.activeWhenType,
      searchType:      rawAb?.searchType,
      condition1Type:  rawAb?.activeCondition1Type,
      condition1Value: rawAb?.activeCondition1Value,
      condition2Type:  rawAb?.activeCondition2Type,
      condition2Value: rawAb?.activeCondition2Value,
      probability:     rawAb?.activeProbability,
      game:            abilityGame(code),
    })
    seenCodes.add(code)
    abilityIdx = (abilityIdx + 1) as 1 | 2
  }

  return out
}

// ── Main builder ────────────────────────────────────

export async function buildRangerStatsResponse(
  raw: RawRanger,
  rangerId: string,
  levelOverride?: number,
): Promise<RangerStatsResponse> {
  const stats = calcRangerStat(raw, levelOverride)
  const unitRow = gameUnit(raw.unitCode ?? rangerId) as Record<string, unknown> | null
  const { tier, combineMax, maxLevel, playerMaxLevel, tierLabel, tierIconKey } = getTierInfo(raw)
  const cat = (raw.unitCategoryType ?? null) as string | null
  const catLabel = categoryLabel(cat)

  const critDamageBonus = typeof raw.criticalRatio === 'number'
    ? Math.max(0, raw.criticalRatio - 1)
    : 0

  return {
    id: rangerId,
    imageUrl: `https://rangers.lerico.net/res/${rangerId}/${rangerId}-thum.png`,

    tier,
    tierLabel,
    tierIconKey,
    grade: typeof raw.grade === 'number' ? raw.grade : null,
    maxLevel,
    playerMaxLevel,
    unlimitMax: combineMax,

    category: cat,
    categoryLabel: catLabel,
    element: typeof raw.unitElement === 'string' ? raw.unitElement : null,
    mineral: typeof raw.summonEnergy === 'number' ? raw.summonEnergy : null,
    leonardMax: typeof raw.maxLeonardPoint === 'number' ? raw.maxLeonardPoint : null,
    attackRange: typeof raw.attackRange === 'number' ? raw.attackRange : null,
    attackScope: typeof raw.attackScope === 'number' ? raw.attackScope : null,
    splashRadius: typeof raw.projectileAttackScope === 'number' ? raw.projectileAttackScope : null,

    attackSpeedType: typeof raw.attackSpeedType === 'string' ? raw.attackSpeedType : null,
    moveSpeedType:   typeof raw.moveSpeedType   === 'string' ? raw.moveSpeedType   : null,
    movingSpeed:     typeof raw.movingSpeed     === 'number' ? raw.movingSpeed     : null,

    baseStats: {
      phyAtk: stats.phyAtk,
      magAtk: stats.magAtk,
      phyDef: stats.phyDef,
      magDef: stats.magDef,
      hp: stats.hp,
      phyDps: stats.phyDps,
      cooldown: stats.cooldown,
      attackDelayFrames: stats.attackDelayFrames,
      attackDelaySec: stats.attackDelaySec,
      atMaxUnlimit: stats.atMaxUnlimit,
      limitBreakTier: stats.limitBreakTier,
    },

    growth: {
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

    rates: {
      critRate:        typeof raw.criticalProbability     === 'number' ? raw.criticalProbability     : 0,
      critDamage:      critDamageBonus,
      evadeRate:       typeof raw.avoidProbability        === 'number' ? raw.avoidProbability        : 0,
      skillEvadeRate:  typeof raw.skillAvoidProbability   === 'number' ? raw.skillAvoidProbability   : 0,
      skillResistance: typeof raw.skillResistance         === 'number' ? raw.skillResistance         : 0,
      hitRate:         typeof raw.antiAvoidProb           === 'number' ? raw.antiAvoidProb           : 0,
      skillHitRate:    typeof raw.antiSkillAvoidProb      === 'number' ? raw.antiSkillAvoidProb      : 0,
    },

    skills: await buildSkills(raw),
    abilities: buildAbilities(raw, rangerId),

    lab: labOf(unitRow),
    skillEffectColors: { skill1: str(unitRow?.skillEffectColor1) || null, skill2: str(unitRow?.skillEffectColor2) || null },

    // ช่องที่ rangerData ไม่ได้ส่งมา → อ่านจากตาราง unit โดยตรง
    potential: potentialOf(str(unitRow?.potentialStatGroup)),

    game: {
      levelRules: levelRulesOf(tier),
      attackDelay: raw.attackDelay ?? 30,
      movingSpeed: raw.movingSpeed ?? 0,
      attackRange: raw.attackRange ?? 0,
      splash: raw.projectileAttackScope ?? 0,
      summonEnergy: raw.summonEnergy ?? 0,
      productionSpeed: raw.productionSpeed ?? 0,
      critRatio: typeof raw.criticalRatio === 'number' ? raw.criticalRatio : 1,
      antiStun: n(unitRow?.antiStunProb),
      antiKnockback: n(unitRow?.antiKnockbackProb),
      antiSilence: n(unitRow?.antiSilenceProb),
    },
  }
}
