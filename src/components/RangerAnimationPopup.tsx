'use client'

// ====================================================
// RangerAnimationPopup — ดู .sam animation ของ ranger
// • ซ้อนทับ RangerDetailPopup (z-index สูงกว่า)
// • โหลดไฟล์ผ่าน /api/lerico-proxy (CORS bypass + cache 30d)
// • Cleanup memory เมื่อปิด popup (sprites.bitmap.close())
// ====================================================

import { proxyFile, fetchSamList, corsImage } from '@/lib/staticApi'
import { apiFetch } from '@/lib/staticApi'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLanguage } from '@/contexts/LanguageContext'
import { useSound } from '@/contexts/SoundContext'
import { SAMParser, applyAttackCombos, type SamFrame } from '@/lib/animation/samParser'
import { BATTLE_STAGES, stageLabel } from '@/lib/battleStages'
import {
  loadSprites,
  disposeSprites,
  renderSAMFrame,
  renderGrid,
  autoFit,
  animCenterX,
  animBBox,
  animBBoxLoose,
  animBodyBBox,
  animStandPoint,
  animSelfArcRise,
  animGroundDecalY,
  animMedianBBox,
  animFrame0Center,
  anchorFromRatio,
  framePieces,
  pieceAtPoint,
  type FramePiece,
  type Sprite,
  type SpriteMap,
} from '@/lib/animation/samRenderer'

interface Props {
  rangerId: string
  rangerName: string
  attackRange?: number | null   // ระยะโจมตีจริง (รวมบัฟ) — ใช้เป็นระยะห่างของกระสอบทราย
  // 觸發基準 ของแต่ละสกิล (ตัวเดียวกับที่โชว์ใต้คำอธิบายสกิลว่า Self / Front Enemy / Rear Enemy)
  // 'self' = บัฟตัวเอง ไม่ทำดาเมจ → เป้าหมายต้องไม่มีปฏิกิริยา, 'front'/'rear' = สกิลโจมตี
  skillTargets?: { skill1: 'self' | 'front' | 'rear' | null; skill2: 'self' | 'front' | 'rear' | null }
  // รัศมี Area Skill (หน่วย pt เดียวกับที่โชว์ว่า "Area Skill → 150pt") — ใช้วาดแถบความกว้างของสกิล
  skillAreas?: { skill1: number | null; skill2: number | null }
  // ตัวคูณระยะของสกิลที่เล็ง Rear Enemy (เช่น "Rear Enemy (Multiplier: 8×)" → 8)
  // ศัตรูแนวหลังยืนไกลออกไป = ATK Range × ตัวคูณนี้
  skillRearMul?: { skill1: number | null; skill2: number | null }
  // เรนเจอร์ประเภทบิน (ability ab201_flight) — ลอยอยู่เหนือพื้น คนละระดับกับตัวเดินดิน
  isFlyer?: boolean
  // รายชื่อไฟล์ .sam ที่จะให้เล่น — ใส่มาเองได้ (หน้า /res รู้อยู่แล้วจากรายการโฟลเดอร์)
  // ถ้าไม่ใส่ จะไปถาม /api/lerico-proxy/list/<rangerId> เหมือนเดิม
  // จำเป็นเพราะ API ตัวนั้นรับได้แค่ชื่อชั้นเดียว ใช้กับพาธซ้อนอย่าง hd/area ไม่ได้
  samFilesOverride?: string[]
  // ฝังอยู่ในหน้าเลย ไม่ใช่ป๊อปอัพลอยทับจอ — หน้า /res บนจอใหญ่ใช้แบบนี้
  // ต่างกันที่: ไม่มีฉากดำคลุม ไม่ล็อกการเลื่อนหน้า ไม่ปิดด้วย ESC และไม่มีปุ่มกากบาท
  embedded?: boolean
  // เรนเจอร์ประเภทสอยนกบิน (ability ab217_airatk) — เป้าหมายต้องเป็นตัวบิน
  isAirAmbush?: boolean
  onClose: () => void
}

// ── Hold-to-step button ──

// ── รูปย่อของชิ้นส่วนในแถบเลเยอร์ ──
// ชื่อ sprite ของไฟล์พวกนี้บอกแค่ขนาดภาพ (เช่น _114x33.png) ดูไม่ออกว่าเป็นชิ้นไหน
// รูปย่อจึงเป็นทางเดียวที่คนดูแยกแขน/ขา/ผม ออกจากกันได้ก่อนกดปิด
function LayerThumb({ sprite }: { sprite?: Sprite }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current; if (!cv) return
    const ctx = cv.getContext('2d'); if (!ctx) return
    ctx.clearRect(0, 0, cv.width, cv.height)
    if (!sprite) return
    // ย่อให้พอดีกรอบโดยคงสัดส่วน (ชิ้นผอมยาวอย่างแขนจะได้ไม่บิด)
    const k = Math.min(cv.width / sprite.w, cv.height / sprite.h, 1)
    const w = sprite.w * k, h = sprite.h * k
    ctx.drawImage(sprite.bitmap, (cv.width - w) / 2, (cv.height - h) / 2, w, h)
  }, [sprite])
  return <canvas ref={ref} width={26} height={26} className="w-[26px] h-[26px] shrink-0 rounded bg-black/40" />
}
function HoldStepButton({ onStep, children, className }: { onStep: () => void; children: React.ReactNode; className?: string }) {
  const timers = useRef<{ initial?: ReturnType<typeof setTimeout>; interval?: ReturnType<typeof setInterval> }>({})

  const start = useCallback(() => {
    onStep()
    timers.current.initial = setTimeout(() => {
      timers.current.interval = setInterval(onStep, 80)
    }, 400)
  }, [onStep])

  const stop = useCallback(() => {
    if (timers.current.initial) clearTimeout(timers.current.initial)
    if (timers.current.interval) clearInterval(timers.current.interval)
    timers.current = {}
  }, [])

  useEffect(() => () => stop(), [stop])

  return (
    <button
      type="button"
      onMouseDown={start}
      onMouseUp={stop}
      onMouseLeave={stop}
      onTouchStart={(e) => { e.preventDefault(); start() }}
      onTouchEnd={(e) => { e.preventDefault(); stop() }}
      className={className ?? 'px-3 py-2 bg-slate-800 border border-slate-700 rounded text-gray-200 hover:bg-slate-700 active:bg-slate-600'}
    >
      {children}
    </button>
  )
}

// แนบ Beta/Pro code จาก localStorage ไปด้วยทุกครั้ง — server เช็คสิทธิ์จริงก่อนคืนไฟล์
// (กันคน bypass ด้วยการปลอม isPro ฝั่ง client แล้วยิง endpoint พวกนี้ตรงๆ)
const PROXY_FILE = proxyFile

const BG_PRESETS = [
  { label: 'เขียว', value: '#00b140' },
  { label: 'ฟ้า',   value: '#1e90ff' },
  { label: 'ขาว',   value: '#ffffff' },
  { label: 'ดำ',    value: '#000000' },
  { label: 'แดง',   value: '#ee2222' },
]

// ── ฉากพื้นหลังจากด่านในเกม (res/<stage>/bg.png + object1..6.png) ──
const BATTLE_STAGE_BASE = 'https://rangers.lerico.net/res/'
const BG_TILE_COUNT = 14      // ต่อ bg.png ซ้าย→ขวา ให้เป็นฉากยาว
const BG_OBJECT_COUNT = 6
// ระยะห่างระหว่าง object (px) — สุ่มในช่วงนี้ ห่างนิดเดียวแต่ไม่ชนกัน
const BG_OBJECT_GAP_MIN = 40
const BG_OBJECT_GAP_MAX = 90
// ออฟเซ็ตตำแหน่งฉากแนวนอน (สัดส่วนของขนาดฉากเอง) — ขวา +25%
const BG_OFFSET_X_RATIO = 0.25
// แนวตั้งไม่ใช้ออฟเซ็ตแล้ว แต่จัดจาก "เส้นถนน" ในภาพโดยตรง:
// ถนนอยู่ที่ 77.8% ของความสูงภาพ (วัดจากภาพจริง — 646 จาก 830px)
// วางภาพให้เส้นนี้ตรงกับจุดยืนของเรนเจอร์พอดี เรนเจอร์จึงยืนบนถนนเสมอ ไม่ว่าตัวจะสูงเท่าไหร่
const BG_ROAD_RATIO = 0.778

// ── กระสอบทราย: เรนเจอร์หุ่นนิ่งฝั่งขวา (โชว์เฉพาะตอนเปิดพื้นหลัง) ──
const DUMMY_RANGER_ID = 'u1147e-benimaru'
// เป้าหมาย "แนวหลัง" — โผล่เฉพาะเรนเจอร์ที่มีสกิลเล็ง Rear Enemy
const REAR_DUMMY_RANGER_ID = 'u1148e-souei'
// เป้าหมายตัวบิน — ใช้แทนตัวปกติเมื่อเรนเจอร์มี ability Air Ambush (สอยเฉพาะตัวบิน)
const FLYER_DUMMY_RANGER_ID = 'u1231e-cony'
// เป้าหมายที่ยืนสุดขอบวง Area ของสกิล — ไว้ดูว่าไกลสุดที่สกิลกินถึงคือแค่ไหน
const EDGE_DUMMY_RANGER_ID = 'u1297e-sn'
// เหตุการณ์ "โดนตี" หนึ่งครั้งของเป้าหมายหนึ่งตัว
interface HitEvent { tick: number; isSkill: boolean }
const HIT_EVENT_KEEP = 8
function pushHit(list: HitEvent[], tick: number, isSkill: boolean): void {
  if (list.some(e => e.tick === tick && e.isSkill === isSkill)) return
  list.push({ tick, isSkill })
  list.sort((a, b) => a.tick - b.tick)   // ย้อนเฟรมแล้วโดนใหม่ → tick อาจย้อนหลัง ต้องเรียงก่อน
  if (list.length > HIT_EVENT_KEEP) list.splice(0, list.length - HIT_EVENT_KEEP)
}
// เหตุการณ์ล่าสุดที่ "เกิดไปแล้ว" ณ tick นี้ (เหตุการณ์ในอนาคตหลังย้อนเฟรมจะถูกข้ามไป)
function activeHit(list: HitEvent[], tick: number): HitEvent | null {
  for (let i = list.length - 1; i >= 0; i--) if (list[i].tick <= tick) return list[i]
  return null
}
// สีเส้นบอกระยะส่วนที่เพิ่มไปถึงแนวหลัง
const REAR_LINE_COLOR = '#4ade80'
// ระยะห่าง = ระยะระหว่าง "MAIN X ของเรนเจอร์หลัก" กับ "MAIN X ของเป้าหมาย" (0 = ทับกันพอดี)
// ผูกกับ ATK Range ของเรนเจอร์ตัวนั้นๆ
// ── ตัวแปลงหน่วย "pt" (หน่วยระยะของเกม) → world unit ของ .sam ──
// ทุกค่าที่มีหน่วย pt ต้องผ่านตัวนี้: ATK Range, Area Skill, moveSpeed
// ห้ามใช้ค่า pt ดิบๆ เป็นระยะบนจอเด็ดขาด ไม่งั้นแถบวัดสองอันจะเทียบกันไม่ได้
// (เคยพลาดมาแล้ว: ATK 350pt ถูกคูณ แต่ Area 760pt ไม่ถูกคูณ → 760 ดูสั้นกว่า 350)
// เคยตั้ง 1 เพราะค่า start ใน projectile_data ดูเหมือนใช้หน่วยเดียวกับ .sam
// (u286u-brown start.x=183 ตกที่ปลายกระบอกปืนพอดี ทั้งที่ตัวกว้างแค่ ~186)
// แต่พอวางจริงแล้วเป้าหมายใกล้เกินไป → pt คนละสเกลกับ start ค่านี้จูนด้วยตา (1 → 2 → 2.2 → 2.1)
const PT_TO_WORLD = 2.1
// ใช้เมื่อเรนเจอร์ไม่มีค่า ATK Range
const DUMMY_FALLBACK_RANGE = 400
// โดนโจมตีปกติ → แดงวาบจังหวะเดียว ติดกี่เฟรมแล้วดับ (ไม่สลับติด/ดับซ้ำ)
const DUMMY_FLASH_TICKS = 4
// ความเข้มสีแดงตอนติด (0..1)
const DUMMY_FLASH_ALPHA = 0.55
// ชื่อ anim ท่าโดนตี (กระเด็นเล็กน้อย) — ใช้ตอนโดนสกิล
const DUMMY_HIT_ANIM = 'target'

// ── เสียงของท่าโจมตี (จาก projectile_data → sounds) ──
// เซิร์ฟเวอร์จับคู่ชื่อเสียงกับไฟล์จริงบน lerico ให้แล้ว (ดู api/ranger/projectile)
//   preparation = ตอนเริ่มร่าย (ต้นช่วง Cast Time) — เล่นเสมอ ซิงก์กับเฟรม (syncUnitSound)
//   underAttack = ตอนท่าโจมตีลงเป้า (ชื่อไฟล์ขึ้นต้น hit_/skhit_) — เล่นเฉพาะตอนเปิดพื้นหลัง (ปุ่ม wallpaper)
//                 เพราะต้องมีกระสอบทรายให้โดน · ทริกเกอร์จังหวะเดียวกับที่กระสอบทรายกระพริบ/กระเด็น (playHitSound)
//   attack      = ตอนปล่อยท่า (เสียงฟึ่บ) — ข้อมูลมากับ API แต่ไม่ได้เล่น
type AttackKind = 'normal' | 'skill1' | 'skill2'
type SoundField = 'preparation' | 'attack' | 'underAttack'
type UnitSoundUrls = Record<AttackKind, Record<SoundField, string | null>>
// รุ่นของคำตอบ /api/ranger/projectile — ขยับเมื่อรูปข้อมูลเปลี่ยน (ดูที่ fetch)
const PROJECTILE_DATA_VERSION = 2
// ระดับเสียงท่าเทียบกับเสียงหลักของเว็บ — เสียงเกมดังกว่าเสียงคลิก UI มาก ลดลงหน่อยไม่ให้กลบ
const SKILL_SOUND_VOLUME = 0.8
// เวลาค่อยๆ เบาลงตอนตัดเสียง — สั้นพอให้รู้สึกว่าหยุดทันที แต่ไม่ได้ยินเสียงคลิกจากการตัดฉับ
const SOUND_FADE_MS = 90
// เสียงกับภาพคลาดกันได้เท่านี้ก่อนจะสั่งกระโดดตำแหน่งเสียงให้ตรง (วินาที)
// เล่นปกติคลาดกันไม่กี่มิลลิวินาที เกินค่านี้แปลว่าภาพถูกลาก/ย้อน/วนกลับ
const SOUND_SYNC_TOLERANCE = 0.15

// อุ่นแคชเบราว์เซอร์ (preload) ให้ครั้งแรกที่เล่นไม่หน่วง — เก็บอ้างอิงไว้กัน GC ทิ้งก่อนโหลดเสร็จ
const warmedSounds = new Map<string, HTMLAudioElement>()
// ตัวเล่นของแต่ละไฟล์ใช้ตัวที่อุ่นไว้ — รู้ความยาวไฟล์แล้ว และกระโดดไปวินาทีไหนก็ได้ทันที
// (ตัวที่สร้างใหม่ต้องรอโหลด metadata ก่อนถึงจะ seek ได้)
function soundAudioFor(url: string): HTMLAudioElement {
  let a = warmedSounds.get(url)
  if (!a) { a = new Audio(); a.preload = 'auto'; a.src = url; warmedSounds.set(url, a) }
  return a
}
function warmSounds(urls: UnitSoundUrls | null): void {
  if (!urls || typeof window === 'undefined') return
  for (const set of Object.values(urls)) {
    for (const url of [set.preparation, set.underAttack]) {
      if (!url || warmedSounds.has(url)) continue
      try {
        const a = new Audio()
        a.preload = 'auto'
        a.src = url
        warmedSounds.set(url, a)
      } catch { /* ignore */ }
    }
  }
}

// ── Layer panel ──
// ลูปวาดเดินที่ 30fps แต่แถบเลเยอร์ไม่ต้องตามทุกเฟรม
// 120ms (~8 ครั้ง/วินาที) อ่านทันสายตาแล้ว และลด re-render ของ popup ลงเกือบ 4 เท่า
const LAYER_PANEL_REFRESH_MS = 120
// ความกว้างของหน้าต่างลอย — ตั้งเป็นค่าคงที่เพราะใช้ทั้งตอนวาดและตอนจำกัดขอบไม่ให้ลากหลุดจอ
const LAYER_PANEL_W = 268
// ชื่อ animation ท่ายืนนิ่ง — ใช้ทั้งกระสอบทรายและกรอบอ้างอิงคงที่ของ hitbox (MAIN)
const IDLE_ANIM_NAMES = ['idle', 'wait', 'stand']
// หา anim ท่ายืนของ sam ตัวหนึ่ง — ถ้าไม่เจอชื่อมาตรฐาน ใช้ anim แรกที่ไม่ใช่ _all
function pickIdleAnimName(sam: SAMParser): string {
  return IDLE_ANIM_NAMES.find(n => sam.animations[n]?.length) ??
    sam.animNames.find(n => n !== '_all' && sam.animations[n]?.length) ??
    '_all'
}
// ── ระบบเสก bul/bul2/bul3 พุ่งใส่กระสอบทราย (โชว์เฉพาะตอนเปิดพื้นหลัง) ──
// จับคู่ combo anim (หลัง applyAttackCombos) → ประเภทโจมตี — ส่วนไฟล์กระสุนจริงใช้ meta.animationPart จาก API
// (bulletSuffix ตรงนี้เป็นแค่ fallback ถ้า API ไม่ส่ง animationPart มาให้)
const ATTACK_ANIM_MAP: Record<string, { kind: 'normal' | 'skill1' | 'skill2'; bulletSuffix: string }> = {
  All_attack:           { kind: 'normal', bulletSuffix: 'bul' },
  All_s_attack:         { kind: 'skill1', bulletSuffix: 'bul2' },
  All_s_action_attack:  { kind: 'skill1', bulletSuffix: 'bul2' },
  All_s2_attack:        { kind: 'skill2', bulletSuffix: 'bul3' },
  All_s2_action_attack: { kind: 'skill2', bulletSuffix: 'bul3' },
}
// ── จังหวะโจมตีระหว่างเล่น "_all" ──
// _all คือทุก anim ต่อกันเป็นเส้นเดียว ชื่อ anim จึงเป็น "_all" ไม่ตรงกับ ATTACK_ANIM_MAP
// แต่ parser เก็บ allSegments (ชื่อช่วงย่อย + ช่วงเฟรม) ไว้ด้วย และ applyAttackCombos ไม่ได้แตะ
// จึงหาจังหวะปล่อยได้จากช่วงย่อยตรงๆ: จุดปล่อย = ต้นช่วง "เตรียมท่า" + ความยาว ready ที่ตัดเฟรมว่างแล้ว
// (ใช้ comboReadyLength ตัวเดียวกับตอนเล่น combo เดี่ยว จังหวะจึงตรงกันเป๊ะทั้งสองโหมด)
const ALL_SEG_ATTACK: Record<string, { kind: 'normal' | 'skill1' | 'skill2'; suffix: string; ready: string; combo: string }> = {
  attack:             { kind: 'normal', suffix: 'bul',  ready: 'attack_ready',      combo: 'All_attack' },
  s_attack:           { kind: 'skill1', suffix: 'bul2', ready: 's_attack_ready',    combo: 'All_s_attack' },
  s2_attack:          { kind: 'skill2', suffix: 'bul3', ready: 's2_attack_ready',   combo: 'All_s2_attack' },
  s_action_attack_3:  { kind: 'skill1', suffix: 'bul2', ready: 's_action_attack_1', combo: 'All_s_action_attack' },
  s2_action_attack_3: { kind: 'skill2', suffix: 'bul3', ready: 's2_action_attack_1', combo: 'All_s2_action_attack' },
}
// frame = จุดปล่อยท่า (ต้น Recovery) / prepFrame = จุดเริ่มร่าย (ต้น Cast Time) — ใช้จับจังหวะเสียง preparation
function allAttackTriggers(sam: SAMParser): { frame: number; prepFrame: number; kind: 'normal' | 'skill1' | 'skill2'; suffix: string }[] {
  const segStart = new Map<string, number>()
  for (const [name, start] of sam.allSegments) segStart.set(name, start)
  const out: { frame: number; prepFrame: number; kind: 'normal' | 'skill1' | 'skill2'; suffix: string }[] = []
  for (const [segName, info] of Object.entries(ALL_SEG_ATTACK)) {
    const atkStart = segStart.get(segName)
    if (atkStart === undefined) continue
    const readyStart = segStart.get(info.ready)
    // ไม่มีช่วงเตรียม → ปล่อยตอนเข้าช่วงโจมตีเลย
    const frame = readyStart === undefined
      ? atkStart
      : Math.min(atkStart, readyStart + (sam.comboReadyLength[info.combo] ?? atkStart - readyStart))
    // ไม่มีช่วงเตรียม → ร่ายกับปล่อยเป็นจังหวะเดียวกัน
    out.push({ frame, prepFrame: readyStart ?? atkStart, kind: info.kind, suffix: info.suffix })
  }
  return out.sort((a, b) => a.frame - b.frame)
}
// moveSpeed จาก API อยู่ในหน่วยเกมเดียวกับ attackRange (ทั้งคู่มาจาก projectile_data)
// แต่ระยะบนจอถูกขยายด้วย PT_TO_WORLD → ถ้าไม่ขยายความเร็วตามด้วย เวลาบินจะยืดออกเท่าตัวคูณนั้น
// ผูกสองค่าเข้าด้วยกัน ตัวคูณจึงตัดกันทิ้ง เวลาบินที่ได้ = attackRange / moveSpeed = เวลาจริงตาม API
// (เคยตั้งเป็น 1 ตรงๆ แล้วกระสุนช้ากว่าในเกม 2.1 เท่า)
// ตัวคูณชดเชยอัตราติ๊ก: โค้ดนี้ขยับกระสุนทีละเฟรมของ animation ซึ่ง .sam ทุกไฟล์เป็น 30fps
// (เช็คแล้ว 18/18 ไฟล์) แต่ moveSpeed เป็นระยะต่อ "ติ๊กฟิสิกส์" ของเกมซึ่งน่าจะเดินที่ 60Hz
// → 1 เฟรมอนิเมชั่น = 2 ติ๊กฟิสิกส์ ค่าตามทฤษฎีจึงเป็น 60/30 = 2
// (ยังไม่ได้ยืนยันกับเกมจริงว่าฟิสิกส์เดิน 60Hz) ลดลงเล็กน้อยจาก 2 ตามที่ดูด้วยตาแล้วกำลังพอดี
const PROJECTILE_SPEED_TUNE = 1.95
const PROJECTILE_SPEED_SCALE = PT_TO_WORLD * PROJECTILE_SPEED_TUNE
// ความสูงโค้งปาวิถี (WEAPONC) — peak = min(ARC_MAX_HEIGHT, dist*0.5)
// dist*0.5 คือความสูงของ "ครึ่งวงกลมจริง" (เส้นผ่านศูนย์กลาง = ระยะทางเดินทาง) = ทรงสายรุ้ง
// ARC_MAX_HEIGHT เป็นแค่เพดานกันโค้งเวอร์ตอนเป้าไกลมากๆ (เช่นศัตรูแนวหลังที่ไกลได้ถึง 8 เท่า)
// จูนมาแล้ว: 120 = แบนติดพื้น / 500 = พุ่งทะลุขอบบนของฉากตอนเป้าอยู่ไกล → ลงตัวที่ครึ่งทาง
// (ระยะยิงปกติ ~960 ครึ่งวงกลมเต็มต้องการ 480 ซึ่งเกินความสูงฉากที่วาดไว้ จึงต้องมีเพดาน)
const ARC_MAX_HEIGHT = 255
// ความสูงที่เรนเจอร์ประเภทบิน (ability ab201_flight) ลอยเหนือพื้น (world unit)
// พื้นหลังกับเป้าหมายยังอยู่ระดับพื้นเหมือนเดิม — ลอยเฉพาะตัวเรนเจอร์และทุกอย่างที่ติดตัวมัน
// (หมุด MAIN/FACE, จุดปล่อยกระสุน) เหมือนมีถนนอีกเส้นอยู่บนฟ้า
// projectile_data มี render.flightYn แต่เป็น 0 ทั้ง 3081 ตัว ใช้แยกไม่ได้ จึงดูจาก ability แทน
const FLYER_LIFT = 248
// ความสูงของแถบ Area เหนือจุดยืนเรนเจอร์ (world unit)
// ยึดกับฉากเหมือนแถบ ATK ไม่ใช่ยึดขอบจอ — เลื่อนกล้อง/ซูมแล้วแถบอยู่กับที่ในฉาก
// ค่ายิ่งมาก แถบยิ่งลอยสูงเหนือหัวตัวละคร (240 = เทียบเท่าตำแหน่งเดิมสมัยยึดขอบจอ)
const AREA_BAR_ABOVE_STAND = 330
// ระยะขั้นต่ำจากขอบบนจอ — กันแถบหลุดออกนอกจอตอนซูมเข้า
// (ยึดฉากทำให้ระยะบนจอคูณ zoom ไปด้วย ซูมเข้ามากๆ แถบจะพ้นขอบบน)
// เผื่อที่ให้ป้ายตัวเลขที่วาดเหนือเส้นราว 22px ด้วย
const AREA_BAR_MIN_SCREEN_Y = 26
// ── เกณฑ์แยก "ท่าตกใส่ศัตรูจากฟ้า" ออกจากเอฟเฟกต์ที่เกิดคาตัวเป้าหมาย (world unit) ──
// ทั้งสองแบบเป็น motion.enabled=false เหมือนกัน API ไม่มีฟิลด์ไหนแยกได้ และรอยพื้นก็แยกไม่ได้
// (u1524e-ak-bul3 ไม่มีรอยพื้นแต่ต้องลงพื้น / u1577e-ap-bul3 มีรอยพื้น 6.6 แต่ต้องอยู่ที่ตัว)
// ตัวที่แยกขาดคือความสูงของภาพ เพราะของที่ตกมาจากฟ้าถูกวาดยาวขึ้นไปนอกจอ:
//   ตกใส่ศัตรู      ขอบบน y0 = -410, -504, -852, -1042
//   เกิดคาตัวศัตรู  ขอบบน y0 = -184, -117, -113     ← ช่องว่าง 226 หน่วย
// ยืนยันด้วยตา 7 ไฟล์ ถ้าเจอตัวที่หลุดเกณฑ์ให้ปรับเลขนี้หรือหาตัวชี้วัดที่ดีกว่า
const INSTANT_DROP_ART_TOP = -300
// ── ระยะที่ท่าพุ่งเข้าไปชนต้อง "หยุดก่อนถึงตัว" (world unit) ──
// กฎ MAIN ชน MAIN ทำให้ภาพไปทับตัวเป้าหมายพอดี ซึ่งทับมากเกินไป ถอยกลับมาทางผู้ร่ายเล็กน้อย
// ค่านี้จูนด้วยตา ปรับที่นี่ที่เดียว (มากขึ้น = หยุดไกลตัวเป้าหมายขึ้น)
// นับตามแกน world ซึ่ง +X = ทิศออกจากผู้ร่ายเสมอ จึงใช้ได้ทั้งตอนหันซ้ายและหันขวา
const CHARGE_STOP_SHORT = 40
// ── ปุ่มปรับความสูงจุดปล่อยกระสุนบิน จุดเดียวของทั้งระบบ (world unit, ลบ = สูงขึ้น) ──
// เดิมมีตัวปรับทับซ้อนกันสองตัว ถอดออกทั้งคู่แล้ว เหลือค่านี้ค่าเดียวที่จูนได้:
//   1. LINEAR_START_LIFT = 25 ยกขึ้นเฉพาะแนว LINEAR — จูนด้วยตาตอนที่จุดอ้างอิงยังไม่แน่นอน
//   2. การเอา faceCenter (สัดส่วน "หน้าคนอยู่สูง 54-69% ของลำตัว") ไปคูณกรอบของ "ลูกกระสุน"
//      ซึ่งไม่มีหน้า → กลายเป็นค่าที่แปรตามขนาดไฟล์กระสุนแต่ละตัว = ที่มาของอาการ
//      "บางตัวสูงไป บางตัวต่ำไป" เพราะกระสุนตัวใหญ่ถูกยกมากกว่ากระสุนตัวเล็ก
// ตอนนี้ยึดกึ่งกลางภาพเฟรมแรกซึ่งเป็นจุดเดียวกันทุกไฟล์ ความเพี้ยนที่เหลือจึงเป็นค่าคงที่
// ปรับได้ที่นี่ที่เดียว ไม่ต้องไปแก้รายไฟล์
const SPAWN_Y_BIAS = 0
// ความกว้างรวมของแถบ Area (หน่วย pt) ที่ต่ำกว่านี้จะไม่แสดงป้ายซ้าย/ขวา — แคบเกินจะซ้อนป้ายกลาง
const AREA_SIDE_LABEL_MIN_PT = 250
// ระยะลอยขึ้นในตัว anim ที่ถือว่า "ไฟล์นี้โค้งมาให้แล้ว" → เลิกใส่โค้งสังเคราะห์ (world unit)
// af2/af ลอยขึ้น 128 ส่วน cony ไม่ลอยเลย เกณฑ์ 40 จึงแยกสองกลุ่มได้ชัดโดยไม่ต้องเฉียดฉิว
const SELF_ARC_MIN_RISE = 40
// ตัวหารความสูงยอดโค้ง: peak = dist² / ARC_FLATTEN
// ใช้กำลังสองไม่ใช่สัดส่วนเชิงเส้น เพราะสัดส่วนคงที่ทำให้เป้าใกล้โค้งสูงเกินสัดส่วนตัวละคร
// (เชิงเส้น 0.3 เป้าห่าง 400 ได้ยอด 120 = ท่วมหัวทั้งที่ยิงระยะประชิด)
// แบบกำลังสองจะแบนลงเร็วเมื่อระยะสั้น แต่ระยะไกลยังชน ARC_MAX_HEIGHT เหมือนเดิม (ไม่กระทบที่จูนไว้)
// เทียบ: ระยะ 400 → 53 (เดิม 120) | 780 → 203 (เดิม 234) | 960 ขึ้นไป → 300 เท่าเดิม
const ARC_FLATTEN = 3800
// ถ้าไม่มีค่า/เป็น 0 (เช่น attackType เป็น PUNCH ที่ปกติไม่มีไฟล์กระสุนอยู่แล้ว) ใช้ค่า fallback นี้กันหารด้วยศูนย์
const PROJECTILE_FALLBACK_SPEED = 30
interface ActiveBullet {
  suffix: string
  spawnTick: number
  startX: number; startY: number
  targetX: number; targetY: number
  travelTicks: number
  kind: AttackKind         // ท่าไหนยิงนัดนี้ — ใช้เลือกเสียงตอนโดน (underAttack)
  isSkill: boolean         // ใช้เลือกปฏิกิริยาของเป้าหมายตอนโดน (กระพริบ vs เล่นท่าโดนตี)
  isAttack: boolean        // false = ท่าบัฟ (motion.type NONE) — ไม่สั่งปฏิกิริยาใส่เป้าหมาย
  hitRear: boolean         // true = นัดนี้เล็งเป้าหมายแนวหลัง
  fitNormal: boolean       // true = ยืด anim normal ให้จบพอดีตอนถึงเป้าหมาย แทนการวนซ้ำ
  areaWorld: number        // รัศมี Area ของสกิล (world unit) 0 = ไม่มี → โดนแค่ตัวที่เล็ง
  areaCenterX: number      // จุดกึ่งกลางวง Area = MAIN ของเป้าหมายที่เล็ง (world unit)
  hitFired?: boolean       // กันไม่ให้ทริกเกอร์ซ้ำเมื่อ drawFrame ถูกเรียกหลายครั้งในติ๊กเดียว
  arcStartDeg: number; arcEndDeg: number
  motionType: string       // "LINEAR" | "CURVE"
  selfArc: boolean         // anim โค้งมาให้ในตัวแล้ว — ไม่ใส่โค้งสังเคราะห์ทับ — ตัวชี้ขาดจริงว่าจะโค้งไหม (ไม่ใช่ดูจาก angle)
  motionRotation: string   // "FIXED" | "ANGLE_LERP" — จะหมุนสไปรต์ตามมุมไหม
  // จุดบนตัวกระสุนที่ใช้เป็นหมุดวางตำแหน่ง (world unit ในพิกัดท้องถิ่นของกระสุน)
  //   • กระสุนบินจริง → จุด face (ให้ face ไปชน face ของเป้าหมาย)
  //   • ท่าไม่บิน (วาปไปตี/ทุบพื้น) → origin (0,0) เพราะ anim ถูกวาดโดยยึด origin เป็นจุดกระทบพื้นอยู่แล้ว
  anchorX: number; anchorY: number
  // หมุดของช่วง finish แยกจากช่วงบิน — normal กับ finish ใช้ origin ร่วมกัน (พิสูจน์แล้วว่า
  // _all = normal ++ finish เมทริกซ์ตรงเป๊ะ 25/25 ไฟล์) แต่ "จุดบนตัวกระสุนที่ควรแตะเป้าหมาย"
  // เป็นคนละจุดได้ เพราะศิลปะสองช่วงถูกวาดเยื้องกันตามท่า (u1297e-sn-bul เยื้อง Y ถึง 53)
  // ปกติเท่ากับหมุดช่วงบิน → ไฟล์ที่ไม่ได้ระบุอะไรจึงไม่เปลี่ยนพฤติกรรมเลย
  finishAnchorX: number; finishAnchorY: number
  normalFrames: number
  finishFrames: number
  bulletFps: number
}
// รูปร่างข้อมูลดิบของ normal/skill1/skill2 หนึ่งตัวจาก projectile_data (schemaVersion 3)
interface RawAttackMove {
  animationPart?: string
  start?: { x: number; y: number }
  moveSpeed?: number
  angle?: { start: number; end: number }
  motion?: { type?: string; enabled?: boolean; rotation?: string; loopNormal?: boolean }
}
interface AttackMeta {
  start: { x: number; y: number }   // {0,0} ถูกต้องได้ — บางสกิล moveSpeed=0 ใช้ {0,0} หมายถึง "เสกทับเป้าหมายทันที"
  moveSpeed: number
  angleStart: number
  angleEnd: number
  animationPart: string | null   // ชื่อไฟล์กระสุนจริงจาก API (เช่น "bul","bul2") — ไม่ต้องเดาจาก kind
  motionType: string             // "LINEAR" | "CURVE"
  motionEnabled: boolean         // false = ไม่มีการพุ่งจริง (เช่น melee) — ใช้แทนการเดาจาก moveSpeed
  motionRotation: string         // "FIXED" | "ANGLE_LERP"
  loopNormal: boolean
  // hitTiming.*HitPointRate — จุดที่การโจมตี "ลงเป้า" บนตัวศัตรู
  //   100 = จุดรับดาเมจ (face) ซึ่งเป็นค่าปกติของกระสุนบิน
  //     0 = ลงที่พื้นตรงจุดยืนของศัตรู เหมือนท่าวาปมาตี (กระสุนบินที่เป็นแบบนี้มี 356 ท่า)
  // ค่าอื่นที่พบ (0.3/0.5/1/30/50) ยังไม่รู้ความหมาย จึงเช็คเฉพาะ === 0 เท่านั้น
  hitPointRate: number
}
interface BulletAsset {
  sam: SAMParser; sprites: SpriteMap; normalName: string; finishName: string | null
  // กึ่งกลางภาพเฟรมแรกของ anim ช่วงบิน = จุดที่ควรไปโผล่ตรงปากกระบอก (ดู animFrame0Center)
  spawnRef: { x: number; y: number } | null
  // กึ่งกลางภาพระเบิด (เฟรมแรกของ finish)
  burstRef: { x: number; y: number } | null
  // ขอบบนสุดของภาพ (y น้อยสุด) — ใช้แยก "ท่าตกใส่ศัตรูจากฟ้า" ออกจากเอฟเฟกต์ที่เกิดคาตัว
  artTop: number | null
  // ── ไฟล์ bul บางไฟล์เป็น "ตัวละครวิ่ง/พุ่งเข้าไปตี" ไม่ใช่ลูกกระสุน ──
  // เงาที่วาดไว้ในไฟล์ = จุดที่เท้าแตะพื้น (null ถ้าไฟล์ไม่มีเงา เช่น ท่าพุ่งแบบลอยตัว)
  // สำรวจ 17 ไฟล์เจอแค่ 3 ไฟล์ที่มีเงา — เป็นกลุ่มเล็กและเจาะจง
  bulShadow: { x: number; y: number } | null
  // จุด "face" ของกระสุนเอง (world unit ในพิกัดท้องถิ่นของกระสุน) — คำนวณจาก bbox ของ anim "normal" x faceCenter
  // ของตัวละคร (ratio เดียวกับที่ใช้กับ MAIN/DUMMY) ใช้เป็นจุดอ้างอิงตอนวาง/เล็งกระสุนแทนจุด origin (0,0) ดิบๆ
  faceAnchor: { x: number; y: number } | null
  // หมุด MAIN ของกระสุน = shadowCenter x กรอบ "แม่นยำ" (คนละจุดกับ origin 0,0)
  // ใช้กรอบแม่นยำไม่ใช่กรอบหลวมเหมือน faceAnchor เพราะกรอบหลวมพองผิดจริงในบางไฟล์
  // u1550e-moon-bul2 ภาพสูง 86 แต่กรอบหลวมพองเป็น 462 (5 เท่า) หมุดเลยหลุดไป 203 = ลอยเหนือหัว
  // (faceAnchor ยังใช้กรอบหลวมต่อไป เพราะเป็นค่าที่ตรวจผ่านมาแล้วหลายสิบไฟล์ ห้ามขยับ)
  shadowAnchor: { x: number; y: number } | null
  // ชื่อไฟล์ล้วน (เช่น "u1381e-mk-bul3") — คีย์ของตารางยกเว้นแกน Y ด้านล่าง
  fileKey: string
  // กึ่งกลางแนวนอนของภาพเอฟเฟกต์ — เหลือไว้โชว์ในแถบดีบักเท่านั้น ห้ามใช้เป็นหมุด (ดูเหตุผลที่ anchorX)
  centerX: number
  // Y ของรอยกระแทกพื้นที่ศิลปินวาดไว้ในไฟล์ (null = ไฟล์นี้ไม่มี) — หมุดแนวตั้งของท่าไม่บิน
  decalY: number | null
  // anim ช่วงบินมีการกระโดดขึ้นลงในตัวเองอยู่แล้ว → ห้ามใส่โค้งสังเคราะห์ทับ ไม่งั้นสูงเป็นสองเท่า
  selfArc: boolean
}

