// ====================================================
// rangerTriggerBasis — 觸發基準 (เป้าของสกิล: ตัวเอง / ศัตรูด้านหน้า / ศัตรูแนวหลัง ×N)
// จากข้อมูลเกมของเรา (ตาราง skill — src/lib/gameData.ts):
//   targetType SELF    → self        (เกม setTarget(ตัวเอง) ก่อนยิง)
//   targetType SEARCH  → front       (ศัตรูใกล้สุดในระยะ)
//   targetType RSEARCH → rear × rsearchRatio (ศัตรูไกลสุดในระยะ × ตัวคูณ)
// เดิมแกะจากข้อความจีนใน Rangers_data.json ของ warmycat — ตรวจแล้วตรงกันทุกสกิล (3,095/3,095)
// API เดิม: จับคู่ด้วยชื่อไฟล์ไอคอนสกิลของเรนเจอร์ตัวนั้น
// ====================================================

import { gameTable } from '@/lib/gameData'

export type TriggerBasisType = 'self' | 'front' | 'rear'
export interface TriggerBasis {
  type: TriggerBasisType
  multiplier?: number   // เฉพาะ type === 'rear'
}

// unitCode → { skillIconFilename → TriggerBasis }
let byUnit: Map<string, Record<string, TriggerBasis>> | null = null

function basisOf(skill: Record<string, unknown>): TriggerBasis | null {
  switch (skill.targetType) {
    case 'SELF': return { type: 'self' }
    case 'SEARCH': return { type: 'front' }
    case 'RSEARCH': {
      // ค่าจากเกมตรงๆ — 0 ก็คงไว้ (เกมเก็บ 0 ไว้กับบางสกิล ผู้ใช้ค่าตีความ 0 = ไม่มีตัวคูณ)
      const m = Number(skill.rsearchRatio)
      return Number.isFinite(m) && m >= 0 ? { type: 'rear', multiplier: m } : { type: 'rear' }
    }
    default: return null
  }
}

function build(): Map<string, Record<string, TriggerBasis>> {
  const skills = new Map(gameTable('skill').map(s => [s.skillCode as string, s]))
  const out = new Map<string, Record<string, TriggerBasis>>()
  for (const u of gameTable('unit')) {
    const bySkillIcon: Record<string, TriggerBasis> = {}
    for (const c of [u.skillCode, u.skillCode2, u.skillCode3]) {
      const s = typeof c === 'string' && c ? skills.get(c) : undefined
      const icon = typeof s?.iconResourcePath === 'string' ? s.iconResourcePath : ''
      const tb = s ? basisOf(s) : null
      if (icon && tb && !bySkillIcon[icon]) bySkillIcon[icon] = tb
    }
    if (Object.keys(bySkillIcon).length) out.set(u.unitCode as string, bySkillIcon)
  }
  return out
}

/** เรียกก่อนใช้ getTriggerBasis() — อ่านข้อมูลเกมครั้งเดียว (คง async ไว้ให้ผู้เรียกเดิมใช้ได้) */
export async function ensureTriggerBasisLoaded(unitCode: string): Promise<void> {
  if (!unitCode || byUnit) return
  byUnit = build()
}

export function getTriggerBasis(unitCode: string, skillIcon: string | undefined | null): TriggerBasis | null {
  if (!unitCode || !skillIcon) return null
  if (!byUnit) byUnit = build()
  return byUnit.get(unitCode)?.[skillIcon] ?? null
}
