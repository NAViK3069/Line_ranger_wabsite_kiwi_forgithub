// ====================================================
// API: GET /api/ranger/projectile/[id]
// คืนข้อมูลท่าโจมตี (กระสุน / จุดปล่อย / มุม / ความเร็ว / จังหวะโดน / เสียง) ของ unit เดียว
// • จากข้อมูลเกมของเรา (src/lib/gameData.ts → gameProjectileUnit — คอลัมน์ในตาราง unit ตรงๆ)
//   เดิมใช้ projectile_data.json ของ warmycat — ตรวจแล้วทุกฟิลด์ตรงกันทั้ง 3,158 ตัว
//   ยกเว้น motion ที่ warmycat สรุปเอง (ตอนนี้สรุปตามกฎของเกม) และ skill2.skillCode ของตัวที่สกิลที่สองอยู่ช่อง skillCode3
// • cache ทั้งฝั่ง CDN (ข้อมูลนิ่ง เปลี่ยนตอนเกมออกตัวใหม่เท่านั้น)
//
// พิกัดใน start/end เป็น "game unit" ซึ่งวัดจาก anchor ของ unit —
// ตรงกับ world coordinate ของไฟล์ .sam แบบ 1:1 (origin เดียวกัน)
// ใช้จัดตำแหน่ง/ตรวจแนวอนิเมชั่นได้ตรงๆ
// ====================================================

import { NextResponse } from 'next/server'
import { gameProjectileUnit } from '@/lib/gameData'

const ID_RE = /^[a-z0-9][a-z0-9_-]+$/i

interface ProjectilePoint { x: number; y: number }
// motion.type คือตัวบอกจริงๆ ว่ากระสุนพุ่งตรง (LINEAR) หรือปาโค้ง (CURVE) — angle แค่บอกมุมเริ่ม/จบเฉยๆ
// motion.rotation: "FIXED" = ไม่หมุนสไปรต์เพิ่ม, "ANGLE_LERP" = หมุนไล่จาก angle.start → angle.end
// motion.enabled: false = ไม่มีการพุ่งจริง (เช่น melee) — ใช้แทนการเดา moveSpeed<=0
interface ProjectileMotion {
  type: 'LINEAR' | 'CURVE' | string
  enabled: boolean
  rotation: 'FIXED' | 'ANGLE_LERP' | string
  loopNormal: boolean
}
interface ProjectileMove {
  animationPart?: string   // ชื่อไฟล์กระสุนที่ใช้จริง (เช่น "bul", "bul2") — มาจาก API ตรงๆ ไม่ต้องเดาจาก normal/skill1/skill2
  attackType: string | null
  target: string | null
  start: ProjectilePoint
  end: ProjectilePoint
  angle: { start: number; end: number }
  moveSpeed: number
  attackScope?: number
  attackRange?: number
  motion?: ProjectileMotion
}
// render.shadowCenter/faceCenter เป็นสัดส่วน 0..1 ของ bounding box ตัวละคร
// x: 0=ซ้ายสุด 1=ขวาสุด, y: 0=ล่างสุด(พื้น/anchor) 1=บนสุด(หัว)
interface ProjectileRender {
  flightYn?: number
  sizeRatio?: number
  shadowCenter?: ProjectilePoint
  faceCenter?: ProjectilePoint
}
// attackDelay = จำนวนเฟรม (นับจากเริ่ม anim โจมตี รวม ready) ก่อนจะปล่อยกระสุนจริง — ค่าเดียวใช้ร่วมกันทุกประเภทโจมตี
interface ProjectileHitTiming {
  attackDelay?: number
  normalHitPointRate?: number
  skill1HitPointRate?: number
  skill2HitPointRate?: number
}
interface ProjectileUnit {
  unitName: string
  resourceCode: string
  render?: ProjectileRender
  hitTiming?: ProjectileHitTiming
  normal?: ProjectileMove
  skill1?: ProjectileMove
  skill2?: ProjectileMove
  sounds?: Partial<Record<SoundKind, SoundSet>>
}

// ── เสียงของแต่ละท่า ──
// ข้อมูลเกมให้มาแค่ "ชื่อ" (เช่น attrd_u1640xi) แต่ไฟล์จริงบน lerico มีเวลาต่อท้าย
// (attrd_u1640xi_20260928130004344.ogg) จึงต้องเปิดสารบัญโฟลเดอร์มาจับคู่ชื่อ → ไฟล์
//   preparation = ตอนเริ่มร่าย (ช่วง Cast Time)
//   attack      = ตอนปล่อยท่า (เริ่มช่วง Recovery)
//   underAttack = ตอนการโจมตีลงเป้า
type SoundSet = { preparation?: string; attack?: string; underAttack?: string }
type SoundKind = 'normal' | 'skill1' | 'skill2'
type SoundUrls = Record<SoundKind, { preparation: string | null; attack: string | null; underAttack: string | null }>
const SOUND_DIR = 'https://rangers.lerico.net/res/_raw/sounds/'

// สารบัญไฟล์เสียง (~2,600 ไฟล์ / HTML ~385KB) → map ชื่อ → ชื่อไฟล์
// ทำฝั่งเซิร์ฟเวอร์ครั้งเดียว ไม่ให้เบราว์เซอร์โหลดสารบัญเอง เบราว์เซอร์ได้แค่ URL 9 ตัวที่ใช้จริง
// ชื่อเดียวกันอาจมีหลายเวอร์ชัน (วัดแล้ว 47 ชื่อ เช่น ambi_main มี 5 ไฟล์) → เลือกเวลาล่าสุด
let soundIndex: Promise<Map<string, string>> | null = null
function loadSoundIndex() {
  if (!soundIndex) {
    soundIndex = fetch(SOUND_DIR, { next: { revalidate: 604800 } })
      .then(r => { if (!r.ok) throw new Error(`sounds ${r.status}`); return r.text() })
      .then(html => {
        const latest = new Map<string, { ts: string; file: string }>()
        for (const m of html.matchAll(/href="(([^"/]+)_(\d{17})\.ogg)"/g)) {
          const [, file, name, ts] = m
          const cur = latest.get(name)
          if (!cur || ts > cur.ts) latest.set(name, { ts, file })
        }
        return new Map([...latest].map(([name, v]) => [name, v.file]))
      })
      .catch(err => { soundIndex = null; throw err })
  }
  return soundIndex
}


export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params
  const id = raw.toLowerCase().trim()
  if (!ID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  try {
    const index = await loadSoundIndex().catch(() => null)
    const unit = gameProjectileUnit(id) as ProjectileUnit | null
    let soundUrls: SoundUrls | null = null
    if (unit?.sounds && index) {
      const pick = (name?: string) => {
        const file = name ? index.get(name) : undefined
        return file ? SOUND_DIR + file : null
      }
      const out = {} as SoundUrls
      for (const kind of ['normal', 'skill1', 'skill2'] as const) {
        const set = unit.sounds[kind] ?? {}
        out[kind] = {
          preparation: pick(set.preparation),
          attack: pick(set.attack),
          underAttack: pick(set.underAttack),
        }
      }
      soundUrls = out
    }
    return NextResponse.json({ id, unit, soundUrls }, {
      headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800' },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'unknown' },
      { status: 502 },
    )
  }
}