// ── หมุดแนวตั้งของท่าไม่บิน: ค่ายกเว้นรายไฟล์ ──
// ปกติใช้ "จุดยืนของเรนเจอร์เจ้าของ" (ดูคำอธิบายที่ anchorY) ซึ่งตรงกับของจริงเป๊ะเป็นส่วนใหญ่
// แต่บางไฟล์ศิลปินวางไม่ตามนั้น และ .sam ก็ไม่มีหมุดจุดชนให้อ่าน — ยืนยันแล้ว 3 ทาง:
//   1. หัวไฟล์ .sam มีแค่ x,y (= 0 ทุกไฟล์) กับ canvas_w/h (ขนาดสเตจตอนวาด ไม่สัมพันธ์กับตำแหน่ง)
//   2. ไม่มี sprite marker — รูปทุกชิ้นใน .plist เป็นภาพจริง ส่วนอ็อบเจกต์ alpha=0 เป็นภาพที่เฟดหาย
//      ไม่ใช่หมุด (u1023h-brown-bul3 ไม่มี alpha=0 เลยสักชิ้นแต่ตำแหน่งถูกต้อง)
//   3. projectile_data ให้ start เป็น {0,0} ล้วนสำหรับท่า motion.enabled=false
// → ไฟล์ที่เพี้ยนจึงต้องระบุค่าตรงๆ ค่าเป็น world unit นับลงจาก origin เท่ากับหน่วยของ mainAnchor
// targetFace = ให้เอฟเฟกต์ไปโผล่ที่จุดรับดาเมจ (FACE) ของเป้าหมาย ไม่ใช่จุดยืน (MAIN) ตามปกติ
// fitNormal = ยืด/ย่อ anim "normal" ให้เล่นจบพอดีตอนกระสุนถึงเป้าหมาย (ปกติจะวนซ้ำตามจังหวะของตัวเอง)
// ยังไม่เจอฟิลด์ใน API ที่บอกเรื่องนี้ — motion.loopNormal เป็น true เหมือนกันทั้งตัวที่ต้องวนและไม่ต้อง
// contactFace = จุดของกระสุนที่ต้อง "แตะ" เป้าหมายคือหมุด face ไม่ใช่หมุด MAIN
//   ใช้กับกระสุนบิน hitPointRate=0.5 ที่ค่าตั้งต้นให้ MAIN แตะ FACE ของเป้าหมาย
//   ตั้งค่านี้แล้วหมุดยังเป็น MAIN เหมือนเดิม (จุดปล่อย/ช่วงบินไม่ขยับ) แต่เลื่อนปลายทางเท่าระยะ MAIN-face
const INSTANT_ANCHOR_OVERRIDE: Record<string, { x?: number; y?: number; targetFace?: boolean; fitNormal?: boolean; contactFace?: boolean; finishMain?: boolean }> = {
  // ท่าวาปไปตีที่ยึด 0,0 ของไฟล์ ไม่ใช่จุดยืนเรนเจอร์ — ให้ 0,0 ของกระสุนไปชน MAIN ของเป้าหมาย
  // ไม่มีอะไรใน .sam หรือ API แยกไฟล์กลุ่มนี้ออกจากกลุ่มที่ใช้จุดยืนได้เลย (วัดแล้วเหมือนกันทุกค่า)
  'u1524-ak-bul3': { x: 0, y: 0 },
  // ท่าโจมตีปกติของตัวเดียวกัน — แกน X ต้องยึด 0,0 เหมือน bul3 ไม่งั้นเอฟเฟกต์ค้างอยู่ทางซ้าย
  // ไม่ถึงแกน X ของเป้าหมาย (จุดยืนเรนเจอร์อยู่ x=80 จึงดึงภาพถอยไป 80 หน่วย)
  // ส่วนแกน Y ปล่อยให้กฎเดิมจัดการ (รอยพื้นในไฟล์อยู่ที่ 9 ซึ่งใช้ได้อยู่แล้ว)
  'u1524-ak-bul': { x: 0 },
  // ท่าตกจากฟ้า — X ต้องยึดหมุด face ของกระสุน (184) ไม่ใช่จุดยืนเรนเจอร์ (64) ห่างกัน 120 หน่วย
  // Y ต้องยึด "รอยพื้น" ในไฟล์ (241) ซึ่งอยู่ต่ำกว่าจุดยืน (67) — instantAnchorY() ใช้ min()
  // จึงเลือกจุดยืนแล้วภาพจมใต้พื้น 189 หน่วย ส่วนรอยพื้นทำให้เหลือ 15 (พอดีกับเอฟเฟกต์ตกลงพื้น)
  // นี่คือเคสที่คอมเมนต์ของ instantAnchorY() เตือนไว้ว่า min() อาจผิด — ถ้าเจอเพิ่มอีก 2-3 ไฟล์
  // ให้เปลี่ยน instantAnchorY() เป็นเชื่อรอยพื้นเสมอ แล้วลบรายการพวกนี้ออก
  // (ยังไม่เปลี่ยนตอนนี้เพราะ u286u-brown-bul2 ที่ยืนยันแล้วจะขยับ 15 หน่วย)
  'u1004-sally-bul2': { x: 184, y: 241 },
  // กระสุนบินที่ hitPointRate=0 แต่ต้องชนที่ FACE ไม่ใช่ลงพื้น
  // ไล่หาตัวแยกแล้วยังไม่เจอ — ทุกฟิลด์เหมือนกลุ่มที่ลงพื้นหมด (LINEAR/FIXED/WEAPON/rate 0)
  // สมมติฐาน "start.y = 0 → ชน FACE" ใช้ไม่ได้: u1550e-moon skill1 ก็ start.y = 0 แต่ต้องลงพื้น
  //   ลงพื้น  : u1616e-brown normal (110,280) / u1281e-lv skill1 (270,360) / u1550e-moon skill1 (135,0)
  //   ชน FACE : u1522e-po normal (224,0) / u1512e-ty normal (150,0)
  'u1522-po-bul': { targetFace: true },
  'u1512-ty-bul': { targetFace: true },
  // กระสุนบินที่ hitPointRate=0 และต้องเอา 0,0 ของกระสุนไปชน MAIN ของเป้าหมายตรงๆ
  // (ค่า 0,0 ทำให้ค่าชดเชยปลายทางกลายเป็นระยะ face เต็มๆ → origin ของภาพไปลงที่ MAIN พอดี)
  'u1281-lv-bul2': { x: 0, y: 0 },
  // anim ช่วงบินต้องเล่นจบพอดีตอนถึงเป้าหมาย ไม่ใช่วนซ้ำ
  'u1556-af-bul3': { fitNormal: true },
  // ต้องเอา face ของกระสุนไปชน face ของเป้าหมาย (ค่าตั้งต้นของ rate=0.5 ใช้ MAIN ซึ่งห่างกัน 111 หน่วย)
  'u1612-cony-bul3': { contactFace: true },
  // ท่าวาปไปตี — ให้ 0,0 ของกระสุนไปชน MAIN ของเป้าหมาย (ค่าตั้งต้นใช้จุดยืนเรนเจอร์ (92, 87))
  'u1539-en-bul': { x: 0, y: 0 },
  // 0,0 ของเอฟเฟกต์ต้องไปชน MAIN ของเป้าหมาย (ผู้ใช้ยืนยันด้วยตา) เหมือน u1539e-en-bul
  'u1374-fe-bul3': { x: 0, y: 0 },
  // ── ผลการหาเงื่อนไขแยกกลุ่ม (ทำใหม่ตอนได้ตัวอย่างที่ 4) ──
  // API ยังแยกไม่ได้: u1374e-fe:skill2 มีทุกฟิลด์ตรงกับ u1381e-mk:skill2 และ u1588e-es:skill2 เป๊ะ
  // (WEAPON / UNIT / hitPointRate null / attackScope null / attackRange null / moveSpeed 0 /
  //  LINEAR-false-FIXED / start 0,0 / end 0,0) ทั้งที่สองกลุ่มนี้ต้องใช้หมุดตรงข้ามกัน
  // → ตัดความหวังว่าจะมีกฎจากข้อมูล API ได้เลย ต้องดูจากตัวศิลปะในไฟล์
  // เงื่อนไขที่พอมีเค้า วัดจาก 6 ไฟล์ (A = ต้องใช้ 0,0 / B = ใช้จุดยืนแล้วถูก):
  //   รอยพื้นของเอฟเฟกต์เอง  A: 6.9, 9.45, ไม่มี, ไม่มี   B: 50, 49.9, ไม่มี
  //     → ตรงกับกฎ instantAnchorY ที่ใช้อยู่แล้ว (รอยพื้นใกล้ origin = ศิลปะยึด origin เป็นพื้น)
  //     แต่ช่วยได้แค่แกน Y และเฉพาะไฟล์ที่มีรอยพื้น
  //   กึ่งกลางภาพเฟรมแรก X   A: -108, -269, -52   B: +32, +39, +41   ← แยกขาดพอดี 3 ต่อ 3
  //     ถ้าเก็บได้อีก 3-4 ตัวแล้วยังแยกขาด ให้ทำเป็นกฎ "เฟรมแรกอยู่ฝั่งลบ → ยึด 0,0" แทนตารางนี้
  // ── ตระกูล sn (e/h/u ใช้กฎเดียวกันผ่านคีย์ตระกูล) ──
  // อาการ: หมุดช่วงบิน (face y -41) ไปแตะ FACE ของเป้าหมาย แต่ภาพระเบิดถูกวาดต่ำกว่าหมุด 67 หน่วย
  //   ภาพระเบิดจึงพาดตั้งแต่กลางลำตัวลงไปจ่อพื้น (วัดกับเป้าหมาย u1147e-benimaru:
  //   FACE y -17 / พื้น y 80 — ภาพระเบิดกิน y 21..78 คือชนขอบพื้นพอดี)
  // (ตอนนี้การให้ช่วง finish ยึดกลางระเบิดของตัวเองเป็นค่าตั้งต้นของทุกไฟล์ไปแล้ว
  //  จึงเหลือแต่ contactChest ที่ต้องระบุ)
  // ── สองวิธีที่ลองแล้วไม่ผ่าน อย่าวนกลับไปทำซ้ำ ──
  //   finishMain (หมุด finish = 0,0): กลางระเบิดไปอยู่ที่ FACE+25 ยังเหลือช่องว่าง 25 จากจุดชน
  //   เลื่อนปลายทางลงไปหาระเบิด: จุดชนไปอยู่ y 50 เหลือ 30 จากพื้น = เหมือนยิงลงถนน (ผู้ใช้ทัก)
}

// ── หาค่ายกเว้นของไฟล์กระสุน โดยไม่สนร่างวิวัฒน์ ──
// ไฟล์กระสุนแยกตามร่าง (u1297e-sn-bul / u1297h-sn-bul / u1297u-sn-bul เป็นสามไฟล์)
// แต่เนื้อในเหมือนกันเป๊ะ ทั้งศิลปะและค่าใน API (ตรวจกับตระกูล sn แล้ว: faceCenter, shadowCenter,
// start, moveSpeed, attackRange, กรอบภาพ, กลางระเบิด ตรงกันหมดทั้งสามร่าง)
// ถ้าคีย์ด้วยชื่อไฟล์ตรงๆ ค่ายกเว้นจะลงแค่ร่างเดียว อีกสองร่างยิงไม่เหมือนกัน = ผิดแน่นอน
// จึงถอดตัวอักษรบอกร่างออกเป็น "คีย์ตระกูล": u1297e-sn-bul → u1297-sn-bul
// ยังหาแบบตรงตัวก่อนเสมอ เผื่อร่างไหนศิลปะต่างจริงๆ จะยังเจาะเฉพาะร่างนั้นได้
function familyKey(fileKey: string): string {
  return fileKey.replace(/^(u\d+)[a-z]+-/, '$1-')
}
function bulletOverride(fileKey: string) {
  return INSTANT_ANCHOR_OVERRIDE[fileKey] ?? INSTANT_ANCHOR_OVERRIDE[familyKey(fileKey)]
}

// ── หมุดแนวตั้งของท่าไม่บิน ──
// ตั้งต้นที่ "จุดยืนของเรนเจอร์เจ้าของ" เพราะไฟล์เอฟเฟกต์ถูกวาดในระบบพิกัดเดียวกับ rig ตัวละคร
// แต่ถ้าไฟล์นั้นวาดรอยกระแทกพื้นมาเอง ให้เชื่อรอยพื้นเมื่อมันอยู่ "สูงกว่า" เส้นจุดยืน
// (Y ชี้ลง → สูงกว่า = ค่าน้อยกว่า) ไม่งั้นภาพจะลอยเหนือพื้นเป้าหมาย
//
// วัดจริง 5 ไฟล์ คลาดเคลื่อน 0/0/0/-2/-2:
//   u402e-james-bul2  ไม่มีรอยพื้น           → จุดยืน 88
//   u1023h-brown-bul3 ไม่มีรอยพื้น           → จุดยืน 87
//   u286u-brown-bul2  รอยพื้น 118 ต่ำกว่าจุดยืน → จุดยืน 103
//   u1381e-mk-bul3    รอยพื้น 50 สูงกว่า 77   → 50
//   u1588e-es-bul3    รอยพื้น 50 สูงกว่า 87   → 50
// หมายเหตุ: เงื่อนไข min() ยืนอยู่บนตัวอย่างเดียวคือ u286u-brown ถ้าเจอไฟล์ที่มีรอยพื้น
// อยู่ต่ำกว่าจุดยืนอีกตัวแล้วมันควรใช้รอยพื้น แปลว่า min() ผิด ให้เปลี่ยนเป็นเชื่อรอยพื้นเสมอ
function instantAnchorY(rangerStandY: number, decalY: number | null): number {
  return decalY === null ? rangerStandY : Math.min(rangerStandY, decalY)
}

// โหลด .sam/.plist/.png ของไฟล์กระสุน (bul/bul2/bul3) จากรายชื่อไฟล์ที่มีของเรนเจอร์ตัวนี้
// anim ชื่อ "normal" = เดินทางไปเป้าหมาย, "finish" = หลังชนเป้าหมายแล้ว (ตามที่ผู้ใช้ยืนยัน)
async function loadBulletSam(samFilesList: string[], suffix: string, faceCenterRatio: { x: number; y: number } | null, shadowCenterRatio: { x: number; y: number } | null): Promise<BulletAsset | null> {
  const re = new RegExp(`-${suffix}\\.sam$`, 'i')
  const samUrl = samFilesList.find(u => re.test(u))
  if (!samUrl) return null
  try {
    const prefix = samUrl.replace(/\.sam$/i, '')
    const [samBuf, plistBuf, pngBlob] = await Promise.all([
      fetch(PROXY_FILE(samUrl)).then(r => { if (!r.ok) throw new Error('SAM'); return r.arrayBuffer() }),
      fetch(PROXY_FILE(prefix + '.plist')).then(r => { if (!r.ok) throw new Error('PLIST'); return r.arrayBuffer() }),
      fetch(PROXY_FILE(prefix + '.png')).then(r => { if (!r.ok) throw new Error('PNG'); return r.blob() }),
    ])
    const sam = new SAMParser(samBuf)
    const sprites = await loadSprites(plistBuf, pngBlob)
    const normalName = sam.animations['normal']?.length
      ? 'normal'
      : sam.animNames.find(n => n !== '_all' && sam.animations[n]?.length) ?? null
    if (!normalName) { disposeSprites(sprites); return null }
    const finishName = sam.animations['finish']?.length ? 'finish' : null
    // ใช้ bbox ของ normal เป็นหลักเสมอ (ตำแหน่งที่ถูกต้องอยู่แล้วสำหรับกระสุนส่วนใหญ่) — fallback ไป finish
    // เฉพาะตอน normal ว่างเปล่าจริงๆ เท่านั้น (เช่น u286u-brown-bul2 ที่ normal ไม่มีอะไรวาดเลย)
    // ห้าม "รวม" สอง bbox เข้าด้วยกันเด็ดขาด เพราะจะไปเลื่อนตำแหน่งของกระสุนที่ normal ถูกต้องอยู่แล้วให้เพี้ยน
    // จุดเล็งของกระสุนบิน ใช้กรอบแบบหลวม (animBBoxLoose) ไม่ใช่กรอบแม่นยำ — ดูเหตุผลที่ตัวฟังก์ชัน
    // สรุปสั้นๆ: จุดเล็งเป็นแค่สัดส่วนของกรอบ ค่าที่ตรวจแล้วว่าเล็งตรงมาจากกรอบแบบนี้
    // ถ้าสลับไปใช้ animBBox จะเพี้ยนมัธยฐาน 6 หน่วย แต่ u286u-brown-bul3 เพี้ยนถึง 75
    const bbox = animBBoxLoose(sam, sprites, normalName) ?? (finishName ? animBBoxLoose(sam, sprites, finishName) : null)
    const faceAnchor = bbox && faceCenterRatio ? anchorFromRatio(bbox, faceCenterRatio) : null
    const exactBox = animBBox(sam, sprites, normalName) ?? (finishName ? animBBox(sam, sprites, finishName) : null)
    const shadowAnchor = exactBox && shadowCenterRatio ? anchorFromRatio(exactBox, shadowCenterRatio) : null
    // ท่าไม่บิน: ศิลปะจริงมักอยู่ใน finish (normal เป็นเฟรมเปล่า) → วัดหมุดจาก anim ที่มีของจริง
    const effectAnim = finishName && animBBox(sam, sprites, finishName) ? finishName : normalName
    const effectBox = animBBox(sam, sprites, effectAnim) ?? bbox
    const centerX = effectBox ? (effectBox.x0 + effectBox.x1) / 2 : 0
    const fileKey = prefix.split('/').pop() ?? ''
    const decalY = animGroundDecalY(sam, sprites, effectAnim)
    const selfArc = animSelfArcRise(sam, sprites, normalName) >= SELF_ARC_MIN_RISE
    const spawnRef = animFrame0Center(sam, sprites, normalName)
    const burstRef = finishName ? animFrame0Center(sam, sprites, finishName) : null
    const artTop = effectBox ? effectBox.y0 : null
    // ส่ง shadowCenter = null → ได้เงาจริงเท่านั้น ไม่มีการเดาจากสัดส่วนกรอบ
    const bulShadow = animStandPoint(sam, sprites, normalName, null)
    return { sam, sprites, normalName, finishName, faceAnchor, shadowAnchor, fileKey, centerX, decalY, selfArc, spawnRef, burstRef, artTop, bulShadow }
  } catch {
    return null
  }
}
function lerp(a: number, b: number, t: number): number { return a + (b - a) * t }
// ตำแหน่ง world ของกระสุนที่ความคืบหน้า p (0..1) — ใช้ทั้งวาดกระสุนจริงและเส้นพรีวิวเส้นทางตอนเปิด Hitbox
// hasArc=false → เส้นตรง, hasArc=true → โค้งครึ่งวงกลม (peak = min(ARC_MAX_HEIGHT, dist*0.5))
function arcPathPos(startX: number, startY: number, targetX: number, targetY: number, p: number, hasArc: boolean): { x: number; y: number } {
  const dist = Math.hypot(targetX - startX, targetY - startY)
  // ทรงโค้งเป็น "พาราโบลา" (4p(1-p)) ไม่ใช่ครึ่งวงกลม (2√(p(1-p)))
  // ครึ่งวงกลมมีความชันเป็นอนันต์ที่ปลายทั้งสองข้าง กระสุนจึงพุ่งขึ้นตรงๆ ก่อนแล้วค่อยโค้ง
  // พาราโบลาชันจำกัดตั้งแต่เฟรมแรก เลยโค้งทันทีเหมือนการโยนของจริง (ยอดสูงเท่ากัน อยู่กลางทางเหมือนกัน)
  const height = hasArc ? Math.min(ARC_MAX_HEIGHT, dist * dist / ARC_FLATTEN) * 4 * p * (1 - p) : 0
  return { x: lerp(startX, targetX, p), y: lerp(startY, targetY, p) - height }
}
// ตำแหน่งจริงของจุดอ้างอิงหนึ่งๆ บนตัวกระสอบทราย (world unit, สัมพัทธ์กับ origin ของ MAIN)
// ต้องกลับด้านรอบ pivotX เพราะรูปหุ่นถูกมิเรอร์ตอนวาด แล้วค่อยบวกระยะห่างจาก MAIN
// ใช้ได้ทั้งจุดยืน (anchor/shadowCenter) และจุดรับดาเมจ (faceAnchor/faceCenter)
// ── จุดปล่อยกระสุน (world unit) จากค่า start ของ projectile_data ──
// X นับจาก origin ของ .sam ตรงๆ ส่วน Y นับ "ขึ้นจากจุดยืน" ของตัวละคร (เกมยึดจุดที่เท้าแตะพื้น)
// ต้องใช้ฟังก์ชันนี้ทุกที่ ไม่งั้นกระสุนจะไม่ออกตรงหมุดที่วาดไว้
//
// วัด "กึ่งกลางภาพกระสุนตอนโผล่" คิดเป็น % ความสูงลำตัว (0=พื้น 100=หัว, ระดับอกอยู่ราว 40-55%)
// เทียบ 4 สูตรกับ 4 เรนเจอร์ (u1588e-es / u286u-brown / u1345e-jr / u402e-james):
//   ยึด origin + หมุด 0,0   เฉลี่ย 131%  ← ลอยเหนือหัว (แบบที่เคยใช้)
//   ยึด origin + หมุด face  เฉลี่ย 117%
//   ยึดพื้น    + หมุด 0,0   เฉลี่ย  38%  แต่กระจาย 13-96%
//   ยึดพื้น    + หมุด face  เฉลี่ย  31%  กระจุก 23-37%  ← ใช้สูตรนี้
// ที่เคยสรุปว่า "โจมตีปกติยึดหมุด 0,0" เป็นความบังเอิญ: u286u-brown-bul วางภาพต่ำจาก origin 66 หน่วย
// การยึด 0,0 เลยไปหักล้างความสูงเกินของ start พอดีเฉพาะไฟล์นั้น ไม่ใช่กฎที่ใช้ได้ทั่วไป
// ── ตารางยกเว้นจุดปล่อยกระสุน (พิกัด world ตรงๆ) ──
// คีย์ = "<rangerId>:<normal|skill1|skill2>" ใช้เมื่อค่าใน API เองผิดสเกลจนไม่มีสูตรไหนช่วยได้
// คีย์เขียนแบบ "ตระกูล" (ถอดตัวอักษรบอกร่างออก เช่น u1317e-brown → u1317-brown)
// เพื่อให้ลงทุกร่างวิวัฒน์พร้อมกัน — ดูเหตุผลที่ familyKey()
const ATTACK_START_OVERRIDE: Record<string, { x: number; y: number }> = {
  // เรนเจอร์ตัวนี้ start.y ถูกเขียนโดยยึด origin ไม่ใช่ยึดพื้นเหมือนตัวอื่น จึงต้องยกเว้น
  // ค่าที่ใส่ = -start.y ตรงๆ (สูตรเดิมก่อนเปลี่ยนมานับจากพื้น) ไม่ใช่ตัวเลขที่เดาขึ้นมา
  //
  // ไล่จูนมาทั้งหมด เทียบเป็น % ความสูงตัวละคร (กึ่งกลางภาพ 0=พื้น 100=หัว):
  //   -55 → 45% | -104 → 77% | -160 → 113% | -230 → 159% | สูตรนับจากพื้น → 209%
  //   ทั้งหมดผู้ใช้บอกว่ายังต่ำไป ส่วน -385 (= -start.y ยึด origin) → 260% กลับสูงไป
  //   คำตอบจึงอยู่ระหว่าง 209-260% — ภาพไฟล์นี้สูง 236 ใหญ่กว่าตัวละคร (153) จึงลอยสูงกว่าปกติได้
  'u1317-brown:normal': { x: 180, y: -345 },   // กลางภาพ 234% กินตั้งแต่ 311% ลงมาถึง 157%
  // start.y = 0 (= "ไม่ระบุ") ทำให้จุดปล่อยไปอยู่ระดับ origin ของ rig ซึ่งสูงเกินสำหรับกระสุนตัวนี้
  // ของจริงต้องพุ่งตรงไปข้างหน้าระดับล่าง — วัดแล้วภาพควรกินราว 53% ลงมาถึง 7% ของความสูงตัวละคร
  'u1550-moon:skill1': { x: 135, y: 36 },
  // (u1526-ko:normal ถอดออกแล้ว — กฎ runIn คำนวณจากเงาในไฟล์เองแทนการจูนด้วยตา)
  // start.y = 0 (= "ไม่ระบุ") ให้ระดับ origin ของ rig ซึ่งสูงไปหน่อยสำหรับตัวนี้
  // จูนด้วยตา: -25 (ค่าตั้งต้น = origin + LINEAR_START_LIFT) สูงไป / 0 ต่ำไป / -12 ยังสูงอยู่นิดหน่อย
  'u1512-ty:normal': { x: 150, y: -6 },
}
// ── ตารางแก้ค่า start.y ที่ API เขียนไว้ต่ำจนผิดสังเกต (หน่วยเดียวกับ API = นับขึ้นจากพื้น) ──
// ต่างจาก ATTACK_START_OVERRIDE ที่คืนพิกัดสำเร็จแล้วข้ามการจัดตำแหน่งภาพทั้งหมด
// ตารางนี้แก้แค่ค่า y แล้วปล่อยให้ไหลผ่านสูตรปกติ → การจัดภาพเฟรมแรกกับแกน X ยังทำงานเหมือนเดิม
// เทียบกับข้อมูลทั้งชุด (กระสุนที่บินจริง 1899 ท่า): start.y แนว CURVE มัธยฐาน 150 ควอไทล์ 110-207
// ค่า 20 ของสกิลนี้จึงต่ำกว่าควอไทล์ล่างไปมาก — ใส่ค่ามัธยฐานของแนว CURVE แทน
// กลุ่ม 0 < start.y <= 40 มีทั้งหมด 60 ท่า (LINEAR 35 / CURVE 10 และอื่นๆ) ยังไม่ได้ตรวจด้วยตาทั้งหมด
// ถ้าเจอเพิ่มอีก 2-3 ตัวที่เพี้ยนแบบเดียวกัน ให้เลิกตารางนี้แล้วทำเป็นกฎ "y ต่ำกว่าควอไทล์ล่าง → ใช้มัธยฐาน"
const START_Y_OVERRIDE: Record<string, number> = {
  // u1306e-az สกิล 1: API เขียน start (350, 20) → ภาพไปโผล่แค่ 20 หน่วยเหนือพื้น เกือบติดพื้น
  // ผู้ใช้ยืนยันด้วยตาว่าต่ำเกินไป ส่วนจุดจบตรงดีอยู่แล้ว จึงไม่แตะหมุดและปลายทาง
  // สามตัวที่เหลือเป็นร่างวิวัฒน์ของตัวเดียวกัน ข้อมูลในไฟล์เหมือนกันเป๊ะทั้ง x และ y (ตรวจแล้ว)
  // คีย์ตระกูล (ถอดตัวอักษรบอกร่างออก) — ลงทุกร่างพร้อมกัน ข้อมูลในไฟล์เหมือนกันเป๊ะทั้ง x และ y
  'u1306-az:skill1': 150,
  'u1305-az:skill1': 150,
}
function attackStartWorld(start: { x: number; y: number }, standY: number, key?: string): { x: number; y: number } {
  const o = key ? ATTACK_START_OVERRIDE[key] ?? ATTACK_START_OVERRIDE[familyKey(key)] : undefined
  if (o) return o
  // start.y = 0 = "ไม่ได้ระบุความสูง" ไม่ใช่ "อยู่ที่ระดับพื้น"
  // ถ้าเอาไปนับจากพื้นตรงๆ กระสุนจะออกจากเท้า (u1522e-po start=(224,0) → 0% ของความสูงตัว)
  // ใช้ origin ของ rig เป็นค่าตั้งต้นแทน ซึ่งอยู่ราว 55-60% ของความสูงตัว = ระดับอก
  // พบ 161 ท่าของกระสุนบินที่ y=0 แต่ x!=0 — เป็นกลุ่มก้อนจริง ไม่ใช่ค่าหลุด
  const y = (key ? START_Y_OVERRIDE[key] ?? START_Y_OVERRIDE[familyKey(key)] : undefined) ?? start.y
  return { x: start.x, y: (y === 0 ? 0 : standY - y) + SPAWN_Y_BIAS }
}
// ขอบบนของภาพพื้นหลังบนจอ — จัดให้เส้นถนน (BG_ROAD_RATIO ของความสูงภาพ) ตรงกับจุดยืนเรนเจอร์
// ค่า 77.8% วัดมาจากสไลเดอร์จูนเส้นถนน (ถอดออกแล้ว) — ด่านอื่นถ้าถนนไม่ตรงต้องแยกค่าเป็นรายด่าน
function bgTopOnScreen(originY: number, standY: number, zoom: number, bgHeight: number): number {
  return originY + standY * zoom - BG_ROAD_RATIO * (bgHeight * zoom)
}
// ── แปลง "ระยะห่างระหว่าง MAIN X สองฝั่ง" เป็นออฟเซ็ตที่ใช้วาดหุ่นจริง ──
// หุ่นถูกมิเรอร์รอบ pivotX → MAIN ของมันไปอยู่ที่ (2*pivotX - anchor.x) ในพิกัดของตัวเอง
// ต้องหักส่วนนั้นออก ระยะที่ตั้งไว้จึงเป็นระยะ MAIN-ถึง-MAIN จริงๆ (gap=0 = ทับกันพอดี)
function dummyDrawOffset(dummy: { pivotX: number; anchor: { x: number; y: number } | null }, rangerStandX: number, gap: number): number {
  const mainLocal = 2 * dummy.pivotX - (dummy.anchor?.x ?? dummy.pivotX)
  return rangerStandX + gap - mainLocal
}
// ── ระยะเลื่อนแนวตั้งของกระสอบทราย ──
// เรนเจอร์แต่ละตัว origin ห่างจากจุดยืนไม่เท่ากัน (วัดได้ +60 ถึง +238)
// ถ้าวาดหุ่นที่ origin.y เดียวกับเรนเจอร์หลัก เท้าทั้งสองฝั่งจะไม่อยู่ระดับเดียวกัน
// เลื่อนด้วยผลต่างของจุดยืน เท้าทั้งคู่จึงแตะถนนเส้นเดียวกัน
function dummyYAlign(mainStandY: number, dummyStandY: number): number {
  return mainStandY - dummyStandY
}
function dummyPointWorld(dummy: { pivotX: number }, raw: { x: number; y: number } | null, dist: number, yOff: number): { x: number; y: number } {
  const r = raw ?? { x: dummy.pivotX, y: 0 }
  return { x: dist + (2 * dummy.pivotX - r.x), y: r.y + yOff }
}

function loadBgImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image()
    corsImage(img, url) // ฉากผ่าน Worker ต้องโหลดแบบ CORS ไม่งั้นส่งออก PNG/วิดีโอไม่ได้ (canvas tainted)
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
}

// ประกอบฉาก: ต่อ bg.png 14 รูป แล้ววาง object1..6 ทับ ชิดขอบล่างของ bg
// วนซ้ำ 1→6→1→6... เรียงซ้าย→ขวาจนสุดความกว้าง เว้นระยะสุ่มเล็กน้อย (ไม่ชนกัน)
// ส่วนที่ล้นออกนอกกรอบ bg ถูก clip โดยขอบ canvas เอง
async function composeBattleStage(stage: string): Promise<HTMLCanvasElement | null> {
  const bg = await loadBgImage(PROXY_FILE(`${BATTLE_STAGE_BASE}${stage}/bg.png`))
  if (!bg) return null
  const W = bg.width * BG_TILE_COUNT
  const H = bg.height
  const cv = document.createElement('canvas')
  cv.width = W; cv.height = H
  const ctx = cv.getContext('2d')
  if (!ctx) return null
  for (let i = 0; i < BG_TILE_COUNT; i++) ctx.drawImage(bg, i * bg.width, 0)

  const objects = (await Promise.all(
    Array.from({ length: BG_OBJECT_COUNT }, (_, i) =>
      loadBgImage(PROXY_FILE(`${BATTLE_STAGE_BASE}${stage}/object${i + 1}.png`))
    )
  )).filter((o): o is HTMLImageElement => o !== null)

  if (objects.length) {
    let x = 0
    for (let i = 0; x < W; i++) {
      const o = objects[i % objects.length]
      ctx.drawImage(o, Math.round(x), H - o.height)
      x += o.width + BG_OBJECT_GAP_MIN + Math.random() * (BG_OBJECT_GAP_MAX - BG_OBJECT_GAP_MIN)
    }
  }
  return cv
}

// ── Parse single-frame WebP → extract ANMF payload (VP8 / VP8L / ALPH+VP8) ──
function extractAnmfPayload(buf: ArrayBuffer): { data: ArrayBuffer; hasAlpha: boolean } | null {
  const bytes = new Uint8Array(buf)
  const dv = new DataView(buf)
  const tag = (p: number) => String.fromCharCode(bytes[p], bytes[p+1], bytes[p+2], bytes[p+3])
  if (tag(0) !== 'RIFF' || tag(8) !== 'WEBP') return null
  type C = { tag: string; start: number; size: number }
  const chunks: C[] = []
  let pos = 12
  while (pos + 8 <= buf.byteLength) {
    const t = tag(pos), s = dv.getUint32(pos + 4, true)
    chunks.push({ tag: t, start: pos, size: s })
    pos += 8 + s + (s & 1)
  }
  const vp8l = chunks.find(c => c.tag === 'VP8L')
  if (vp8l) return { data: buf.slice(vp8l.start, vp8l.start + 8 + vp8l.size + (vp8l.size & 1)), hasAlpha: true }
  const alph = chunks.find(c => c.tag === 'ALPH')
  const vp8  = chunks.find(c => c.tag === 'VP8 ')
  if (alph && vp8) {
    const a = buf.slice(alph.start, alph.start + 8 + alph.size + (alph.size & 1))
    const v = buf.slice(vp8.start,  vp8.start  + 8 + vp8.size  + (vp8.size  & 1))
    const out = new Uint8Array(a.byteLength + v.byteLength)
    out.set(new Uint8Array(a), 0); out.set(new Uint8Array(v), a.byteLength)
    return { data: out.buffer, hasAlpha: true }
  }
  if (vp8) return { data: buf.slice(vp8.start, vp8.start + 8 + vp8.size + (vp8.size & 1)), hasAlpha: false }
  return null
}

