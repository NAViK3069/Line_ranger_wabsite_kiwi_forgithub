// ====================================================
// Gear Effect Parser
// แปลง GearEffect[] (name + value string) → bonus เชิงตัวเลข ตาม stat key มาตรฐาน
// ใช้ใน Ranger Detail popup เพื่อแสดง "ค่าฐาน (+โบนัสจาก gear)"
// ====================================================

import type { GearEffect, GearEffects } from './pvpScraper'

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
  /** เปอร์เซ็นต์ของแต่ละ effect แยกกัน ไม่ยุบเป็นก้อนเดียว
   *  ค่าแร่ในสนามรบปัดเศษ "ทีละชิ้น" แล้วค่อยบวกกัน ผลรวมก้อนเดียวจึงใช้แทนไม่ได้
   *  (1548 กับเกียร์ -32.4%/-37.2%: ปัดแยกได้ 502+576=1078 แต่ปัดรวมได้ 1077 ต่างกัน 1) */
  pctParts: number[]
}

export type StatBonusMap = Partial<Record<StatKey, StatBonus>>

// ── Parse value string ────────────────────────────────
// "+8.4%"  →  { num: 0.084, isPct: true }
// "+120"   →  { num: 120,   isPct: false }
// "-30%"   →  { num: -0.30, isPct: true }
function parseValue(value: string): { num: number; isPct: boolean } | null {
  if (!value) return null
  const m = value.match(/([+\-]?)([0-9]+(?:\.[0-9]+)?)(%?)/)
  if (!m) return null
  const sign = m[1] === '-' ? -1 : 1
  const numStr = m[2]
  const isPct = m[3] === '%'
  const raw = parseFloat(numStr)
  if (!isFinite(raw)) return null
  return { num: sign * (isPct ? raw / 100 : raw), isPct }
}

// ── Name matchers ────────────────────────────────────
// คืน StatKey หรือ array ของ StatKey (เช่น "Overall ATK" → กระจายไปทั้ง phy+mag)
type ClassifyResult = StatKey | StatKey[] | null

function classify(name: string): ClassifyResult {
  const n = name.toLowerCase()

  // ── Overall / All / Total — กระจายไปทั้ง phy + mag ──
  // ตรวจก่อน physical/magical pattern เพื่อจับให้ทัน
  if (/\b(overall|all|total)\s*atk\b/.test(n)) return ['phyAtk', 'magAtk']
  if (/\b(overall|all|total)\s*def\b/.test(n)) return ['phyDef', 'magDef']

  // ── ATK ──
  if (/(physical|phys)\s*atk|physical attack/.test(n)) return 'phyAtk'
  if (/(magical|magic|mag)\s*atk|magic(al)? attack/.test(n)) return 'magAtk'

  // ── DEF ──
  if (/(physical|phys)\s*def|physical defen[cs]e/.test(n)) return 'phyDef'
  if (/(magical|magic|mag)\s*def|magic(al)? defen[cs]e/.test(n)) return 'magDef'

  // ── HP ──
  if (/(\bhp\b|max hp|health)/.test(n)) return 'hp'

  // ── Crit ──
  if (/critical (rate|prob|chance)/.test(n)) return 'critRate'
  if (/critical (damage|dmg|ratio)/.test(n)) return 'critDamage'

  // ── Skill rate / cooldown / resist ──
  if (/skill (evade|avoid)/.test(n)) return 'skillEvadeRate'
  if (/skill hit/.test(n)) return 'skillHitRate'
  if (/skill resist/.test(n)) return 'skillResistance'
  if (/skill cool ?down|skill cd/.test(n)) return 'skillCooldown'
  if (/skill (use rate|prob|probability|usage)/.test(n)) return 'skillUseRate'

  // ── Hit / Evade ──
  if (/\bevade rate\b|\bavoid rate\b|\bdodge\b/.test(n)) return 'evadeRate'
  if (/\bhit rate\b|\baccuracy\b/.test(n)) return 'hitRate'

  // ── Speed ──
  if (/atk speed|attack speed/.test(n)) return 'atkSpeed'
  if (/move(ment)? speed|moving speed|movespeed/.test(n)) return 'moveSpeed'

  // ── Range / Splash ──
  if (/atk range|attack range/.test(n)) return 'attackRange'
  if (/splash|area damage range|aoe range/.test(n)) return 'splashRadius'

  // ── Cost / Cooldown ──
  // "Mineral Production cost" → จัดเป็น mineralCost (โหลด pattern mineral ก่อน)
  if (/mineral|\bcost\b|\benergy\b|consum/.test(n)) return 'mineralCost'
  if (/(production|spawn|regen|summon).*time|cool ?down(?! reduction)/.test(n)) return 'cooldown'

  return null
}

