// ====================================================
// playerBus.ts — ช่องทางให้ปุ่มนอกตัวเล่น (เช่น ปุ่มดาวน์โหลดข้างชื่อคลิปในหน้า /gear-options)
//   เรียกใช้ ScenePlayer ที่กำลังแสดงอยู่ (หน้าหนึ่งมีตัวเล่นตัวเดียว — ตัวที่เพิ่งพร้อมล่าสุดเป็นเจ้าของ)
// ====================================================
import { useSyncExternalStore } from 'react'

export interface PlayerApi {
  /** ภาพนิ่ง PNG ของเฟรมที่หยุดอยู่ */
  png: () => Promise<Blob>
  /** วิดีโอ MP4 ทั้งคลิป (null = ยกเลิก) */
  video: (onProgress: (k: number) => void, signal: { cancel: boolean }) => Promise<Blob | null>
  canVideo: boolean
}

let current: PlayerApi | null = null
const subs = new Set<() => void>()

export function setPlayerApi(api: PlayerApi | null) {
  current = api
  subs.forEach(f => f())
}
/** ถอดเฉพาะเมื่อยังเป็นตัวเดิม (ตัวเล่นใหม่อาจลงทะเบียนไปก่อนตัวเก่าถูกถอด) */
export function clearPlayerApi(api: PlayerApi) {
  if (current === api) setPlayerApi(null)
}
export function usePlayerApi(): PlayerApi | null {
  return useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f) } }, () => current, () => null)
}
