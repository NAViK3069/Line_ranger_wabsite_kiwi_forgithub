// ====================================================
// Gear Effect Parser
// แปลง GearEffect[] → bonus เชิงตัวเลข ตาม stat key มาตรฐาน
// ชนิดของค่าพลังมาจาก reinforceType ของเกม (unit_eqip_attr) และค่าตัวเลขดิบ (amount) — ไม่อ่านจากชื่อ/ข้อความ
// ใช้ในหน้า gear-options tutorials · หน้าข้อมูลเรนเจอร์ใช้ rangerGameCalc.ts (กฎรวมค่าของเกมเต็มรูปแบบ)
// ====================================================

import type { GearEffect, GearEffects } from './pvpScraper'
import { effectAmount, effectType } from './gearLevelCalc'

export type StatKey =
  | 'phyAtk' | 'magAtk' | 'hp' | 'phyDef' | 'magDef'
  | 'critRate' | 'critDamage'
  | 'evadeRate' | 'hitRate'
  | 'skillEvadeRate' | 'skillHitRate' | 'skillResistance'
  | 'skillCooldown' | 'skillUseRate'
  | 'atkSpeed' | 'moveSpeed'
  | 'attackRange' | 'splashRadius'
  | 'cooldown' | 'mineralCost'

export interface StatBonus {
  // Percentage bonuses are stored as fraction (0.18 = +18%)
  // Flat bonuses are absolute numbers
  pct: number
  flat: number
  /** เปอร์เซ็นต์ของแต่ละ effect แยกกัน */
  pctParts: number[]
}

export type StatBonusMap = Partial<Record<StatKey, StatBonus>>

/** reinforceType ของเกม → stat key + เป็น % (MUL) หรือค่าตรง (ADD) */
const TYPE_MAP: Record<string, { keys: StatKey[]; pct: boolean }> = {
  GATK_ADD: { keys: ['phyAtk'], pct: false }, GATK_MUL: { keys: ['phyAtk'], pct: true },
  SATK_ADD: { keys: ['magAtk'], pct: false }, SATK_MUL: { keys: ['magAtk'], pct: true },
  ALL_ATK_ADD: { keys: ['phyAtk', 'magAtk'], pct: false }, ALL_ATK_MUL: { keys: ['phyAtk', 'magAtk'], pct: true },
  GDEF_ADD: { keys: ['phyDef'], pct: false }, GDEF_MUL: { keys: ['phyDef'], pct: true },
  SDEF_ADD: { keys: ['magDef'], pct: false }, SDEF_MUL: { keys: ['magDef'], pct: true },
  HP_ADD: { keys: ['hp'], pct: false }, HP_MUL: { keys: ['hp'], pct: true },
  CRI_PROB_MUL: { keys: ['critRate'], pct: true },
  CRI_DMG_MUL: { keys: ['critDamage'], pct: true },
  AVD_PROB_MUL: { keys: ['evadeRate'], pct: true },
  ANTI_AVD_PROB_MUL: { keys: ['hitRate'], pct: true },
  SKLAVD_PROB_MUL: { keys: ['skillEvadeRate'], pct: true },
  ANTI_SKLAVD_PROB_MUL: { keys: ['skillHitRate'], pct: true },
  SKLRE_PROB_MUL: { keys: ['skillResistance'], pct: true },
  SKDELAY_PROB_MUL: { keys: ['skillCooldown'], pct: true },
  SKL_PROB_MUL: { keys: ['skillUseRate'], pct: true },
  ATK_SPE_MUL: { keys: ['atkSpeed'], pct: true },
  SPE_ADD: { keys: ['moveSpeed'], pct: false }, SPE_MUL: { keys: ['moveSpeed'], pct: true },
  ATK_RNGE_MUL: { keys: ['attackRange'], pct: true },
  ATK_SCOPE_ADD: { keys: ['splashRadius'], pct: false },
  PRD_SPE_MUL: { keys: ['cooldown'], pct: true },
  SUMMON_ENGY_MUL: { keys: ['mineralCost'], pct: true },
}

function add(map: StatBonusMap, key: StatKey, num: number, isPct: boolean) {
  const cur = map[key] ?? { pct: 0, flat: 0, pctParts: [] }
  if (isPct) {
    cur.pctParts.push(num)
    // ค่าแร่รวมแบบคูณ (libgame 0x111da60): Π(1 − |v|)
    if (key === 'mineralCost') cur.pct = (1 + cur.pct) * (1 - Math.abs(num)) - 1
    else cur.pct += num
  } else {
    cur.flat += num
  }
  map[key] = cur
}

function ingestEffectArray(map: StatBonusMap, effects: GearEffect[] | undefined) {
  for (const eff of effects ?? []) {
    const t = TYPE_MAP[effectType(eff) ?? '']
    if (!t) continue
    const v = effectAmount(eff)
    if (!v) continue
    for (const k of t.keys) add(map, k, v, t.pct)
  }
}

// รวม effect จาก gear หลายชิ้น (WPN/AMR/ACC) → bonus map เดียว
// switchableOverrides: ถ้าส่งมา จะใช้แทน option แรก (null = ไม่รวม switchable ของช่องนั้น)
export function aggregateGearBonuses(
  gears: (GearEffects | null | undefined)[],
  switchableOverrides?: (GearEffect | null | undefined)[]
): StatBonusMap {
  const map: StatBonusMap = {}
  for (let i = 0; i < gears.length; i++) {
    const g = gears[i]
    if (!g) continue
    ingestEffectArray(map, g.basic)
    // SKILL+ ไม่ใช่ค่าพลังของเรนเจอร์ (บวกเข้าสกิล) — ไม่รวม
    const sw = switchableOverrides ? (switchableOverrides[i] ?? null) : (g.switchable?.effect ?? null)
    if (sw) ingestEffectArray(map, [sw])
  }
  return map
}

// ── Format helpers ───────────────────────────────────
export function formatBonusPct(b: StatBonus | undefined): string {
  if (!b || b.pct === 0) return ''
  const v = b.pct * 100
  const rounded = Math.abs(v) < 10 ? v.toFixed(1) : v.toFixed(0)
  return `${v >= 0 ? '+' : ''}${rounded}%`
}

export function formatBonusFlat(b: StatBonus | undefined, digits = 0): string {
  if (!b || b.flat === 0) return ''
  const v = b.flat
  const rounded = digits > 0 ? v.toFixed(digits) : Math.round(v).toString()
  return `${v >= 0 ? '+' : ''}${rounded}`
}

// base × (1 + pct) + flat
export function applyBonus(base: number, b: StatBonus | undefined): number {
  if (!b) return base
  return base * (1 + b.pct) + b.flat
}