function add(map: StatBonusMap, key: StatKey, num: number, isPct: boolean) {
  const cur = map[key] ?? { pct: 0, flat: 0, pctParts: [] }
  if (isPct) {
    cur.pctParts.push(num)
    if (key === 'mineralCost') {
      // Multiplicative reduction: ลดจากยอดที่เหลือ ไม่ใช่บวกรวม
      // สูตร: (1 + cur.pct) × (1 + num) − 1
      // เช่น -30%, -30%, -18% → 0.70 × 0.70 × 0.82 − 1 = −0.5982
      // applyBonus จะคำนวณ: base × (1 + pct) = base × 0.4018 ✓
      cur.pct = (1 + cur.pct) * (1 + num) - 1
    } else {
      cur.pct += num
    }
  } else {
    cur.flat += num
  }
  map[key] = cur
}

function ingestEffectArray(map: StatBonusMap, effects: GearEffect[] | undefined) {
  if (!effects) return
  for (const eff of effects) {
    const result = classify(eff.name ?? '')
    if (!result) continue
    const v = parseValue(eff.value ?? '')
    if (!v || v.num === 0) continue
    const keys = Array.isArray(result) ? result : [result]
    for (const k of keys) add(map, k, v.num, v.isPct)
  }
}

// รวม effect จาก gear หลายชิ้น (WPN/AMR/ACC) → bonus map เดียว
// switchableOverrides: ถ้าส่งมา จะใช้แทน option แรก (null = ไม่รวม switchable ของช่องนั้น)
// ถ้าไม่ส่ง switchableOverrides → ใช้ option แรกของแต่ละชิ้น (พฤติกรรมเดิม)
export function aggregateGearBonuses(
  gears: (GearEffects | null | undefined)[],
  switchableOverrides?: (GearEffect | null | undefined)[]
): StatBonusMap {
  const map: StatBonusMap = {}
  for (let i = 0; i < gears.length; i++) {
    const g = gears[i]
    if (!g) continue
    ingestEffectArray(map, g.basic)
    // หมายเหตุ: ไม่รวม g.skillPlus — SKILL+ คือ skill multiplier ไม่ใช่ stat bonus ตรงๆ
    // (เช่น "ATK x n% Area Damage" เพิ่ม damage ของสกิล ไม่ใช่ ATK stat โดยตรง)
    const sw = switchableOverrides
      ? (switchableOverrides[i] ?? null)
      : (g.switchable?.effect ?? null)
    if (sw) ingestEffectArray(map, [sw])
  }
  return map
}

// ── Format helpers ───────────────────────────────────
// คืน "+X%" / "+X" สำหรับใช้แสดงตามหลังค่าฐาน
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

// รวม bonus pct+flat ของ stat ที่มีทั้ง 2 รูปแบบ (เช่น phyAtk)
// คืน base × (1 + pct) + flat
export function applyBonus(base: number, b: StatBonus | undefined): number {
  if (!b) return base
  return base * (1 + b.pct) + b.flat
}

// ส่วนชดเชยในสูตรสมบัติ — ข้อมูลจริง 30 จุดบีบได้ว่าอยู่ระหว่าง 60 ถึง 62
// เลือก 60 ตามที่ชุมชนวิเคราะห์ไว้ ทั้งสามค่าให้ผลเหมือนกันหมดในข้อมูลที่มี
const TREASURE_OFFSET = 60

