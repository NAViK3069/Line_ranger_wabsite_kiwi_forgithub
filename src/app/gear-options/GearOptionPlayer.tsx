'use client'

// ====================================================
// GearOptionPlayer — เลือกวิดีโอของออพชั่นที่กำลังดู
//   ออพชั่นที่มีวิดีโอสอนเต็มรูปแบบ (ฉาก + การ์ด/ตัวเลขซ้อน) → คอมโพเนนต์ใน ./tutorials/
//   ที่เหลือ → เล่นไฟล์ฉากเฉยๆ (ฉากตัวอย่าง ถ้ายังไม่ได้ทำ)
// โหลดเฉพาะฝั่ง browser (หน้า page.tsx ใช้ next/dynamic) เพราะ engine ของสตูดิโอแตะ canvas/Web Audio ตั้งแต่โหลด
// ====================================================

import type { ComponentType } from 'react'
import ScenePlayer from '@/components/ScenePlayer'
import AtkTutorial from './tutorials/atk'

/** id ของออพชั่น (options.ts) → วิดีโอสอน · เพิ่มออพชั่นใหม่ = เพิ่มบรรทัดที่นี่ */
export const TUTORIALS: Record<string, ComponentType<{ autoPlay: boolean }>> = {
  atk: AtkTutorial,
}

export default function GearOptionPlayer({ optionId, src, autoPlay }: { optionId: string; src: string; autoPlay: boolean }) {
  const Tutorial = TUTORIALS[optionId]
  return Tutorial ? <Tutorial autoPlay={autoPlay} /> : <ScenePlayer src={src} autoPlay={autoPlay} />
}
