// ====================================================
// Switchable Effect Selector — Auto-pick logic
// ====================================================
// เลือก Switchable Effect ที่เหมาะสมที่สุดให้แต่ละ slot (WPN/AMR/ACC) ของเกียร์
//
// ────────────────────────────────────────────────────
// HIGH-LEVEL ALGORITHM
// ────────────────────────────────────────────────────
// 1) แต่ละ slot "เลือก independent" จาก option ที่ดีที่สุดของตัวเอง (ตาม priority list)
//    → WPN, AMR, ACC ไม่สนใจกันในรอบแรก
//
// 2) Duplicate detection (หลังเลือกทั้ง 3 slot):
//    ถ้า 2 slot ได้ effect ชื่อเดียวกัน:
//      a) เปรียบเทียบ **value** → slot ที่ค่าสูงกว่า "ชนะ" (เก็บ effect ไว้)
//      b) ถ้า value เท่ากัน → ใช้ **slotOrder** เป็นตัวตัดสิน (slot ที่ค่า slotOrder น้อยกว่าชนะ)
//      c) Loser → mark duplicate + **re-pick** โดยกรอง name นั้นออก
//
// 3) Iterate จนกว่าจะไม่มี duplicate (max 10 iterations เพื่อ safety)
//
// ────────────────────────────────────────────────────
// SLOT ORDER (ตัดสิน tiebreak):
// ────────────────────────────────────────────────────
//   - Default: { WPN: 0, AMR: 1, ACC: 2 } → ใช้ใน PvP meta (slot order: WPN > AMR > ACC)
//   - Book mode: ส่ง installOrder จริง — slot ที่ install ก่อนจะมีค่าน้อยกว่า → ชนะ tiebreak
//   - ค่าน้อย = ชนะ (เก็บ effect)
//
// ────────────────────────────────────────────────────
// PRIORITY LIST PER SLOT:
// ────────────────────────────────────────────────────
//   WPN  : rangerRegen → mineralCost → fallbackChain
//   AMR  : (STR)     hp → mineralCost → fallbackChain
//          (non-STR) elemental → mineralCost → fallbackChain
//   ACC  : (STR)     mineralCost → fallbackChain
//          (non-STR) elemental → mineralCost → fallbackChain
//
// elemental = elementalProwess (ถ้ามี damage skill) หรือ elementalHit
//
// ────────────────────────────────────────────────────
// FALLBACK CHAIN (depends on current total rates):
// ────────────────────────────────────────────────────
//   skillEvadeRate < 95%  →  ['skillEvade', 'skillResist', 'skillUseRate', 'hp']
//   skillEvadeRate ≥ 95%,
//   skillResistance < 95% →  ['skillResist', 'skillUseRate', 'hp']
//   ทั้งสองเกิน 95%        →  ['skillUseRate', 'hp']
//
// แต่ละ step ใน chain "ข้าม" เองได้ถ้าเกียร์ไม่มี option นั้น → ไป step ต่อไป
// ถ้า chain ทั้งหมดไม่ match → pickByPriority fallback คืน compatible option ตัวแรก
//
// ────────────────────────────────────────────────────
// TYPE COMPATIBILITY:
// ────────────────────────────────────────────────────
// option มี trigType:
//   null         → ใช้ได้กับทุก ranger
//   'STR'|'AGI'|'INT' → ต้องตรงกับ category
//   'FIRE'|'WATER'|'TREE'|'LIGHT'|'DARK' → ต้องตรงกับ element
// option ที่ไม่ compatible ถูก filter ออกก่อนเลือก
//
// ถ้าเกียร์มี switchable แต่ "ไม่มี option ที่ compatible" → mark inactiveReason='type_mismatch'
//
// ────────────────────────────────────────────────────
// CONSISTENCY GUARANTEE:
// ────────────────────────────────────────────────────
// `selectSwitchableEffects` เป็น single source of truth — caller ต้องส่ง gears ของทุก slot
// (รวม slot ที่ popup กำลังแสดง) เพื่อให้ผลลัพธ์ตรงกันระหว่าง picker preview, installed popup,
// และ stat panel display
// ====================================================

import type { GearEffect, GearEffects } from './pvpScraper'
import { effectAmount, effectType } from './gearLevelCalc'

// ──────────────────────────────────────────────────────
// SECTION 1 — Types & Constants
// ──────────────────────────────────────────────────────