/** ค่าแร่จริงตอนลงสนามรบ — ต่างจากตัวเลขในเมนู 2 อย่าง
 *
 *  1. สมบัติลดค่าแร่ = floor((ฐาน + 60) / 110) * 10
 *     คิดจาก "ฐาน" ไม่ใช่ค่าหลังใส่เกียร์ ยิ่งใส่เกียร์เยอะยิ่งกินสัดส่วนมาก
 *     ⚠ ไม่ใช่การปัดครึ่งธรรมดา — ตัวชดเชย 60/110 = 0.545 ไม่ใช่ 0.5
 *       ต่างกันตอนเศษของ ฐาน mod 110 อยู่ในช่วง 50-54 เช่น 160 ต้องลด 20 ไม่ใช่ 10
 *  2. เกียร์ในสนามรบคิดจากฐานทีละชิ้น ปัดเศษทีละชิ้น แล้วค่อยบวกกัน
 *     ไม่ใช่คูณต่อกันเหมือนที่เมนูโชว์ และไม่ใช่บวกผลรวมแล้วค่อยปัดทีเดียว
 *
 *  ยืนยันกับข้อมูลจริง 30 จุด (ไม่ใส่เกียร์) และ 5 จุด (ใส่เกียร์) ไม่มีพลาด */
export function inGameMineral(base: number, b: StatBonus | undefined): number {
  const treasure = Math.floor((base + TREASURE_OFFSET) / 110) * 10
  // ปัดจากค่าสัมบูรณ์แล้วค่อยใส่เครื่องหมาย เพื่อให้ทิศการปัดตอนเจอ .5 เท่ากันทั้งบวกและลบ
  const gearCut = (b?.pctParts ?? []).reduce(
    (sum, p) => sum + Math.sign(p) * Math.round(Math.abs(base * p)), 0)
  return Math.max(0, base + gearCut + (b?.flat ?? 0) - treasure)
}

// รวม StatBonusMap สองอัน (เช่น เกียร์ + พรสวรรค์) เข้าด้วยกัน — บวก pct/flat ต่อ key
export function mergeStatBonusMaps(a: StatBonusMap, b: StatBonusMap): StatBonusMap {
  const out: StatBonusMap = { ...a }
  for (const key of Object.keys(b) as StatKey[]) {
    const bb = b[key]
    if (!bb) continue
    const aa = out[key] ?? { pct: 0, flat: 0, pctParts: [] }
    out[key] = {
      pct: aa.pct + bb.pct,
      flat: aa.flat + bb.flat,
      pctParts: [...aa.pctParts, ...bb.pctParts],
    }
  }
  return out
}

// ── Talent bonus parsing ──────────────────────────────
// Enhanced Talent เป็น string เดียวรวม name+value (เช่น "Skill Use Rate +20.0%")
// ต้องเป็นข้อความภาษาอังกฤษเท่านั้น (classify() จับ pattern เป็นภาษาอังกฤษ) — แยกเป็น {name, value}
// แล้วส่งเข้า ingestEffectArray ตัวเดียวกับเกียร์เป๊ะๆ (โลจิกบวกค่าพลังเดียวกันทุกอย่าง)
const TALENT_VALUE_SUFFIX_RE = /([+\-]?\d+(?:\.\d+)?%?)\s*$/

function splitTalentLine(line: string): GearEffect | null {
  const m = line.match(TALENT_VALUE_SUFFIX_RE)
  if (!m || m.index == null) return null
  const value = m[1]
  const name = line.slice(0, m.index).trim()
  if (!name) return null
  return { name, value }
}

// เรนเจอร์ 1 ตัว → รวม bonus จากบรรทัด Enhanced Talent ที่ปลดล็อกแล้ว (ภาษาอังกฤษ)
export function aggregateTalentBonuses(lines: string[] | undefined): StatBonusMap {
  const map: StatBonusMap = {}
  if (!lines?.length) return map
  const effects = lines.map(splitTalentLine).filter((e): e is GearEffect => e !== null)
  ingestEffectArray(map, effects)
  return map
}
