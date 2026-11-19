// ====================================================
// เรนเจอร์ตัวใหม่ที่ไฟล์อนิเมชั่นขึ้น lerico แล้ว แต่ยังไม่อยู่ใน Ranger Book (ยังไม่มีชื่อ/ค่าพลัง)
// ใส่ไว้ให้เลือกในตัวเลือกเรนเจอร์ของ Video Studio ได้ก่อน — ไฟล์โหลดจาก lerico ตามปกติ
// พอ Ranger Book sync ตัวนี้มาแล้ว RangerPicker จะใช้ข้อมูลจาก Book แทนเอง (ไม่ซ้ำ) → ลบออกจากที่นี่ได้
// ====================================================

import type { RangerRow } from '@/app/lobby/RangerPicker'

/** e = ร่างปกติ · h = ไฮเปอร์ · u = อัลตร้า (ตามตัวอักษรหลังเลขในรหัส) */
function upcoming(id: string): RangerRow {
  const m = id.match(/^u(\d+)([euh])-/)
  const evo = m?.[2] === 'h' ? 'hyper' : m?.[2] === 'u' ? 'ultra' : 'normal'
  return { id, name: id, grade: null, evolution: evo, type: null, role: null, element: null, elementOpen: null, sortOrder: Number(m?.[1] ?? 0) }
}

export const UPCOMING_RANGERS: RangerRow[] = ['u1652e-al', 'u1651u-al', 'u1651h-al', 'u1651e-al'].map(upcoming)
export const UPCOMING_IDS = new Set(UPCOMING_RANGERS.map(r => r.id))