export interface RangerContext {
  category: string | null      // 'STR' | 'AGI' | 'INT'
  element: string | null       // 'fire'|'water'|'wood'|'light'|'dark' (normalized lowercase)
  hasDamageSkill: boolean      // มีสกิล (หลัก/ย่อย) ที่ factorType = ATTACK ในตาราง skill — ดู hasAttackFactorSkill()
  skillEvadeRate: number       // total รวม Basic gear bonus แล้ว (0–1, อาจ > 1)
  skillResistance: number      // total รวม Basic gear bonus แล้ว (0–1, อาจ > 1)
}

export type InactiveReason = 'duplicate' | 'type_mismatch'

export interface SwitchableResult {
  effect: GearEffect | null
  active: boolean
  inactiveReason?: InactiveReason
}

export type SlotKey = 'WPN' | 'AMR' | 'ACC'
export type SwitchableResultMap = Record<SlotKey, SwitchableResult>
export type SlotOrder = Record<SlotKey, number>

// Default slot order (PvP meta) — WPN ชนะ tiebreak, ACC แพ้
export const DEFAULT_SLOT_ORDER: SlotOrder = { WPN: 0, AMR: 1, ACC: 2 }

// trigType groups
const ELEM_TRIG_MAP: Record<string, string[]> = {
  FIRE:  ['fire'],
  WATER: ['water'],
  TREE:  ['wood', 'tree', 'nature', 'earth', 'plant'],
  LIGHT: ['light', 'holy'],
  DARK:  ['dark', 'shadow'],
}
const ELEMENT_TRIG_TYPES = new Set(Object.keys(ELEM_TRIG_MAP))
const CATEGORY_TRIG_TYPES = new Set(['STR', 'AGI', 'INT'])

// Priority keys
type PriorityKey =
  | 'rangerRegen'
  | 'elementalProwess'
  | 'elementalHit'
  | 'mineralCost'
  | 'skillEvade'
  | 'skillResist'
  | 'skillUseRate'
  | 'hp'

// Priority key → ชนิดค่าพลังของเกม (unit_eqip_attr.reinforceType) — ไม่อ่านจากชื่อ/ข้อความ
const PRIORITY_TYPES: Record<PriorityKey, string[]> = {
  rangerRegen:      ['PRD_SPE_MUL'],
  elementalProwess: ['EATK_MUL'],
  elementalHit:     ['EHIT_MUL'],
  mineralCost:      ['SUMMON_ENGY_MUL'],
  skillEvade:       ['SKLAVD_PROB_MUL'],
  skillResist:      ['SKLRE_PROB_MUL'],
  skillUseRate:     ['SKL_PROB_MUL'],
  hp:               ['HP_MUL', 'HP_ADD'],
}
const MATCHERS: Record<PriorityKey, (e: GearEffect) => boolean> = Object.fromEntries(
  (Object.keys(PRIORITY_TYPES) as PriorityKey[]).map(k => [k, (e: GearEffect) => PRIORITY_TYPES[k].includes(effectType(e) ?? '')]),
) as Record<PriorityKey, (e: GearEffect) => boolean>

/** ตัวระบุชนิดของ effect — ชนิดเดียวกันจากหลายชิ้น เกมนับแค่ Switchable ค่าสูงสุด (libgame 0x111d8c8) */
export const effectKey = (e: GearEffect): string => effectType(e) ?? e.name

type Option = { trigType: string | null; effect: GearEffect }

const ALL_SLOTS: SlotKey[] = ['WPN', 'AMR', 'ACC']

// ──────────────────────────────────────────────────────
// SECTION 2 — Helpers
// ──────────────────────────────────────────────────────

// Normalize: รองรับ old CDN format ที่ allEffects เป็น GearEffect[] โดยตรง
function normalizeOption(o: { trigType: string | null; effect: GearEffect }): Option {
  if (o.effect != null) return o
  const raw = o as unknown as Record<string, unknown>
  if (typeof raw['name'] === 'string') {
    const trig = typeof raw['trigType'] === 'string' ? (raw['trigType'] as string) : null
    return { trigType: trig, effect: { name: raw['name'] as string, value: String(raw['value'] ?? '') } }
  }
  return o
}