// ── Build animated WebP container ──
function buildAnimatedWebP(
  frames: { data: ArrayBuffer; hasAlpha: boolean }[],
  width: number,
  height: number,
  delayMs: number
): ArrayBuffer {
  const anyAlpha = frames.some(f => f.hasAlpha)
  const w3 = (a: Uint8Array, p: number, v: number) => { a[p]=v&0xFF; a[p+1]=(v>>8)&0xFF; a[p+2]=(v>>16)&0xFF }

  const vp8x = new Uint8Array(18)
  vp8x.set([0x56,0x50,0x38,0x58]); new DataView(vp8x.buffer).setUint32(4,10,true)
  vp8x[8] = 0x02|(anyAlpha?0x10:0x00); w3(vp8x,12,width-1); w3(vp8x,15,height-1)

  const anim = new Uint8Array(14)
  anim.set([0x41,0x4E,0x49,0x4D]); new DataView(anim.buffer).setUint32(4,6,true)
  // bg=0 (transparent), loop=0 (infinite)

  const dur = Math.max(1, Math.min(delayMs, 0xFFFFFF))
  const anmfBufs = frames.map(({ data, hasAlpha }) => {
    const pd = data.byteLength + (data.byteLength & 1)
    const anmfData = 16 + pd
    const buf = new Uint8Array(8 + anmfData + (anmfData & 1))
    buf.set([0x41,0x4E,0x4D,0x46]); new DataView(buf.buffer).setUint32(4,anmfData,true)
    // x(3)=0, y(3)=0
    w3(buf,14,width-1); w3(buf,17,height-1); w3(buf,20,dur)
    buf[23] = hasAlpha ? 0x01 : 0x00  // dispose-to-bg if transparent
    buf.set(new Uint8Array(data), 24)
    return buf
  })

  let payloadSz = 4 + vp8x.byteLength + anim.byteLength
  for (const a of anmfBufs) payloadSz += a.byteLength
  const result = new Uint8Array(8 + payloadSz)
  const rdv = new DataView(result.buffer)
  let p = 0
  result.set([0x52,0x49,0x46,0x46]); p+=4
  rdv.setUint32(p, payloadSz, true); p+=4
  result.set([0x57,0x45,0x42,0x50],p); p+=4
  result.set(vp8x,p); p+=vp8x.byteLength
  result.set(anim,p); p+=anim.byteLength
  for (const a of anmfBufs) { result.set(a,p); p+=a.byteLength }
  return result.buffer
}

// ดึง render.shadowCenter (จุดยืน/hitbox) + render.faceCenter (จุดรับดาเมจ — เป้ากระสุนจริงๆ) ของ ranger คนหนึ่งจาก projectile_data
async function fetchRenderCenters(rangerId: string): Promise<{ shadowCenter: { x: number; y: number } | null; faceCenter: { x: number; y: number } | null }> {
  try {
    const d = await apiFetch(`/api/ranger/projectile/${encodeURIComponent(rangerId)}`).then(r => r.json()) as
      { unit?: { render?: { shadowCenter?: { x: number; y: number }; faceCenter?: { x: number; y: number } } } }
    return { shadowCenter: d.unit?.render?.shadowCenter ?? null, faceCenter: d.unit?.render?.faceCenter ?? null }
  } catch {
    return { shadowCenter: null, faceCenter: null }
  }
}

interface DummyAsset {
  sam: SAMParser; sprites: SpriteMap; idleName: string; hitName: string | null
  pivotX: number; anchor: { x: number; y: number } | null; faceAnchor: { x: number; y: number } | null
  // จุด CENTER = ระดับอกของเป้าหมาย: แกน X ตาม MAIN (จุดยืน) / แกน Y คือกึ่งกลางตัวจริงๆ
  // เดิมมีแค่ MAIN (พื้น) กับ FACE (0.65 ของลำตัว = ระดับหัวสำหรับตัวหัวโต) ไม่มีจุดกลางตัว
  centerAnchor: { x: number; y: number } | null
}
// โหลด .sam/.plist/.png ของกระสอบทราย แล้วหา animation ท่ายืน + คำนวณจุดยืน(anchor)/จุดรับดาเมจ(faceAnchor) คงที่
// (คำนวณครั้งเดียวจาก bbox ของ anim ท่ายืนล้วนๆ — ไม่ผูกกับเฟรม/anim ที่กำลังเล่นอยู่ขณะนั้น)
async function loadDummyRanger(unitId: string): Promise<DummyAsset | null> {
  try {
    const [list, centers] = await Promise.all([
      fetchSamList(unitId).then(r => r.json()) as Promise<{ samFiles?: string[] }>,
      fetchRenderCenters(unitId),
    ])
    const samUrl = list.samFiles?.[0]
    if (!samUrl) return null
    const prefix = samUrl.replace(/\.sam$/i, '')
    const [samBuf, plistBuf, pngBlob] = await Promise.all([
      fetch(PROXY_FILE(samUrl)).then(r => { if (!r.ok) throw new Error('SAM'); return r.arrayBuffer() }),
      fetch(PROXY_FILE(prefix + '.plist')).then(r => { if (!r.ok) throw new Error('PLIST'); return r.arrayBuffer() }),
      fetch(PROXY_FILE(prefix + '.png')).then(r => { if (!r.ok) throw new Error('PNG'); return r.blob() }),
    ])
    const sam = new SAMParser(samBuf)
    const sprites = await loadSprites(plistBuf, pngBlob)
    const idleName = pickIdleAnimName(sam)
    // แกนมิเรอร์ = กึ่งกลางตัวละคร → กลับด้านแล้วยังยืนที่เดิม
    const pivotX = animCenterX(sam, sprites, idleName)
    const bbox = animBodyBBox(sam, sprites, idleName)
    const standPt = animStandPoint(sam, sprites, idleName, centers.shadowCenter)
    const anchor = standPt ?? (bbox && centers.shadowCenter ? anchorFromRatio(bbox, centers.shadowCenter) : null)
    const faceAnchor = bbox && centers.faceCenter ? anchorFromRatio(bbox, centers.faceCenter) : null
    const hitName = sam.animations[DUMMY_HIT_ANIM]?.length ? DUMMY_HIT_ANIM : null
    // แกน Y ของ CENTER = กึ่งกลางกรอบมัธยฐานรายเฟรม (ไม่กรองขนาดสไปรต์ — ตัวกรองขนาดเคยตัด
    // ลำตัวจริงของ u1517h-ron ทิ้ง) ส่วนแกน X ยึดตาม MAIN เพราะจุดยืนคือแกนกลางตัวอยู่แล้ว
    const medBox = animMedianBBox(sam, sprites, idleName)
    const centerAnchor = anchor && medBox ? { x: anchor.x, y: (medBox.y0 + medBox.y1) / 2 } : null
    return { sam, sprites, idleName, hitName, pivotX, anchor, faceAnchor, centerAnchor }
  } catch {
    return null
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ── Selection handles (resize) ──
type Sel = { x: number; y: number; w: number; h: number }
type Handle = 'nw' | 'n' | 'ne' | 'w' | 'e' | 'sw' | 's' | 'se'
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se']
const HANDLE_CURSOR: Record<Handle, string> = {
  nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize',
  n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
}
function handlePoint(s: Sel, h: Handle): [number, number] {
  const midX = s.x + s.w / 2, midY = s.y + s.h / 2
  const L = s.x, R = s.x + s.w, T = s.y, B = s.y + s.h
  switch (h) {
    case 'nw': return [L, T]; case 'n': return [midX, T]; case 'ne': return [R, T]
    case 'w':  return [L, midY];                          case 'e':  return [R, midY]
    case 'sw': return [L, B]; case 's': return [midX, B]; case 'se': return [R, B]
  }
}
// ปรับขอบตาม handle ที่ลาก + clamp ในกรอบ canvas
function applyResize(base: Sel, h: Handle, px: number, py: number, W: number, H: number): Sel {
  let left = base.x, top = base.y, right = base.x + base.w, bottom = base.y + base.h
  if (h.includes('w')) left = px
  if (h.includes('e')) right = px
  if (h.includes('n')) top = py
  if (h.includes('s')) bottom = py
  let x = Math.min(left, right), y = Math.min(top, bottom)
  let w = Math.abs(right - left), hh = Math.abs(bottom - top)
  if (x < 0) { w += x; x = 0 }
  if (y < 0) { hh += y; y = 0 }
  if (x + w > W) w = W - x
  if (y + hh > H) hh = H - y
  return { x, y, w, h: hh }
}

// รายการ anim ในลำดับ export — เก็บช่วงเฟรม start/end ของแต่ละตัวไว้ด้วย (ตัดคลิปได้อิสระต่อตัว)
interface SeqItem { animIdx: number; start: number; end: number }

// ── รูปตัวอย่างของด่าน (หน้าต่างเลือกพื้นหลัง) ──
// bg.png เป็นแค่แผ่นแคบสูง (284×830) ส่วนฉากจริง (เสา/ธง/ต้นไม้) มาจาก object1..6 ที่วางทับ
// → ประกอบแบบเดียวกับฉากจริงแต่ย่อ: bg 3 แผ่น + object เรียงซ้ายไปขวา (ระยะห่างคงที่ ภาพเดิมทุกครั้ง)
//   แล้วครอป 16:9 รอบเส้นถนน (จุดที่ตัวละครยืน) ย่อเป็น JPEG เล็ก แคชไว้ทั้ง session
const stageThumbCache = new Map<string, Promise<string | null>>()
function stageThumb(stage: string): Promise<string | null> {
  let p = stageThumbCache.get(stage)
  if (!p) {
    p = (async () => {
      const bg = await loadBgImage(PROXY_FILE(`${BATTLE_STAGE_BASE}${stage}/bg.png`))
      if (!bg) return null
      const objects = (await Promise.all(
        Array.from({ length: BG_OBJECT_COUNT }, (_, i) => loadBgImage(PROXY_FILE(`${BATTLE_STAGE_BASE}${stage}/object${i + 1}.png`))),
      )).filter((o): o is HTMLImageElement => o !== null)
      const W = bg.width * 3, H = bg.height
      const cv = document.createElement('canvas')
      cv.width = W; cv.height = H
      const ctx = cv.getContext('2d')
      if (!ctx) return null
      for (let i = 0; i < 3; i++) ctx.drawImage(bg, i * bg.width, 0)
      let x = 12
      for (let i = 0; objects.length && x < W; i++) {
        const o = objects[i % objects.length]
        ctx.drawImage(o, Math.round(x), H - o.height)
        x += o.width + (BG_OBJECT_GAP_MIN + BG_OBJECT_GAP_MAX) / 2
      }
      const ch = Math.round(H * 0.52), cw = Math.min(W, Math.round((ch * 16) / 9)), cy = Math.round(H * 0.4)
      const out = document.createElement('canvas')
      out.width = 320; out.height = 180
      out.getContext('2d')?.drawImage(cv, 0, cy, cw, ch, 0, 0, 320, 180)
      try { return out.toDataURL('image/jpeg', 0.78) } catch { return null }
    })()
    stageThumbCache.set(stage, p)
  }
  return p
}

/** รูปตัวอย่างหนึ่งการ์ด — ประกอบเมื่อเลื่อนมาเห็นเท่านั้น (ด่านมี 65 ด่าน) · ระหว่างรอเป็นกล่องกระพริบ */
function StageThumb({ stage }: { stage: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [url, setUrl] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let alive = true
    const io = new IntersectionObserver(entries => {
      if (!entries.some(e => e.isIntersecting)) return
      io.disconnect()
      stageThumb(stage).then(u => { if (alive) setUrl(u) })
    }, { rootMargin: '200px' })
    io.observe(el)
    return () => { alive = false; io.disconnect() }
  }, [stage])
  return (
    <div ref={ref} className="aspect-[16/9] bg-slate-900 overflow-hidden">
      {url === undefined && <div className="w-full h-full animate-pulse bg-gradient-to-br from-slate-800 to-slate-900" />}
      {url === null && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={PROXY_FILE(`${BATTLE_STAGE_BASE}${stage}/bg.png`)} alt="" loading="lazy" className="w-full h-full object-cover opacity-60" />
      )}
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
      )}
    </div>
  )
}

// ── หน้าต่างเลือกพื้นหลัง (ด่านในเกม) — มีรูปตัวอย่างของแต่ละด่าน เลือกง่ายเหมือน Video Studio ──
// Mobile first: จอแคบเต็มพื้นที่ตัวเล่น 2 คอลัมน์ · จอกว้างเป็นกล่องกลางจอ 3–4 คอลัมน์
// รูปตัวอย่าง = ฉากย่อที่ประกอบจาก bg + object (ดู stageThumb) ทำเฉพาะการ์ดที่เลื่อนมาเห็น
type StageGroup = 'all' | 'story' | 'team' | 'raid'
const stageGroupOf = (s: string): Exclude<StageGroup, 'all'> =>
  s.startsWith('eventraid_') ? 'raid' : s.startsWith('arena_') || s.startsWith('battleteam') ? 'team' : 'story'

function BgStagePicker({ value, onPick, onClose }: { value: string | null; onPick: (stage: string | null) => void; onClose: () => void }) {
  const { tStat } = useLanguage()
  const [group, setGroup] = useState<StageGroup>(() => (value ? stageGroupOf(value) : 'all'))
  const list = group === 'all' ? BATTLE_STAGES : BATTLE_STAGES.filter(s => stageGroupOf(s) === group)
  const chips: { key: StageGroup; label: string; n: number }[] = [
    { key: 'all', label: tStat('All'), n: BATTLE_STAGES.length },
    { key: 'story', label: tStat('Story'), n: BATTLE_STAGES.filter(s => stageGroupOf(s) === 'story').length },
    { key: 'team', label: tStat('Arena & Team'), n: BATTLE_STAGES.filter(s => stageGroupOf(s) === 'team').length },
    { key: 'raid', label: tStat('Event Raid'), n: BATTLE_STAGES.filter(s => stageGroupOf(s) === 'raid').length },
  ]
  // เปิดมาแล้วเลื่อนไปหาด่านที่ใช้อยู่ให้เห็นเลย
  const gridRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    gridRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.scrollIntoView({ block: 'center' })
  }, [])
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const card = (on: boolean) =>
    `group relative rounded-xl overflow-hidden border text-left transition-all active:scale-[0.97] ${
      on ? 'border-cyan-400 ring-2 ring-cyan-400/60 shadow-[0_0_18px_rgba(34,211,238,0.35)]' : 'border-white/10 hover:border-white/30'
    }`

  return (
    <div className="absolute inset-0 z-20 flex sm:items-center sm:justify-center bg-black/80 sm:p-3 sm:rounded-b-2xl"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="card-glass w-full h-full sm:h-auto sm:max-h-full sm:max-w-2xl sm:rounded-xl flex flex-col overflow-hidden">
        {/* หัว */}
        <div className="flex items-center gap-2 px-3 sm:px-4 pt-3 pb-2 shrink-0">
          <span className="material-icons-round text-[20px] text-cyan-300">wallpaper</span>
          <span className="text-sm font-bold text-white">{tStat('Background')}</span>
          <span className="text-[11px] text-gray-500 tabular-nums">{list.length}</span>
          <button type="button" onClick={onClose} aria-label="close"
            className="ml-auto w-9 h-9 sm:w-8 sm:h-8 rounded-lg grid place-items-center text-gray-400 hover:text-white hover:bg-white/10">
            <span className="material-icons-round text-[20px]">close</span>
          </button>
        </div>
        {/* กลุ่มด่าน — เลื่อนซ้ายขวาได้บนจอแคบ */}
        <div className="flex gap-1.5 px-3 sm:px-4 pb-2.5 overflow-x-auto shrink-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {chips.map(c => (
            <button key={c.key} type="button" onClick={() => setGroup(c.key)}
              className={`shrink-0 h-8 px-3 rounded-full border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                group === c.key ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200' : 'bg-slate-800/80 border-slate-700 text-gray-400 hover:text-white'
              }`}>
              {c.label}<span className="text-[10px] opacity-60 tabular-nums">{c.n}</span>
            </button>
          ))}
        </div>
        {/* รายการด่าน */}
        {/* กล่องเลื่อนแยกจาก grid — grid ที่เป็นตัวเลื่อนเองจะบีบแถวจนการ์ด (overflow-hidden) แบนเป็นเส้น */}
        <div ref={gridRef} className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-4 pb-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {/* ไม่มีพื้นหลัง */}
          <button type="button" onClick={() => onPick(null)} aria-pressed={value === null} className={card(value === null)}>
            <div className="aspect-[16/9] grid place-items-center bg-[repeating-conic-gradient(#1e293b_0%_25%,#0f172a_0%_50%)] bg-[length:16px_16px]">
              <span className="material-icons-round text-[28px] text-gray-500">hide_image</span>
            </div>
            <span className="block px-2 py-1.5 text-[11px] font-semibold text-gray-300 bg-black/60 truncate">{tStat('Off')}</span>
          </button>
          {list.map(stage => (
            <button key={stage} type="button" onClick={() => onPick(stage)} aria-pressed={value === stage} title={stage} className={card(value === stage)}>
              <StageThumb stage={stage} />
              <span className={`block px-2 py-1.5 text-[11px] font-semibold truncate ${value === stage ? 'text-cyan-200 bg-cyan-950/80' : 'text-gray-200 bg-black/60'}`}>
                {stageLabel(stage, { storyPrefix: `${tStat('Stage')} ` })}
              </span>
              {value === stage && (
                <span className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-cyan-400 text-slate-900 grid place-items-center shadow">
                  <span className="material-icons-round text-[16px]">check</span>
                </span>
              )}
            </button>
          ))}
        </div>
        </div>
      </div>
    </div>
  )
}

