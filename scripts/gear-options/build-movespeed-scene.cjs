// ====================================================
// วิดีโอ Move Speed: Wooden Box Cony 2 ตัวแข่งเดินบนตู้รถไฟอวกาศ (บน = ไม่ใส่เกียร์ · ล่าง = ชุด Move Speed +192) จาก START ถึง FINISH
// overlay: src/app/gear-options/tutorials/move-speed.tsx (ค่าคงที่ RACE / LANES / START_X / FINISH_X ต้องตรงกัน)
// Run: node scripts/gear-options/build-movespeed-scene.cjs scripts/gear-options/atk-base.anme.json public/gear-options/scenes/move-speed.anme.json
//
// กฎของเกม (ถอดจาก libgame.so):
//   ใส่เกียร์ (fn 0xd5d490): movingSpeed ใหม่ = movingSpeed + ตัดเศษ(movingSpeed × Σ SPE_MUL + Σ SPE_ADD)
//     ไม่มีเกียร์ไหนมี SPE_MUL → ในทางปฏิบัติ = movingSpeed + Σ Move Speed (บวกตรง ไม่ใช่ %)
//     Basic ทุกชิ้นบวกกัน (ค่า × 6 ที่ +5) · Switchable ตรงเงื่อนไขนับตัวสูงสุดตัวเดียว (+15)
//   ในสนาม (fn 0xc994c8): เดินด้วย CCMoveBy = movingSpeed × (บัฟเดิน · ปกติ 1) หน่วยระยะ/วินาที (โดนช้า ×0.2) — ไม่มีเพดาน
//   1 หน่วยระยะ (pt) = 2 พิกเซลของไฟล์ .sam = 2 พิกเซลเวทีที่ scale 1 (หน่วยเดียวกับ attackRange)
//   Wooden Box Cony (u1110e-cony): movingSpeed 34 (เรนเจอร์ที่ผู้เล่นใช้ได้ที่เดินช้าสุดในเกม) · ชุด +5 = Tessaiga +60 · Kick-boost shoes +60 · Sea Necklace +72 = +192 → 226
// ====================================================
const { ALLY } = require('./scene-lib.cjs')

const RANGER = { id: 'u1110e-cony', name: 'Wooden Box Cony' }
const BASE_SPEED = 34          // unit.movingSpeed
const GEAR_ADD = 60 + 60 + 72  // Move Speed รวมของชุด (Basic ล้วน)
const PX_PER_PT = 2
const DIST_PT = 350            // ระยะแข่ง (หน่วยระยะ)

// ── แผนที่ตู้รถไฟ (ตรงกับ src/app/gear-options/tutorials/spaceTrain.ts) ──
const MAP_SCALE = 720 / 640
const LANE_FEET = [319, 430]   // กลางพื้นเลนพอดี (เลนบน 270–368 · เลนล่าง 380–480)
const START_X = 250
const FINISH_X = START_X + DIST_PT * PX_PER_PT   // 950

// ── เวลา (ต้องตรงกับ TL ใน move-speed.tsx) ──
const COUNT_AT = 21.0                 // เสียงนับถอยหลัง arena_startcount (3 · 2 · 1 · เริ่ม = +0.1 / +0.8 / +1.25 / +1.9 วิ)
const GO = +(COUNT_AT + 1.9).toFixed(2)
const LANES = [
  { id: 'base', actor: 'cony_base', y: Math.round(LANE_FEET[0] * MAP_SCALE), speed: BASE_SPEED },
  { id: 'gear', actor: 'cony_gear', y: Math.round(LANE_FEET[1] * MAP_SCALE), speed: BASE_SPEED + GEAR_ADD },
]
const walkTime = L => DIST_PT / L.speed
const RACE_END = +(GO + walkTime(LANES[0]) + 1.2).toFixed(2)
const END = +(RACE_END + 9.6).toFixed(2)
// หน้าเว็บเล่นช่วงเดินทั้งหมดที่ความเร็วเกม x2 (GAME_SPEED ใน move-speed.tsx) แต่เสียงเล่นความเร็วปกติ
const FAST_AFTER = 0, FAST_RATE = 2
const REAL_END = +(END - (walkTime(LANES[0]) - FAST_AFTER) * (1 - 1 / FAST_RATE)).toFixed(2)