// ตรวจว่า trigType ตรงกับ ranger หรือไม่
function matchesTrigType(
  trigType: string | null,
  category: string | null,
  element: string | null
): boolean {
  if (!trigType) return true
  if (CATEGORY_TRIG_TYPES.has(trigType)) return trigType === category?.toUpperCase()
  if (ELEMENT_TRIG_TYPES.has(trigType)) {
    const targets = ELEM_TRIG_MAP[trigType] ?? []
    return targets.includes(element?.toLowerCase() ?? '')
  }
  return false
}

// Filter: เก็บแค่ options ที่ compatible
function filterCompatible(opts: Option[], category: string | null, element: string | null): Option[] {
  return opts.filter(o => matchesTrigType(o.trigType, category, element))
}

/** ขนาดของค่า effect (ใช้เทียบว่าชิ้นไหนสูงกว่า) — จากค่าตัวเลขดิบ ไม่แกะข้อความ */
export const absEffectValue = (e: GearEffect): number => Math.abs(effectAmount(e))

// ──────────────────────────────────────────────────────
// SECTION 3 — Core: priority builder
// ──────────────────────────────────────────────────────

// Fallback chain ตาม current total rates
function buildFallbackChain(
  skillEvadeRate: number,
  skillResistance: number
): PriorityKey[] {
  if (skillEvadeRate < 0.95)  return ['skillEvade', 'skillResist', 'skillUseRate', 'hp']
  if (skillResistance < 0.95) return ['skillResist', 'skillUseRate', 'hp']
  return ['skillUseRate', 'hp']
}

// Priority list สำหรับแต่ละ slot (NO cross-slot awareness — slot นี้เลือก independent)
function buildPriority(
  slot: SlotKey,
  isSTR: boolean,
  hasDamage: boolean,
  skillEvadeRate: number,
  skillResistance: number
): PriorityKey[] {
  const fallback = buildFallbackChain(skillEvadeRate, skillResistance)
  const elem: PriorityKey = hasDamage ? 'elementalProwess' : 'elementalHit'

  if (slot === 'WPN') return ['rangerRegen', 'mineralCost', ...fallback]

  if (slot === 'AMR') {
    if (isSTR) return ['hp', 'mineralCost', ...fallback]
    return [elem, 'mineralCost', ...fallback]
  }

  // ACC
  if (isSTR) return ['mineralCost', ...fallback]
  return [elem, 'mineralCost', ...fallback]
}

// ──────────────────────────────────────────────────────
// SECTION 4 — Pick logic
// ──────────────────────────────────────────────────────

// หา option แรกที่ match priority key
// ถ้าไม่มี match ไหนเลย → fallback คืน option แรกใน list (ใด ๆ ก็ได้ที่ compatible)
function pickByPriority(opts: Option[], priority: PriorityKey[]): Option | null {
  if (opts.length === 0) return null
  for (const key of priority) {
    const found = opts.find(o => o.effect != null && MATCHERS[key](o.effect))
    if (found) return found
  }
  // Final fallback: คืน option แรกที่ compatible
  return opts.find(o => o.effect != null) ?? null
}

// เลือก switchable option สำหรับ slot — independent (ไม่สน slot อื่น)
function pickForSlot(
  slot: SlotKey,
  rawEffects: Option[],
  ctx: RangerContext,
  excludeNames?: Set<string>,
): Option | null {
  const isSTR = ctx.category?.toUpperCase() === 'STR'

  // 1) Normalize
  const normalized = rawEffects.map(normalizeOption)

  // 2) Filter ตาม type/element compatibility
  let opts = filterCompatible(normalized, ctx.category, ctx.element)

  // 3) Filter ตาม excludeNames (ใช้ตอน re-pick หลัง duplicate)
  if (excludeNames && excludeNames.size > 0) {
    opts = opts.filter(o => !o.effect || !excludeNames.has(effectKey(o.effect)))
  }

  // 4) Build priority + pick
  const priority = buildPriority(slot, isSTR, ctx.hasDamageSkill, ctx.skillEvadeRate, ctx.skillResistance)
  return pickByPriority(opts, priority)
}

// ──────────────────────────────────────────────────────
// SECTION 5 — Effect classification (สำหรับ caller ใช้)
// ──────────────────────────────────────────────────────

function isElementalEffect(effect: GearEffect | null): boolean {
  if (!effect) return false
  return MATCHERS.elementalProwess(effect) || MATCHERS.elementalHit(effect)
}

function isMineralCostEffect(effect: GearEffect | null): boolean {
  if (!effect) return false
  return MATCHERS.mineralCost(effect)
}