export default function RangerAnimationPopup({ rangerId, rangerName, attackRange, skillTargets, skillAreas, skillRearMul, isFlyer, isAirAmbush, samFilesOverride, embedded = false, onClose }: Props) {
  const { tStat } = useLanguage()
  const { play, volume } = useSound()
  const [samFiles, setSamFiles] = useState<string[]>([])
  const [currentSamIdx, setCurrentSamIdx] = useState(0)
  const [sam, setSam] = useState<SAMParser | null>(null)
  const [sprites, setSprites] = useState<SpriteMap | null>(null)
  const [animIdx, setAnimIdx] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [zoom, setZoom] = useState(1.5)
  const [origin, setOrigin] = useState<{ x: number; y: number }>({ x: 300, y: 300 })
  const [showGrid, setShowGrid] = useState(true)
  // ปุ่ม Hitbox ถูกถอดออกจากแถบเครื่องมือแล้ว — ตัวโค้ดวาดหมุด/เส้นยังอยู่ครบ
  // เปิดกลับได้แค่เอาปุ่ม toggle มาใส่ใหม่ (ค่าคงเป็น false เลยไม่มีอะไรถูกวาดตอนนี้)
  const [showHitbox] = useState(false)
  // เส้นบอกระยะโจมตีจากเรนเจอร์หลักถึงเป้าหมาย (ปุ่มรูปดวงตา)
  const [showRange, setShowRange] = useState(false)
  const showRangeRef = useRef(false)
  // ── Layer panel ──
  // หน่วยที่ปิดได้คือ "ชิ้นส่วน" = ตัวภาพ (resNum) ไม่ใช่ช่องเลเยอร์ (เหตุผลอยู่ที่ framePieces ใน samRenderer)
  // จอ PC = หน้าต่างลอยลากได้ / จอเล็ก = แผ่นชิดขอบล่างจอ (ไม่บังตัวละครกลางจอ) แตะแถวเพื่อชี้ชิ้นบนภาพ
  const [showLayers, setShowLayers] = useState(false)
  const [layerDesktop, setLayerDesktop] = useState(true)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const sync = () => setLayerDesktop(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])
  // ชิ้นที่ถูกปิด เก็บเป็น resNum ของภาพ
  // (ล้างทิ้งเมื่อสลับไฟล์ .sam เพราะคนละไฟล์ = คนละตัวละคร เลขภาพชุดเดียวกันคนละความหมาย)
  const [hiddenImages, setHiddenImages] = useState<Set<number>>(new Set())
  const hiddenImagesRef = useRef<Set<number>>(hiddenImages)
  // ชิ้นที่กำลังถูกชี้ — ชี้จากในแถบเลเยอร์ หรือชี้จากบนภาพก็ได้ ใช้ค่าเดียวกันทั้งสองทาง
  // (ref สำหรับ draw loop, state สำหรับไฮไลต์แถบ — ต้องมีทั้งคู่)
  const [hoverRes, setHoverRes] = useState<number | null>(null)
  const hoverResRef = useRef<number | null>(null)
  const showLayersRef = useRef(false)
  // ชิ้นทั้งหมดของเฟรมที่วาดล่าสุด (พิกัดหน้าจอ) — ใช้ทั้งวาดกรอบแดงและ hit-test เมาส์
  const framePiecesRef = useRef<FramePiece[]>([])
  // ตัวปลุกให้แถบเลเยอร์ re-render ตามเฟรมที่เล่นอยู่
  // draw loop วาดที่ 30fps แต่ setState ทุกเฟรมคือ re-render ทั้ง popup 30 ครั้ง/วินาที
  // → หน่วงเป็นช่วงๆ แทน (เฉพาะตอนเปิดแถบ) ปิดแถบแล้วไม่มี setState เลย
  const [layerTick, setLayerTick] = useState(0)
  const [layerPanelPos, setLayerPanelPos] = useState({ x: 12, y: 12 })
  const layerTickAtRef = useRef(0)
  const attackRangeRef = useRef<number | null>(null)
  const rangerIdRef = useRef(rangerId)
  useEffect(() => { rangerIdRef.current = rangerId }, [rangerId])
  // ── ตัวช่วยจูนหมุดแนวตั้งของท่าไม่บิน (ชั่วคราว) ──
  // ค่า 0 = ยึด origin ของไฟล์เอฟเฟกต์, บวก = ดันภาพขึ้น, ลบ = ดันภาพลง (หน่วย world เดียวกับ .sam)
  // ข้อมูลกระสุนตัวล่าสุดที่เสก — โชว์ความสูงเอฟเฟกต์คู่กับค่า offset เพื่อคำนวณสัดส่วน
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // ── ฉากพื้นหลังจากด่าน ──
  const [bgStage, setBgStage] = useState<string | null>(null)
  // เปิดฉากพื้นหลังอยู่ = บันทึกรูป/วิดีโอไม่ได้ ต้องปิดพื้นหลังก่อน
  const bgOn = bgStage !== null
  // ไฟล์ทั่วไปที่ไม่ใช่เรนเจอร์ (เปิดจากหน้า /res) — ฉากพื้นหลัง กระสอบทราย และเส้นระยะโจมตี
  // เป็นของเฉพาะเรนเจอร์ ใช้กับไฟล์อย่างไอคอนเมนูหรือเอฟเฟกต์ไม่ได้ จึงไม่ต้องมีปุ่มพวกนี้
  const plainSam = samFilesOverride !== undefined
  const [showBgPanel, setShowBgPanel] = useState(false)
  const [bgLoading, setBgLoading] = useState(false)
  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null)
  // กระสอบทราย — โหลดครั้งเดียวตอนเปิดพื้นหลังครั้งแรก แล้ว cache ไว้
  const dummyRef = useRef<DummyAsset | null>(null)
  const dummyIdRef = useRef<string>('')
  const rearDummyRef = useRef<DummyAsset | null>(null)
  const rearGapRef = useRef(0)          // ระยะ MAIN-ถึง-MAIN ของแนวหลัง (world unit) 0 = ไม่มี
  const rearHitRef = useRef<HitEvent[]>([])
  const edgeDummyRef = useRef<DummyAsset | null>(null)
  const edgeHitRef = useRef<HitEvent[]>([])
  // ปฏิกิริยาตอนเป้าหมายโดนตี — โจมตีปกติ = กระพริบแดง, สกิล = เล่น anim ท่าโดนตี 1 รอบ
  // ผูกกับ sceneTick เหมือนทุกอย่างในฉาก → หยุด/ย้อน/เร่งเฟรม มีผลด้วย
  // เก็บเป็น "รายการเหตุการณ์" ไม่ใช่สถานะปัจจุบันตัวเดียว เพราะสถานะเดี่ยวจะถูกล้างทิ้งเมื่อท่าโดนตีเล่นจบ
  // ย้อนเฟรมกลับไปแล้วจะไม่เหลืออะไรให้เล่นซ้ำ ต้องรอโดนตีใหม่ถึงจะเห็นอีก
  // เก็บ tick ไว้แล้วคำนวณตอนวาด → ย้อน/เดินหน้าได้เหมือนกระสุน
  const dummyHitRef = useRef<HitEvent[]>([])
  const skillTargetsRef = useRef(skillTargets)
  useEffect(() => { skillTargetsRef.current = skillTargets }, [skillTargets])
  const skillAreasRef = useRef(skillAreas)
  useEffect(() => { skillAreasRef.current = skillAreas; drawFrameRef.current() }, [skillAreas])
  const skillRearMulRef = useRef(skillRearMul)
  useEffect(() => { skillRearMulRef.current = skillRearMul; drawFrameRef.current() }, [skillRearMul])
  // ระยะที่เรนเจอร์ประเภทบินลอยเหนือพื้น (world unit) — 0 = เดินดิน
  // ไม่ได้ยกตัวเรนเจอร์ขึ้น แต่กด "ระดับพื้นของฉาก" ลงแทน กล้องจึงไม่ต้องขยับตาม
  const flyerLiftRef = useRef(0)
  // เป้าหมายเป็นตัวบินหรือไม่ (เรนเจอร์ Air Ambush) — ลอยอยู่ถนนเดียวกับเรนเจอร์ประเภทบิน
  const targetFliesRef = useRef(false)
  // ระดับพื้นของฉาก (ฉากหลัง/เป้าหมาย/แถบวัดระยะ ใช้ค่านี้ ไม่ใช่จุดยืนเรนเจอร์ตรงๆ)
  const sceneGroundY = useCallback(() => (rangerStandRef.current?.y ?? 0) + flyerLiftRef.current, [])
  useEffect(() => { flyerLiftRef.current = isFlyer ? FLYER_LIFT : 0; drawFrameRef.current() }, [isFlyer])
  useEffect(() => { targetFliesRef.current = !!isAirAmbush; drawFrameRef.current() }, [isAirAmbush])
  // ระดับพื้นของ "เป้าหมายแนวหน้า" — ยกขึ้นไปถนนบนฟ้าถ้าเป้าหมายเป็นตัวบิน
  const targetGroundY = useCallback(() => sceneGroundY() - (targetFliesRef.current ? FLYER_LIFT : 0), [sceneGroundY])
  // canvas ชั่วคราวสำหรับย้อมสีหุ่น (ใช้เฉพาะตอนกระพริบ)
  const dummyFxCanvasRef = useRef<HTMLCanvasElement | null>(null)
  // ระยะห่างกระสอบทราย = ATK Range ของเรนเจอร์หลัก (ไม่มีค่า → ใช้ค่าเริ่มต้น)
  const dummyGapRef = useRef(DUMMY_FALLBACK_RANGE * PT_TO_WORLD)
  useEffect(() => {
    dummyGapRef.current = (attackRange && attackRange > 0 ? attackRange : DUMMY_FALLBACK_RANGE) * PT_TO_WORLD
    drawFrameRef.current()
  }, [attackRange, skillTargets, skillRearMul])

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const frameIdxRef = useRef(0)
  const spritesRef = useRef<SpriteMap | null>(null)
  // ── refs สำหรับ draw loop — วาดตรงใน rAF โดยไม่ผ่าน React state (กัน re-render 30fps) ──
  const samRef = useRef<SAMParser | null>(null)
  // ไฟล์ที่กำลังแสดงเป็นไฟล์กระสุน (bul/bul2/bul3) หรือไฟล์ตัวละคร — ตัดสินว่าจะวัดกรอบด้วยวิธีไหน
  const viewingBulletFileRef = useRef(false)
  // กึ่งกลางรูปของ anim normal / finish ตอนเปิดดูไฟล์กระสุนตรงๆ — โชว์เป็นหมุดใน Hitbox
  const viewCentersRef = useRef<{ normal: { x: number; y: number } | null; finish: { x: number; y: number } | null }>({ normal: null, finish: null })
  const animIdxRef = useRef(0)
  const zoomRef = useRef(1.5)
  const originRef = useRef<{ x: number; y: number }>({ x: 300, y: 300 })
  const showGridRef = useRef(true)
  const showHitboxRef = useRef(false)
  // ข้อมูลจุดปล่อยกระสุน/ความเร็ว/มุมโค้ง จาก projectile_data ต่อประเภทโจมตี (game unit — origin เดียวกับ world ของ .sam)
  const attackMetaRef = useRef<Record<'normal' | 'skill1' | 'skill2', AttackMeta | null>>({ normal: null, skill1: null, skill2: null })
  // Hitbox ของเรนเจอร์หลัก — คำนวณครั้งเดียวจาก bbox ของ anim ท่ายืน x shadowCenter/faceCenter (ค่าคงที่)
  const mainShadowCenterRef = useRef<{ x: number; y: number } | null>(null)
  const mainFaceCenterRef = useRef<{ x: number; y: number } | null>(null)
  const mainAnchorRef = useRef<{ x: number; y: number } | null>(null)
  // จุดยืนของ "ตัวเรนเจอร์" — อัปเดตเฉพาะตอนไฟล์ที่แสดงเป็นไฟล์ตัวละครเท่านั้น
  // แยกจาก mainAnchorRef เพราะอันนั้นคือหมุดของ "ไฟล์ที่กำลังดู" ซึ่งอาจเป็นไฟล์กระสุน
  // ถ้าเอา mainAnchorRef ไปใช้จัดพื้นหลัง/หมุดเอฟเฟกต์/ตำแหน่งหุ่น พอผู้ใช้สลับไปดูไฟล์กระสุน
  // ค่าจะกลายเป็นจุดของไฟล์กระสุนแทนจุดยืนเรนเจอร์ ทุกอย่างเลยเลื่อนตามไปหมด
  const rangerStandRef = useRef<{ x: number; y: number } | null>(null)
  const mainFaceAnchorRef = useRef<{ x: number; y: number } | null>(null)
  // ── ระบบเสกกระสุน (bul/bul2/bul3) พุ่งใส่กระสอบทราย ──
  const sceneTickRef = useRef(0)                                   // ตัวนับ tick รวมแบบอิสระ (เดิน/ถอยตาม play+step) ไม่ผูกกับความยาว anim ไหน
  const spawnCheckRef = useRef<{ animKey: string; lastFrame: number }>({ animKey: '', lastFrame: -1 })
  // ── เสียงท่าโจมตี — ผูกกับไทม์ไลน์ของเฟรมแบบวิดีโอ ──
  // ทุกครั้งที่วาดเฟรม คำนวณว่า "ที่เฟรมนี้ควรได้ยินเสียงไหน ที่วินาทีเท่าไหร่ของไฟล์" แล้วซิงก์ตัวเล่นให้ตรง
  // จึงทำงานเหมือนวิดีโอ: หยุดแล้วเล่นต่อจากจุดเดิม, ย้อน/ลากไปเฟรมไหนก็ได้ยินเสียงช่วงนั้น,
  // จุดตัด Start/End ตัดเสียงไปด้วย (ตอนวนกลับไป Start frame เสียงกระโดดกลับตามภาพ)
  // เดิมเป็นแบบ "สั่งเล่นเมื่อเฟรมข้ามจุดร่าย" ซึ่งรู้แค่ว่าควรเริ่มเมื่อไหร่ ไม่รู้ว่าตอนนี้ควรอยู่ตรงไหน
  // กติกา: เสียงเดียวในเวลาเดียว (ตัวละครหนึ่งตัวร่ายได้ทีละท่า) — คิวที่ใหม่กว่าแทนคิวเก่า
  const soundUrlsRef = useRef<UnitSoundUrls | null>(null)
  const playingRef = useRef(true)
  useEffect(() => { playingRef.current = playing }, [playing])
  const volumeRef = useRef(volume)
  useEffect(() => { volumeRef.current = volume }, [volume])
  const activeSoundRef = useRef<{ key: string; audio: HTMLAudioElement } | null>(null)
  // เฟรมที่ซิงก์ครั้งล่าสุด — ใช้แยก "ภาพเดินต่อตามปกติ" ออกจาก "ภาพกระโดด" (ดู syncUnitSound)
  const lastSyncFrameRef = useRef(-1)
  // เลขรุ่นของการสั่งต่อตัวเล่น — ตัวจับเวลาที่ค่อยๆ เบาเสียงแล้วหยุด เช็คเลขนี้ก่อนลงมือ
  // ไม่งั้นกดหยุดแล้วกดเล่นต่อภายใน 90ms ตัวจับเวลาเก่าจะไปหยุดเสียงที่เพิ่งเริ่มเล่นใหม่
  const soundGenRef = useRef(new WeakMap<HTMLAudioElement, number>())
  const bumpGen = useCallback((a: HTMLAudioElement) => {
    const g = (soundGenRef.current.get(a) ?? 0) + 1
    soundGenRef.current.set(a, g)
    return g
  }, [])
  const fadeAndPause = useCallback((a: HTMLAudioElement, fadeMs: number) => {
    const gen = bumpGen(a)
    if (fadeMs <= 0 || a.paused) { a.pause(); return }
    // ใช้ตัวจับเวลา ไม่ใช่ requestAnimationFrame — rAF หยุดเดินเมื่อแท็บถูกซ่อน เสียงจะไม่เคยถูกหยุด
    const start = a.volume, t0 = performance.now()
    const timer = setInterval(() => {
      if (soundGenRef.current.get(a) !== gen) { clearInterval(timer); return }
      a.volume = start * (1 - Math.min(1, (performance.now() - t0) / fadeMs))
    }, 15)
    setTimeout(() => {
      clearInterval(timer)
      if (soundGenRef.current.get(a) === gen) a.pause()
    }, fadeMs)
  }, [bumpGen])
  const stopUnitSound = useCallback((fadeMs = SOUND_FADE_MS) => {
    const act = activeSoundRef.current
    if (!act) return
    activeSoundRef.current = null
    fadeAndPause(act.audio, fadeMs)
  }, [fadeAndPause])
  // คิวเสียงของท่าหนึ่ง: [เฟรมที่เริ่มร่าย, ไฟล์เสียงร่าย] เรียงตามเฟรม
  const animSoundCues = useCallback((sm: SAMParser, animName: string): { frame: number; url: string }[] => {
    const urls = soundUrlsRef.current
    if (!urls) return []
    const out: { frame: number; url: string }[] = []
    const atk = ATTACK_ANIM_MAP[animName]
    if (atk) {
      const url = urls[atk.kind]?.preparation
      if (url) out.push({ frame: 0, url })
    } else if (animName === '_all') {
      if (allTriggerCacheRef.current.sam !== sm) {
        allTriggerCacheRef.current = { sam: sm, list: allAttackTriggers(sm) }
      }
      for (const t of allTriggerCacheRef.current.list) {
        const url = urls[t.kind]?.preparation
        if (url) out.push({ frame: t.prepFrame, url })
      }
    }
    return out.sort((x, y) => x.frame - y.frame)
  }, [])
  const startAt = useCallback((a: HTMLAudioElement, offset: number) => {
    bumpGen(a)   // ยกเลิกการค่อยๆ หยุดที่ค้างอยู่ (ถ้ามี)
    a.volume = Math.max(0, Math.min(1, volumeRef.current * SKILL_SOUND_VOLUME))
    try { a.currentTime = offset } catch { /* ยังโหลดไม่เสร็จ — เล่นจากต้นไฟล์แทน */ }
    a.play().catch(() => { /* autoplay policy */ })
  }, [bumpGen])
  const syncUnitSound = useCallback((sm: SAMParser, animName: string, frame: number) => {
    // หยุดอยู่ = เงียบ (เหมือนกด pause วิดีโอ) — ตอนกดเล่นต่อ เฟรมแรกที่วาดจะซิงก์กลับมาเอง
    if (!playingRef.current) return
    // จำเฟรมไว้ทุกครั้ง (รวมจังหวะที่ไม่มีเสียง) ให้การเช็ค "ภาพกระโดดไหม" อิงเฟรมก่อนหน้าจริงๆ
    const last = lastSyncFrameRef.current
    lastSyncFrameRef.current = frame
    if (volumeRef.current <= 0) { stopUnitSound(0); return }
    const fpsNow = sm.animRate || 24
    // คิวล่าสุดที่เริ่มไปแล้ว ณ เฟรมนี้ (เสียงเดียวในเวลาเดียว คิวใหม่กว่าชนะ)
    let cue: { frame: number; url: string } | null = null
    for (const c of animSoundCues(sm, animName)) { if (c.frame <= frame) cue = c; else break }
    const act = activeSoundRef.current
    if (!cue) { if (act) stopUnitSound(); return }
    const audio = soundAudioFor(cue.url)
    const offset = (frame - cue.frame) / fpsNow
    // เลยความยาวไฟล์ไปแล้ว = เสียงของคิวนี้จบไปแล้ว ไม่ต้องเล่นซ้ำ
    // (ยังไม่รู้ความยาว = ไฟล์ยังโหลดไม่เสร็จ → ถือว่ายังไม่จบ)
    const dur = Number.isFinite(audio.duration) ? audio.duration : Infinity
    if (offset >= dur) { if (act) stopUnitSound(); return }
    const key = `${animName}|${cue.frame}|${cue.url}`
    if (act && act.key === key) {
      if (audio.paused) {
        // เล่นจบเองไปแล้วและภาพก็เดินต่อจากจุดนั้น → ไม่ต้องเล่นหางซ้ำ
        if (audio.ended && offset >= dur - SOUND_SYNC_TOLERANCE) return
        startAt(audio, offset)
      } else if (frame !== last && frame !== last + 1) {
        // ภาพกระโดด (ลากหลอด/ย้อนเฟรม/วนกลับ Start frame) → เสียงกระโดดตาม
        // เดินหน้าทีละเฟรมตามปกติไม่แก้ตำแหน่งเสียง แม้จะคลาดกันบ้าง — ถ้าไล่แก้ทุกครั้งที่คลาด
        // เครื่องที่วาดได้ช้ากว่า 30fps เสียงจะโดนดึงกลับถี่ๆ จนฟังเป็นเสียงสะดุด
        audio.currentTime = offset
      }
      return
    }
    // คิวเปลี่ยน → ค่อยๆ หยุดเสียงเก่า แล้วเริ่มเสียงใหม่ที่ตำแหน่งตรงกับภาพ
    // (ไฟล์เดียวกันคนละคิว ใช้ตัวเล่นตัวเดิม แค่กระโดดตำแหน่ง ไม่ต้องค่อยๆ หยุด)
    if (act && act.audio !== audio) fadeAndPause(act.audio, SOUND_FADE_MS)
    activeSoundRef.current = { key, audio }
    startAt(audio, offset)
  }, [animSoundCues, stopUnitSound, fadeAndPause, startAt])
  // กดหยุด → เงียบ / ปิด popup → หยุดทันที
  // ── เสียงตอนโดน (underAttack) — เสียงสั้นแบบยิงครั้งเดียว ซ้อนกันได้ (หลายนัดโดนพร้อมกัน)
  // ไม่ผ่าน syncUnitSound เพราะไม่ได้ผูกกับเฟรมของตัวละคร แต่ผูกกับจังหวะที่กระสุน/ท่าไปถึงกระสอบทราย
  // ใช้สำเนาของตัวที่อุ่นไว้ (cloneNode) — ไฟล์มาจากแคชเดียวกัน แต่เล่นซ้อนกันเองได้
  const hitAudiosRef = useRef(new Set<HTMLAudioElement>())
  const playHitSound = useCallback((kind: AttackKind) => {
    if (!playingRef.current || volumeRef.current <= 0) return
    const url = soundUrlsRef.current?.[kind]?.underAttack
    if (!url) return
    const a = soundAudioFor(url).cloneNode(true) as HTMLAudioElement
    a.volume = Math.max(0, Math.min(1, volumeRef.current * SKILL_SOUND_VOLUME))
    const set = hitAudiosRef.current
    set.add(a)
    a.onended = () => set.delete(a)
    a.play().catch(() => set.delete(a))
  }, [])
  const stopHitSounds = useCallback(() => {
    for (const a of hitAudiosRef.current) a.pause()
    hitAudiosRef.current.clear()
  }, [])
  useEffect(() => { if (!playing) { stopUnitSound(); stopHitSounds() } }, [playing, stopUnitSound, stopHitSounds])
  useEffect(() => () => { stopUnitSound(0); stopHitSounds() }, [stopUnitSound, stopHitSounds])
  // จุดยิงของ _all คำนวณครั้งเดียวต่อไฟล์ — เดิมสร้าง Map+array+sort ใหม่ทุกเฟรม
  const allTriggerCacheRef = useRef<{ sam: SAMParser | null; list: ReturnType<typeof allAttackTriggers> }>({ sam: null, list: [] })
  const activeBulletsRef = useRef<ActiveBullet[]>([])
  const bulletCacheRef = useRef<Map<string, BulletAsset | null>>(new Map())
  // เรียกเมื่อ sam/sprites หรือ shadowCenter/faceCenter พร้อมทั้งคู่ — คำนวณ anchor ใหม่ (ไม่ใช่ทุกเฟรม)
  const recomputeMainAnchor = useCallback(() => {
    const s = samRef.current, spr = spritesRef.current
    if (!s || !spr) { mainAnchorRef.current = null; mainFaceAnchorRef.current = null; return }
    // ไฟล์ตัวละคร → กรอบแม่นยำ (ค่าหมุดเอฟเฟกต์ท่าไม่บินถูกจูนบนกรอบนี้ ถ้าสลับจะเพี้ยนได้ถึง 39 หน่วย)
    // ไฟล์กระสุน → กรอบหลวม ให้ตรงกับจุดเล็งที่ loadBulletSam ใช้ และตรงกับที่ผู้ใช้ตรวจแล้วว่าถูก
    // (u286u-brown-bul3 สไปรต์ถูก anim ขยายไว้มาก กรอบสองแบบต่างกันถึง 75 หน่วย)
    viewCentersRef.current = viewingBulletFileRef.current
      ? {
          normal: s.animations['normal']?.length ? animFrame0Center(s, spr, 'normal') : null,
          finish: s.animations['finish']?.length ? animFrame0Center(s, spr, 'finish') : null,
        }
      : { normal: null, finish: null }
    const bbox = (viewingBulletFileRef.current ? animBBoxLoose : animBodyBBox)(s, spr, pickIdleAnimName(s))
    const sc = mainShadowCenterRef.current, fc = mainFaceCenterRef.current
    // จุดยืนอ่านจากเงาที่วาดไว้ในไฟล์ (ดู animStandPoint) แม่นกว่าการคิดจากสัดส่วนของกรอบ
    // ไฟล์กระสุนไม่มีเงาตัวละคร จึงยังใช้วิธีเดิมกับกรอบหลวมเหมือนก่อน
    mainAnchorRef.current = viewingBulletFileRef.current
      ? (bbox && sc ? anchorFromRatio(bbox, sc) : null)
      : animStandPoint(s, spr, pickIdleAnimName(s), sc)
    if (!viewingBulletFileRef.current) rangerStandRef.current = mainAnchorRef.current
    mainFaceAnchorRef.current = bbox && fc ? anchorFromRatio(bbox, fc) : null
    drawFrameRef.current()
  }, [])
  // ── สั่งปฏิกิริยาโดนตี ──
  // เป้าหมายที่เล็งโดนเสมอ ส่วนอีกตัวโดนด้วยก็ต่อเมื่อ MAIN ของมันอยู่ในวง Area ของสกิล
  // (สกิลที่ตีแนวหลังแต่วงกว้างพอจะคลุมแนวหน้าด้วย → แนวหน้าต้องกระเด็นตาม
  //  ถ้าแนวหลังอยู่ไกลจนวงไม่ถึง แนวหน้าก็ไม่ต้องกระเด็น)
  const applyHitReaction = useCallback((aimRear: boolean, isSkill: boolean, areaWorld: number, centerX: number) => {
    const tick = sceneTickRef.current
    pushHit((aimRear ? rearHitRef : dummyHitRef).current, tick, isSkill)
    if (areaWorld <= 0) return
    // ตัวที่ยืนสุดขอบวงอยู่ห่างเท่ารัศมีพอดี → อยู่ในระยะเสมอเมื่อสกิลมี Area
    pushHit(edgeHitRef.current, tick, isSkill)
    const other = aimRear ? dummyRef.current : rearDummyRef.current
    const otherGap = aimRear ? dummyGapRef.current : rearGapRef.current
    if (!other || otherGap <= 0) return
    const standX = rangerStandRef.current?.x ?? 0
    const standY = aimRear ? targetGroundY() : sceneGroundY()
    const p = dummyPointWorld(
      other, other.anchor ?? other.faceAnchor,
      dummyDrawOffset(other, standX, otherGap),
      dummyYAlign(standY, other.anchor?.y ?? 0),
    )
    if (Math.abs(p.x - centerX) <= areaWorld) {
      pushHit((aimRear ? dummyHitRef : rearHitRef).current, tick, isSkill)
    }
  }, [sceneGroundY, targetGroundY])
  // เสกกระสุน 1 นัด พุ่งจากจุดโจมตี (NormalATK/Skill1/Skill2) ไปยัง Face Center ของกระสอบทราย (จุดรับดาเมจจริง ไม่ใช่จุดยืน)
  // ทำงานเฉพาะตอนเปิดพื้นหลัง+มีกระสอบทราย และไฟล์กระสุนที่เกี่ยวข้องโหลดสำเร็จแล้วเท่านั้น
  const spawnBullet = useCallback((kind: 'normal' | 'skill1' | 'skill2', fallbackSuffix: string) => {
    // สกิลที่เล็ง Rear Enemy ยิงไปที่เป้าหมายแนวหลัง ไม่ใช่ตัวหน้า — ปฏิกิริยาก็ไปลงตัวนั้นด้วย
    const useRear = kind !== 'normal'
      && skillTargetsRef.current?.[kind] === 'rear'
      && !!rearDummyRef.current && rearGapRef.current > 0
    const dummy = useRear ? rearDummyRef.current : dummyRef.current
    const hitRef = useRear ? rearHitRef : dummyHitRef
    const gap = useRear ? rearGapRef.current : dummyGapRef.current
    if (!bgCanvasRef.current || !dummy) return
    const meta = attackMetaRef.current[kind]
    if (!meta) return
    // ── แยกสกิลโจมตีออกจากสกิลบัฟ ──
    // ตัวชี้ขาดคือ 觸發基準 ที่โชว์อยู่ใต้คำอธิบายสกิล: Self = บัฟตัวเอง, Front/Rear Enemy = โจมตี
    // (ค่าเดียวกับที่ผู้ใช้เห็นบนหน้าจอ จึงตรงกับที่คาดหวังเสมอ)
    // ถ้าไม่มีค่านั้น (สกิลไม่มีข้อมูล หรือเป็นท่าโจมตีปกติ) ค่อยถอยไปใช้ motion.type === "NONE"
    // ซึ่งครอบคลุมได้กว้างแต่หยาบกว่า — เช็คแล้ว 3,393 ท่าเป็น NONE ทั้งที่ยังมี animationPart ติดมาด้วย
    const basis = kind === 'normal' ? null : skillTargetsRef.current?.[kind] ?? null
    const isBuff = basis ? basis === 'self' : meta.motionType === 'NONE'
    // ไฟล์กระสุนจริงมาจาก API (animationPart) ตรงๆ — ใช้ fallback (จาก ATTACK_ANIM_MAP) แค่ตอน API ไม่ส่งมาให้
    const suffix = meta.animationPart ?? fallbackSuffix
    // undefined = ยังโหลดไม่เสร็จ / null = โหลดแล้วแต่ไม่มีไฟล์นี้จริงๆ
    const asset = bulletCacheRef.current.get(suffix)
    if (!asset) {
      // ตัวระยะประชิดไม่มีไฟล์กระสุน ท่าโจมตีอยู่ใน body ล้วนๆ → ไม่มีกระสุนลอยไปชนให้ทริกเกอร์
      // สั่งปฏิกิริยาตรงนี้เลย (จุดนี้คือจังหวะที่ _ready เล่นจบพอดี ซึ่งเป็นจังหวะที่ออกอาวุธ)
      // เช็ค === null เท่านั้น ไม่งั้นตัวระยะไกลที่ไฟล์ยังโหลดไม่เสร็จจะถูกนับเป็นประชิดไปด้วย
      if (asset === null && !isBuff) {
        const off = dummyDrawOffset(dummy, rangerStandRef.current?.x ?? 0, gap)
        const yOff = dummyYAlign(useRear ? sceneGroundY() : targetGroundY(), dummy.anchor?.y ?? 0)
        applyHitReaction(
          useRear, kind !== 'normal',
          kind === 'normal' ? 0 : (skillAreasRef.current?.[kind] ?? 0) * PT_TO_WORLD,
          dummyPointWorld(dummy, dummy.anchor ?? dummy.faceAnchor, off, yOff).x,
        )
        playHitSound(kind)
      }
      return
    }
    // จุดปล่อย = ค่า start จาก API แปลงผ่าน attackStartWorld — จุดเดียวกับ marker "NormalATK/Skill1/Skill2"
    // สีเหลือง/ม่วง/ส้ม ที่เห็นตอนเปิด Hitbox เป๊ะ (ใช้ฟังก์ชันเดียวกัน กระสุนจึงออกตรงหมุดเสมอ)
    const startKey = `${rangerIdRef.current}:${kind}`
    const sp = attackStartWorld(meta.start, rangerStandRef.current?.y ?? 0, startKey)
    // motion.enabled=false = ไม่มีการพุ่งจริง (เช่น วาปไปตี/ตกจากฟ้าทุบพื้น/melee) — ใช้ค่านี้จาก API ตรงๆ แทนการเดาจาก moveSpeed
    // ── ท่าที่ไม่มีการ "พุ่ง" จริง → เอฟเฟกต์เกิดคาตัวเป้าหมาย ──
    //   motion.enabled=false หรือ moveSpeed=0 → ชัดเจนว่าไม่บิน
    //   start={0,0} → ประกาศว่าบิน (enabled=true, moveSpeed>0) แต่ไม่มีจุดปล่อยให้บินออกมา
    //     พวกนี้คือสกิลตกจากฟ้า/เกิดคาตัวศัตรู เช่น u1054h-knuckles skill2 (enabled=true speed=60
    //     แต่ start={0,0}) ถ้าจัดเป็นกระสุนบินจะไปเล็ง FACE แล้วตำแหน่งแกน Y เพี้ยนต่ำลงไปมาก
    //     พบ 116 ท่าที่เป็นแบบนี้ ทั้งหมดควรใช้กฎเดียวกับท่าวาปมาตี
    const isInstant = !meta.motionEnabled || meta.moveSpeed <= 0 || (!meta.start.x && !meta.start.y)
    const dummyYOff = dummyYAlign(useRear ? sceneGroundY() : targetGroundY(), dummy.anchor?.y ?? 0)
    const dummyOff = dummyDrawOffset(dummy, rangerStandRef.current?.x ?? 0, gap)
    // วง Area ของสกิลนี้ (pt → world) และจุดกึ่งกลาง = MAIN ของเป้าหมายที่เล็ง
    const areaWorld = kind === 'normal' ? 0 : (skillAreasRef.current?.[kind] ?? 0) * PT_TO_WORLD
    const mainPt = dummyPointWorld(dummy, dummy.anchor ?? dummy.faceAnchor, dummyOff, dummyYOff)
    const areaCenterX = mainPt.x
    // จุดเป้าหมาย ขึ้นกับว่าเป็นกระสุนบินหรือเอฟเฟกต์ที่เกิดคาตัวเป้าหมาย:
    //   • บินจริง (enabled:true)  → FACE = จุดรับดาเมจ (อก/หัว) เพราะกระสุนลอยมาชนตัว
    //   • ไม่บิน  (enabled:false) → MAIN = จุดยืน เพราะเป็นเอฟเฟกต์ที่เกิดคาตัวเป้าหมายบนพื้น
    // ── เล็ง MAIN (จุดยืน) หรือ FACE (จุดรับดาเมจ) ของเป้าหมาย ──
    //   ท่าไม่บิน → MAIN (เกิดคาตัวบนพื้น) ยกเว้นไฟล์ที่ระบุ targetFace ไว้
    //   กระสุนบิน → FACE ตามปกติ แต่ถ้า hitPointRate = 0 ต้องไปลงที่พื้น (MAIN)
    // targetFace บังคับให้เล็ง FACE ได้ทั้งท่าไม่บินและกระสุนบิน
    // จำเป็นเพราะ hitPointRate=0 ไม่พอเป็นกฎ: u1616e-brown-bul (rate 0) ต้องลงพื้น
    // แต่ u1522e-po-bul (rate 0 เหมือนกัน) ต้อง face ชน face — ยังไม่เจอฟิลด์ไหนแยกสองกลุ่มนี้ได้
    // ── hitPointRate เป็นเศษส่วน (0 < rate <= 1) → เอาจุดของกระสุนเองไปชน FACE ของเป้าหมาย ──
    // ต่างจาก 100 (จุดรับดาเมจตามปกติ) และ 0 (ลงพื้น) ซึ่งเป็นค่าคนละสเกลกัน
    //   ท่าไม่บิน  : ยึด 0,0 ของไฟล์ ไปโผล่ที่ FACE ของเป้าหมาย (u1577e-ap-bul3, u1622e-re-bul2 rate 0.5
    //                / u1526e-ko-bul2 rate 1)
    //   กระสุนบิน : ยึดหมุด MAIN ของกระสุน (shadowCenter x กรอบ ไม่ใช่ 0,0) ออกจากปากกระบอก
    //               แล้ววิ่งไปชน FACE ของเป้าหมาย (u1556e-af-bul3 rate 0.5)
    // วัดแล้ว MAIN ห่างจาก 0,0 คนละระยะทุกไฟล์ (ap 197, re 143, af 78) จึงเป็นคนละจุดกันจริง
    // ครอบคลุม 353 ท่า (0.5 = 308, 1 = 34, 0.3 = 11) — ยืนยันด้วยตาแล้ว 5 ตัว ที่ rate 0.5 กับ 1
    // ส่วน 0.3 ยังไม่มีตัวยืนยัน เป็นการเหมารวมเพราะอยู่สเกลเดียวกัน ถ้าเจอตัวเพี้ยนต้องแยกออก
    const halfRate = meta.hitPointRate > 0 && meta.hitPointRate <= 1
    const ov = bulletOverride(asset.fileKey)
    const forceFace = ov?.targetFace === true || halfRate
    // ── ท่าไม่บินที่เป็น "ของตกมาจากฟ้า" เท่านั้นที่ลงพื้น ส่วนที่เหลือเกิดคาตัวเป้าหมาย ──
    const dropFromSky = asset.artTop !== null && asset.artTop <= INSTANT_DROP_ART_TOP
    // ไฟล์ที่ระบุพิกัดหมุดไว้ตรงๆ = จูนด้วยตาจนตรงแล้ว อย่าเปลี่ยนพฤติกรรม
    const pinnedAnchor = ov?.x !== undefined || ov?.y !== undefined
    const aimGround = !forceFace && (meta.hitPointRate === 0 || (isInstant && (dropFromSky || pinnedAnchor)))
    // หมุดสองแบบ: แบบท่าวาปมาตี (จุดยืนเรนเจอร์ + รอยพื้น) กับ face ของกระสุนเอง
    // ลำดับความสำคัญของหมุดท่าไม่บิน: ค่าที่ระบุตรงๆ → กฎ rate 0.5 (0,0) → จุดยืนเรนเจอร์
    const instA = {
      x: ov?.x ?? (halfRate ? 0 : rangerStandRef.current?.x ?? 0),
      y: ov?.y ?? (halfRate ? 0 : instantAnchorY(rangerStandRef.current?.y ?? 0, asset.decalY)),
    }
    const faceA = asset.faceAnchor ?? { x: 0, y: 0 }
    const targetFacePt = dummyPointWorld(dummy, dummy.faceAnchor ?? dummy.anchor, dummyOff, dummyYOff)
    const targetMainPt = dummyPointWorld(dummy, dummy.anchor ?? dummy.faceAnchor, dummyOff, dummyYOff)
    // ── จุดที่ต้องไปแตะบนตัวเป้าหมาย ──
    // ค่าตั้งต้น = CENTER (ระดับอก) ไม่ใช่ FACE อีกแล้ว เพราะ faceCenter จาก API ผูกกับสัดส่วนหัว
    // ของแต่ละตัว วัดแล้วเหวี่ยง 59-69% ของความสูง (ตัวหัวโตดันไปถึงระดับหัว = ปาใส่หัว)
    // ส่วน CENTER เกาะกลุ่ม 46-47% ทุกตัว — ยืนยันด้วยตาแล้ว 8 ไฟล์ว่าต้องเป็นจุดนี้
    // targetFace ยังบังคับให้กลับไปใช้ FACE ได้สำหรับไฟล์ที่ต้องการจริงๆ
    const targetCenterPt = ov?.targetFace === true || !dummy.centerAnchor
      ? targetFacePt
      : dummyPointWorld(dummy, dummy.centerAnchor, dummyOff, dummyYOff)
    const target = isBuff
      // ท่าบัฟเกิดที่ตัวผู้ร่าย ไม่ใช่ที่เป้าหมาย
      ? { x: rangerStandRef.current?.x ?? 0, y: rangerStandRef.current?.y ?? 0 }
      : aimGround ? targetMainPt : targetCenterPt
    // ── กระสุนบินที่ต้องลงพื้น (hitPointRate=0) ──
    // หมุดคุมทั้งจุดปล่อยและจุดตก แก้ที่หมุดจึงพังอีกฝั่งเสมอ:
    //   ใช้หมุด face → จุดปล่อยถูก แต่ตอนจบภาพลอยสูงเท่าระยะ face
    //   ใช้หมุดวาปมาตี → ตอนจบถูก แต่จุดปล่อยเพี้ยน
    // → คงหมุด face ไว้ (จุดปล่อยถูก) แล้วเลื่อนปลายทางเท่าผลต่างของสองหมุด
    //   พอหมุด face ถึงปลายทางนั้น origin ของภาพจะไปอยู่ที่เดียวกับที่หมุดวาปมาตีจะให้พอดี
    // เลื่อนปลายทางเพื่อให้ "จุดที่ต้องแตะเป้าหมาย" ไปตรงเป้า โดยไม่ต้องย้ายหมุด (จุดปล่อยจึงไม่เพี้ยน)
    // สูตรนี้เป็นค่าเชิงผลต่าง (หมุด - instA) → ผลลัพธ์คือ "จุดยืนเรนเจอร์ในพิกัดไฟล์กระสุน
    // ไปตกที่ MAIN ของเป้าหมาย" เหมือนกันหมดไม่ว่าหมุดจะเป็นอะไร นี่คือเงื่อนไขที่ยืนยันด้วยตาแล้ว
    // สำหรับท่าพุ่งเข้าไปชน (u1616e-brown-bul / u1526e-ko-bul: main กระสุนอยู่แกน Y เดียวกับ main เป้าหมาย)
    // เคยลองเปลี่ยนหมุดกลุ่มนี้ไปยึด "เส้นพื้นของภาพ" แล้วแย่ลง — อย่าทำซ้ำ ปล่อยให้สูตรผลต่างทำงาน
    //   aimGround   : หมุดอะไรก็ได้ → ภาพไปลงตำแหน่งเดียวกับหมุดวาปมาตี
    //   contactFace : หมุด MAIN (จาก rate=0.5) → อยากให้ face เป็นจุดแตะแทน MAIN
    const contactFace = ov?.contactFace === true
    const mainA = asset.shadowAnchor ?? { x: 0, y: 0 }
    // ── หมุดช่วงบิน ──
    // ค่าตั้งต้น = จุดกึ่งกลางรูปกระสุนของ anim ช่วงนั้นเอง (ไม่ใช่หมุด face อีกแล้ว)
    // หมุด face เดิมคือ faceCenter ของ "คน" (0.54-0.69 ของลำตัว) เอาไปคูณกรอบของลูกกระสุน
    // ซึ่งไม่มีหน้า → ค่าที่ได้แปรตามขนาดไฟล์กระสุนแต่ละตัว ไม่ใช่จุดที่มีความหมาย
    // → "center ของกระสุน ไปอยู่ที่ center ของเป้าหมาย"
    // กฎที่ยืนยันด้วยตาแล้วยังอยู่: ท่าลงพื้นใช้ instA / hitPointRate<=1 ใช้หมุด MAIN ของกระสุน
    const flightA = (isInstant && aimGround) ? instA
      : (halfRate ? mainA : (asset.spawnRef ?? asset.burstRef ?? faceA))
    // ── ท่าพุ่งเข้าไปชนที่ลงพื้น: หมุด MAIN ของกระสุน ไปชน MAIN ของเป้าหมาย ──
    // MAIN ของกระสุน = shadowCenter x กรอบแม่นยำ (จุดเดียวกับเส้น MAIN ในโหมด Hitbox)
    // ไม่ใช่ instA (จุดยืนเรนเจอร์) และไม่ใช่ขอบล่างภาพ — สองอย่างนั้นลองแล้วเพี้ยนทั้งคู่:
    //   instA      → ตัวด้วง u1616e-brown-bul ลอยเหนือพื้น 56 หน่วย (ขอบล่างภาพ 27.6 / พื้น rig 83)
    //   ขอบล่างภาพ → แกน X กระเด็นไปซ้าย 109 หน่วย (กึ่งกลางกรอบ -46 / จุดยืน 63)
    const shiftX = !isInstant && aimGround ? flightA.x - mainA.x
      : !isInstant && halfRate && contactFace ? flightA.x - faceA.x : 0
    const shiftY = !isInstant && aimGround ? flightA.y - mainA.y
      : !isInstant && halfRate && contactFace ? flightA.y - faceA.y : 0
    // ท่าพุ่งเข้าไปชน (กระสุนบิน + ลงพื้น): หยุดก่อนถึงตัวเป้าหมายเล็กน้อย ไม่ให้ภาพทับกันเกินไป
    const stopShort = !isInstant && aimGround ? CHARGE_STOP_SHORT : 0
    const endX = target.x + shiftX - stopShort, endY = target.y + shiftY
    // ── จุดปล่อยกระสุนบิน ──
    // หมุด (flightA) ถูกล็อกไว้ด้วยฝั่งปลายทางแล้ว แก้ที่หมุดจะพังจุดกระทบ
    // → ใช้วิธีเดียวกับที่เลื่อนปลายทาง: เลื่อน "จุดเริ่ม" เท่าผลต่างระหว่างหมุดกับจุดอ้างอิงตอนโผล่
    //   พอหมุดไปอยู่ที่จุดนั้น ภาพเฟรมแรกของกระสุนจะไปตกตรงปากกระบอกพอดี
    // ทำไมต้องใช้เฟรมแรก ไม่ใช่หมุด face เหมือนเดิม: หมุด face มาจากกรอบเฉลี่ยทุกเฟรม
    // ไฟล์ที่ anim ช่วงบินมีสไปรต์ตัวเดียวได้ค่าตรงกันเป๊ะ (จึงไม่กระทบไฟล์ที่ถูกอยู่แล้ว)
    // แต่ไฟล์หลายสไปรต์/มีหางลาก กรอบเฉลี่ยจะไถลไปตามหาง เพี้ยนมัธยฐาน 19 สูงสุด 148 หน่วย
    // ข้ามไฟล์ที่มีค่าใน ATTACK_START_OVERRIDE เพราะนั่นเป็นพิกัดที่จูนด้วยตาจนตรงแล้ว
    // ── ท่าวิ่ง/พุ่งเข้าไปตี: ไฟล์ bul เป็นตัวละคร ไม่ใช่ลูกกระสุน ──
    // จุดปล่อยต้องให้ "เงาในไฟล์กระสุน" ทับ "เงาของเรนเจอร์" พอดี ไม่ใช่ยึดค่า start จาก API
    // (u1526e-ko-bul: เงาในไฟล์ (22, 50) / เงาเรนเจอร์ (47, 79) — ทั้งสองอ่านจากเงาที่วาดไว้จริง)
    // เดิมใช้ตัวเลขที่จูนด้วยตาใน ATTACK_START_OVERRIDE ซึ่งคำนวณบนหมุดชุดเก่า พอเปลี่ยนหมุด
    // เป็นกึ่งกลางรูปแล้วค่านั้นก็ค้างผิด — กฎนี้คำนวณเองจากไฟล์ ไม่ต้องจูนอีก
    const runIn = !isInstant && !!asset.bulShadow && !!rangerStandRef.current
    const spawnRefPt = runIn ? asset.bulShadow! : asset.spawnRef
    const spawnAt = runIn ? rangerStandRef.current! : sp
    const spawnShift = !isInstant && !ATTACK_START_OVERRIDE[startKey] && spawnRefPt
      ? { x: flightA.x - spawnRefPt.x, y: flightA.y - spawnRefPt.y }
      : { x: 0, y: 0 }
    const startX = spawnAt.x + spawnShift.x, startY = spawnAt.y + spawnShift.y
    const dist = Math.hypot(endX - startX, endY - startY)
    // moveSpeed = world-unit ต่อ "1 เฟรม/ติ๊ก" ของเกม (ไม่ใช่ต่อวินาที) — คูณ PROJECTILE_SPEED_SCALE ปรับจูนได้
    const speed = (meta.moveSpeed > 0 ? meta.moveSpeed : PROJECTILE_FALLBACK_SPEED) * PROJECTILE_SPEED_SCALE
    const normalFrames = asset.sam.animations[asset.normalName]?.length || 1
    const finishFrames = asset.finishName ? (asset.sam.animations[asset.finishName]?.length || 0) : 0
    const bulletFps = asset.sam.animRate || 24
    const bodyFpsNow = samRef.current?.animRate || 24
    // isInstant: ไม่มีการ "เดินทาง" ทางฟิสิกส์ (ไม่มี start→target ให้พุ่งข้าม) แต่ anim "normal" ของกระสุนเองอาจมีท่าอยู่แล้ว
    // เช่น ตกจากฟ้า/โผล่ขึ้นมา (ตามที่ API ไม่มีฟิลด์บอกแยก ต้องให้ anim ต้นฉบับเล่นเต็มๆ ที่ตำแหน่งเป้าหมายก่อนค่อยไป finish)
    // → เล่น normal เต็มความยาวของมันเองในที่เกิดเหตุ แทนที่จะข้าม travelTicks=0 ไป finish ทันที
    const travelTicks = isInstant
      ? Math.max(1, Math.round(normalFrames * (bodyFpsNow / bulletFps)))
      : Math.max(1, Math.round(dist / speed))
    activeBulletsRef.current.push({
      suffix, spawnTick: sceneTickRef.current,
      startX: isInstant ? endX : startX, startY: isInstant ? endY : startY,
      targetX: endX, targetY: endY,
      travelTicks, kind, isSkill: kind !== 'normal', isAttack: !isBuff, hitRear: useRear, areaWorld, areaCenterX,
      fitNormal: ov?.fitNormal === true,
      arcStartDeg: meta.angleStart, arcEndDeg: meta.angleEnd,
      motionType: meta.motionType, motionRotation: meta.motionRotation, selfArc: asset.selfArc,
      // ท่าไม่บิน (motion.enabled=false): ไฟล์เอฟเฟกต์ถูกวาดในระบบพิกัดเดียวกับ rig ของตัวละคร
      // → "จุดยืน" ของเอฟเฟกต์อยู่ที่เดียวกับจุดยืนของเรนเจอร์เจ้าของ คือเยื้องขวา-ล่างจาก origin
      // (วัดจริง 5 ตัว: +60..+74 แนวนอน, +77..+103 แนวตั้ง — ตรงกับ offset ที่จูนด้วยตา r=0.918)
      // ห้ามใช้กึ่งกลาง bbox: bbox กินทุกเฟรม ถ้าเอฟเฟกต์กวาด/ยิงลำแสงออกข้าง กึ่งกลางจะไถลตาม
      // เช่น u1023h-brown-bul3 bbox X -171..1647 → กึ่งกลาง 738 ทั้งที่เฟรมแรกอยู่ ~50 (เพี้ยน ~700)
      // ส่วน API ช่วยไม่ได้ ท่าพวกนี้ start เป็น {0,0} ล้วน
      // ท่าไม่บินยึดหมุดแบบวาปมาตี ส่วนกระสุนบินยึด face เสมอ (จุดปล่อยจึงถูกทุกกรณี)
      // กระสุนบินปกติยึดหมุด face ของตัวเอง แต่ถ้า rate=0.5 ยึด 0,0 (ฝั่งท่าไม่บิน instA เป็น 0 อยู่แล้ว)
      anchorX: flightA.x, anchorY: flightA.y,
      // finishMain: ตอนระเบิดยึด MAIN (0,0) ของไฟล์แทนหมุดช่วงบิน — จุดที่แตะเป้าหมายยังเป็นจุดเดิม
      // ── ท่าที่ "ลงพื้น" ใช้หมุดเดียวทั้งท่า ไม่แยกตามช่วง ──
      // กฎคือ MAIN ของกระสุนชน MAIN ของเป้าหมาย ซึ่งเป็นจุดเดียวตลอดท่า ไม่ใช่จุดที่ขยับตาม anim
      // ถ้าให้ช่วงระเบิดยึดกึ่งกลางรูปของตัวเอง ภาพจะกระตุกตอนกระทบ:
      //   u1616e-brown-bul ช่วงบินขอบล่างจมพื้น 12 แต่ช่วงระเบิดลอยเหนือพื้น 13 = เด้งขึ้น 25 หน่วย
      finishAnchorX: ov?.finishMain ? 0 : (aimGround ? flightA.x : (asset.burstRef?.x ?? flightA.x)),
      // ── หมุดช่วงระเบิด: แยกจากช่วงบิน เพราะกึ่งกลางรูปสองช่วงอยู่คนละที่ ──
      // (u1297e-sn-bul: normal กึ่งกลาง y -29 / finish กึ่งกลาง y +26 ห่างกัน 55)
      // ใช้กึ่งกลางรูป finish → กลางระเบิดไปตรงจุดชนพอดี ไม่ต้องพึ่งค่าเยื้องที่วาดไว้ในไฟล์
      finishAnchorY: ov?.finishMain ? 0 : (aimGround ? flightA.y : (asset.burstRef?.y ?? flightA.y)),
      normalFrames, finishFrames, bulletFps,
    })
  }, [applyHitReaction, playHitSound, sceneGroundY, targetGroundY])   // identity คงที่ทุกตัว — spawnBullet จึงไม่ถูกสร้างใหม่
  const frameLabelRef = useRef<HTMLSpanElement>(null)  // counter "X/Y" — อัปเดตผ่าน textContent
  // grid cache — grid เป็น static (เปลี่ยนแค่ตอน zoom/origin/size) → render ครั้งเดียวเก็บไว้ blit
  const gridCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const gridKeyRef = useRef<string>('')

  const drawFrameRef = useRef<() => void>(() => {})

  // ── Capture state ──
  const [selectMode, setSelectMode] = useState(false)
  const [selection, setSelection] = useState<Sel | null>(null)
  // drag state ใน ref (ไม่ต้อง re-render) — mode: วาดใหม่ / ย้าย / ลาก handle
  const dragRef = useRef<{ mode: 'new' | 'move' | Handle; startX: number; startY: number; base: Sel } | null>(null)

  // ── Confirm download dialog ──
  const [confirmAction, setConfirmAction] = useState<'png' | 'video' | null>(null)

  // ── Video export state ──
  const [showVideoPanel, setShowVideoPanel] = useState(false)
  const [vFormat, setVFormat] = useState<'webp' | 'gif' | 'mp4'>('webp')
  const [vBg, setVBg] = useState<string | null>(null)   // null = โปร่งใส (GIF เท่านั้น)
  const [vCustomColor, setVCustomColor] = useState('#9b59b6')
  const [vUseSelection, setVUseSelection] = useState(false)
  const [vAnimSeq, setVAnimSeq] = useState<SeqItem[]>([])   // ลำดับ anim ที่จะ export (index เข้า sam.animNames, ซ้ำได้ — แต่ละตัวมีช่วงเฟรมของตัวเอง)
  const [vAddAnimIdx, setVAddAnimIdx] = useState(0)         // anim ที่เลือกไว้ในช่อง "เพิ่ม Anim"
  // ── ตัด Frame เริ่มต้น/สิ้นสุด ──
  // editingSeqIdx = ตัวใน vAnimSeq ที่กำลังแก้ (null = ไม่ได้แก้ตัวไหน → ใช้ solo trim ของ anim ที่กำลังดูอยู่)
  const [editingSeqIdx, setEditingSeqIdx] = useState<number | null>(null)
  const [soloStart, setSoloStart] = useState(0)
  const [soloEnd, setSoloEnd] = useState(0)
  const scrubBarRef = useRef<HTMLDivElement>(null)
  const playheadRef = useRef<HTMLDivElement>(null)
  const scrubDragRef = useRef<'seek' | 'start' | 'end' | null>(null)
  // state คู่กับ ref ด้านบน — ใช้แค่โชว์/ซ่อน guide popup ตอนลากมาร์ค start/end (เปลี่ยนแค่ตอนเริ่ม/หยุดลาก ไม่ใช่ทุก pixel)
  const [scrubDragMode, setScrubDragMode] = useState<'seek' | 'start' | 'end' | null>(null)
  // index ของ sequence item ที่กำลังลากอยู่ — ใช้ไฮไลท์เรืองแสงเฉยๆ (border/shadow ไม่กระทบ layout ไม่ดันแถวอื่น)
  const [draggingSeqIdx, setDraggingSeqIdx] = useState<number | null>(null)
  // sync ให้ play loop (รันใน rAF อ่านจาก ref ล้วน) รู้ช่วง trim ปัจจุบันโดยไม่ต้อง restart loop ทุกครั้งที่ลากมาร์ค
  const trimStartRef = useRef(0)
  const trimEndRef = useRef(0)
  const [vExporting, setVExporting] = useState(false)
  const [vProgress, setVProgress] = useState(0)
  const [vProgressMsg, setVProgressMsg] = useState('')
  const [vError, setVError] = useState('')
  const exportCancelRef = useRef(false)
  const recorderRef = useRef<MediaRecorder | null>(null)

  // ── Touch / pinch-zoom ──
  const pinchRef = useRef<{ dist: number; ox: number; oy: number; zoom: number } | null>(null)

  // sync refs (ให้ drawFrame อ่านค่าล่าสุดได้โดยไม่ต้องเป็น dependency)
  useEffect(() => { spritesRef.current = sprites }, [sprites])
  useEffect(() => { samRef.current = sam }, [sam])
  useEffect(() => { animIdxRef.current = animIdx }, [animIdx])
  useEffect(() => { zoomRef.current = zoom }, [zoom])
  useEffect(() => { originRef.current = origin }, [origin])
  useEffect(() => { showGridRef.current = showGrid }, [showGrid])
  // เปิดพื้นหลังครั้งแรก → ปิดตาราง + เปิดแถบวัดระยะให้อัตโนมัติ
  // เป็นการ "กดปุ่มให้" เฉยๆ ผู้ใช้ยังกดสลับกลับได้ตามปกติ
  // เช็คว่าเพิ่งเปลี่ยนจาก "ไม่มีพื้นหลัง" เท่านั้น จะได้ไม่ไปกดทับตอนสลับด่าน
  const prevBgStageRef = useRef<string | null>(null)
  useEffect(() => {
    if (bgStage && !prevBgStageRef.current) {
      setShowGrid(false)     // เส้นตารางบังฉาก
      setShowRange(true)     // เปิดแถบวัดระยะให้เลย มีเป้าหมายให้วัดถึงแล้ว
    }
    prevBgStageRef.current = bgStage
  }, [bgStage])
  useEffect(() => { showHitboxRef.current = showHitbox; drawFrameRef.current() }, [showHitbox])
  useEffect(() => { showRangeRef.current = showRange; drawFrameRef.current() }, [showRange])
  // ปิด/เปิดเลเยอร์แล้วต้องเห็นผลทันทีแม้หยุดเล่นอยู่
  useEffect(() => { hiddenImagesRef.current = hiddenImages; drawFrameRef.current() }, [hiddenImages])
  useEffect(() => { hoverResRef.current = hoverRes; drawFrameRef.current() }, [hoverRes])
  // ปิดแถบ = เลิกไฮไลต์ (ไม่ล้างรายการที่ปิดไว้ ของที่ซ่อนต้องยังซ่อนอยู่)
  useEffect(() => { showLayersRef.current = showLayers; if (!showLayers) setHoverRes(null); drawFrameRef.current() }, [showLayers])
  useEffect(() => { attackRangeRef.current = attackRange ?? null }, [attackRange])
  // โหลดจุด NormalATK/Skill1/Skill2 (+ ความเร็ว/มุมโค้งกระสุน) + shadowCenter/faceCenter ของเรนเจอร์นี้ (จาก projectile_data)
  useEffect(() => {
    let cancelled = false
    attackMetaRef.current = { normal: null, skill1: null, skill2: null }
    mainShadowCenterRef.current = null
    mainFaceCenterRef.current = null
    mainAnchorRef.current = null
    rangerStandRef.current = null
    mainFaceAnchorRef.current = null
    activeBulletsRef.current = []
    dummyHitRef.current = []; rearHitRef.current = []; edgeHitRef.current = []
    soundUrlsRef.current = null
    if (plainSam) return
    // ?v= คือรุ่นของรูปข้อมูล — route นี้แคช CDN 7 วัน ของเก่าไม่มี soundUrls ติดมา
    // ขยับเลขเพื่อให้ได้คำตอบรุ่นใหม่ทันที ไม่ต้องรอแคชเก่าหมดอายุ
    apiFetch(`/api/ranger/projectile/${encodeURIComponent(rangerId)}?v=${PROJECTILE_DATA_VERSION}`)
      .then(r => r.json())
      .then((d: {
        unit?: {
          normal?: RawAttackMove
          skill1?: RawAttackMove
          skill2?: RawAttackMove
          render?: { shadowCenter?: { x: number; y: number }; faceCenter?: { x: number; y: number } }
          hitTiming?: { normalHitPointRate?: number; skill1HitPointRate?: number; skill2HitPointRate?: number }
        }
        soundUrls?: UnitSoundUrls | null
      }) => {
        if (cancelled) return
        soundUrlsRef.current = d.soundUrls ?? null
        // อุ่นแคชเบราว์เซอร์ไว้ก่อน ไม่งั้นครั้งแรกที่กดเล่นเสียงจะช้ากว่าภาพ
        // (ไฟล์ละไม่กี่สิบ KB โหลดตรงจาก lerico ไม่ผ่านเซิร์ฟเวอร์เรา)
        warmSounds(d.soundUrls ?? null)
        // หมายเหตุ: ไม่กรอง start={0,0} ทิ้งอีกต่อไป — บางสกิล (moveSpeed=0 + start={0,0}) คือ
        // "เสกทับเป้าหมายทันที" ซึ่งเป็นเคสที่ต้องใช้งานจริง ไม่ใช่ค่าว่าง ตัวกันจริงๆ คือมีไฟล์ bul/bul2/bul3 ให้ใช้หรือไม่
        const ht = d.unit?.hitTiming
        const pick = (m?: RawAttackMove, hitPointRate?: number): AttackMeta | null => {
          if (!m) return null
          return {
            hitPointRate: hitPointRate ?? 100,
            start: m.start ?? { x: 0, y: 0 },
            moveSpeed: m.moveSpeed ?? 0,
            angleStart: m.angle?.start ?? 0,
            angleEnd: m.angle?.end ?? 0,
            animationPart: m.animationPart ?? null,
            motionType: m.motion?.type ?? 'LINEAR',
            motionEnabled: m.motion?.enabled ?? true,
            motionRotation: m.motion?.rotation ?? 'FIXED',
            loopNormal: m.motion?.loopNormal ?? true,
          }
        }
        attackMetaRef.current = {
          normal: pick(d.unit?.normal, ht?.normalHitPointRate),
          skill1: pick(d.unit?.skill1, ht?.skill1HitPointRate),
          skill2: pick(d.unit?.skill2, ht?.skill2HitPointRate),
        }
        mainShadowCenterRef.current = d.unit?.render?.shadowCenter ?? null
        mainFaceCenterRef.current = d.unit?.render?.faceCenter ?? null
        recomputeMainAnchor()   // sam/sprites อาจโหลดเสร็จก่อนแล้ว → คำนวณ anchor ทันทีถ้าพร้อม
        drawFrameRef.current()
      })
      .catch(() => { /* ไม่มีข้อมูล → ไม่วาด marker/ไม่เสกกระสุน */ })
    return () => { cancelled = true }
  }, [rangerId, recomputeMainAnchor])

  // ── วาด 1 เฟรม (อ่านจาก refs ทั้งหมด → identity คงที่ ไม่ trigger re-render) ──
  const drawFrame = useCallback(() => {
    const cv = canvasRef.current; if (!cv) return
    const ctx = cv.getContext('2d'); if (!ctx) return
    const s = samRef.current, spr = spritesRef.current
    const W = cv.width, H = cv.height
    ctx.clearRect(0, 0, W, H)
    // ฉากพื้นหลัง — วางขอบล่างชิดพื้น (origin.y) และจัดกึ่งกลางแนวนอนที่ตัวละคร แล้ว scale ตาม zoom
    // แล้วเลื่อนตามออฟเซ็ต (สัดส่วนของขนาดฉากเอง) ให้เข้าเฟรมพอดี
    const bgc = bgCanvasRef.current
    if (bgc) {
      const z = zoomRef.current
      const dw = bgc.width * z, dh = bgc.height * z
      ctx.drawImage(
        bgc,
        originRef.current.x - dw / 2 + dw * BG_OFFSET_X_RATIO,
        bgTopOnScreen(originRef.current.y, sceneGroundY(), z, bgc.height),
        dw, dh,
      )
    }
    // กระสอบทราย — เฉพาะตอนเปิดพื้นหลัง; วางขวาของเรนเจอร์หลัก กลับด้านหันมาทางซ้าย
    // เฟรมผูกกับ frameIdxRef เดียวกัน → หยุด/ย้อน/เร่งเฟรม มีผลกับหุ่นด้วย
    const dummy = dummyRef.current
    // ── ระยะของเป้าหมายแนวหลัง — คิดใหม่ทุกเฟรมเพราะแต่ละสกิลมีตัวคูณของตัวเอง ──
    // เปิด anim สกิลไหนอยู่ก็ใช้ตัวคูณของสกิลนั้น (ดูสกิล 2 ก็ต้องเห็นระยะของสกิล 2)
    // ถ้าไม่ได้เปิดท่าสกิลอยู่ ใช้สกิลแรกที่เล็ง rear เพื่อให้เป้าหมายยังอยู่บนจอ
    {
      const curKind = ATTACK_ANIM_MAP[s?.animNames[animIdxRef.current] ?? '']?.kind
      const isRear = (k: 'skill1' | 'skill2') =>
        skillTargetsRef.current?.[k] === 'rear' && (skillRearMulRef.current?.[k] ?? 0) > 0
      const slot = (curKind === 'skill1' || curKind === 'skill2') && isRear(curKind)
        ? curKind
        : (['skill1', 'skill2'] as const).find(isRear) ?? null
      const rangePt = attackRangeRef.current && attackRangeRef.current > 0 ? attackRangeRef.current : DUMMY_FALLBACK_RANGE
      rearGapRef.current = slot ? rangePt * (skillRearMulRef.current?.[slot] ?? 0) * PT_TO_WORLD : 0
    }
    // ── วาดเป้าหมาย (แนวหน้า + แนวหลังถ้ามี) — ใช้เส้นทางเดียวกันทั้งคู่ ──
    if (bgc && dummy) {
      const z = zoomRef.current
      const standX = rangerStandRef.current?.x ?? 0
      const standY = sceneGroundY()
      const paintDummy = (d: DummyAsset, gap: number, hitRef: { current: HitEvent[] }, groundY: number) => {
        const idleFrames = d.sam.animations[d.idleName] || []
        // ── เลือกเฟรมที่จะวาด: ปกติคือท่ายืน แต่ถ้าเพิ่งโดนสกิลให้เล่นท่าโดนตี 1 รอบก่อน ──
        let frames = idleFrames
        let fi = idleFrames.length ? frameIdxRef.current % idleFrames.length : 0
        let redAlpha = 0
        // อ่านอย่างเดียว ไม่ล้างรายการทิ้ง เหตุการณ์จึงยังอยู่ให้ย้อนกลับมาดูซ้ำได้
        const hit = activeHit(hitRef.current, sceneTickRef.current)
        if (hit) {
          const age = sceneTickRef.current - hit.tick
          if (hit.isSkill) {
            const hitFrames = d.hitName ? d.sam.animations[d.hitName] ?? [] : []
            if (age < hitFrames.length) { frames = hitFrames; fi = age }
          } else if (age < DUMMY_FLASH_TICKS) {
            redAlpha = DUMMY_FLASH_ALPHA
          }
        }
        if (!frames.length) return
        const dx = originRef.current.x + dummyDrawOffset(d, standX, gap) * z
        const dy = originRef.current.y + dummyYAlign(groundY, d.anchor?.y ?? 0) * z
        const draw = (target: CanvasRenderingContext2D) => renderSAMFrame(
          target, frames[Math.min(fi, frames.length - 1)], d.sam.images, d.sprites,
          dx, dy, z, undefined,
          true,
          d.pivotX,   // มิเรอร์รอบกึ่งกลางตัวหุ่น → กลับด้านแล้วยืนที่เดิม
        )
        draw(ctx)
        if (redAlpha > 0) {
          // ย้อมแดงเฉพาะพิกเซลของหุ่น: วาดหุ่นลง canvas แยก แล้วเติมสีแบบ source-in ก่อนค่อย blit ทับ
          // (เติมสีลง ctx หลักตรงๆ ไม่ได้ เพราะ composite จะกินทั้งจอ)
          let fx = dummyFxCanvasRef.current
          if (!fx) { fx = document.createElement('canvas'); dummyFxCanvasRef.current = fx }
          if (fx.width !== W) fx.width = W
          if (fx.height !== H) fx.height = H
          const fctx = fx.getContext('2d')
          if (fctx) {
            fctx.setTransform(1, 0, 0, 1, 0, 0)
            fctx.clearRect(0, 0, W, H)
            draw(fctx)
            fctx.setTransform(1, 0, 0, 1, 0, 0)
            fctx.globalCompositeOperation = 'source-in'
            fctx.fillStyle = '#ff2d2d'
            fctx.fillRect(0, 0, W, H)
            fctx.globalCompositeOperation = 'source-over'
            ctx.save()
            ctx.setTransform(1, 0, 0, 1, 0, 0)
            ctx.globalAlpha = redAlpha
            ctx.drawImage(fx, 0, 0)
            ctx.restore()
          }
        }
      }
      paintDummy(dummy, dummyGapRef.current, dummyHitRef, targetGroundY())
      if (rearDummyRef.current && rearGapRef.current > 0) {
        paintDummy(rearDummyRef.current, rearGapRef.current, rearHitRef, standY)
      }
      // ── ตัวยืนสุดขอบวง Area ของสกิลที่กำลังเปิดดู ──
      // ใช้จุดกึ่งกลางวงชุดเดียวกับแถบ Area ที่วาดในโหมดดูระยะ ตำแหน่งจึงตรงกับขอบแถบเป๊ะ
      const areaSlot = (() => {
        const k = ATTACK_ANIM_MAP[samRef.current?.animNames[animIdxRef.current] ?? '']?.kind
        return k === 'skill1' || k === 'skill2' ? k : null
      })()
      const areaPt = areaSlot ? skillAreasRef.current?.[areaSlot] ?? 0 : 0
      // เฉพาะสกิลโจมตีเท่านั้น — สกิลบัฟไม่ได้ตีใคร ไม่ต้องมีตัวยืนขอบวง
      // ใช้ตัวแยกชุดเดียวกับ spawnBullet: 觸發基準 เป็นหลัก ถ้าไม่มีค่อยถอยไปดู motion.type
      const areaBasis = areaSlot ? skillTargetsRef.current?.[areaSlot] : null
      const areaIsBuff = areaSlot
        ? (areaBasis ? areaBasis === 'self' : attackMetaRef.current[areaSlot]?.motionType === 'NONE')
        : true
      if (edgeDummyRef.current && areaSlot && areaPt > 0 && !areaIsBuff) {
        const rear = rearDummyRef.current
        const centerX = areaBasis === 'rear' && rear && rearGapRef.current > 0
          ? dummyPointWorld(rear, rear.anchor ?? rear.faceAnchor,
              dummyDrawOffset(rear, standX, rearGapRef.current), dummyYAlign(standY, rear.anchor?.y ?? 0)).x
          : dummyPointWorld(dummy, dummy.anchor ?? dummy.faceAnchor,
              dummyDrawOffset(dummy, standX, dummyGapRef.current), dummyYAlign(targetGroundY(), dummy.anchor?.y ?? 0)).x
        // ขอบขวาของวง = กึ่งกลาง + รัศมี (แปลง pt → world เหมือนแถบวัดระยะ)
        paintDummy(edgeDummyRef.current, centerX + areaPt * PT_TO_WORLD - standX, edgeHitRef, targetGroundY())
      }
    }
    if (showGridRef.current) {
      // วาด grid ลง offscreen ครั้งเดียวต่อ (zoom/origin/size) แล้ว blit — ไม่ stroke ใหม่ทุกเฟรม
      const ox = originRef.current.x, oy = originRef.current.y, z = zoomRef.current
      const key = `${W}x${H}|${z}|${Math.round(ox)}|${Math.round(oy)}`
      let gc = gridCanvasRef.current
      if (!gc) { gc = document.createElement('canvas'); gridCanvasRef.current = gc }
      if (gc.width !== W)  gc.width  = W
      if (gc.height !== H) gc.height = H
      if (gridKeyRef.current !== key) {
        const gctx = gc.getContext('2d')
        if (gctx) { gctx.clearRect(0, 0, W, H); renderGrid(gctx, W, H, ox, oy, z) }
        gridKeyRef.current = key
      }
      ctx.drawImage(gc, 0, 0)
    }
    if (s && spr) {
      const frames = s.animations[s.animNames[animIdxRef.current]] || []
      const fr = frames[frameIdxRef.current]
      if (fr) renderSAMFrame(ctx, fr, s.images, spr, originRef.current.x, originRef.current.y, zoomRef.current, hiddenImagesRef.current)
      // ── Layer panel: เก็บกรอบของแต่ละชิ้น + วาดกรอบแดงให้ชิ้นที่กำลังชี้ ──
      // คิดเฉพาะตอนเปิดแถบ (ปิดอยู่ = ไม่มีงานเพิ่มในลูปวาดเลย)
      if (showLayersRef.current && fr) {
        const pieces = framePieces(fr, s.images, spr, originRef.current.x, originRef.current.y, zoomRef.current)
        framePiecesRef.current = pieces
        const hv = hoverResRef.current
        if (hv !== null) {
          // ภาพเดียวอาจถูกวาดหลายชิ้นในเฟรมเดียว (อนุภาคเอฟเฟกต์) → ตีกรอบให้ครบทุกชิ้น
          // คนกดจะได้เห็นตั้งแต่ก่อนกดว่าปิดแถวนี้แล้วอะไรจะหายบ้าง
          // ชี้แถบของชิ้นที่ปิดไว้แล้วเฟรมนี้ไม่มี → ไม่เจอ ก็ไม่ต้องวาด
          for (const p of pieces.filter(x => x.resNum === hv)) {
            ctx.save()
            ctx.setTransform(1, 0, 0, 1, 0, 0)
            ctx.strokeStyle = '#ff3b3b'
            ctx.lineWidth = 2
            ctx.lineJoin = 'round'
            ctx.beginPath()
            ctx.moveTo(p.quad[0].x, p.quad[0].y)
            for (let i = 1; i < p.quad.length; i++) ctx.lineTo(p.quad[i].x, p.quad[i].y)
            ctx.closePath()
            ctx.stroke()
            ctx.restore()
          }
        }
        // ปลุกแถบเลเยอร์เป็นช่วงๆ ให้รายการตรงกับเฟรมที่เล่นอยู่ (ไม่ใช่ทุกเฟรม — ดู layerTick)
        const now = performance.now()
        if (now - layerTickAtRef.current > LAYER_PANEL_REFRESH_MS) {
          layerTickAtRef.current = now
          setLayerTick(t => t + 1)
        }
      }
      // อัปเดต counter + ตำแหน่ง playhead ผ่าน DOM ตรงๆ (ไม่ผ่าน React = ไม่ re-render ทุกเฟรม)
      if (frameLabelRef.current) frameLabelRef.current.textContent = `${frameIdxRef.current + 1}/${frames.length}`
      if (playheadRef.current) {
        const p = frames.length > 1 ? (frameIdxRef.current / (frames.length - 1)) * 100 : 0
        playheadRef.current.style.left = `${p}%`
      }
      // ── ตรวจจังหวะ "เตรียมท่าจบ → เริ่มปล่อยจริง" ของ anim โจมตี เพื่อเสกกระสุน (เฉพาะตอนมีพื้นหลัง+กระสอบทราย) ──
      if (bgCanvasRef.current && dummyRef.current) {
        const animName = s.animNames[animIdxRef.current]
        const atkInfo = ATTACK_ANIM_MAP[animName]
        const cur = frameIdxRef.current
        const prev = spawnCheckRef.current
        const prevFrame = prev.animKey === animName ? prev.lastFrame : -1
        // วนรอบจริงตอนเล่น = เด้งกลับไปที่ต้นช่วง trim เท่านั้น
        // ถ้าเช็คแค่ cur < prevFrame การลากหลอดถอยหลังจะถูกนับเป็นวนรอบด้วย แล้วยิงรัวทุกท่าที่ผ่านมา
        const wrapped = prev.animKey === animName && cur < prevFrame && cur <= trimStartRef.current + 1
        if (atkInfo) {
          // ปล่อยกระสุนตอน anim ท่าเตรียม (_ready) เล่นจบพอดี — ใช้ความยาว ready-phase จริงจาก .sam
          // (comboReadyLength บันทึกไว้ตอน applyAttackCombos รวม ready+trigger เป็น combo เดียว)
          const readyLen = Math.min(s.comboReadyLength[animName] ?? 0, Math.max(0, frames.length - 1))
          // ข้าม ready → ปล่อยจริง (ข้ามไปข้างหน้า) หรือกรณีไม่มีช่วง ready เลย (readyLen=0) ให้นับรอบ loop ใหม่เป็นปล่อยอีกครั้ง
          if ((prevFrame < readyLen && cur >= readyLen) || (readyLen === 0 && wrapped)) {
            spawnBullet(atkInfo.kind, atkInfo.bulletSuffix)
          }
        } else if (animName === '_all') {
          // เล่นรวมทุกท่า — ยิงเฉพาะตอนเฟรมเดินหน้าผ่านจุดยิงของช่วงย่อยนั้น
          // ไม่ต้องมีกรณีพิเศษตอนวนรอบ เพราะพอเด้งกลับต้นคลิปแล้ว เฟรมถัดๆ ไปจะเดินผ่านจุดยิงเองอยู่ดี
          if (allTriggerCacheRef.current.sam !== s) {
            allTriggerCacheRef.current = { sam: s, list: allAttackTriggers(s) }
          }
          for (const t of allTriggerCacheRef.current.list) {
            if (prevFrame < t.frame && cur >= t.frame) spawnBullet(t.kind, t.suffix)
          }
        }
        spawnCheckRef.current = { animKey: animName, lastFrame: cur }
      }

      // ── เสียงท่าโจมตี — ซิงก์กับเฟรมที่วาดอยู่ (ทั้งตอนมีและไม่มีฉากกระสอบทราย) ──
      syncUnitSound(s, s.animNames[animIdxRef.current], frameIdxRef.current)
    }
    // ── วาด + ไล่เก็บกระสุนที่เสกไว้ (เฉพาะตอนมีพื้นหลัง+กระสอบทราย) ──
    if (bgc && dummy) {
      const z = zoomRef.current
      const bodyFpsNow = s?.animRate || 24
      const alive: ActiveBullet[] = []
      for (const b of activeBulletsRef.current) {
        const asset = bulletCacheRef.current.get(b.suffix)
        if (!asset) continue
        const T = sceneTickRef.current - b.spawnTick
        const finishTicksEq = b.finishFrames > 0 ? (b.finishFrames / b.bulletFps) * bodyFpsNow : 0
        // ถึงเป้าหมายแล้ว → สั่งปฏิกิริยาครั้งเดียวต่อนัด
        // ต้องเช็คก่อนบรรทัดตัดกระสุนทิ้งด้านล่าง: ไฟล์ที่ไม่มี anim "finish" จะได้ finishTicksEq = 0
        // เงื่อนไขตัดทิ้งเลยกลายเป็นตัวเดียวกับเงื่อนไขชน กระสุนถูกตัดก่อนจะได้ทริกเกอร์ → ไม่มีปฏิกิริยาเลย
        // ถอยกลับไปก่อนจังหวะชน → ปลดธงเพื่อให้ทริกเกอร์ได้อีกครั้งตอนเดินหน้ามาใหม่
        if (T < b.travelTicks) b.hitFired = false
        if (T >= b.travelTicks && !b.hitFired) {
          b.hitFired = true
          if (b.isAttack) {
            applyHitReaction(b.hitRear, b.isSkill, b.areaWorld, b.areaCenterX)
            playHitSound(b.kind)
          }
        }
        if (T < 0 || T > b.travelTicks + finishTicksEq) continue   // ยังไม่ถึงเวลา หรือเล่นจบแล้ว → ตัดทิ้ง
        alive.push(b)
        let wx: number, wy: number, frame: SamFrame | undefined, spinAngle = 0
        let anchorX = b.anchorX, anchorY = b.anchorY
        const hasArc = b.motionType === 'CURVE' && !b.selfArc   // motion.type บอกว่าโค้งไหม แต่ถ้า anim โค้งมาให้แล้วก็ไม่ใส่ซ้ำ
        if (T <= b.travelTicks) {
          // ── ช่วงเดินทาง (normal) — เส้นตรงไปเป้าหมาย บวกส่วนโค้ง (ถ้าเป็นท่าปาโค้ง) — สูตรเดียวกับเส้นพรีวิว Hitbox ──
          // ไม่หมุนสไปรต์เพิ่มเอง — อนิเมชัน normal ต้นฉบับของกระสุนมีท่าเอียง/ก้มหัวตอนใกล้ตกอยู่แล้ว
          const p = b.travelTicks > 0 ? Math.min(1, T / b.travelTicks) : 1
          const pos = arcPathPos(b.startX, b.startY, b.targetX, b.targetY, p, hasArc)
          wx = pos.x; wy = pos.y
          // motion.rotation === "ANGLE_LERP": หมุนตามมุมจริงจาก API — เริ่ม angle.start ไล่ไปจบ angle.end ตอนชน (p=1)
          // (ตอนวาดข้างล่างจะหมุนเวกเตอร์หมุดตามไปด้วย ไม่งั้นหมุดจะเหวี่ยงหลุดจากตำแหน่งที่เล็งไว้)
          if (b.motionRotation === 'ANGLE_LERP') spinAngle = lerp(b.arcStartDeg, b.arcEndDeg, p) * Math.PI / 180
          // ระหว่างลอย เล่น normal วนซ้ำไปเรื่อยๆ จนกว่าจะถึงเป้าหมาย
          // (anim ช่วงเดินทางของกระสุนสั้นกว่าเวลาบินมาก ถ้าไม่วนจะค้างเฟรมสุดท้ายนิ่งๆ ระหว่างทาง)
          // fitNormal: ยืดให้จบพอดีตอนถึงเป้าหมายแทน — เฟรมผูกกับความคืบหน้า p ไม่ใช่เวลาจริง
          const normalFrameRaw = T * (b.bulletFps / bodyFpsNow)
          const bulletFrame = b.fitNormal
            ? Math.min(b.normalFrames - 1, Math.floor(p * b.normalFrames))
            : Math.floor(normalFrameRaw) % b.normalFrames
          frame = asset.sam.animations[asset.normalName]?.[bulletFrame]
        } else if (asset.finishName && b.finishFrames > 0) {
          // ── ช่วงหลังชนเป้าหมาย (finish) — อยู่นิ่งที่จุดกระทบ ──
          const finishAge = T - b.travelTicks
          const finishFrame = Math.min(b.finishFrames - 1, Math.floor(finishAge * (b.bulletFps / bodyFpsNow)))
          wx = b.targetX; wy = b.targetY
          anchorX = b.finishAnchorX; anchorY = b.finishAnchorY
          frame = asset.sam.animations[asset.finishName]?.[finishFrame]
        } else {
          wx = b.targetX; wy = b.targetY
        }
        // เลื่อน origin กลับเท่ากับระยะจาก origin ถึงหมุด (anchorX/Y) เพื่อให้ "หมุด" ไปโผล่ตรง (wx,wy) พอดี
        // สำคัญ: renderSAMFrame หมุนรอบ origin ไม่ใช่รอบหมุด → ต้องหมุนเวกเตอร์หมุดด้วยมุมเดียวกันก่อนหักลบ
        // ไม่งั้นพอหมุนแล้วหมุดจะเหวี่ยงออกจากตำแหน่งที่เล็งไว้ (เห็นชัดสุดตอน p=0 ที่มุมเยอะสุด)
        const ca = Math.cos(spinAngle), sa = Math.sin(spinAngle)
        // ท่าไม่บิน: บวกค่าจากสไลเดอร์ตรงนี้ (ไม่ใช่ตอนเสก) เพื่อให้เลื่อนแล้วเห็นผลกับกระสุนที่ลอยอยู่ทันที
        const fx = ca * anchorX - sa * anchorY
        const fy = sa * anchorX + ca * anchorY
        if (frame) renderSAMFrame(ctx, frame, asset.sam.images, asset.sprites, originRef.current.x + (wx - fx) * z, originRef.current.y + (wy - fy) * z, z, undefined, false, 0, spinAngle)
      }
      activeBulletsRef.current = alive
    }
    // Hitbox — จุดคงที่ตาม projectile_data เท่านั้น ไม่ใช่การวัดขนาด/bbox ของรูปอนิเมชั่น
    // รูป .sam เป็นแค่ภาพที่แสดงทับ ตำแหน่ง hitbox จริงคือ world (0,0) ของเรนเจอร์แต่ละตัว
    // (จุดเดียวกับที่ muzzle/target อ้างอิงอยู่แล้ว) — อนิเมชั่นขยับเฟรมยังไงตำแหน่งนี้ก็ไม่ขยับตาม
    // จนกว่าโค้ดเกม (moveSpeed ฯลฯ ใน projectile_data) จะสั่งเปลี่ยนเอง ซึ่งนอกขอบเขตตัวเล่นนี้
    // ── แถบบอกระยะ (ปุ่มรูปดวงตา): ระยะโจมตี + ความกว้าง Area ของแต่ละสกิล ──
    if (showRangeRef.current && bgc && dummy) {
      const z = zoomRef.current
      const standX = rangerStandRef.current?.x ?? 0
      const standY = sceneGroundY()
      const dOff = dummyDrawOffset(dummy, standX, dummyGapRef.current)
      const dyOff = dummyYAlign(standY, dummy.anchor?.y ?? 0)
      const tgt = dummyPointWorld(dummy, dummy.anchor ?? dummy.faceAnchor, dOff, dyOff)
      const meX = originRef.current.x + standX * z
      const tgtX = originRef.current.x + tgt.x * z
      const feetY = originRef.current.y + standY * z
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.strokeStyle = '#ffffff'
      ctx.fillStyle = '#ffffff'
      ctx.lineWidth = 3
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      // ใช้ฟอนต์หลักของเว็บ (คลาส .font-line = LineBold) ให้ป้ายบนภาพเข้าชุดกับ UI
      // @font-face โหลดผ่าน globals.css อยู่แล้ว canvas จึงเรียกใช้ชื่อนี้ได้ตรงๆ
      ctx.font = 'bold 16px LineBold, Inter, sans-serif'
      const TICK = 14
      // ป้ายตัวอักษรพร้อมขอบดำ — ใช้ strokeText แทน shadowBlur
      // shadowBlur บน canvas แพงมาก และแถบนี้ถูกวาดใหม่ทุกเฟรม (ยิ่งเปิดอัตโนมัติตอนเปิดแผนที่)
      const label = (text: string, x: number, y: number) => {
        ctx.save()
        ctx.lineWidth = 4
        ctx.lineJoin = 'round'
        ctx.strokeStyle = 'rgba(0,0,0,0.8)'
        ctx.strokeText(text, x, y)
        ctx.restore()
        ctx.fillText(text, x, y)
      }

      // ── ระยะโจมตี: คร่อมจากจุดยืนเรนเจอร์ถึงจุดยืนเป้าหมาย ขีดตั้งชี้ขึ้น ป้ายอยู่ใต้เส้น ──
      const atkY = feetY + 34
      ctx.beginPath()
      ctx.moveTo(meX, atkY - TICK); ctx.lineTo(meX, atkY)
      ctx.lineTo(tgtX, atkY); ctx.lineTo(tgtX, atkY - TICK)
      ctx.stroke()
      const range = attackRangeRef.current
      if (range != null) {
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        label(`ATK - ${Math.round(range)}pt`, (meX + tgtX) / 2, atkY + 8)
      }
      // ── ช่วงต่อขยายไปถึงเป้าหมายแนวหลัง (เส้นเขียว) — ป้ายบอกความยาวของช่วงนี้เอง ──
      // ไม่ใช่ระยะรวมจากเรนเจอร์ เพื่อให้อ่านแบบเดียวกับแถบ ATK ที่บอกช่วงของตัวเอง
      if (rearDummyRef.current && rearGapRef.current > 0) {
        const rearTgt = dummyPointWorld(
          rearDummyRef.current,
          rearDummyRef.current.anchor ?? rearDummyRef.current.faceAnchor,
          dummyDrawOffset(rearDummyRef.current, standX, rearGapRef.current),
          dummyYAlign(standY, rearDummyRef.current.anchor?.y ?? 0),
        )
        const rearX = originRef.current.x + rearTgt.x * z
        ctx.strokeStyle = REAR_LINE_COLOR
        ctx.fillStyle = REAR_LINE_COLOR
        ctx.beginPath()
        ctx.moveTo(tgtX, atkY - TICK); ctx.lineTo(tgtX, atkY)
        ctx.lineTo(rearX, atkY); ctx.lineTo(rearX, atkY - TICK)
        ctx.stroke()
        const addPt = Math.round((rearGapRef.current - dummyGapRef.current) / PT_TO_WORLD)
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        label(`Rear Enemy - ${addPt}pt`, (tgtX + rearX) / 2, atkY + 8)
        ctx.strokeStyle = '#ffffff'
        ctx.fillStyle = '#ffffff'
      }

      // ── Area ของสกิล: จุดกึ่งกลางคือเป้าหมายที่เล็ง แผ่ไปหน้า/หลังข้างละ area ──
      // สกิลที่เล็ง Self จะแผ่รอบตัวเรนเจอร์หลักแทน (ค่า 觸發基準 ตัวเดียวกับที่ใช้แยกบัฟ/โจมตี)
      // แสดงทีละสกิลตาม anim ที่กำลังเปิดอยู่ — ถ้าโชว์พร้อมกันสองอันแถบจะทับกันอ่านไม่ออก
      // (ใช้ ATTACK_ANIM_MAP ตัวเดียวกับที่ใช้จับจังหวะเสกกระสุน ผลจึงตรงกับท่าที่เล่นอยู่จริง)
      const curAnim = samRef.current?.animNames[animIdxRef.current] ?? ''
      const activeKind = ATTACK_ANIM_MAP[curAnim]?.kind ?? null
      const slot = activeKind === 'skill1' || activeKind === 'skill2' ? activeKind : null
      const area = slot ? skillAreasRef.current?.[slot] : null
      if (slot && area != null && area > 0) {
        const basis = skillTargetsRef.current?.[slot]
        let cx = basis === 'self' ? meX : tgtX
        if (basis === 'rear' && rearDummyRef.current && rearGapRef.current > 0) {
          const rt = dummyPointWorld(
            rearDummyRef.current,
            rearDummyRef.current.anchor ?? rearDummyRef.current.faceAnchor,
            dummyDrawOffset(rearDummyRef.current, standX, rearGapRef.current),
            dummyYAlign(standY, rearDummyRef.current.anchor?.y ?? 0),
          )
          cx = originRef.current.x + rt.x * z
        }
        const half = area * PT_TO_WORLD * z   // pt → world → พิกัดจอ (เหมือนแถบ ATK)
        // ยึดกับฉาก (world) เหมือนแถบ ATK — เลื่อนกล้องหรือซูมแล้วแถบไม่ลอยตามจอ
        // แต่ไม่ปล่อยให้พ้นขอบบน ไม่งั้นซูมเข้าแล้วแถบจะหายไปเลย
        const y = Math.max(AREA_BAR_MIN_SCREEN_Y, originRef.current.y + (standY - AREA_BAR_ABOVE_STAND) * z)
        ctx.beginPath()
        ctx.moveTo(cx - half, y + TICK); ctx.lineTo(cx - half, y)   // ขีดตั้งฝั่งซ้าย (ชี้ลง)
        ctx.lineTo(cx + half, y)                                     // เส้นนอนเต็มความกว้าง
        ctx.lineTo(cx + half, y + TICK)                              // ขีดตั้งฝั่งขวา
        ctx.moveTo(cx, y); ctx.lineTo(cx, y + TICK)                  // ขีดตั้งตรงกลาง = จุดที่เล็ง
        ctx.stroke()
        ctx.textBaseline = 'bottom'
        // แถบแคบ → ป้ายซ้าย/ขวาจะซ้อนกับป้ายกลาง เอาออก เหลือป้ายกลางที่บอกความกว้างรวมพอ
        if (area * 2 >= AREA_SIDE_LABEL_MIN_PT) {
          ctx.textAlign = 'left'
          label(`${area}pt`, cx - half, y - 6)
          ctx.textAlign = 'right'
          label(`${area}pt`, cx + half, y - 6)
        }
        ctx.textAlign = 'center'
        // ป้ายกลาง = ความกว้างรวมทั้งแถบ (หน้า area + หลัง area) ไม่ใช่ค่าข้างเดียว
        label(`${slot === 'skill1' ? 'Skill_1' : 'Skill_2'} - ${area * 2}pt`, cx, y - 6)
      }
      ctx.restore()
    }
    if (showHitboxRef.current) {
      const z = zoomRef.current
      // เส้นตั้ง (แกน Y ที่ anchor.x)
      const vline = (worldX: number, color: string, label: string) => {
        const x = originRef.current.x + worldX * z
        ctx.save()
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.strokeStyle = color
        ctx.lineWidth = 2
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
        ctx.fillStyle = color
        ctx.font = 'bold 11px Tahoma, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(label, x, 12)
        ctx.restore()
      }
      // เส้นนอน (แกน X ที่ anchor.y) — เส้นพื้น/ground ที่ตัวละครยืนอยู่จริง
      const hline = (worldY: number, color: string, label: string) => {
        const y = originRef.current.y + worldY * z
        ctx.save()
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.strokeStyle = color
        ctx.lineWidth = 2
        ctx.setLineDash([6, 4])
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
        ctx.setLineDash([])
        ctx.fillStyle = color
        ctx.font = 'bold 11px Tahoma, sans-serif'
        ctx.textAlign = 'left'
        ctx.fillText(label, 4, y - 4)
        ctx.restore()
      }
      // จุด anchor (วงกลมตันตรงตำแหน่ง hitbox จริง)
      const dot = (worldX: number, worldY: number, color: string) => {
        const x = originRef.current.x + worldX * z, y = originRef.current.y + worldY * z
        ctx.save()
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.fillStyle = color
        ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke()
        ctx.restore()
      }
      // จุดกากบาท (แกน x/y ของ muzzle จาก projectile_data — game unit = world unit 1:1)
      const cross = (wx: number, wy: number, color: string, label: string) => {
        const x = originRef.current.x + wx * z, y = originRef.current.y + wy * z
        ctx.save()
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.strokeStyle = color; ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(x - 7, y); ctx.lineTo(x + 7, y)
        ctx.moveTo(x, y - 7); ctx.lineTo(x, y + 7)
        ctx.stroke()
        ctx.fillStyle = color
        ctx.font = 'bold 10px Tahoma, sans-serif'
        ctx.textAlign = 'left'
        ctx.fillText(label, x + 9, y - 3)
        ctx.restore()
      }
      // เส้นทางกระสุนจริง (จุดเริ่ม → เป้าหมาย) — ใช้สูตรเดียวกับกระสุนจริงเป๊ะ (arcPathPos) ตรงไหนโค้งก็โค้งตรงนั้น
      const pathLine = (startX: number, startY: number, targetX: number, targetY: number, hasArc: boolean, color: string) => {
        const STEPS = 24
        ctx.save()
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.globalAlpha = 0.85
        ctx.setLineDash([4, 3])
        ctx.beginPath()
        for (let i = 0; i <= STEPS; i++) {
          const pos = arcPathPos(startX, startY, targetX, targetY, i / STEPS, hasArc)
          const x = originRef.current.x + pos.x * z, y = originRef.current.y + pos.y * z
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
        }
        ctx.stroke()
        ctx.setLineDash([])
        ctx.restore()
      }
      if (s && spr) {
        // MAIN — จุด hitbox คงที่ = shadowCenter x bbox ของท่ายืน คำนวณครั้งเดียวตอนโหลด
        // (mainAnchorRef ไม่ผูกกับเฟรม/anim ที่กำลังเล่นอยู่) ไม่มีข้อมูล → fallback world (0,0)
        const a = mainAnchorRef.current ?? { x: 0, y: 0 }
        vline(a.x, '#ff4d6d', 'MAIN')
        hline(a.y, '#ff4d6d', 'X')
        dot(a.x, a.y, '#ff4d6d')
        // FACE ของ MAIN — จุดรับดาเมจ (face center) เช่นเดียวกับที่กระสอบทรายมี ไว้เทียบตำแหน่งได้ทั้งสองฝั่ง
        if (mainFaceAnchorRef.current) {
          const fa = mainFaceAnchorRef.current
          vline(fa.x, '#ff6ec7', 'FACE')
          hline(fa.y, '#ff6ec7', 'X')
          dot(fa.x, fa.y, '#ff6ec7')
        }
        // จุดเริ่มโจมตีแต่ละแบบจาก projectile_data (ผ่าน attackStartWorld — ดูระบบพิกัดที่นั่น)
        // (0,0) ตอนนี้เป็นไปได้ทั้ง "ไม่มีข้อมูล" และ "เสกทับเป้าหมายทันที" (moveSpeed=0) → ไม่วาด marker ให้รกภาพ ทั้งสองแบบ
        const drawStart = (meta: AttackMeta | null, kind: string, color: string, label: string) => {
          if (!meta || (!meta.start.x && !meta.start.y)) return
          const p = attackStartWorld(meta.start, rangerStandRef.current?.y ?? 0, `${rangerIdRef.current}:${kind}`)
          cross(p.x, p.y, color, label)
        }
        // กึ่งกลางรูปของไฟล์กระสุน — จุดที่ใช้เป็นหมุดจริงตอนยิง แยกกันระหว่างช่วงบินกับช่วงระเบิด
        const vc = viewCentersRef.current
        if (vc.normal) cross(vc.normal.x, vc.normal.y, '#7dff9b', 'CENTER normal')
        if (vc.finish) cross(vc.finish.x, vc.finish.y, '#ffe066', 'CENTER finish')
        drawStart(attackMetaRef.current.normal, 'normal', '#ffd24d', 'NormalATK')
        drawStart(attackMetaRef.current.skill1, 'skill1', '#a78bfa', 'Skill1')
        drawStart(attackMetaRef.current.skill2, 'skill2', '#fb923c', 'Skill2')
      }
      if (bgc && dummy) {
        // DUMMY — จุดยืน (shadow center) เช่นเดียวกับ MAIN แต่คงที่ตำแหน่งเดิมของหุ่น
        const dyOff = dummyYAlign(targetGroundY(), dummy.anchor?.y ?? 0)
        const dOff = dummyDrawOffset(dummy, rangerStandRef.current?.x ?? 0, dummyGapRef.current)
        const t = dummyPointWorld(dummy, dummy.anchor, dOff, dyOff)
        vline(t.x, '#4dd0ff', 'DUMMY')
        hline(t.y, '#4dd0ff', 'X')
        dot(t.x, t.y, '#4dd0ff')
        // CENTER — ระดับอก (แกน X เดียวกับ MAIN) เส้นนอนอย่างเดียว เพราะแกนตั้งซ้อนกับ DUMMY อยู่แล้ว
        if (dummy.centerAnchor) {
          const c = dummyPointWorld(dummy, dummy.centerAnchor, dOff, dyOff)
          hline(c.y, '#7dff9b', 'CENTER')
          dot(c.x, c.y, '#7dff9b')
        }
        // FACE — จุดรับดาเมจ (face center) ที่กระสุนพุ่งไปจริงๆ — แยกจาก DUMMY เพื่อเทียบตำแหน่งที่กระสุนควรตกได้
        if (dummy.faceAnchor) {
          const f = dummyPointWorld(dummy, dummy.faceAnchor, dOff, dyOff)
          vline(f.x, '#ff6ec7', 'FACE')
          hline(f.y, '#ff6ec7', 'X')
          dot(f.x, f.y, '#ff6ec7')
        }
        // เส้นทางกระสุนที่ "บินจริง" เท่านั้น → เล็ง FACE (ตรงกับ spawnBullet)
        // ท่าที่ไม่บิน (enabled:false เช่น วาปไปตี) ถูกกรองออกใน drawAtkPath อยู่แล้ว — ไม่มีเส้นทางให้วาด
        const target = dummyPointWorld(dummy, dummy.faceAnchor ?? dummy.anchor, dOff, dyOff)
        const drawAtkPath = (meta: AttackMeta | null, kind: string, color: string) => {
          if (!meta || (!meta.start.x && !meta.start.y) || !meta.motionEnabled || meta.moveSpeed <= 0) return
          const p = attackStartWorld(meta.start, rangerStandRef.current?.y ?? 0, `${rangerIdRef.current}:${kind}`)
          pathLine(p.x, p.y, target.x, target.y, meta.motionType === 'CURVE', color)
        }
        drawAtkPath(attackMetaRef.current.normal, 'normal', '#ffd24d')
        drawAtkPath(attackMetaRef.current.skill1, 'skill1', '#a78bfa')
        drawAtkPath(attackMetaRef.current.skill2, 'skill2', '#fb923c')
      }
    }
  }, [])

  useEffect(() => { drawFrameRef.current = drawFrame }, [drawFrame])

  // ── ขยายเต็มจอ ── จำค่าที่เลือกไว้ในเครื่อง เปิดครั้งหน้าจะขยายให้เลย
  const [maximized, setMaximized] = useState(false)
  useEffect(() => {
    try { if (localStorage.getItem('animPlayerMaximized') === '1') setMaximized(true) } catch { /* ignore */ }
  }, [])
  const toggleMaximized = () => setMaximized(m => {
    try { localStorage.setItem('animPlayerMaximized', m ? '0' : '1') } catch { /* ignore */ }
    return !m
  })

  // ── ESC ── ถ้าขยายอยู่ให้ย่อกลับก่อน ไม่งั้นปิด popup (แบบฝังในหน้าไม่มีอะไรให้ปิด)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (maximized) toggleMaximized()
      else if (!embedded) onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, embedded, maximized])

  // ── lock body scroll ── (แบบฝังในหน้าต้องเลื่อนหน้าได้ตามปกติ)
  useEffect(() => {
    if (embedded) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [embedded])

  // ── 1. โหลด list ──
  useEffect(() => {
    if (samFilesOverride) {
      if (!samFilesOverride.length) { setError('No animation files found for this ranger'); setLoading(false); return }
      setSamFiles(samFilesOverride); setCurrentSamIdx(0)
      return
    }
    let cancelled = false
    setLoading(true); setError('')
    fetchSamList(rangerId)
      .then(r => r.json())
      .then((d: { samFiles?: string[]; error?: string }) => {
        if (cancelled) return
        if (d.error || !d.samFiles?.length) {
          setError('No animation files found for this ranger'); setLoading(false); return
        }
        setSamFiles(d.samFiles); setCurrentSamIdx(0)
      })
      .catch(() => { if (!cancelled) { setError('Failed to load the file list'); setLoading(false) } })
    return () => { cancelled = true }
  }, [rangerId, samFilesOverride])

  // ── 2. โหลด + parse .sam ──
  useEffect(() => {
    if (!samFiles.length) return
    const samUrl = samFiles[currentSamIdx]; if (!samUrl) return
    viewingBulletFileRef.current = /-bul\d?\.sam$/i.test(samUrl)
    const prefix = samUrl.replace(/\.sam$/i, '')
    let cancelled = false
    let ownSprites: SpriteMap | null = null   // sprites ที่ run นี้เป็นเจ้าของ → dispose ใน cleanup ของ run นี้
    setLoading(true); setError('')

    ;(async () => {
      try {
        const [samBuf, plistBuf, pngBlob] = await Promise.all([
          fetch(PROXY_FILE(samUrl)).then(r => { if (!r.ok) throw new Error('SAM ' + r.status); return r.arrayBuffer() }),
          fetch(PROXY_FILE(prefix + '.plist')).then(r => { if (!r.ok) throw new Error('PLIST ' + r.status); return r.arrayBuffer() }),
          fetch(PROXY_FILE(prefix + '.png')).then(r => { if (!r.ok) throw new Error('PNG ' + r.status); return r.blob() }),
        ])
        if (cancelled) return
        const parser = new SAMParser(samBuf); applyAttackCombos(parser)
        const spr = await loadSprites(plistBuf, pngBlob)
        // ถ้าถูกยกเลิกระหว่างโหลด (สลับไฟล์/ปิด popup) → dispose ทันที ไม่ commit
        if (cancelled) { disposeSprites(spr); return }
        ownSprites = spr
        spritesRef.current = spr
        samRef.current = parser
        animIdxRef.current = 0
        const cv = canvasRef.current
        const fit = cv ? autoFit(parser, spr, cv.width, cv.height) : null
        if (fit) { zoomRef.current = fit.zoom; originRef.current = { x: fit.originX, y: fit.originY }; setZoom(fit.zoom); setOrigin({ x: fit.originX, y: fit.originY }) }
        frameIdxRef.current = 0
        recomputeMainAnchor()   // shadowCenter อาจมาถึงก่อนแล้ว → คำนวณ anchor ทันทีถ้าพร้อม
        setSam(parser); setSprites(spr); setAnimIdx(0); setPlaying(true); setLoading(false)
      } catch (err) {
        if (cancelled) return
        setError('Failed to load animation: ' + (err instanceof Error ? err.message : 'unknown')); setLoading(false)
      }
    })()
    // cleanup: ยกเลิก + dispose sprites ของ run นี้ (ทำงานทั้งตอนสลับไฟล์และตอน unmount)
    return () => {
      cancelled = true
      if (ownSprites) {
        disposeSprites(ownSprites)
        if (spritesRef.current === ownSprites) spritesRef.current = null  // กัน drawFrame วาด bitmap ที่ปิดแล้ว
      }
    }
  }, [samFiles, currentSamIdx, recomputeMainAnchor])

  // ── สลับไฟล์อนิเมชั่น (⏮/⏭) → ล้างลำดับ/ช่วงเฟรมที่ตั้งไว้ทั้งหมด (ผูกกับไฟล์เดิม ใช้กับไฟล์ใหม่ไม่ได้ + กันสะสม state ค้างเปล่าประโยชน์) ──
  // รวมถึงเลือกพื้นที่/พื้นหลัง — ฟีเจอร์พวกนี้ใช้ได้เฉพาะไฟล์หลัก (body) สลับไฟล์แล้วต้องล้างทิ้ง
  useEffect(() => {
    setVAnimSeq([]); setEditingSeqIdx(null); setShowVideoPanel(false)
    setSelectMode(false); setSelection(null); setShowBgPanel(false)
    // objNum ของคนละไฟล์ไม่ใช่ชิ้นเดียวกัน ถ้าไม่ล้าง เลเยอร์ที่ปิดไว้จะไปดับชิ้นมั่วๆ ของไฟล์ใหม่
    setHiddenImages(new Set()); setHoverRes(null)
  }, [currentSamIdx])

  // ── 3. Play loop — วาดตรงใน rAF (ไม่ setState ต่อเฟรม = ไม่ re-render component) ──
  const fps = sam?.animRate || 24
  useEffect(() => {
    if (!sam || !sprites || !playing) return
    const interval = 1000 / fps; let next = performance.now() + interval; let raf = 0
    const tick = (now: number) => {
      if (now >= next) {
        // fixed schedule: เลื่อน next ไปทีละ interval (timing นิ่ง ไม่ drift)
        next += interval
        // ถ้าตามหลังมากกว่า 3 เฟรม (เช่นสลับแท็บกลับมา) → reset กันสะสมเป็น burst
        if (now - next > interval * 3) next = now + interval
        const frames = sam.animations[sam.animNames[animIdxRef.current]] || []
        if (frames.length) {
          // เล่นวนเฉพาะช่วง [trimStart, trimEnd] ตามจุดมาร์คที่ตั้งไว้ (ไม่ใช่ทั้งคลิป)
          const lo = Math.max(0, Math.min(trimStartRef.current, frames.length - 1))
          const hi = Math.max(lo, Math.min(trimEndRef.current, frames.length - 1))
          const next = frameIdxRef.current + 1
          frameIdxRef.current = (next > hi || next < lo) ? lo : next
          sceneTickRef.current += 1   // นับ tick รวมอิสระ — ใช้ขับเคลื่อนตำแหน่ง/เฟรมของกระสุนที่เสกอยู่
          drawFrame()
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf) }
  }, [sam, sprites, playing, animIdx, fps, drawFrame])

  // ── 4. Redraw เมื่อ param เปลี่ยน (zoom/origin/grid/anim/layer/โหลดใหม่) — ไม่ผูกกับ frame ──
  useEffect(() => { drawFrame() }, [sam, sprites, animIdx, zoom, origin, showGrid, drawFrame])

  // ── 5. โหลด/ประกอบฉากพื้นหลังเมื่อเลือกด่าน (+ โหลดกระสอบทรายครั้งแรก) ──
  useEffect(() => {
    if (!bgStage) {
      bgCanvasRef.current = null; activeBulletsRef.current = []
      dummyHitRef.current = []; rearHitRef.current = []; edgeHitRef.current = []
      drawFrame(); return
    }
    let cancelled = false
    setBgLoading(true)
    ;(async () => {
      // เรนเจอร์ Air Ambush สอยเฉพาะตัวบิน → เปลี่ยนเป้าหมายเป็นตัวบิน
      // เก็บ id ที่โหลดไว้ด้วย เพราะสลับเรนเจอร์แล้วชนิดเป้าหมายอาจเปลี่ยน ต้องโหลดใหม่
      const wantId = isAirAmbush ? FLYER_DUMMY_RANGER_ID : DUMMY_RANGER_ID
      const dummyTask = dummyRef.current && dummyIdRef.current === wantId
        ? Promise.resolve(dummyRef.current)
        : loadDummyRanger(wantId)
      // เป้าหมายแนวหลังโหลดเฉพาะเรนเจอร์ที่มีสกิลเล็ง Rear Enemy จริงๆ (ไม่งั้นเสียเน็ตฟรี)
      const needRear = (['skill1', 'skill2'] as const).some(k =>
        skillTargetsRef.current?.[k] === 'rear' && (skillRearMulRef.current?.[k] ?? 0) > 0)
      const rearTask = !needRear ? Promise.resolve(null)
        : rearDummyRef.current ? Promise.resolve(rearDummyRef.current)
        : loadDummyRanger(REAR_DUMMY_RANGER_ID)
      // ตัวยืนสุดขอบวง Area — โหลดเฉพาะเรนเจอร์ที่มีสกิลกินพื้นที่จริงๆ
      const needEdge = (['skill1', 'skill2'] as const).some(k => (skillAreasRef.current?.[k] ?? 0) > 0)
      const edgeTask = !needEdge ? Promise.resolve(null)
        : edgeDummyRef.current ? Promise.resolve(edgeDummyRef.current)
        : loadDummyRanger(EDGE_DUMMY_RANGER_ID)
      const [cv, dummy, rear, edge] = await Promise.all([composeBattleStage(bgStage), dummyTask, rearTask, edgeTask])
      if (cancelled) return
      bgCanvasRef.current = cv
      if (dummy) { dummyRef.current = dummy; dummyIdRef.current = wantId }
      if (rear) rearDummyRef.current = rear
      if (edge) edgeDummyRef.current = edge
      setBgLoading(false)
      drawFrame()
    })()
    return () => { cancelled = true }
  }, [bgStage, drawFrame, skillTargets, skillRearMul, skillAreas, isAirAmbush])

  // ── 5b. โหลดไฟล์กระสุน (bul/bul2/bul3) ล่วงหน้าเมื่อเปิดพื้นหลัง — เสกทันได้พอดีจังหวะโจมตี ──
  // เสกกระสุนทำงานเฉพาะตอนเปิดพื้นหลัง+มีกระสอบทรายเท่านั้น ไม่โหลดไฟล์พวกนี้ถ้าไม่เปิดพื้นหลัง
  useEffect(() => {
    if (!bgStage || !samFiles.length) return
    let cancelled = false
    ;(async () => {
      for (const suffix of ['bul', 'bul2', 'bul3'] as const) {
        if (bulletCacheRef.current.has(suffix)) continue
        const asset = await loadBulletSam(samFiles, suffix, mainFaceCenterRef.current, mainShadowCenterRef.current)
        if (cancelled) { if (asset) disposeSprites(asset.sprites); continue }
        bulletCacheRef.current.set(suffix, asset)
      }
    })()
    return () => { cancelled = true }
  }, [bgStage, samFiles])

  // ── ล้าง cache ไฟล์กระสุน + กระสุนที่ค้างอยู่ เมื่อเปลี่ยนเรนเจอร์ (samFiles ใหม่ = ไฟล์เดิม cache ไว้ใช้ไม่ได้) ──
  useEffect(() => {
    return () => {
      for (const asset of bulletCacheRef.current.values()) { if (asset) disposeSprites(asset.sprites) }
      bulletCacheRef.current.clear()
      activeBulletsRef.current = []
      dummyHitRef.current = []; rearHitRef.current = []; edgeHitRef.current = []
    }
  }, [samFiles])

  // หมายเหตุ: dispose sprites จัดการใน cleanup ของ effect #2 (per-effect ownership) แล้ว
  // ครอบคลุมทั้งตอนสลับไฟล์และ unmount → ไม่ต้องมี cleanup effect แยก (กัน double-dispose)

  // ── 6. Overlay (capture selection) ──
  // deps = [selection, selectMode] เท่านั้น — ไม่ผูกกับ frameIdx/zoom/origin
  // เพราะกรอบเลือกพื้นที่ไม่ได้ขึ้นกับเฟรมอนิเมชั่น (รันทุกเฟรม = reallocate canvas = หนืด)
  useEffect(() => {
    const overlay = overlayRef.current; if (!overlay) return
    const cv = canvasRef.current; if (!cv) return
    // sync ขนาดเฉพาะเมื่อต่างจริง (การ set width/height = clear + reallocate ทุกครั้ง)
    if (overlay.width  !== cv.width)  overlay.width  = cv.width
    if (overlay.height !== cv.height) overlay.height = cv.height
    const octx = overlay.getContext('2d'); if (!octx) return
    octx.clearRect(0, 0, overlay.width, overlay.height)
    const s = selection
    if (s && s.w > 2 && s.h > 2) {
      octx.fillStyle = 'rgba(0,0,0,0.45)'; octx.fillRect(0, 0, overlay.width, overlay.height)
      octx.clearRect(s.x, s.y, s.w, s.h)
      octx.strokeStyle = '#7ec8e3'; octx.lineWidth = 2; octx.setLineDash([6, 3])
      octx.strokeRect(s.x + 1, s.y + 1, s.w - 2, s.h - 2); octx.setLineDash([])
      octx.fillStyle = '#7ec8e3'; octx.font = '11px Tahoma, sans-serif'; octx.textAlign = 'left'
      const ly = s.y + s.h + 14 < overlay.height ? s.y + s.h + 14 : s.y - 4
      octx.fillText(`${Math.round(s.w)} × ${Math.round(s.h)} px`, s.x + 2, ly)
      // resize handles (มุม + ขอบ) — สี่เหลี่ยมเล็กลากปรับขนาดได้
      const hs = 6
      for (const h of HANDLES) {
        const [hx, hy] = handlePoint(s, h)
        octx.fillStyle = '#7ec8e3'; octx.fillRect(hx - hs, hy - hs, hs * 2, hs * 2)
        octx.strokeStyle = '#0a1418'; octx.lineWidth = 1.5; octx.strokeRect(hx - hs, hy - hs, hs * 2, hs * 2)
      }
    } else if (selectMode) {
      octx.fillStyle = 'rgba(0,0,0,0.3)'; octx.fillRect(0, 0, overlay.width, overlay.height)
      octx.fillStyle = 'rgba(255,255,255,0.75)'; octx.font = '13px Tahoma, sans-serif'; octx.textAlign = 'center'
      octx.fillText('ลาก/แตะค้างเพื่อเลือกพื้นที่', overlay.width / 2, overlay.height / 2)
    }
  }, [selection, selectMode])

  // ── Capture handlers ──
  const enterSelectMode = () => { setSelectMode(true); setSelection(null) }
  const clearSelection = () => { setSelection(null); setSelectMode(false) }

  // แปลงพิกัด pointer → canvas coords + คืน tolerance สำหรับ hit-test handle
  const overlayCoords = (clientX: number, clientY: number) => {
    const ov = overlayRef.current!
    const rect = ov.getBoundingClientRect()
    const sx = ov.width / rect.width, sy = ov.height / rect.height
    return { x: (clientX - rect.left) * sx, y: (clientY - rect.top) * sy, tol: 16 * sx }
  }

  // หา handle/พื้นที่ ที่ pointer อยู่ (ใช้ทั้ง hit-test ตอนกด และ cursor ตอน hover)
  const hitTest = (px: number, py: number, tol: number): 'new' | 'move' | Handle => {
    const s = selection
    if (s && s.w > 2 && s.h > 2) {
      for (const h of HANDLES) {
        const [hx, hy] = handlePoint(s, h)
        if (Math.abs(px - hx) <= tol && Math.abs(py - hy) <= tol) return h
      }
      if (px > s.x && px < s.x + s.w && py > s.y && py < s.y + s.h) return 'move'
    }
    return 'new'
  }

  const onOverlayPointerDown = (e: React.PointerEvent) => {
    const ov = overlayRef.current; if (!ov) return
    const { x: px, y: py, tol } = overlayCoords(e.clientX, e.clientY)
    const mode = hitTest(px, py, tol)
    ov.setPointerCapture(e.pointerId)
    if (mode === 'new') {
      dragRef.current = { mode, startX: px, startY: py, base: { x: px, y: py, w: 0, h: 0 } }
      setSelection(null)
    } else {
      dragRef.current = { mode, startX: px, startY: py, base: selection! }
    }
    e.preventDefault()
  }

  const onOverlayPointerMove = (e: React.PointerEvent) => {
    const ov = overlayRef.current; if (!ov) return
    const c = overlayCoords(e.clientX, e.clientY)
    const px = Math.max(0, Math.min(c.x, ov.width)), py = Math.max(0, Math.min(c.y, ov.height))
    const d = dragRef.current
    if (!d) {
      // hover → ตั้ง cursor ตรงๆ (ไม่ผ่าน React)
      const m = hitTest(c.x, c.y, c.tol)
      ov.style.cursor = m === 'new' ? 'crosshair' : m === 'move' ? 'move' : HANDLE_CURSOR[m]
      return
    }
    if (d.mode === 'new') {
      setSelection({ x: Math.min(d.startX, px), y: Math.min(d.startY, py), w: Math.abs(px - d.startX), h: Math.abs(py - d.startY) })
    } else if (d.mode === 'move') {
      const nx = Math.max(0, Math.min(d.base.x + (px - d.startX), ov.width - d.base.w))
      const ny = Math.max(0, Math.min(d.base.y + (py - d.startY), ov.height - d.base.h))
      setSelection({ x: nx, y: ny, w: d.base.w, h: d.base.h })
    } else {
      setSelection(applyResize(d.base, d.mode, px, py, ov.width, ov.height))
    }
  }

  const onOverlayPointerUp = (e: React.PointerEvent) => {
    const ov = overlayRef.current
    if (ov) { try { ov.releasePointerCapture(e.pointerId) } catch { /* already released */ } }
    dragRef.current = null
  }

  // ── Download PNG ──
  const handleDownload = () => {
    const cv = canvasRef.current; if (!cv || !sam || !sprites) return
    const oc = document.createElement('canvas'); oc.width = cv.width; oc.height = cv.height
    const ctx = oc.getContext('2d'); if (!ctx) return
    const frames = sam.animations[sam.animNames[animIdx]] || []
    const fr = frames[frameIdxRef.current]
    if (fr) renderSAMFrame(ctx, fr, sam.images, sprites, origin.x, origin.y, zoom, hiddenImages)
    let final = oc
    if (selection && selection.w > 2 && selection.h > 2) {
      final = document.createElement('canvas')
      final.width = Math.round(selection.w); final.height = Math.round(selection.h)
      const fctx = final.getContext('2d'); if (!fctx) return
      fctx.drawImage(oc, selection.x, selection.y, selection.w, selection.h, 0, 0, final.width, final.height)
    }
    const samName = samFiles[currentSamIdx]?.split('/').pop()?.replace(/\.sam$/i, '') ?? 'frame'
    const animName = sam.animNames[animIdx]?.replace(/[^a-z0-9_-]/gi, '') || 'all'
    const a = document.createElement('a')
    a.download = `${samName}-${animName}-f${frameIdxRef.current + 1}.png`
    a.href = final.toDataURL('image/png'); a.click()
  }

  // ── Export helpers ──
  const getExportArea = () => {
    const cv = canvasRef.current!
    const useArea = vUseSelection && selection && selection.w > 2
    return {
      W: useArea ? Math.round(selection!.w) : cv.width,
      H: useArea ? Math.round(selection!.h) : cv.height,
      offX: useArea ? origin.x - selection!.x : origin.x,
      offY: useArea ? origin.y - selection!.y : origin.y,
    }
  }

  const getExportName = () => {
    const samName = samFiles[currentSamIdx]?.split('/').pop()?.replace(/\.sam$/i, '') ?? 'anim'
    const seq = vAnimSeq.length ? vAnimSeq : [{ animIdx, start: soloStart, end: soloEnd }]
    const animName = seq.length > 1
      ? 'sequence'
      : (sam?.animNames[seq[0].animIdx]?.replace(/[^a-z0-9_-]/gi, '') || 'all')
    return `${samName}-${animName}`
  }

  // ── รวมเฟรมจากทุก anim ในลำดับที่ผู้ใช้จัดไว้ (ว่าง → ใช้ anim ปัจจุบันตัวเดียว) — ตัดตาม start/end ของแต่ละตัว ──
  const getSequenceFrames = (): SamFrame[] => {
    if (!sam) return []
    const seq = vAnimSeq.length ? vAnimSeq : [{ animIdx, start: soloStart, end: soloEnd }]
    const out: SamFrame[] = []
    for (const item of seq) {
      const frames = sam.animations[sam.animNames[item.animIdx]] || []
      if (!frames.length) continue
      const s = Math.max(0, Math.min(item.start, frames.length - 1))
      const e = Math.max(s, Math.min(item.end, frames.length - 1))
      out.push(...frames.slice(s, e + 1))
    }
    return out
  }

  // ── เสียงสำหรับไฟล์ MP4 ──
  // ใช้กติกาเดียวกับตอนเล่น (syncUnitSound) เสียงในไฟล์จึงตรงกับที่ได้ยินในตัวเล่นทุกอย่าง:
  //   • เสียงเดียวในเวลาเดียว — คิวใหม่ตัดคิวเก่า
  //   • Start frame อยู่กลางเสียงที่ร่ายไปก่อนแล้ว → เริ่มไฟล์ด้วยหางของเสียงนั้น (ตำแหน่งตรงกับภาพ)
  //   • End frame ตัดเสียงทิ้งตรงนั้น — ท่าถัดไปในลำดับไม่มีเสียงของท่าก่อนหน้าล้นเข้ามา
  // ผลลัพธ์: [เฟรมที่เริ่มในไฟล์, ตำแหน่งในไฟล์เสียง (วินาที), เฟรมที่ต้องหยุด]
  const getSequenceSoundEvents = (): { frame: number; url: string; offset: number; end: number }[] => {
    if (!sam) return []
    const fpsNow = sam.animRate || 24
    const seq = vAnimSeq.length ? vAnimSeq : [{ animIdx, start: soloStart, end: soloEnd }]
    const out: { frame: number; url: string; offset: number; end: number }[] = []
    let base = 0
    for (const item of seq) {
      const name = sam.animNames[item.animIdx]
      const frames = sam.animations[name] || []
      if (!frames.length) continue
      const st = Math.max(0, Math.min(item.start, frames.length - 1))
      const en = Math.max(st, Math.min(item.end, frames.length - 1))
      const itemEnd = base + (en - st + 1)
      const local: { frame: number; url: string; offset: number }[] = []
      const cues = animSoundCues(sam, name)
      // คิวล่าสุดที่เริ่มก่อน Start frame — ถ้าเสียงยังไม่จบ ไฟล์จะเริ่มด้วยหางของมัน
      let carried: { frame: number; url: string } | null = null
      for (const c of cues) { if (c.frame < st) carried = c; else break }
      if (carried) local.push({ frame: base, url: carried.url, offset: (st - carried.frame) / fpsNow })
      for (const c of cues) {
        if (c.frame >= st && c.frame <= en) local.push({ frame: base + (c.frame - st), url: c.url, offset: 0 })
      }
      // แต่ละคิวดังไปจนถึงคิวถัดไป หรือจนสุดช่วงของท่านี้
      local.forEach((ev, i) => out.push({ ...ev, end: i + 1 < local.length ? local[i + 1].frame : itemEnd }))
      base = itemEnd
    }
    return out
  }

  // มิกซ์เสียงทั้งหมดเป็นแทร็กเดียวด้วย OfflineAudioContext (เรนเดอร์เร็วกว่าเวลาจริง ไม่ต้องรอเล่นจบ)
  // ไฟล์เสียงต้องอ่านเป็นไบต์ได้ ซึ่ง lerico ไม่ส่ง CORS header มา → โหลดผ่าน proxy ของเราแทน
  // (เล่นเฉยๆ ใช้ URL ตรงได้ แต่ decodeAudioData ต้องการข้อมูลดิบ)
  // คืน null ถ้าไม่มีเสียงสักตัว — ไฟล์ออกมาเป็นวิดีโอเงียบแบบเดิม ไม่ใส่แทร็กเปล่าให้หนักไฟล์
  const EXPORT_SAMPLE_RATE = 48000
  const buildExportAudio = async (frameCount: number): Promise<AudioBuffer | null> => {
    const events = getSequenceSoundEvents()
    if (!events.length || typeof OfflineAudioContext === 'undefined') return null
    const duration = frameCount / fps
    const length = Math.max(1, Math.ceil(duration * EXPORT_SAMPLE_RATE))
    const octx = new OfflineAudioContext(2, length, EXPORT_SAMPLE_RATE)
    const decoded = new Map<string, AudioBuffer | null>()
    await Promise.all([...new Set(events.map(e => e.url))].map(async url => {
      try {
        const buf = await fetch(PROXY_FILE(url)).then(r => { if (!r.ok) throw new Error(String(r.status)); return r.arrayBuffer() })
        decoded.set(url, await octx.decodeAudioData(buf))
      } catch {
        decoded.set(url, null)   // ไฟล์เดียวพังไม่ทำให้ทั้งคลิปไม่มีเสียง
      }
    }))
    let placed = 0
    for (const ev of events) {
      const buf = decoded.get(ev.url)
      if (!buf) continue
      const src = octx.createBufferSource()
      src.buffer = buf
      const gain = octx.createGain()
      // ลดลงเล็กน้อยให้ระดับเดียวกับตอนเล่นในตัวเล่น
      gain.gain.value = SKILL_SOUND_VOLUME
      src.connect(gain).connect(octx.destination)
      // เริ่มที่ตำแหน่งตรงกับภาพ (หางของเสียงที่ร่ายก่อน Start frame) และหยุดตามคิวถัดไป/End frame
      if (ev.offset >= buf.duration) continue
      src.start(ev.frame / fps, ev.offset)
      src.stop(ev.end / fps)
      placed++
    }
    if (!placed) return null
    const mixed = await octx.startRendering()
    // กันเสียงแตก: ร่าย + ปล่อย + โดน ตกเฟรมเดียวกันได้ ผลรวมเลยเกิน 1.0 (วัดจากไฟล์จริงได้ 1.036)
    // ลดทั้งแทร็กลงพอดีเพดานเฉพาะคลิปที่เกิน — คลิปที่ไม่เกินไม่ถูกแตะเลย ไม่ใช้ compressor
    // ที่จะเปลี่ยนน้ำเสียงของทุกคลิป
    let peak = 0
    for (let ch = 0; ch < mixed.numberOfChannels; ch++) {
      const d = mixed.getChannelData(ch)
      for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v }
    }
    const CEILING = 0.95   // เผื่อที่ให้ AAC ซึ่งถอดกลับมาแล้วยอดคลื่นเกินต้นฉบับเล็กน้อย
    if (peak > CEILING) {
      const k = CEILING / peak
      for (let ch = 0; ch < mixed.numberOfChannels; ch++) {
        const d = mixed.getChannelData(ch)
        for (let i = 0; i < d.length; i++) d[i] *= k
      }
    }
    return mixed
  }

  // ── Anim Sequence: เพิ่ม / ย้าย / ลบ ──
  const MAX_ANIM_SEQ = 10
  const addSeqItem = (idx: number) => {
    if (!sam) return
    const frames = sam.animations[sam.animNames[idx]] || []
    const end = Math.max(0, frames.length - 1)
    setVAnimSeq(seq => seq.length >= MAX_ANIM_SEQ ? seq : [...seq, { animIdx: idx, start: 0, end }])
  }
  const removeSeqItem = (i: number) => {
    setVAnimSeq(seq => seq.filter((_, idx) => idx !== i))
    setEditingSeqIdx(cur => cur === null ? null : cur === i ? null : cur > i ? cur - 1 : cur)
  }
  const moveSeqItem = (i: number, dir: -1 | 1) => {
    const j = i + dir
    setVAnimSeq(seq => {
      if (j < 0 || j >= seq.length) return seq
      const copy = [...seq]
      ;[copy[i], copy[j]] = [copy[j], copy[i]]
      return copy
    })
    setEditingSeqIdx(cur => cur === null ? null : cur === i ? j : cur === j ? i : cur)
  }
  // ── ลากสลับตำแหน่ง (ทั้งแถวลากได้, PC เท่านั้น) ──
  const dragSeqIdxRef = useRef<number | null>(null)
  // ภาพ ghost 1x1 โปร่งใส — ใช้ปิด ghost image เริ่มต้นของเบราว์เซอร์ตอนลาก (ไม่ต้องการให้ลอยตามเมาส์ เพราะ list สลับที่สดๆ ให้เห็นอยู่แล้ว)
  const emptyDragImgRef = useRef<HTMLImageElement | null>(null)
  const reorderSeqItem = (from: number, to: number) => {
    setVAnimSeq(seq => {
      if (from === to || from < 0 || to < 0 || from >= seq.length || to >= seq.length) return seq
      const copy = [...seq]
      const [item] = copy.splice(from, 1)
      copy.splice(to, 0, item)
      return copy
    })
    setEditingSeqIdx(cur => {
      if (cur === null || from === to) return cur
      if (cur === from) return to
      if (from < cur && cur <= to) return cur - 1
      if (to <= cur && cur < from) return cur + 1
      return cur
    })
  }
  // ── เริ่มแก้ช่วงเฟรมของ item ใน sequence — ปิดหน้า Export ให้เห็นจอ preview เต็มๆ + โหลด anim นั้นเข้า preview + activate scrubber trim ──
  // (ลำดับ/ช่วงเฟรมที่ตั้งไว้ยังอยู่เหมือนเดิม แค่ปิดหน้า Export — กด Video เปิดใหม่ก็เห็นค่าเดิม)
  const editSeqItem = (i: number) => {
    const item = vAnimSeq[i]; if (!item || !sam) return
    setShowVideoPanel(false)
    setEditingSeqIdx(i)
    setAnimIdx(item.animIdx)
    frameIdxRef.current = item.start
    drawFrame()
  }

  // ── Export Animated WebP ──
  const doExportWebP = async () => {
    const cv = canvasRef.current; if (!cv || !sam || !sprites) return
    const frames = getSequenceFrames(); if (!frames.length) return
    const { W, H, offX, offY } = getExportArea()
    const transparent = !vBg
    const delayMs = Math.round(1000 / fps)

    const oc = document.createElement('canvas'); oc.width = W; oc.height = H
    const ctx = oc.getContext('2d', { alpha: true })!
    const framePayloads: { data: ArrayBuffer; hasAlpha: boolean }[] = []

    for (let fi = 0; fi < frames.length; fi++) {
      if (exportCancelRef.current) return
      ctx.clearRect(0, 0, W, H)
      if (!transparent && vBg) { ctx.fillStyle = vBg; ctx.fillRect(0, 0, W, H) }
      renderSAMFrame(ctx, frames[fi], sam.images, sprites, offX, offY, zoom, hiddenImages)

      const dataUrl = oc.toDataURL('image/webp', transparent ? undefined : 0.92)
      if (!dataUrl.startsWith('data:image/webp'))
        throw new Error(tStat('This browser does not support creating WebP — use Chrome or Edge instead'))

      const bin = atob(dataUrl.split(',')[1])
      const webpBuf = new ArrayBuffer(bin.length)
      const webpBytes = new Uint8Array(webpBuf)
      for (let i = 0; i < bin.length; i++) webpBytes[i] = bin.charCodeAt(i)

      const payload = extractAnmfPayload(webpBuf)
      if (!payload) throw new Error(`${tStat('Failed to parse WebP frame')} ${fi + 1}`)
      framePayloads.push({ data: payload.data, hasAlpha: transparent || payload.hasAlpha })

      setVProgress(Math.round((fi + 1) / frames.length * 90))
      setVProgressMsg(`${tStat('Encoding frame')} ${fi + 1} / ${frames.length}`)
      await new Promise(r => setTimeout(r, 0))
    }

    setVProgressMsg(tStat('Building animated WebP...'))
    const result = buildAnimatedWebP(framePayloads, W, H, delayMs)
    setVProgress(100)
    if (exportCancelRef.current) return
    downloadBlob(new Blob([result], { type: 'image/webp' }), getExportName() + '.webp')
  }

  // ── Export GIF (ใช้ gifenc API ตรงๆ — รองรับ transparent ด้วย rgba4444 + oneBitAlpha) ──
  const doExportGIF = async () => {
    const cv = canvasRef.current; if (!cv || !sam || !sprites) return
    const frames = getSequenceFrames(); if (!frames.length) return
    const { W, H, offX, offY } = getExportArea()
    const { GIFEncoder, quantize, applyPalette } = await import('gifenc')
    const oc = document.createElement('canvas'); oc.width = W; oc.height = H
    const ctx = oc.getContext('2d', { willReadFrequently: true })!
    const transparent = !vBg
    const delay = Math.round(1000 / fps)   // gifenc รับเป็น ms
    const N = W * H

    // ── Pass 1: sample สีจากทุกเฟรม (1 ใน 4 pixel) มาสร้าง palette เดียวใช้ร่วมกันทั้งคลิป ──
    // เดิม quantize ทุกเฟรมแยกกัน → สีเดียวกันได้ index ต่างกันในแต่ละเฟรม ทำให้ดูกระพริบตอนเล่น
    const sampleStride = 4   // 1 pixel ใน 4 (ลดหน่วยความจำ ยังคงกระจายสีพอสำหรับ palette)
    const samples: Uint8ClampedArray[] = []
    for (let fi = 0; fi < frames.length; fi++) {
      if (exportCancelRef.current) return
      ctx.clearRect(0, 0, W, H)
      if (!transparent) { ctx.fillStyle = vBg!; ctx.fillRect(0, 0, W, H) }
      renderSAMFrame(ctx, frames[fi], sam.images, sprites, offX, offY, zoom, hiddenImages)
      const data = ctx.getImageData(0, 0, W, H).data
      if (transparent) {
        for (let i = 0; i < N; i++) {
          if (data[i*4+3] < 128) { data[i*4]=0; data[i*4+1]=0; data[i*4+2]=0; data[i*4+3]=0 }
          else data[i*4+3] = 255
        }
      }
      const sampled = new Uint8ClampedArray(Math.ceil(N / sampleStride) * 4)
      let w = 0
      for (let i = 0; i < N; i += sampleStride) {
        sampled[w++] = data[i*4]; sampled[w++] = data[i*4+1]; sampled[w++] = data[i*4+2]; sampled[w++] = data[i*4+3]
      }
      samples.push(sampled)
      setVProgress(Math.round((fi + 1) / frames.length * 35))
      setVProgressMsg(`${tStat('Analyzing color')} ${fi + 1} / ${frames.length}`)
      await new Promise(r => setTimeout(r, 0))
    }
    const combined = new Uint8ClampedArray(samples.reduce((s, c) => s + c.length, 0))
    { let off = 0; for (const c of samples) { combined.set(c, off); off += c.length } }
    const palette = transparent
      ? quantize(combined, 256, { format: 'rgba4444', oneBitAlpha: true })
      : quantize(combined, 256)
    const transparentIndex = transparent ? palette.findIndex(c => c[3] === 0) : -1

    // ── Pass 2: เข้ารหัสจริงด้วย palette เดียวกันทุกเฟรม (เขียนลง Global Color Table แค่เฟรมแรก) ──
    const gif = GIFEncoder()
    for (let fi = 0; fi < frames.length; fi++) {
      if (exportCancelRef.current) return
      ctx.clearRect(0, 0, W, H)
      if (!transparent) { ctx.fillStyle = vBg!; ctx.fillRect(0, 0, W, H) }
      renderSAMFrame(ctx, frames[fi], sam.images, sprites, offX, offY, zoom, hiddenImages)
      const data = ctx.getImageData(0, 0, W, H).data

      if (transparent) {
        for (let i = 0; i < N; i++) {
          if (data[i*4+3] < 128) { data[i*4]=0; data[i*4+1]=0; data[i*4+2]=0; data[i*4+3]=0 }
          else data[i*4+3] = 255
        }
        const index = applyPalette(data, palette, 'rgba4444')
        gif.writeFrame(index, W, H, {
          palette: fi === 0 ? palette : undefined,
          transparent: transparentIndex >= 0,
          transparentIndex: transparentIndex >= 0 ? transparentIndex : undefined,
          delay,
          dispose: 2,
        })
      } else {
        const index = applyPalette(data, palette)
        gif.writeFrame(index, W, H, { palette: fi === 0 ? palette : undefined, delay })
      }

      setVProgress(35 + Math.round((fi + 1) / frames.length * 60))
      setVProgressMsg(`${tStat('Encoding frame')} ${fi + 1} / ${frames.length}`)
      await new Promise(r => setTimeout(r, 0))
    }

    if (exportCancelRef.current) return
    gif.finish()
    setVProgress(100)
    downloadBlob(new Blob([gif.bytes().buffer as ArrayBuffer], { type: 'image/gif' }), getExportName() + '.gif')
  }

  // ── Export MP4 (WebCodecs + mp4-muxer) ──
  const doExportMP4 = async () => {
    const cv = canvasRef.current; if (!cv || !sam || !sprites) return
    if (typeof VideoEncoder === 'undefined') throw new Error(tStat('MP4 requires Chrome 94+ or Edge 94+ — this browser is not supported'))
    const frames = getSequenceFrames(); if (!frames.length) return

    const { Muxer, ArrayBufferTarget } = await import('mp4-muxer')
    let { W, H, offX, offY } = getExportArea()
    // MP4/H.264 ต้องการขนาดคู่
    W = Math.ceil(W / 2) * 2; H = Math.ceil(H / 2) * 2
    const bgColor = vBg || '#000000'

    const oc = document.createElement('canvas'); oc.width = W; oc.height = H
    const ctx = oc.getContext('2d')!

    // ── แทร็กเสียง (ถ้ามี) — เตรียมก่อนเปิด muxer เพราะต้องบอกตั้งแต่แรกว่าไฟล์มีเสียงไหม ──
    setVProgressMsg(tStat('Mixing audio...'))
    let audio: AudioBuffer | null = null
    try { audio = await buildExportAudio(frames.length) } catch { audio = null }
    if (exportCancelRef.current) return
    // AAC เปิดได้ทุกโปรแกรม (รวม Windows/มือถือ) แต่บาง Chrome ไม่มีตัวเข้ารหัส → ถอยไป Opus
    // ถ้าเข้ารหัสเสียงไม่ได้เลยก็ยังได้วิดีโอแบบไม่มีเสียงเหมือนเดิม ไม่ล้มทั้งไฟล์
    let audioCodec: 'aac' | 'opus' | null = null
    if (audio && typeof AudioEncoder !== 'undefined') {
      const base = { sampleRate: EXPORT_SAMPLE_RATE, numberOfChannels: 2, bitrate: 128_000 }
      if ((await AudioEncoder.isConfigSupported({ ...base, codec: 'mp4a.40.2' })).supported) audioCodec = 'aac'
      else if ((await AudioEncoder.isConfigSupported({ ...base, codec: 'opus' })).supported) audioCodec = 'opus'
    }

    const target = new ArrayBufferTarget()
    const muxer = new Muxer({
      target,
      video: { codec: 'avc', width: W, height: H, frameRate: fps },
      ...(audioCodec ? { audio: { codec: audioCodec, numberOfChannels: 2, sampleRate: EXPORT_SAMPLE_RATE } } : {}),
      fastStart: 'in-memory',
    })

    if (audio && audioCodec) {
      const audioEncoder = new AudioEncoder({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        output: (chunk: any, meta: any) => muxer.addAudioChunk(chunk, meta),
        error: (e: Error) => { throw e },
      })
      audioEncoder.configure({
        codec: audioCodec === 'aac' ? 'mp4a.40.2' : 'opus',
        sampleRate: EXPORT_SAMPLE_RATE, numberOfChannels: 2, bitrate: 128_000,
      })
      // ป้อนทีละก้อน (ตัวเข้ารหัสรับก้อนใหญ่ทั้งไฟล์ไม่ได้ในบางเบราว์เซอร์)
      const CHUNK = 4800   // 0.1 วินาที
      const L = audio.getChannelData(0), R = audio.getChannelData(1)
      for (let off = 0; off < audio.length; off += CHUNK) {
        const n = Math.min(CHUNK, audio.length - off)
        const planar = new Float32Array(n * 2)
        planar.set(L.subarray(off, off + n), 0)
        planar.set(R.subarray(off, off + n), n)
        const ad = new AudioData({
          format: 'f32-planar', sampleRate: EXPORT_SAMPLE_RATE,
          numberOfFrames: n, numberOfChannels: 2,
          timestamp: Math.round(off / EXPORT_SAMPLE_RATE * 1_000_000),
          data: planar,
        })
        audioEncoder.encode(ad); ad.close()
      }
      await audioEncoder.flush(); audioEncoder.close()
    }

    const encoder = new VideoEncoder({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      output: (chunk: any, meta: any) => muxer.addVideoChunk(chunk, meta),
      error: (e: Error) => { throw e },
    })
    encoder.configure({ codec: 'avc1.42001f', width: W, height: H, bitrate: 4_000_000, framerate: fps })

    const frameDur = Math.round(1_000_000 / fps)
    for (let fi = 0; fi < frames.length; fi++) {
      if (exportCancelRef.current) { encoder.close(); return }
      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = bgColor; ctx.fillRect(0, 0, W, H)
      renderSAMFrame(ctx, frames[fi], sam.images, sprites, offX, offY, zoom, hiddenImages)
      const vf = new VideoFrame(oc, { timestamp: fi * frameDur, duration: frameDur })
      encoder.encode(vf, { keyFrame: fi % 30 === 0 }); vf.close()
      setVProgress(Math.round((fi + 1) / frames.length * 90))
      setVProgressMsg(`${tStat('Encoding frame')} ${fi + 1} / ${frames.length}`)
      if (fi % 5 === 0) await new Promise(r => setTimeout(r, 0))
    }

    setVProgressMsg(tStat('Finalizing MP4...'))
    await encoder.flush(); encoder.close()
    muxer.finalize()
    setVProgress(100)
    if (exportCancelRef.current) return
    const blob = new Blob([target.buffer], { type: 'video/mp4' })
    downloadBlob(blob, getExportName() + '.mp4')
  }

  // ── Start / Cancel Export ──
  const startExport = async () => {
    if (!canvasRef.current || !sam || !sprites) return
    exportCancelRef.current = false
    setVExporting(true); setVProgress(0); setVProgressMsg(tStat('Starting...')); setVError('')
    try {
      if (vFormat === 'webp') await doExportWebP()
      else if (vFormat === 'gif') await doExportGIF()
      else await doExportMP4()
      if (!exportCancelRef.current) { setVExporting(false); setShowVideoPanel(false) }
    } catch (err) {
      if (!exportCancelRef.current) {
        setVError(err instanceof Error ? err.message : tStat('Export failed'))
      }
      setVExporting(false)
    }
  }

  const cancelExport = () => {
    exportCancelRef.current = true
    if (recorderRef.current?.state !== 'inactive') recorderRef.current?.stop()
    setVExporting(false); setVProgress(0); setVProgressMsg('')
  }

  // ── Canvas resize ──
  // ปรับขนาด canvas หลัก + overlay ที่นี่ที่เดียว (เมื่อขนาดเปลี่ยนจริง) —
  // ห้ามไป set canvas.width ใน draw loop ทุกเฟรม เพราะมัน reallocate backing store = กระตุก
  useEffect(() => {
    const cv = canvasRef.current; if (!cv) return
    const ro = new ResizeObserver(entries => {
      for (const { contentRect } of entries) {
        const w = Math.floor(contentRect.width); const h = Math.floor(contentRect.height)
        if (w < 60 || h < 60) return
        if (cv.width !== w)  cv.width  = w
        if (cv.height !== h) cv.height = h
        const ov = overlayRef.current
        if (ov) { if (ov.width !== w) ov.width = w; if (ov.height !== h) ov.height = h }
        if (sam && sprites) {
          const fit = autoFit(sam, sprites, w, h)
          if (fit) { setZoom(fit.zoom); setOrigin({ x: fit.originX, y: fit.originY }) }
          else setOrigin({ x: w / 2, y: h / 2 })
        }
      }
    })
    ro.observe(cv); return () => ro.disconnect()
  }, [sam, sprites])

  // ── Mouse pan ──
  const [panState, setPanState] = useState<{ active: boolean; sx: number; sy: number; ox: number; oy: number } | null>(null)


  // ── รายการชิ้นส่วนที่โชว์ในหน้าต่างลอย ──
  // คิดใหม่เมื่อ layerTick เด้ง (ทุก ~120ms ตอนเปิดแถบ) → รายการตรงกับเฟรมที่เห็นอยู่
  // 1 แถว = 1 ภาพ ถ้าเฟรมนั้นวาดภาพเดียวกันหลายชิ้นจะยุบเป็นแถวเดียวแล้วบอกจำนวนไว้ (×n)
  // เรียงชิ้นบนสุดไว้บนสุดของรายการ (draw order ของ .sam เรียงจากหลังมาหน้า จึงกลับลำดับ)
  const layerRows = useMemo(() => {
    type Row = { resNum: number; name: string; size: string; count: number; inFrame: boolean }
    if (!showLayers || !sam) return [] as Row[]
    const frames = sam.animations[sam.animNames[animIdx]] || []
    const fr = frames[frameIdxRef.current]
    const sizeOf = (name: string) => name.match(/_(\d+x\d+)(?:_\d+)?\.png$/)?.[1] ?? ''
    const byRes = new Map<number, Row>()
    for (const [, resNum] of (fr ?? [])) {
      const ex = byRes.get(resNum)
      if (ex) { ex.count++; continue }
      const name = sam.images[resNum]?.name ?? ''
      byRes.set(resNum, { resNum, name, size: sizeOf(name), count: 1, inFrame: true })
    }
    const rows = [...byRes.values()].reverse()
    // ชิ้นที่ปิดไว้แต่ไม่โผล่ในเฟรมนี้ — ต่อท้ายไว้เพื่อให้เปิดคืนได้
    // โดยไม่ต้องไล่หาว่าปิดไว้ตอนอยู่เฟรมไหน (ไม่งั้นภาพหายแล้วหาสาเหตุไม่เจอ)
    for (const resNum of hiddenImages) {
      if (byRes.has(resNum)) continue
      const name = sam.images[resNum]?.name ?? ''
      rows.push({ resNum, name, size: sizeOf(name), count: 0, inFrame: false })
    }
    return rows
    // frameIdxRef อ่านตอนคำนวณ — layerTick เป็นตัวบอกว่าเฟรมขยับแล้ว
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showLayers, sam, animIdx, hiddenImages, layerTick])

  // ── ลากหน้าต่างเลเยอร์ ──
  const onLayerPanelDragStart = (e: React.PointerEvent) => {
    const start = { mx: e.clientX, my: e.clientY, px: layerPanelPos.x, py: layerPanelPos.y }
    const onMove = (ev: PointerEvent) => {
      // ตอนนี้หน้าต่างเป็น fixed อยู่ชั้นนอกสุด → คุมด้วยขอบจอ ไม่ใช่ขอบกรอบ canvas
      // เหลือขอบไว้ให้เห็นหัวหน้าต่างเสมอ จะได้ลากกลับได้ ไม่หลุดออกนอกจอถาวร
      const maxX = Math.max(0, window.innerWidth - LAYER_PANEL_W - 8)
      const maxY = Math.max(0, window.innerHeight - 48)
      setLayerPanelPos({
        x: Math.min(maxX, Math.max(8, start.px + (ev.clientX - start.mx))),
        y: Math.min(maxY, Math.max(8, start.py + (ev.clientY - start.my))),
      })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // เปิดหน้าต่างครั้งแรก → วางไว้มุมซ้ายบนของพื้นที่ภาพ (พิกัดจอ เพราะหน้าต่างเป็น fixed แล้ว)
  // ครั้งต่อไปไม่ย้ายให้ เพราะคนลากไปวางตรงที่ถนัดไว้แล้ว
  const layerPanelPlacedRef = useRef(false)
  useEffect(() => {
    if (!showLayers || layerPanelPlacedRef.current) return
    const r = canvasRef.current?.getBoundingClientRect()
    if (r) setLayerPanelPos({ x: Math.max(8, r.left + 12), y: Math.max(8, r.top + 12) })
    layerPanelPlacedRef.current = true
  }, [showLayers])
  // ── ชี้บนภาพ → บอกว่าเป็นชิ้นไหนในแถบเลเยอร์ ──
  // ใช้กรอบที่ draw loop เก็บไว้ (framePiecesRef) ซึ่งเป็นพิกัดหน้าจอของเฟรมล่าสุดอยู่แล้ว
  // canvas ถูกยืดด้วย CSS (w-full h-full) → ต้องแปลงพิกัดเมาส์ตามสัดส่วนจริงของ canvas ก่อน
  // ข้ามชิ้นที่ถูกซ่อน: ภาพไม่มีให้เห็น การชี้โดนจึงไม่มีความหมาย
  const onCanvasHover = (e: React.MouseEvent) => {
    if (!showLayersRef.current) return
    const cv = canvasRef.current; if (!cv) return
    if (panState?.active) return   // กำลังลากเลื่อนภาพ ไม่ใช่การชี้
    const r = cv.getBoundingClientRect()
    const px = (e.clientX - r.left) * (cv.width / r.width)
    const py = (e.clientY - r.top) * (cv.height / r.height)
    const visible = framePiecesRef.current.filter(p => !hiddenImagesRef.current.has(p.resNum))
    const hit = pieceAtPoint(visible, px, py)
    setHoverRes(prev => (hit?.resNum ?? null) === prev ? prev : (hit?.resNum ?? null))
  }
  const onMouseDown = (e: React.MouseEvent) => {
    setPanState({ active: true, sx: e.clientX, sy: e.clientY, ox: origin.x, oy: origin.y })
  }
  useEffect(() => {
    if (!panState?.active) return
    const onMove = (e: MouseEvent) => { setOrigin({ x: panState.ox + (e.clientX - panState.sx), y: panState.oy + (e.clientY - panState.sy) }) }
    const onUp = () => setPanState(null)
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [panState])

  // ── Scroll-wheel zoom ──
  // ต้องผูก listener เองแบบ passive:false — React ผูก wheel ให้เป็น passive
  // preventDefault ใน onWheel ของ React จึงไม่มีผล แล้วหน้าเว็บจะเลื่อนตามไปด้วยขณะซูม
  // (ตอนเป็นป๊อปอัพไม่เห็นอาการเพราะล็อกการเลื่อนหน้าไว้อยู่แล้ว มาโผล่ตอนฝังในหน้า)
  useEffect(() => {
    const el = canvasRef.current
    if (!el || selectMode) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      setZoom(z => Math.max(0.1, Math.min(8.0, +(z + (e.deltaY > 0 ? -0.15 : 0.15)).toFixed(2))))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [selectMode])

  // ── Touch: pan + pinch-zoom ──
  const onTouchStart = (e: React.TouchEvent) => {
    e.preventDefault()
    if (e.touches.length === 1) {
      const t = e.touches[0]; setPanState({ active: true, sx: t.clientX, sy: t.clientY, ox: origin.x, oy: origin.y }); pinchRef.current = null
    } else if (e.touches.length === 2) {
      const dx = e.touches[1].clientX - e.touches[0].clientX; const dy = e.touches[1].clientY - e.touches[0].clientY
      pinchRef.current = { dist: Math.hypot(dx, dy), ox: origin.x, oy: origin.y, zoom }; setPanState(null)
    }
  }
  const onTouchMove = (e: React.TouchEvent) => {
    e.preventDefault()
    if (e.touches.length === 1 && panState?.active) {
      const t = e.touches[0]; setOrigin({ x: panState.ox + (t.clientX - panState.sx), y: panState.oy + (t.clientY - panState.sy) })
    } else if (e.touches.length === 2 && pinchRef.current) {
      const dx = e.touches[1].clientX - e.touches[0].clientX; const dy = e.touches[1].clientY - e.touches[0].clientY
      setZoom(Math.max(0.1, Math.min(8.0, +(pinchRef.current.zoom * (Math.hypot(dx, dy) / pinchRef.current.dist)).toFixed(2))))
    }
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault()
    if (e.touches.length < 2) pinchRef.current = null
    if (e.touches.length === 0) setPanState(null)
  }

  // ── Frame stepping ──
  const stepFrame = (delta: number) => {
    if (!sam) return; setPlaying(false)
    const frames = sam.animations[sam.animNames[animIdx]] || []; if (!frames.length) return
    const next = ((frameIdxRef.current + delta) + frames.length) % frames.length
    frameIdxRef.current = next
    sceneTickRef.current += delta   // เลื่อนเฟรมมือ (chevron/hold-step) ก็ต้องขยับกระสุนตามด้วย
    drawFrame()
  }

  // ── Anim options ──
  const animOptions = useMemo(() => {
    if (!sam) return [] as { idx: number; name: string }[]
    return sam.animNames.map((n, i) => ({ idx: i, name: n }))
  }, [sam])


  // ── Reset view ──
  const resetView = () => {
    if (!sam || !sprites || !canvasRef.current) return
    const cv = canvasRef.current; const fit = autoFit(sam, sprites, cv.width, cv.height)
    if (fit) { setZoom(fit.zoom); setOrigin({ x: fit.originX, y: fit.originY }) }
  }

  // ── เปลี่ยน animation ── คงมุมกล้อง (zoom/origin) เดิมไว้ ไม่ auto-fit ซ้ำ — กด Reset เองถ้าต้องการ
  // เปลี่ยนจาก dropdown เอง → ออกจากโหมดแก้ช่วงเฟรมของ sequence item (ถ้ากำลังแก้อยู่)
  const changeAnim = (idx: number) => {
    setAnimIdx(idx); frameIdxRef.current = 0
    setEditingSeqIdx(null)
  }

  const currentSamName = samFiles[currentSamIdx]?.split('/').pop()?.replace(/\.sam$/i, '') ?? ''
  // ไฟล์หลัก = ไฟล์แรก หรือไฟล์ที่ชื่อมี "body" — ไฟล์อื่น (bul/bul2/target ฯลฯ) ดูอย่างเดียว
  // ปิดพื้นหลัง/เลือกพื้นที่/ดาวน์โหลด เพราะฟีเจอร์พวกนี้ตั้งใจใช้กับตัวเรนเจอร์หลักเท่านั้น
  const totalFrames = (sam?.animations[sam?.animNames[animIdx] ?? ''] || []).length

  // ── solo trim (ไม่ได้แก้ sequence item ไหนอยู่) — reset เป็นเต็มช่วงทุกครั้งที่เปลี่ยน anim ──
  useEffect(() => { setSoloStart(0); setSoloEnd(Math.max(0, totalFrames - 1)) }, [animIdx, totalFrames])

  // ── ช่วงเฟรมที่กำลังแก้อยู่จริง (ของ sequence item ถ้ากำลังแก้ ไม่งั้นใช้ solo trim) ──
  const currentTrim = (editingSeqIdx !== null && vAnimSeq[editingSeqIdx])
    ? vAnimSeq[editingSeqIdx]
    : { start: soloStart, end: soloEnd }
  const setTrimRange = (s: number, e: number) => {
    if (editingSeqIdx !== null) {
      setVAnimSeq(seq => seq.map((it, i) => i === editingSeqIdx ? { ...it, start: s, end: e } : it))
    } else {
      setSoloStart(s); setSoloEnd(e)
    }
    // playhead อยู่นอกช่วงที่เพิ่งตั้ง (เช่นลากมาร์คข้ามตำแหน่งปัจจุบัน) → กระโดดเข้าช่วงทันที ให้พรีวิวตรงกับมาร์ค
    if (frameIdxRef.current < s || frameIdxRef.current > e) {
      frameIdxRef.current = s; drawFrame()
    }
  }
  // sync currentTrim → refs (ให้ play loop เห็นค่าล่าสุดเสมอ ไม่ว่าจะเปลี่ยนจากการลากมาร์ค เปลี่ยน anim หรือ editSeqItem)
  useEffect(() => { trimStartRef.current = currentTrim.start; trimEndRef.current = currentTrim.end }, [currentTrim.start, currentTrim.end])

  // ── ปิดหน้า Export ด้วยปุ่มกากบาท — รีเซ็ตการตั้งค่าวิดีโอทั้งหมดกลับเป็นค่าเริ่มต้น ──
  // (ต่างจาก editSeqItem ที่ปิดหน้านี้ชั่วคราวเพื่อไปแก้ frame แล้วค่ายังอยู่เหมือนเดิม)
  const closeVideoPanel = () => {
    setShowVideoPanel(false)
    setVError('')
    setVAnimSeq([])
    setEditingSeqIdx(null)
    setVFormat('webp')
    setVBg(null)
    setVCustomColor('#9b59b6')
    setVUseSelection(false)
    setVAddAnimIdx(0)
    setSoloStart(0)
    setSoloEnd(Math.max(0, totalFrames - 1))
  }

  // ── Scrub bar: seek + ลากจุดมาร์ค start/end ──
  const scrubPct = (f: number) => totalFrames > 1 ? (f / (totalFrames - 1)) * 100 : 0
  const frameFromClientX = (clientX: number) => {
    const bar = scrubBarRef.current
    if (!bar || totalFrames <= 1) return 0
    const rect = bar.getBoundingClientRect()
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return Math.round(frac * (totalFrames - 1))
  }
  const handleScrubMove = (clientX: number) => {
    const f = frameFromClientX(clientX)
    const mode = scrubDragRef.current
    if (mode === 'seek') {
      // ต้องขยับ sceneTick ตามระยะที่ลากด้วย เหมือน stepFrame() ไม่งั้นทุกอย่างที่ผูกกับ tick จะค้าง:
      //   กระสุนที่เสกไว้ค้างกลางอากาศ (T = sceneTick - spawnTick ไม่เดิน) แล้วไม่หมดอายุ
      //   เป้าหมายค้างสีแดง/ค้างท่ากระเด็น เพราะ age ของปฏิกิริยาไม่เดินเหมือนกัน
      sceneTickRef.current += f - frameIdxRef.current
      frameIdxRef.current = f; drawFrame()
    } else if (mode === 'start') {
      setTrimRange(Math.min(f, currentTrim.end), currentTrim.end)
    } else if (mode === 'end') {
      setTrimRange(currentTrim.start, Math.max(f, currentTrim.start))
    }
  }
  const onScrubPointerDown = (e: React.PointerEvent, mode: 'seek' | 'start' | 'end') => {
    e.stopPropagation()
    if (mode === 'seek') setPlaying(false)
    scrubDragRef.current = mode
    setScrubDragMode(mode)
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* ignore */ }
    handleScrubMove(e.clientX)
  }
  const onScrubPointerMove = (e: React.PointerEvent) => { if (scrubDragRef.current) handleScrubMove(e.clientX) }
  const onScrubPointerUp = () => { scrubDragRef.current = null; setScrubDragMode(null) }

  // ── bg ที่ active จริง (ตรวจว่าเป็น preset หรือ custom) ──
  const isCustomBgActive = typeof vBg === 'string' && !BG_PRESETS.find(p => p.value === vBg)

  // card ใช้พื้นทึบ (ไม่ใช้ backdrop-blur) — backdrop-filter ต้อง re-composite ทุกเฟรมที่ canvas วาด = jank
  const card = (
      <div
        className={`w-full relative overflow-hidden flex flex-col bg-[#0d1220] ${
          maximized ? '' : `rounded-2xl border border-white/10 ${embedded ? '' : 'sm:max-w-6xl shadow-2xl'}`
        }`}
        style={{ height: maximized ? '100svh' : embedded ? 'min(76svh, 680px)' : 'min(92svh, 720px)' }}
        // เล่นเสียงคลิกให้ปุ่มทุกตัวในตัวเล่นอนิเมชั่น (รวม Export) — ดักที่ capture phase ครอบคลุมทุกปุ่มในนี้ในจุดเดียว
        onClickCapture={(e) => { if ((e.target as HTMLElement).closest('button')) play('click_global.ogg') }}
      >
        {/* ── Header ── */}
        <div className="flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-3 border-b border-white/10 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/gacha/images/LogoKiwi.png" alt="Kiwi" width={28} height={28} className="rounded-md shrink-0 object-contain" />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm sm:text-base font-bold text-white truncate leading-tight">{rangerName}</h2>
            <div className="text-[10px] sm:text-xs text-gray-500 truncate">{rangerId}{currentSamName ? ` · ${currentSamName}` : ''}</div>
          </div>
          {samFiles.length > 1 && (
            <div className="flex items-center gap-1 shrink-0">
              <button type="button" onClick={() => setCurrentSamIdx(i => (i - 1 + samFiles.length) % samFiles.length)}
                className="w-7 h-7 flex items-center justify-center bg-slate-800 border border-slate-700 rounded text-gray-300 hover:bg-slate-700">
                <span className="material-icons-round text-[16px]">skip_previous</span>
              </button>
              <span className="text-[10px] text-gray-500 tabular-nums">{currentSamIdx + 1}/{samFiles.length}</span>
              <button type="button" onClick={() => setCurrentSamIdx(i => (i + 1) % samFiles.length)}
                className="w-7 h-7 flex items-center justify-center bg-slate-800 border border-slate-700 rounded text-gray-300 hover:bg-slate-700">
                <span className="material-icons-round text-[16px]">skip_next</span>
              </button>
            </div>
          )}
          <button type="button" onClick={toggleMaximized} className="text-gray-400 hover:text-white transition-colors ml-1 shrink-0"
            aria-label={maximized ? tStat('Exit full screen') : tStat('Full screen')} title={maximized ? tStat('Exit full screen') : tStat('Full screen')}>
            <span className="material-icons-round text-[20px]">{maximized ? 'fullscreen_exit' : 'fullscreen'}</span>
          </button>
          {!embedded && (
            <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors ml-1 shrink-0" aria-label="ปิด">
              <span className="material-icons-round text-[20px]">close</span>
            </button>
          )}
        </div>

        {/* ── Body ── */}
        <div className="flex-1 flex flex-col min-h-0 p-2 sm:p-3 gap-2 relative">

          {/* Confirm Download Dialog */}
          {confirmAction && (
            <div className="absolute inset-0 z-30 flex items-center justify-center p-4 bg-black/70 rounded-b-2xl">
              <div className="card-glass rounded-xl p-5 flex flex-col items-center gap-4 w-full max-w-[280px] text-center">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${confirmAction === 'png' ? 'bg-emerald-700/40' : 'bg-emerald-700/40'}`}>
                  {confirmAction === 'png' ? (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6ee7b7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                      <polyline points="21 15 16 10 5 21"/>
                    </svg>
                  ) : (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6ee7b7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                    </svg>
                  )}
                </div>
                <div>
                  <p className="text-sm font-bold text-white mb-1">
                    {confirmAction === 'png' ? tStat('Download image?') : tStat('Export video?')}
                  </p>
                  <p className="text-xs text-gray-400">
                    {confirmAction === 'png'
                      ? tStat('Save current frame as PNG file')
                      : tStat('Choose format and settings before exporting')}
                  </p>
                </div>
                <div className="flex gap-2 w-full">
                  <button type="button" onClick={() => setConfirmAction(null)}
                    className="flex-1 py-2 bg-slate-800 border border-slate-600 rounded text-sm text-gray-300 hover:bg-slate-700"
                  >{tStat('Cancel')}</button>
                  <button type="button" onClick={() => {
                    const action = confirmAction
                    setConfirmAction(null)
                    // กันซ้ำอีกชั้น เผื่อมีทางเปิดกล่องนี้ได้ทั้งที่พื้นหลังยังเปิดอยู่
                    if (bgOn) return
                    if (action === 'png') handleDownload()
                    else startExport()
                  }}
                    className="flex-1 py-2 bg-emerald-600 border border-emerald-500 rounded text-sm text-white font-medium hover:bg-emerald-500"
                  >{tStat('Confirm')}</button>
                </div>
              </div>
            </div>
          )}

          {/* Battle Stage Background Panel */}
          {showBgPanel && (
            <BgStagePicker
              value={bgStage}
              onPick={stage => { setBgStage(stage); setShowBgPanel(false) }}
              onClose={() => setShowBgPanel(false)}
            />
          )}

          {/* Video Export Panel Overlay */}
          {showVideoPanel && (
            <div className="absolute inset-0 z-20 flex items-center justify-center p-3 bg-black/80 rounded-b-2xl">
              <div className="card-glass w-full max-w-xs sm:max-w-sm rounded-xl p-4 flex flex-col gap-3 max-h-full overflow-y-auto">
                {vExporting ? (
                  /* ── Progress view ── */
                  <div className="flex flex-col items-center gap-3 py-2">
                    <p className="text-sm font-bold text-white">{tStat('Exporting')} {vFormat.toUpperCase()}...</p>
                    <div className="w-full bg-slate-700 rounded-full h-2.5">
                      <div className="bg-cyan-500 h-2.5 rounded-full transition-all duration-200" style={{ width: `${vProgress}%` }} />
                    </div>
                    <p className="text-xs text-gray-400 text-center">{vProgressMsg}</p>
                    <p className="text-xs font-mono text-cyan-400">{vProgress}%</p>
                    <button type="button" onClick={cancelExport}
                      className="px-5 py-2 bg-red-700 border border-red-600 rounded text-sm text-white hover:bg-red-600">
                      {tStat('Cancel')}
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Header */}
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-white">{tStat('Export Video')}</span>
                      <button type="button" onClick={closeVideoPanel}
                        className="text-gray-400 hover:text-white">
                        <span className="material-icons-round text-[18px]">close</span>
                      </button>
                    </div>

                    {/* Animation Sequence */}
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-gray-400 font-medium uppercase tracking-wide">{tStat('Animation Sequence')}</span>
                        <span className="text-[10px] text-gray-500 tabular-nums">{vAnimSeq.length}/{MAX_ANIM_SEQ}</span>
                      </div>
                      <div className="flex gap-1.5">
                        <select value={vAddAnimIdx} onChange={(e) => setVAddAnimIdx(parseInt(e.target.value, 10))}
                          style={{ colorScheme: 'dark' }}
                          className="flex-1 min-w-0 bg-slate-800 text-gray-100 border border-slate-700 rounded px-2 py-1.5 text-xs cursor-pointer hover:bg-slate-700 focus:outline-none focus:border-cyan-500"
                        >
                          {animOptions.map(opt => (
                            <option key={opt.idx} value={opt.idx} className="bg-slate-900 text-gray-100">{opt.name}</option>
                          ))}
                        </select>
                        <button type="button" disabled={vAnimSeq.length >= MAX_ANIM_SEQ} onClick={() => addSeqItem(vAddAnimIdx)}
                          className="px-3 py-1.5 bg-cyan-600 border border-cyan-500 rounded text-xs font-bold text-white hover:bg-cyan-500 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-cyan-600"
                        >+ {tStat('Add')}</button>
                      </div>
                      {vAnimSeq.length >= MAX_ANIM_SEQ && (
                        <p className="text-[10px] text-amber-400/80 text-center">{tStat('Maximum 10 animations reached')}</p>
                      )}
                      <div className="flex flex-col gap-1 max-h-[130px] overflow-y-auto pr-0.5">
                        {vAnimSeq.length === 0 && (
                          <p className="text-[10px] text-gray-500 text-center py-1">{tStat('No animations added — will export current animation')}</p>
                        )}
                        {vAnimSeq.map((item, i) => {
                          const itemTotal = (sam?.animations[sam?.animNames[item.animIdx] ?? ''] || []).length
                          const isFull = item.start === 0 && item.end === Math.max(0, itemTotal - 1)
                          return (
                          <div key={i}
                            draggable
                            onDragStart={(e) => {
                              dragSeqIdxRef.current = i
                              setDraggingSeqIdx(i)
                              e.dataTransfer.effectAllowed = 'move'
                              // ปิด ghost image เริ่มต้นของเบราว์เซอร์ — แทนด้วยภาพโปร่งใส 1x1
                              if (!emptyDragImgRef.current) {
                                const img = new Image()
                                img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7'
                                emptyDragImgRef.current = img
                              }
                              e.dataTransfer.setDragImage(emptyDragImgRef.current, 0, 0)
                            }}
                            onDragOver={(e) => {
                              e.preventDefault()
                              // ลากผ่านตำแหน่งไหน → สลับที่ทันที (เหมือนลากไอคอนย้ายหน้าจอมือถือ ตัวอื่นเบียดขยับให้เอง)
                              const from = dragSeqIdxRef.current
                              if (from === null || from === i) return
                              reorderSeqItem(from, i)
                              dragSeqIdxRef.current = i
                              setDraggingSeqIdx(i)
                            }}
                            onDrop={(e) => e.preventDefault()}
                            onDragEnd={() => { dragSeqIdxRef.current = null; setDraggingSeqIdx(null) }}
                            className={`flex items-center gap-1.5 bg-slate-800/80 border rounded px-2 py-1 cursor-grab active:cursor-grabbing select-none ${
                              draggingSeqIdx === i
                                ? 'border-cyan-400 shadow-[0_0_10px_2px_rgba(34,211,238,0.55)] bg-cyan-950/30'
                                : editingSeqIdx === i ? 'border-cyan-500' : 'border-slate-700'
                            }`}
                          >
                            {/* ไอคอนบอกใบ้เฉยๆ ว่าแถวนี้ลากได้ (ไม่ได้ผูก drag เอง — ทั้งแถวลากได้อยู่แล้ว กันปัญหาไอคอนหลุดออกมาแทน) */}
                            <span className="hidden sm:flex w-4 h-5 items-center justify-center text-gray-500 shrink-0 pointer-events-none">
                              <span className="material-icons-round text-[14px]">drag_indicator</span>
                            </span>
                            <span className="text-[10px] text-gray-500 tabular-nums w-4 text-center shrink-0">{i + 1}</span>
                            <span className="flex-1 min-w-0 text-xs text-gray-200 truncate">{sam?.animNames[item.animIdx]}</span>
                            {/* แก้ไขช่วงเฟรม — ปิดหน้า Export แล้วโหลด anim นี้เข้า preview + ใช้ scrub bar ด้านบนตัดต้น/ท้ายได้ */}
                            <button type="button" onClick={() => editSeqItem(i)}
                              aria-label={tStat('Edit frame range')}
                              className={`w-5 h-5 flex items-center justify-center shrink-0 ${editingSeqIdx === i ? 'text-cyan-300' : 'text-gray-400 hover:text-cyan-300'}`}
                            >
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                              </svg>
                            </button>
                            <span className="text-[9px] text-gray-500 tabular-nums shrink-0 w-11 text-right">
                              {isFull ? `(${tStat('Full')})` : `${item.start + 1}-${item.end + 1}F`}
                            </span>
                            <button type="button" disabled={i === 0} onClick={() => moveSeqItem(i, -1)}
                              className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-cyan-300 disabled:opacity-25 disabled:hover:text-gray-400 shrink-0"
                            ><span className="material-icons-round text-[14px]">keyboard_arrow_up</span></button>
                            <button type="button" disabled={i === vAnimSeq.length - 1} onClick={() => moveSeqItem(i, 1)}
                              className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-cyan-300 disabled:opacity-25 disabled:hover:text-gray-400 shrink-0"
                            ><span className="material-icons-round text-[14px]">keyboard_arrow_down</span></button>
                            <button type="button" onClick={() => removeSeqItem(i)}
                              className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-red-400 shrink-0"
                            ><span className="material-icons-round text-[14px]">close</span></button>
                          </div>
                          )
                        })}
                      </div>
                    </div>

                    {/* Format */}
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[11px] text-gray-400 font-medium uppercase tracking-wide">{tStat('Format')}</span>
                      <div className="flex gap-1.5">
                        {(['webp', 'gif', 'mp4'] as const).map(fmt => (
                          <button key={fmt} type="button"
                            onClick={() => { setVFormat(fmt); if (fmt === 'mp4' && vBg === null) setVBg('#000000') }}
                            className={`flex-1 py-2 border rounded text-xs font-bold uppercase tracking-wider ${vFormat === fmt ? 'bg-cyan-600 border-cyan-500 text-white' : 'bg-slate-800 border-slate-700 text-gray-300 hover:bg-slate-700'}`}
                          >{fmt}</button>
                        ))}
                      </div>
                      <p className="text-[10px] text-gray-500">
                        {vFormat === 'webp' && tStat('Chrome / Edge / Firefox — small file, supports transparency')}
                        {vFormat === 'gif' && tStat('All browsers — supports transparent background')}
                        {vFormat === 'mp4' && tStat('H.264 — requires Chrome 94+ / Edge 94+ (WebCodecs)')}
                      </p>
                    </div>

                    {/* Background */}
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[11px] text-gray-400 font-medium uppercase tracking-wide">{tStat('Background')}</span>
                      <div className="flex items-center flex-wrap gap-1.5">
                        {/* Transparent (GIF + WebM รองรับ alpha) */}
                        {vFormat !== 'mp4' && (
                          <button type="button" onClick={() => setVBg(null)}
                            className={`px-2 py-1.5 border rounded text-[11px] flex items-center gap-1 ${vBg === null ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300' : 'bg-slate-800 border-slate-700 text-gray-300 hover:bg-slate-700'}`}
                          >
                            <svg width="12" height="12" viewBox="0 0 12 12" className="shrink-0">
                              <rect x="0" y="0" width="6" height="6" fill="rgba(255,255,255,0.25)" />
                              <rect x="6" y="6" width="6" height="6" fill="rgba(255,255,255,0.25)" />
                              <rect x="6" y="0" width="6" height="6" fill="rgba(0,0,0,0.35)" />
                              <rect x="0" y="6" width="6" height="6" fill="rgba(0,0,0,0.35)" />
                            </svg>
                            {tStat('Transparent')}
                          </button>
                        )}
                        {/* Preset swatches */}
                        {BG_PRESETS.map(({ label, value }) => (
                          <button key={value} type="button" onClick={() => setVBg(value)}
                            aria-label={label}
                            className={`w-8 h-8 rounded-md border-2 transition-transform ${vBg === value ? 'border-cyan-400 scale-110' : 'border-slate-600 hover:border-slate-400'}`}
                            style={{ backgroundColor: value }}
                          />
                        ))}
                        {/* Custom color picker */}
                        <div className="relative" aria-label={tStat('Custom color')}>
                          <input
                            type="color"
                            value={isCustomBgActive ? vBg! : vCustomColor}
                            onChange={e => { setVCustomColor(e.target.value); setVBg(e.target.value) }}
                            className={`w-8 h-8 rounded-md border-2 cursor-pointer p-0.5 bg-transparent ${isCustomBgActive ? 'border-cyan-400' : 'border-slate-600 hover:border-slate-400'}`}
                          />
                        </div>
                      </div>
                      {/* Hex display */}
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-500">{tStat('Selected color')}:</span>
                        {vBg === null
                          ? <span className="text-[11px] text-cyan-400 font-mono">{tStat('Transparent')}</span>
                          : (
                            <div className="flex items-center gap-1.5">
                              <div className="w-4 h-4 rounded border border-white/20" style={{ backgroundColor: vBg }} />
                              <span className="text-[11px] text-gray-300 font-mono">{vBg}</span>
                            </div>
                          )
                        }
                      </div>
                    </div>

                    {/* Area */}
                    {selection && selection.w > 2 && (
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[11px] text-gray-400 font-medium uppercase tracking-wide">{tStat('Area')}</span>
                        <div className="flex gap-1.5">
                          <button type="button" onClick={() => setVUseSelection(false)}
                            className={`flex-1 py-1.5 border rounded text-xs ${!vUseSelection ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300' : 'bg-slate-800 border-slate-700 text-gray-300 hover:bg-slate-700'}`}
                          >{tStat('Full window')}</button>
                          <button type="button" onClick={() => setVUseSelection(true)}
                            className={`flex-1 py-1.5 border rounded text-[11px] ${vUseSelection ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300' : 'bg-slate-800 border-slate-700 text-gray-300 hover:bg-slate-700'}`}
                          >{tStat('Selected area')} ({Math.round(selection.w)}×{Math.round(selection.h)})</button>
                        </div>
                      </div>
                    )}

                    {/* Error */}
                    {vError && <p className="text-xs text-red-400 bg-red-900/20 border border-red-800/40 rounded p-2">{vError}</p>}

                    {/* Export button */}
                    <button type="button" onClick={() => setConfirmAction('video')}
                      className="w-full py-2.5 bg-emerald-600 border border-emerald-500 rounded text-sm font-bold text-white hover:bg-emerald-500 active:bg-emerald-700 flex items-center justify-center gap-2"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" /><polygon points="10 8 16 12 10 16 10 8" fill="currentColor" />
                      </svg>
                      Export {vFormat.toUpperCase()}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Canvas area */}
          <div className="flex-1 min-h-0 relative rounded-lg overflow-hidden bg-[#0e0e0e] border border-white/5">
            <canvas ref={canvasRef} className="w-full h-full block"
              style={{ cursor: panState?.active ? 'grabbing' : 'grab', touchAction: 'none' }}
              onMouseDown={selectMode ? undefined : onMouseDown}
              onMouseMove={selectMode ? undefined : onCanvasHover}
              onMouseLeave={() => { if (showLayersRef.current) setHoverRes(null) }}
              onTouchStart={selectMode ? undefined : onTouchStart}
              onTouchMove={selectMode ? undefined : onTouchMove}
              onTouchEnd={selectMode ? undefined : onTouchEnd}
            />
            <canvas ref={overlayRef} className="absolute inset-0 w-full h-full"
              style={{
                display: (selectMode || (selection && selection.w > 2 && selection.h > 2)) ? 'block' : 'none',
                cursor: 'crosshair',
                pointerEvents: (selectMode || (selection && selection.w > 2 && selection.h > 2)) ? 'auto' : 'none',
                touchAction: 'none',
              }}
              onPointerDown={onOverlayPointerDown}
              onPointerMove={onOverlayPointerMove}
              onPointerUp={onOverlayPointerUp}
              onPointerCancel={onOverlayPointerUp}
            />
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <span className="material-icons-round text-4xl text-cyan-400 animate-pulse">animation</span>
                <p className="text-gray-300 text-sm ml-3">Loading...</p>
              </div>
            )}
            {error && !loading && (
              <div className="absolute inset-0 flex items-center justify-center p-4">
                <p className="text-red-400 text-sm text-center">{error}</p>
              </div>
            )}

            {/* ── หน้าต่างลอย: ชิ้นส่วนของเฟรมที่กำลังเล่น (PC ลอย / มือถือชิดขอบล่าง) ──
                วาดผ่าน portal ไปที่ body ไม่ใช่ลูกของกรอบ canvas
                เพราะกรอบนั้นเป็น overflow-hidden หน้าต่างจึงถูกตัดทันทีที่ลากพ้นขอบ
                ออกมาอยู่ชั้นนอกสุดแล้วลากไปวางตรงไหนของจอก็ได้ รวมถึงนอกตัวเล่นอนิเมชั่น */}
            {showLayers && sam && !loading && !error && typeof document !== 'undefined' && createPortal((
              <div
                className="flex fixed z-[200] flex-col bg-slate-900/95 border border-slate-700 rounded-lg shadow-2xl backdrop-blur-sm overflow-hidden"
                style={layerDesktop
                  ? { left: layerPanelPos.x, top: layerPanelPos.y, width: LAYER_PANEL_W, maxHeight: 'min(70vh, 640px)' }
                  // จอเล็ก: เต็มความกว้าง ชิดขอบล่าง สูงไม่เกินราว 40% จอ — ตัวละครกลางจอยังเห็นอยู่
                  : { left: 8, right: 8, bottom: 8, maxHeight: '42svh' }}
              >
                {/* หัวหน้าต่าง = ที่จับลาก (ตัวละครมักอยู่กลางจอ หน้าต่างจึงต้องย้ายหลบได้) */}
                <div
                  className={`flex items-center gap-1.5 px-2.5 py-2 bg-slate-800/90 border-b border-slate-700 select-none ${layerDesktop ? 'cursor-move' : ''}`}
                  onPointerDown={layerDesktop ? onLayerPanelDragStart : undefined}
                >
                  <span className="material-icons-round text-[15px] text-cyan-400">layers</span>
                  <span className="text-[11px] font-semibold text-gray-200">{tStat('Layers')}</span>
                  <span className="text-[10px] text-gray-500 font-mono">f{frameIdxRef.current + 1}</span>
                  <div className="flex-1" />
                  {hiddenImages.size > 0 && (
                    <button type="button" onClick={() => setHiddenImages(new Set())}
                      className="px-1.5 py-0.5 rounded bg-amber-600/20 border border-amber-600/40 text-amber-300 text-[10px] hover:bg-amber-600/30"
                    >{tStat('Show all')}</button>
                  )}
                  <button type="button" onClick={() => setShowLayers(false)}
                    className="w-7 h-7 lg:w-5 lg:h-5 flex items-center justify-center rounded text-gray-400 hover:bg-slate-700 hover:text-gray-200"
                  ><span className="material-icons-round text-[18px] lg:text-[15px]">close</span></button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain" onMouseLeave={() => setHoverRes(null)}>
                  {layerRows.length === 0 && (
                    <p className="px-2.5 py-3 text-[11px] text-gray-500">{tStat('No pieces in this frame')}</p>
                  )}
                  {layerRows.map(row => {
                    const hidden = hiddenImages.has(row.resNum)
                    const active = hoverRes === row.resNum
                    return (
                      <div key={row.resNum}
                        onMouseEnter={() => setHoverRes(row.resNum)}
                        onClick={() => setHoverRes(row.resNum)}
                        className={`flex items-center gap-2 px-2 py-1 border-b border-slate-800 cursor-default ${
                          active ? 'bg-red-500/15' : 'hover:bg-slate-800/60'
                        } ${row.inFrame ? '' : 'opacity-55'}`}
                      >
                        <button type="button"
                          onClick={() => setHiddenImages(prev => {
                            const next = new Set(prev)
                            if (next.has(row.resNum)) next.delete(row.resNum); else next.add(row.resNum)
                            return next
                          })}
                          aria-label={hidden ? tStat('Show piece') : tStat('Hide piece')}
                          className={`w-8 h-8 lg:w-5 lg:h-5 shrink-0 flex items-center justify-center rounded ${
                            hidden ? 'text-amber-400 hover:bg-amber-500/20' : 'text-gray-400 hover:bg-slate-700 hover:text-gray-200'
                          }`}
                        ><span className="material-icons-round text-[18px] lg:text-[15px]">{hidden ? 'visibility_off' : 'visibility'}</span></button>
                        <LayerThumb sprite={sprites?.[row.name]} />
                        <div className="min-w-0 flex-1">
                          <div className={`text-[11px] font-mono leading-tight truncate ${hidden ? 'text-gray-500 line-through' : 'text-gray-200'}`}>
                            {row.size || `img ${row.resNum}`}
                            {/* ภาพเดียวกันถูกวาดหลายชิ้นในเฟรมนี้ — บอกไว้ก่อน กดปิดแล้วจะหายพร้อมกันทั้งหมด */}
                            {row.count > 1 && <span className="text-cyan-400"> ×{row.count}</span>}
                          </div>
                          {/* ชิ้นที่ปิดไว้แต่เฟรมนี้ไม่มีมัน — ต้องยังโชว์อยู่ ไม่งั้นเลื่อนเฟรมไปแล้วหาปุ่มเปิดคืนไม่เจอ */}
                          {!row.inFrame && (
                            <div className="text-[9px] text-amber-500/80 leading-tight">{tStat('hidden · not in this frame')}</div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="px-2.5 py-1.5 border-t border-slate-700 bg-slate-800/60 text-[9px] text-gray-500 leading-snug">
                  {tStat('Hidden pieces also apply to PNG and video export')}
                </div>
              </div>
            ), document.body)}
          </div>

          {/* Status bar + Scrub bar (แบบ YouTube — ลากเพื่อ seek, จุดมาร์คเขียว/แดง = ตัดช่วง Frame เริ่มต้น/สิ้นสุดสำหรับ export) */}
          {sam && !loading && !error && (
            <div className="flex flex-col gap-1 w-full max-w-3xl mx-auto">
              <div className="text-[10px] sm:text-[11px] text-gray-500 text-center font-mono leading-none">
                {sam.animNames[animIdx]} · f<span ref={frameLabelRef}>{frameIdxRef.current + 1}/{totalFrames}</span> · {fps}fps · {zoom.toFixed(2)}×
                {editingSeqIdx !== null && <span className="text-cyan-400"> · {tStat('Editing frame range')} #{editingSeqIdx + 1}</span>}
              </div>
              <div
                ref={scrubBarRef}
                className="relative h-4 flex items-center cursor-pointer select-none"
                style={{ touchAction: 'none' }}
                onPointerDown={(e) => onScrubPointerDown(e, 'seek')}
                onPointerMove={onScrubPointerMove}
                onPointerUp={onScrubPointerUp}
                onPointerCancel={onScrubPointerUp}
              >
                {/* track */}
                <div className="absolute left-0 right-0 h-1.5 bg-slate-700 rounded-full pointer-events-none" />
                {/* ช่วงที่เลือกไว้ (start→end) */}
                <div
                  className="absolute h-1.5 bg-cyan-500/50 rounded-full pointer-events-none"
                  style={{ left: `${scrubPct(currentTrim.start)}%`, width: `${Math.max(0, scrubPct(currentTrim.end) - scrubPct(currentTrim.start))}%` }}
                />
                {/* playhead */}
                <div
                  ref={playheadRef}
                  className="absolute w-2.5 h-2.5 bg-cyan-300 rounded-full shadow pointer-events-none"
                  style={{ left: `${scrubPct(frameIdxRef.current)}%`, transform: 'translateX(-50%)' }}
                />
                {/* จุดมาร์คเริ่มต้น */}
                <div
                  onPointerDown={(e) => onScrubPointerDown(e, 'start')}
                  className="absolute w-2 h-4 bg-emerald-400 rounded-sm border border-emerald-200 cursor-ew-resize"
                  style={{ left: `${scrubPct(currentTrim.start)}%`, transform: 'translateX(-50%)' }}
                />
                {/* จุดมาร์คสิ้นสุด */}
                <div
                  onPointerDown={(e) => onScrubPointerDown(e, 'end')}
                  className="absolute w-2 h-4 bg-red-400 rounded-sm border border-red-200 cursor-ew-resize"
                  style={{ left: `${scrubPct(currentTrim.end)}%`, transform: 'translateX(-50%)' }}
                />
                {/* ไกด์ป๊อปอัพ Start/End — โชว์เฉพาะตอนกำลังลากมาร์คนั้นอยู่ (แทน title tooltip เดิม) */}
                {scrubDragMode === 'start' && (
                  <div
                    className="absolute -top-7 -translate-x-1/2 px-2 py-1 bg-slate-900 border border-emerald-500/60 text-emerald-300 text-[10px] font-bold rounded shadow-lg whitespace-nowrap pointer-events-none z-20"
                    style={{ left: `${scrubPct(currentTrim.start)}%` }}
                  >
                    {tStat('Start')}: f{currentTrim.start + 1}
                  </div>
                )}
                {scrubDragMode === 'end' && (
                  <div
                    className="absolute -top-7 -translate-x-1/2 px-2 py-1 bg-slate-900 border border-red-500/60 text-red-300 text-[10px] font-bold rounded shadow-lg whitespace-nowrap pointer-events-none z-20"
                    style={{ left: `${scrubPct(currentTrim.end)}%` }}
                  >
                    {tStat('End')}: f{currentTrim.end + 1}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Controls ── */}
          {/* mx-auto max-w-3xl: คุมความกว้าง Controls ให้เท่าเดิม (ก่อนขยาย popup เป็น 6xl) — กว้างขึ้นเฉพาะ Canvas area */}
          {sam && !loading && (
            <div className="flex flex-col gap-1.5 w-full max-w-3xl mx-auto">

              {/* Row 1: Anim dropdown */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] sm:text-xs text-gray-400 shrink-0 hidden sm:inline">Anim:</span>
                <select value={animIdx} onChange={(e) => changeAnim(parseInt(e.target.value, 10))}
                  style={{ colorScheme: 'dark' }}
                  className="flex-1 bg-slate-800 text-gray-100 border border-slate-700 rounded px-2 py-1.5 text-xs cursor-pointer hover:bg-slate-700 focus:outline-none focus:border-cyan-500"
                >
                  {animOptions.map(opt => (
                    <option key={opt.idx} value={opt.idx} className="bg-slate-900 text-gray-100">{opt.name}</option>
                  ))}
                </select>
              </div>

              {/* Row 2: step back | play/pause | step forward | zoom -/+ */}
              <div className="flex items-center justify-center gap-1 sm:gap-1.5">
                <HoldStepButton onStep={() => stepFrame(-1)} className="flex-1 sm:flex-none h-9 sm:h-8 sm:px-3 bg-slate-800 border border-slate-700 rounded text-gray-200 hover:bg-slate-700 active:bg-slate-600 text-sm flex items-center justify-center">
                  <span className="material-icons-round text-[18px]">chevron_left</span>
                </HoldStepButton>
                <button type="button" onClick={() => setPlaying(p => !p)}
                  className="flex-[2] sm:flex-none sm:px-6 h-9 sm:h-8 bg-cyan-600 border border-cyan-500 rounded text-white hover:bg-cyan-500 font-bold text-base sm:text-sm flex items-center justify-center"
                ><span className="material-icons-round text-[20px]">{playing ? 'pause' : 'play_arrow'}</span></button>
                <HoldStepButton onStep={() => stepFrame(1)} className="flex-1 sm:flex-none h-9 sm:h-8 sm:px-3 bg-slate-800 border border-slate-700 rounded text-gray-200 hover:bg-slate-700 active:bg-slate-600 text-sm flex items-center justify-center">
                  <span className="material-icons-round text-[18px]">chevron_right</span>
                </HoldStepButton>
                <span className="text-gray-700 text-xs px-0.5">|</span>
                <button type="button" onClick={() => setZoom(z => Math.max(0.1, +(z - 0.25).toFixed(2)))}
                  className="flex-1 sm:flex-none h-9 sm:h-8 sm:w-8 flex items-center justify-center bg-slate-800 border border-slate-700 rounded text-gray-200 hover:bg-slate-700 text-base sm:text-sm"
                ><span className="material-icons-round text-[18px]">remove</span></button>
                <button type="button" onClick={() => setZoom(z => Math.min(8.0, +(z + 0.25).toFixed(2)))}
                  className="flex-1 sm:flex-none h-9 sm:h-8 sm:w-8 flex items-center justify-center bg-slate-800 border border-slate-700 rounded text-gray-200 hover:bg-slate-700 text-base sm:text-sm"
                ><span className="material-icons-round text-[18px]">add</span></button>
                {!plainSam && <span className="text-gray-700 text-xs px-0.5">|</span>}
                {!plainSam && (
                <button type="button" onClick={() => setShowBgPanel(true)}
                  aria-label={tStat('Background')}
                  className={`flex-1 sm:flex-none h-9 sm:h-8 sm:w-8 flex items-center justify-center border rounded text-base sm:text-sm ${
                    bgStage ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300' : 'bg-slate-800 border-slate-700 text-gray-200 hover:bg-slate-700'
                  }`}
                ><span className="material-icons-round text-[18px]">{bgLoading ? 'hourglass_empty' : 'wallpaper'}</span></button>
                )}
                {/* เส้นบอกระยะโจมตี — ต้องมีพื้นหลัง(กระสอบทราย)ก่อนถึงจะมีปลายทางให้วัด */}
                {!plainSam && (
                <button type="button" onClick={() => setShowRange(v => !v)}
                  disabled={!bgStage}
                  aria-label={tStat('ATK Range')}
                  className={`flex-1 sm:flex-none h-9 sm:h-8 sm:w-8 flex items-center justify-center border rounded text-base sm:text-sm ${
                    !bgStage ? 'opacity-40 cursor-not-allowed bg-slate-800 border-slate-700 text-gray-500' :
                    showRange ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300' : 'bg-slate-800 border-slate-700 text-gray-200 hover:bg-slate-700'
                  }`}
                ><span className="material-icons-round text-[18px]">visibility</span></button>
                )}
                {/* ── Layer panel — ทุกขนาดจอ (มือถือเปิดเป็นแผ่นชิดขอบล่าง ดูที่ตัวแถบ) ── */}
                <span className="text-gray-700 text-xs px-0.5">|</span>
                <button type="button" onClick={() => setShowLayers(v => !v)}
                  aria-label={tStat('Layers')}
                  className={`flex-1 sm:flex-none h-9 sm:h-8 sm:w-8 flex items-center justify-center border rounded text-base sm:text-sm relative ${
                    showLayers ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300' : 'bg-slate-800 border-slate-700 text-gray-200 hover:bg-slate-700'
                  }`}
                ><span className="material-icons-round text-[18px]">layers</span>
                  {/* จุดส้ม = ยังมีเลเยอร์ถูกปิดอยู่ กันลืมตอนปิดแถบไปแล้วแล้วงงว่าภาพหายไปไหน */}
                  {hiddenImages.size > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-[3px] rounded-full bg-amber-500 text-black text-[9px] font-bold leading-[14px]">{hiddenImages.size}</span>
                  )}
                </button>
              </div>

              {/* Row 3: Reset | Grid | เลือก/ล้าง | PNG | Video */}
              <div className="flex items-center gap-1 sm:gap-1.5">
                {/* Reset view */}
                <button type="button" onClick={resetView}
                  className="flex-1 h-8 sm:h-7 px-1 bg-slate-800 border border-slate-700 rounded text-[10px] sm:text-xs text-gray-200 hover:bg-slate-700 inline-flex items-center justify-center gap-1"
                ><span className="material-icons-round text-[13px]">restart_alt</span> {tStat('Reset')}</button>

                {/* Grid toggle */}
                <button type="button" onClick={() => setShowGrid(g => !g)}
                  className={`flex-1 h-8 sm:h-7 px-1 border rounded text-[10px] sm:text-xs inline-flex items-center justify-center gap-1 ${showGrid ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300' : 'bg-slate-800 border-slate-700 text-gray-200 hover:bg-slate-700'}`}
                ><span className="material-icons-round text-[13px]">grid_on</span> {tStat('Grid')}</button>


                {/* เลือก / ล้าง — toggle เดียว (ใช้ได้เฉพาะไฟล์หลัก เพราะเป็นขั้นตอนก่อนดาวน์โหลด PNG/Video) */}
                <button type="button"
                  onClick={() => (selectMode || selection) ? clearSelection() : enterSelectMode()}
                  className={`flex-1 h-8 sm:h-7 px-1 border rounded text-[10px] sm:text-xs inline-flex items-center justify-center gap-1 ${
                    (selectMode || selection)
                      ? 'bg-amber-600/20 border-amber-500 text-amber-300 hover:bg-amber-600/30'
                      : 'bg-slate-800 border-slate-700 text-gray-200 hover:bg-slate-700'
                  }`}
                >
                  {(selectMode || selection) ? (
                    <>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                      {tStat('Clear')}
                    </>
                  ) : (
                    <>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h2M6 3v2M18 3v2M21 6h-2M3 18h2M6 21v-2M18 21v-2M21 18h-2"/>
                        <rect x="6" y="6" width="12" height="12" strokeDasharray="3 2"/>
                      </svg>
                      {tStat('Select')}
                    </>
                  )}
                </button>

                {/* Download PNG — ปิดไว้ตอนเปิดพื้นหลัง (ดูหมายเหตุที่ bgOn) */}
                <button type="button" disabled={bgOn} onClick={() => setConfirmAction('png')}
                  className="flex-1 h-8 sm:h-7 px-1 border rounded text-[10px] sm:text-xs inline-flex items-center justify-center gap-1 bg-emerald-700 border-emerald-600 text-white hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-emerald-700"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  PNG
                </button>

                {/* Export Video — ปิดไว้ตอนเปิดพื้นหลังเช่นกัน */}
                <button type="button" disabled={bgOn} onClick={() => {
                    // ลำดับที่ตั้งไว้แล้วให้อยู่เหมือนเดิม (ไม่ทับ) — seed แค่ตอนว่าง (เปิดครั้งแรก/ยังไม่เคยเพิ่มอะไร)
                    if (vAnimSeq.length === 0) setVAnimSeq([{ animIdx, start: soloStart, end: soloEnd }])
                    setVAddAnimIdx(animIdx); setShowVideoPanel(true); setVError(''); setEditingSeqIdx(null)
                  }}
                  className="flex-1 h-8 sm:h-7 px-1 border rounded text-[10px] sm:text-xs inline-flex items-center justify-center gap-1 bg-emerald-700 border-emerald-600 text-white hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-emerald-700"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                  </svg>
                  Video
                </button>
              </div>


            </div>
          )}
        </div>
      </div>
  )

  // กรอบนอกต้องเป็น element ตัวเดียวกันทุกโหมด (สลับแค่ className) — ถ้าสลับเต็มจอแล้วเปลี่ยนโครงกรอบ
  // React จะสร้าง canvas ใหม่ทั้งก้อน แต่ ResizeObserver / ตัวฟังล้อเมาส์ยังผูกอยู่กับ canvas ตัวเก่า
  // → ภาพแตก ซูมด้วยล้อเมาส์ไม่ได้ จนกว่าจะ F5 (เคยเป็นกับตัวเล่นที่ฝังในหน้า /res)
  return (
    <div
      className={
        maximized ? 'fixed inset-0 z-[60] bg-[#0d1220]'
          : embedded ? ''
          : 'fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/85'
      }
      onClick={(e) => { if (!embedded && !maximized && e.target === e.currentTarget) onClose() }}
    >
      {card}
    </div>
  )
}
