// ====================================================
// rangerLevelCalc — สูตรคำนวณค่าพลังตามเลเวล (pure function, ไม่มี I/O)
// ใช้ร่วมกันทั้งฝั่ง server (rangerData.ts → calcRangerStat) และฝั่ง client
// (RangerStatPanel.tsx ปรับเลเวล Ranger Book) — คำนวณสดในเบราว์เซอร์ได้เลย
// ไม่ต้องยิง fetch ซ้ำทุกครั้งที่ลากสไลเดอร์ (ลื่นไหลแบบ warmycat โดยไม่เพิ่ม cost)
// ====================================================

export type RangerTierKind = 'base8' | 'ultra' | 'hyper' | 'base9'

export interface RangerGrowthInput {
  initialAttack: number
  attackIncreaseAmount: number
  attackIncreaseAmountMax: number
  specialAttack: number
  specialAttackDelta: number
  specialAttackDeltaMax: number
  defence: number
  generalDefenceDelta: number
  generalDefenceDeltaMax: number
  specialDefence: number
  specialDefenceDelta: number
  specialDefenceDeltaMax: number
  initialHp: number
  hpIncreaseAmount: number
  hpIncreaseAmountMax: number
  productionSpeed: number
  attackDelay: number
}

export interface RangerLevelLimits {
  tier: RangerTierKind
  combineMax: number      // 4 (base8/base9) / 20 (ultra/hyper)
  maxLevel: number        // cap เลเวลปกติ (ก่อน limit break)
  playerMaxLevel: number  // cap เต็ม (รวม limit break)
}

export interface RangerLevelStats {
  phyAtk: number
  magAtk: number
  phyDef: number
  magDef: number
  hp: number
  phyDps: number
  cooldown: number
  attackDelaySec: number
  attackDelayFrames: number
  combineCount: number      // floor-based — ใช้คูณโบนัส ATK/HP (tier base8) + regen time
  limitBreakTier: number    // ceil-based — ใช้แสดงไอคอน/label (progress ระหว่างเก็บเลเวล)
  atMaxUnlimit: boolean
}

// ขั้นต่ำเวลาเกิดใหม่ — ยังไม่พบค่านี้ในตาราง game_factor ของเกม (ใช้ค่าเดิมไปก่อน)
const RESPAWN_MIN_SECONDS = 1.3
// อัตราลดเวลาเกิดใหม่ตามจำนวนครั้งปลดลิมิต = ตาราง unit_level_expansion ของเกม (productionSpeedDecreaseRate)
//   evolution (8★/9★ ธรรมดา) 4 ขั้น · transcend / hyper 20 ขั้น — ตรวจแล้วตรงทุกค่า (ไฟล์เกม 2026-11)
const GENERAL_RESPAWN_DECREASE_RATES = [0, 0.20, 0.30, 0.40, 0.50]
const EVOLVED_RESPAWN_DECREASE_RATES = [
  0, 0.01, 0.02, 0.03, 0.05, 0.07, 0.09, 0.12, 0.15, 0.18, 0.20,
  0.22, 0.24, 0.26, 0.28, 0.30, 0.33, 0.36, 0.40, 0.45, 0.50,
]

// สูตรค่าพลังตามเลเวล (initial + delta × เลเวล + deltaMax × เลเวลเกิน) ใช้ค่าจากตาราง unit / unit_reinforce_rate ของเกม
// อัตราลดเวลาเกิดใหม่จากตาราง unit_level_expansion — ดู comment เต็มใน src/lib/rangerData.ts
export function calcRangerLevelStats(
  growth: RangerGrowthInput,
  limits: RangerLevelLimits,
  unitLevelOverride?: number,
): RangerLevelStats {
  const { tier, combineMax, maxLevel, playerMaxLevel } = limits
  const unitLevel = unitLevelOverride ?? playerMaxLevel

  const combineCount = Math.max(0, Math.floor((Math.min(unitLevel, playerMaxLevel) - maxLevel) / 5))
  const i = Math.min(Math.max(0, unitLevel - 1), Math.max(0, maxLevel - 1))
  const j = Math.max(0, unitLevel - maxLevel)
  const k = 1 + ((tier === 'base8') ? 0.2 : 0) * combineCount

  const phyAtk = (growth.initialAttack + growth.attackIncreaseAmount * i + growth.attackIncreaseAmountMax * j) * k
  const magAtk = (growth.specialAttack + growth.specialAttackDelta * i + growth.specialAttackDeltaMax * j) * k
  const phyDef = (growth.defence + growth.generalDefenceDelta * i + growth.generalDefenceDeltaMax * j) * k
  const magDef = (growth.specialDefence + growth.specialDefenceDelta * i + growth.specialDefenceDeltaMax * j) * k
  const hp     = (growth.initialHp + growth.hpIncreaseAmount * i + growth.hpIncreaseAmountMax * j) * k

  const attackDelayFrames = growth.attackDelay > 0 ? growth.attackDelay : 30
  const attackDelaySec = attackDelayFrames > 0 ? attackDelayFrames / 30 : 1
  const phyDps = attackDelaySec > 0 ? phyAtk / attackDelaySec : 0

  // limitBreakTier (ceil) = ใช้แสดงไอคอน/label เท่านั้น (progress ระหว่างเก็บเลเวลไปเป้าหมาย tier ถัดไป)
  // combineCount (floor) = ใช้คำนวณค่าพลังจริง (ATK/HP k-multiplier + regen time — ไม่ลดจนกว่าจะเก็บเลเวลครบเต็ม tier)
  const limitBreakTier = Math.min(combineMax, Math.ceil(Math.max(0, Math.min(unitLevel, playerMaxLevel) - maxLevel) / 5))
  const isEvolvedTier = tier === 'ultra' || tier === 'hyper'
  const respawnRates = isEvolvedTier ? EVOLVED_RESPAWN_DECREASE_RATES : GENERAL_RESPAWN_DECREASE_RATES
  const decreaseRate = respawnRates[combineCount] ?? respawnRates[respawnRates.length - 1]
  const cooldown = Math.max(RESPAWN_MIN_SECONDS, growth.productionSpeed * (1 - decreaseRate))
  const atMaxUnlimit = combineCount >= combineMax

  return {
    phyAtk, magAtk, phyDef, magDef, hp, phyDps,
    cooldown, attackDelaySec, attackDelayFrames,
    combineCount, limitBreakTier, atMaxUnlimit,
  }
}