// Helper สำหรับ classify AMR pick (ใช้โดย caller ถ้าต้องการ — แต่ logic หลักไม่ต้องการแล้ว)
export function classifyAmrPick(amrEffect: GearEffect | null): {
  amrChoseElem: boolean
  amrChoseMineralCost: boolean
} {
  const amrChoseElem = isElementalEffect(amrEffect)
  const amrChoseMineralCost = !amrChoseElem && isMineralCostEffect(amrEffect)
  return { amrChoseElem, amrChoseMineralCost }
}

// ──────────────────────────────────────────────────────
// SECTION 6 — PUBLIC API: selectSwitchableEffects
// ──────────────────────────────────────────────────────

export function selectSwitchableEffects(
  gears: { WPN: GearEffects | null; AMR: GearEffects | null; ACC: GearEffects | null },
  ctx: RangerContext,
  slotOrder: SlotOrder = DEFAULT_SLOT_ORDER,
): SwitchableResultMap {
  const opts = (g: GearEffects | null): Option[] => g?.switchable?.allEffects ?? []

  // ── Step 1: Initial independent picks ────────────────
  const initial: Record<SlotKey, Option | null> = {
    WPN: pickForSlot('WPN', opts(gears.WPN), ctx),
    AMR: pickForSlot('AMR', opts(gears.AMR), ctx),
    ACC: pickForSlot('ACC', opts(gears.ACC), ctx),
  }

  // ── Step 2: Initial state ────────────────────────────
  const state: SwitchableResultMap = {
    WPN: { effect: initial.WPN?.effect ?? null, active: initial.WPN !== null },
    AMR: { effect: initial.AMR?.effect ?? null, active: initial.AMR !== null },
    ACC: { effect: initial.ACC?.effect ?? null, active: initial.ACC !== null },
  }

  // ── Step 3: Type mismatch detection ──────────────────
  // เกียร์มี switchable แต่ไม่มี compatible option → mark type_mismatch
  for (const s of ALL_SLOTS) {
    if (gears[s]?.switchable && !state[s].effect) {
      state[s].active = false
      state[s].inactiveReason = 'type_mismatch'
    }
  }

  // ── Step 4: Iterative duplicate resolution ───────────
  // แต่ละ iteration:
  //   - หา conflict pair (active slots ที่ effect.name ซ้ำกัน)
  //   - winner ตัดสินด้วย value (สูงกว่าชนะ) → tiebreak ด้วย slotOrder (น้อยกว่าชนะ)
  //   - loser: mark duplicate + re-pick (กรอง name ที่ซ้ำออก)
  //   - ถ้า loser ไม่มี option ใหม่ → คงสภาพ effect เดิม + active=false
  // หยุดเมื่อไม่มี conflict (max 10 iterations safety)
  const excluded: Record<SlotKey, Set<string>> = {
    WPN: new Set(), AMR: new Set(), ACC: new Set(),
  }

  for (let iter = 0; iter < 10; iter++) {
    // หา conflict pair แรกที่เจอ
    let cA: SlotKey | null = null
    let cB: SlotKey | null = null
    outer: for (let i = 0; i < ALL_SLOTS.length; i++) {
      for (let j = i + 1; j < ALL_SLOTS.length; j++) {
        const sA = ALL_SLOTS[i], sB = ALL_SLOTS[j]
        const stA = state[sA], stB = state[sB]
        if (!stA.active || !stB.active || !stA.effect || !stB.effect) continue
        if (effectKey(stA.effect) === effectKey(stB.effect)) {
          cA = sA; cB = sB
          break outer
        }
      }
    }
    if (!cA || !cB) break   // ไม่มี conflict แล้ว

    // ตัดสิน winner/loser
    const eA = state[cA].effect!, eB = state[cB].effect!
    const vA = absEffectValue(eA), vB = absEffectValue(eB)

    let winner: SlotKey, loser: SlotKey
    if (vA > vB) {
      winner = cA; loser = cB
    } else if (vB > vA) {
      winner = cB; loser = cA
    } else {
      // Tie → slotOrder ตัดสิน (น้อยกว่าชนะ = install ก่อน)
      const oA = slotOrder[cA] ?? 0
      const oB = slotOrder[cB] ?? 0
      if (oA <= oB) { winner = cA; loser = cB }
      else { winner = cB; loser = cA }
    }

    // Loser: เพิ่มชื่อ effect ไป excluded list + re-pick
    const dupName = effectKey(state[loser].effect!)
    excluded[loser].add(dupName)

    const newPick = pickForSlot(loser, opts(gears[loser]), ctx, excluded[loser])
    if (newPick) {
      // มี option ใหม่ → ใช้แทน
      state[loser] = { effect: newPick.effect, active: true }
    } else {
      // ไม่มี option เหลือ → คงสภาพ effect เดิม (สำหรับแสดง overlay duplicate)
      state[loser] = {
        effect: state[loser].effect,
        active: false,
        inactiveReason: 'duplicate',
      }
    }
    // unused variable suppression
    void winner
  }

  return state
}