const clone = o => JSON.parse(JSON.stringify(o))

function buildScene(src) {
  const allyTpl = src.actors.find(a => a.id === ALLY)
  if (!allyTpl) throw new Error('base scene missing ally actor')
  const W = src.width ?? 1280, H = src.height ?? 720

  // ── asset ของเรนเจอร์: ทำสำเนา asset เรนเจอร์ของฉากต้นฉบับแล้วเปลี่ยนตัว (ตัวเล่นโหลดไฟล์ตาม rangerId) ──
  const allyAsset = src.assets.find(a => a.id === allyTpl.assetId)
  const asset = { ...clone(allyAsset), id: `r_${RANGER.id}`, rangerId: RANGER.id, name: RANGER.name }
  const assets = [asset]

  // ── ตัวแสดง: Cony 2 ตัว (เลนบนวาดก่อน) ยืนที่ START หันขวา ──
  const actors = LANES.map(L => ({ ...clone(allyTpl), id: L.actor, name: `${RANGER.name} (${L.id})`, assetId: asset.id, tag: `ally_${L.id}`, x: START_X, y: L.y, flip: false }))

  // ── เดิน: ความเร็วคงที่ (linear) จาก START ถึง FINISH · เล่นท่า walk ระหว่างเดิน แล้วกลับท่ายืน ──
  const cues = LANES.map(L => ({
    id: `walk_${L.id}`, type: 'move', actorId: L.actor, start: GO, to: { x: FINISH_X, y: L.y },
    duration: +walkTime(L).toFixed(4), ease: 'linear', clip: 'walk',
  }))

  // ── กล้อง ──
  const clampTo = (v, half, size) => Math.min(Math.max(v, half), size - half)
  const cam = (id, start, x, y, zoom, duration, ease = 'easeInOut') => ({
    id, type: 'camera', actorId: '__camera', start,
    center: { x: clampTo(x, W / 2 / zoom, W), y: clampTo(y, H / 2 / zoom, H) }, zoom, duration, ease,
  })
  const midX = (START_X + FINISH_X) / 2
  const midY = (LANES[0].y + LANES[1].y) / 2
  const WIDE = [midX, midY - 130, 1.22]
  const RACE_VIEW = [midX, midY - 115, 1.24]
  cues.push(
    cam('cam_wide0', 0, ...WIDE, 0),
    cam('cam_ranger', 7.6, START_X + 240, midY - 80, 1.45, 0.9),   // การ์ดเรนเจอร์อยู่ขวา → ตัวละครชิดซ้าย
    cam('cam_wide1', 12.2, ...WIDE, 0.8),
    cam('cam_equip', 18.0, START_X + 260, LANES[1].y - 110, 1.4, 0.7),
    cam('cam_race', COUNT_AT - 0.6, ...RACE_VIEW, 0.7),
    cam('cam_outro', RACE_END + 0.4, midX, midY - 115, 1.34, END - RACE_END - 0.4, 'linear'),
  )

  // ── แสงตอนใส่เกียร์หลังตัวล่าง (icon_ab_light_eff2_b) ──
  const EQUIP_AT = 19.4
  const LIGHT_SCALE = 2.2, LIGHT_SPEED = 0.8, LIGHT_DUR = 23 / 30 / LIGHT_SPEED
  assets.push({
    id: 'fx_light_b', type: 'ranger', source: 'upload', name: 'icon_ab_light_eff2_b', body: 'body',
    sets: { body: { sam: '/api/res/icon_ab_light_eff2/icon_ab_light_eff2_b.sam', plist: '/api/res/icon_ab_light_eff2/icon_ab_light_eff2_b.plist', png: '/api/res/icon_ab_light_eff2/icon_ab_light_eff2_b.png' } },
  })
  actors.unshift({
    ...clone(allyTpl), id: 'a_light_b', name: 'fx_light_b', assetId: 'fx_light_b', tag: 'prop',
    x: START_X, y: LANES[1].y + (785 - 560) * LIGHT_SCALE / 3.2, flip: false, idleClip: 'start', loop: false, muted: true, scale: LIGHT_SCALE,
  })
  cues.push(
    { id: 'light_once', type: 'anim', actorId: 'a_light_b', start: EQUIP_AT, clip: 'start', speed: LIGHT_SPEED, loop: false, hold: true, duration: LIGHT_DUR },
    { id: 'show_light_b', type: 'show', actorId: 'a_light_b', start: EQUIP_AT, duration: LIGHT_DUR, fadeIn: 0.05, fadeOut: 0.2 },
  )

  // ── เสียง: เพลงในเกมของด่านรถไฟอวกาศ · ใส่เกียร์ · ไอเทมเร่งความเร็ว · นับถอยหลัง · เข้าเส้นชัย ──
  const sound = (id, name, file) => ({ id, type: 'audio', name, url: `/api/res/_raw/sounds/${file}` })
  assets.push(
    sound('snd_bgm', 'BGM_SpaceTrain_InGame', 'BGM_SpaceTrain_InGame_20250214105927567.ogg'),
    sound('snd_equip', 'gear_equip', 'gear_equip_20151123104728600.ogg'),
    sound('snd_speedup', 'SpaceTrain_item_speedup', 'SpaceTrain_item_speedup_20250214105924266.ogg'),
    sound('snd_count', 'arena_startcount', 'arena_startcount_20151015111953983.ogg'),
    sound('snd_finish', 'SpaceTrain_buff1', 'SpaceTrain_buff1_20250214105925948.ogg'),
  )
  const sfx = (id, assetId, start, volume = 1, extra = {}) =>
    ({ id, type: 'sound', actorId: '__audio', start, assetId, volume, offset: 0, duration: 0, fadeIn: 0, fadeOut: 0, ...extra })
  cues.push(
    sfx('bgm', 'snd_bgm', 0, 1, { duration: REAL_END, fadeIn: 1, fadeOut: 2 }),   // ยาวเท่าเวลาจริงของวิดีโอ (ช่วงเร่งสั้นลง)
    sfx('sfx_equip', 'snd_equip', EQUIP_AT),
    sfx('sfx_speedup', 'snd_speedup', EQUIP_AT + 0.15, 0.8),
    sfx('sfx_count', 'snd_count', COUNT_AT),
    ...LANES.map(L => sfx(`sfx_finish_${L.id}`, 'snd_finish', +(GO + walkTime(L)).toFixed(4), 0.8)),
  )

  return { ...clone(src), name: 'Move Speed — Wooden Box Cony', duration: END, depthSort: false, background: { ...clone(src.background), kind: 'color', color: '#0a0d1c' }, actors, assets, cues }
}

const fs = require('fs')
const [inPath, outPath] = process.argv.slice(2)
if (!inPath || !outPath) throw new Error('usage: node build-movespeed-scene.cjs <base.anme.json> <out.anme.json>')
const scene = buildScene(JSON.parse(fs.readFileSync(inPath, 'utf8')))
fs.writeFileSync(outPath, JSON.stringify(scene, null, 1) + '\n')
console.log('wrote', outPath, scene.cues.length, 'cues · GO', GO, '· RACE_END', RACE_END, '· END', END, '(real', REAL_END + ')', '·',
  LANES.map(L => `${L.id}: speed ${L.speed} → ${walkTime(L).toFixed(3)}s`).join(' | '))
