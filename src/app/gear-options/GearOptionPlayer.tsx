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
import HpTutorial from './tutorials/hp'
import DefTutorial from './tutorials/def'
import AtkSpeedTutorial from './tutorials/atk-speed'
import MoveSpeedTutorial from './tutorials/move-speed'
import { SkillEvadeTutorial, SkillHitTutorial, SkillUseTutorial } from './tutorials/skill-rates'
import SkillResistTutorial from './tutorials/skill-resist'
import DmgReductionTutorial from './tutorials/dmg-reduction'
import ElementTutorial from './tutorials/element'
import SkillPierceTutorial from './tutorials/skill-pierce'
import { BlitzRushTutorial } from './tutorials/blitz-rush'
import { SkillReactivateTutorial } from './tutorials/skill-reactivate'
import { SurehitRateTutorial, SkillSurehitTutorial } from './tutorials/surehit'
import { SkillCancelTutorial } from './tutorials/skill-cancel'

/** id ของออพชั่น (options.ts) → วิดีโอสอน · เพิ่มออพชั่นใหม่ = เพิ่มบรรทัดที่นี่ */
export const TUTORIALS: Record<string, ComponentType<{ autoPlay: boolean }>> = {
  atk: AtkTutorial,
  hp: HpTutorial,
  def: DefTutorial,
  'atk-speed': AtkSpeedTutorial,
  'move-speed': MoveSpeedTutorial,
  'skill-use': SkillUseTutorial,
  'skill-evade': SkillEvadeTutorial,
  'skill-hit': SkillHitTutorial,
  'skill-resist': SkillResistTutorial,
  'dmg-reduction': DmgReductionTutorial,
  element: ElementTutorial,
  'blitz-rush': BlitzRushTutorial,
  'skill-reactivate': SkillReactivateTutorial,
  'surehit': SurehitRateTutorial,
  'skill-surehit': SkillSurehitTutorial,
  'skill-pierce': SkillPierceTutorial,
  'skill-cancel': SkillCancelTutorial,
}

export default function GearOptionPlayer({ optionId, src, autoPlay }: { optionId: string; src: string; autoPlay: boolean }) {
  const Tutorial = TUTORIALS[optionId]
  return Tutorial ? <Tutorial autoPlay={autoPlay} /> : <ScenePlayer src={src} autoPlay={autoPlay} />
}