// ──────────────────────────────────────────────────────
// SECTION 7 — PUBLIC API: pickAutoSwitchable (lock-in approach)
// ──────────────────────────────────────────────────────
//
// เลือก auto-pick สำหรับ slot นี้ครั้งเดียวตอนใส่เกียร์ — ไม่ re-compute อีกหลังจากนั้น
// caller (RangerStatPanel) ส่ง lockedOtherEffectNames = ชื่อ effect ที่ slot อื่น "lock" ไว้แล้ว
//   → ฟังก์ชันจะกรองชื่อพวกนั้นออก แล้วเลือก option ที่ดีที่สุดของ slot นี้
//
// Return:
//   - effect:           option ที่เลือก (null ถ้าไม่มี option เหลือ)
//   - inactiveReason:   'duplicate' = ทุก option ของ slot นี้ถูก lock โดย slot อื่นไปแล้ว
//                       'type_mismatch' = เกียร์มี switchable แต่ไม่มี option ที่ compatible

export function pickAutoSwitchable(
  slot: SlotKey,
  ownGearEffects: GearEffects | null,
  ctx: RangerContext,
  lockedOtherEffectNames: string[] = [],
): { effect: GearEffect | null; inactiveReason?: InactiveReason } {
  const allEffects = ownGearEffects?.switchable?.allEffects ?? []
  if (allEffects.length === 0) return { effect: null }

  // 1) ลองเลือกโดยกรอง name ที่ slot อื่น lock ไปแล้ว
  const lockedSet = new Set(lockedOtherEffectNames)
  const picked = pickForSlot(slot, allEffects, ctx, lockedSet)
  if (picked) return { effect: picked.effect }

  // 2) ไม่มี option เหลือ → ตรวจว่าเกียร์มี compatible option ไหม
  const anyCompat = pickForSlot(slot, allEffects, ctx)
  if (!anyCompat) return { effect: null, inactiveReason: 'type_mismatch' }

  // 3) มี compatible option แต่ทุกตัวถูก lock โดย slot อื่น → mark duplicate
  return { effect: anyCompat.effect, inactiveReason: 'duplicate' }
}

// ──────────────────────────────────────────────────────
// SECTION 8 — PUBLIC API: selectSwitchableForSlot (single-slot helper)
// ──────────────────────────────────────────────────────
//
// ใช้ใน GearDetailPopup ที่ต้องการคำนวณ resolved selection สำหรับ slot เดียว
// → caller ต้องส่ง gears ของ slot อื่นมาด้วย (เพื่อให้คำนวณตรงกับ selectSwitchableEffects)
//
// ถ้า caller ไม่ส่ง gears ของ slot อื่น → ฟังก์ชันคำนวณเฉพาะ slot นี้
// (อาจไม่ตรงกับ installed state ถ้ามี cross-slot conflict)

export function selectSwitchableForSlot(
  slot: SlotKey,
  ownGearEffects: GearEffects | null,
  ctx: RangerContext,
  otherGears?: Partial<Record<SlotKey, GearEffects | null>>,
  slotOrder: SlotOrder = DEFAULT_SLOT_ORDER,
): GearEffect | null {
  // Build full gears: own + others
  const gears: { WPN: GearEffects | null; AMR: GearEffects | null; ACC: GearEffects | null } = {
    WPN: slot === 'WPN' ? ownGearEffects : (otherGears?.WPN ?? null),
    AMR: slot === 'AMR' ? ownGearEffects : (otherGears?.AMR ?? null),
    ACC: slot === 'ACC' ? ownGearEffects : (otherGears?.ACC ?? null),
  }

  const result = selectSwitchableEffects(gears, ctx, slotOrder)
  return result[slot].effect
}
