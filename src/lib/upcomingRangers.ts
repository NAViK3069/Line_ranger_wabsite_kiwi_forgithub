// ====================================================
// เรนเจอร์ตัวใหม่ที่ไฟล์อนิเมชั่นขึ้น lerico แล้ว แต่ยังไม่เข้าเกมอย่างเป็นทางการ
// (ยังไม่อยู่ใน Ranger Book — ไม่มีชื่อ / ค่าพลัง / เลเวล / พรสวรรค์)
// ใส่ไว้ให้เลือกได้ก่อนใน Video Studio (/custom-video) และ /lobby — อนิเมชั่นโหลดจาก lerico ตามปกติ (ท่า idle)
//
// ⚠️ ของชั่วคราว: พอเกมอัปเดตตัวละครเหล่านี้มาจริงแล้ว ข้อมูลทางการจะถูกใช้แทนเองอัตโนมัติ
//    - ตัวเลือกเรนเจอร์: ถ้า Ranger Book มีไอดีนี้แล้ว ใช้แถวของ Book (ไม่ซ้ำ)
//    - /lobby: ถ้า /api/meta/ranger-stats ตอบข้อมูลจริงได้ ใช้ของจริง (ค่าข้างล่างใช้เฉพาะตอนยังไม่มี)
//    แล้วค่อยลบรายการในไฟล์นี้ทิ้ง
// ====================================================

import type { RangerRow } from '@/app/lobby/RangerPicker'
import { isHiddenRanger } from './hiddenRangers'

interface UpcomingDef {
  id: string
  grade: number
  evolution: 'normal' | 'hyper' | 'ultra'
  /** ระดับตามกฎฐานยืนของ /lobby (ดู RangerFacts ใน lobby/team.ts) */
  tier: 'base8' | 'ultra' | 'hyper' | 'base9'
  /** ชื่อไฟล์ดาว: "9" | "8+" | "8#" | "8" */
  tierIconKey: string
  /** เลเวลสูงสุดเหมือนตัวอื่นในระดับเดียวกัน (9★ 180 · 8★ อัลตร้า/ไฮเปอร์ 240 · 8★ ธรรมดา 140) */
  playerMaxLevel: number
  /**
   * ตัวคูณขนาดตอนวาดใน /lobby — ไฟล์ชุด al วาดใหญ่ขนาดเดียวกับเรนเจอร์รหัส g (บอสกิล)
   * จึงย่อเท่ากับ g (G_RANGER_SCALE = 0.375) · ของจริงจะมากับข้อมูลทางการ
   */
  sizeRatio: number
}

// ค่าที่เจ้าของเว็บกำหนดเอง — มีพรสวรรค์ทุกตัว
/** ขนาดเรนเจอร์รหัส g เทียบกับร่าง u ของตัวเดียวกัน — วัดจากท่า idle 3 คู่ ได้ 0.375 (3/8) ตรงกันทุกคู่
 *  g116-guardian4 → u1443e-wa · g115-guardian4 → u1428e-ks · g113-guardian4 → u1404e-bg (g ใหญ่กว่า +167%) */
export const G_RANGER_SCALE = 0.375

const ALL_DEFS: UpcomingDef[] = [
  { id: 'u1652e-al', grade: 9, evolution: 'normal', tier: 'base9', tierIconKey: '9',  playerMaxLevel: 180, sizeRatio: G_RANGER_SCALE },
  { id: 'u1651u-al', grade: 8, evolution: 'ultra',  tier: 'ultra', tierIconKey: '8+', playerMaxLevel: 240, sizeRatio: G_RANGER_SCALE },
  { id: 'u1651h-al', grade: 8, evolution: 'hyper',  tier: 'hyper', tierIconKey: '8#', playerMaxLevel: 240, sizeRatio: G_RANGER_SCALE },
  { id: 'u1651e-al', grade: 8, evolution: 'normal', tier: 'base8', tierIconKey: '8',  playerMaxLevel: 140, sizeRatio: G_RANGER_SCALE },
]
// เจ้าของเว็บซ่อนไว้ก่อน (src/lib/hiddenRangers.ts) — ไม่ขึ้นในตัวเลือก
const DEFS = ALL_DEFS.filter(d => !isHiddenRanger(d.id))

export const UPCOMING_RANGERS: RangerRow[] = DEFS.map(d => ({
  id: d.id, name: d.id, grade: d.grade, evolution: d.evolution, type: null, role: null, element: null, elementOpen: null,
  sortOrder: Number(d.id.match(/^u(\d+)/)?.[1] ?? 0),
}))
export const UPCOMING_IDS = new Set(DEFS.map(d => d.id))

/** ขนาดตัวของเรนเจอร์ชั่วคราว (1 = ไม่ย่อ) — ใช้ใน /lobby ตอนวาด */
export const upcomingSizeRatio = (id: string): number => DEFS.find(x => x.id === id)?.sizeRatio ?? 1

/** ข้อมูลชั่วคราวสำหรับกฎฐานยืน/ดาว/เลเวล/พรสวรรค์ของ /lobby — undefined = ไม่ใช่ตัวชั่วคราว */
export function upcomingFacts(id: string) {
  const d = DEFS.find(x => x.id === id)
  if (!d) return undefined
  return {
    id: d.id, tier: d.tier, grade: d.grade, tierIconKey: d.tierIconKey, playerMaxLevel: d.playerMaxLevel,
    element: null, masterSeven: false, hasTalent: true,
  }
}
