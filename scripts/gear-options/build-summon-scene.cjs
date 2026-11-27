// วิดีโอ ค่าใช้จ่ายการผลิตแร่ (mineral-cost) / ระยะเวลาที่สร้างเรนเจอร์ใหม่ (regen-time)
//   ฉาก: สนาม battle24 · กดเรียก Rock Legend Brown → ตัวใหม่โผล่ฝั่งซ้ายแล้วเดินออกขวา (ความเร็วเดินของเกม movingSpeed 95 pt/วิ = 190 px/วิ)
//   ช่วง A (ไม่ใส่เกียร์) / ช่วง B (ใส่เกียร์) · จังหวะกดเรียกต้องตรงกับ SPAWNS ใน src/app/gear-options/tutorials/summon.tsx
//   กฎของเกม:
//     แร่ (SUMMON_ENGY_MUL 0x14 — 0x111da60 คูณกัน + 0xd5e054): ค่าแร่ = max(ขั้นต่ำ, ตัดเศษ(ค่าแร่ × Π(1 − |ค่าเกียร์|)))
//     เวลาเกิดใหม่ (PRD_SPE_MUL 0x15 — 0x1124f0c + UI 0x132f114): T' = T × (1 + r × (1 − X)) · แสดง max(1.3, T' × (1 − X))
//       X = productionSpeedDecreaseRate ของ unit_level_expansion (ชนิดวิวัฒน์ · จำนวนขั้นเกินเลเวลตัน) — Lv.180 ตัวนี้ = 0.5
// Run: node scripts/gear-options/build-summon-scene.cjs <mineral-cost|regen-time> scripts/gear-options/atk-base.anme.json public/gear-options/scenes/<mode>.anme.json
const fs = require('fs')
const MODE = process.argv[2]
if (!['mineral-cost', 'regen-time'].includes(MODE)) throw new Error('mode: mineral-cost | regen-time')
const [inPath, outPath] = process.argv.slice(3)

const RANGER = { id: 'u1260e-brown', name: 'Brown ตำนานร็อค' }
const MOVE_PX = 95 * 2            // movingSpeed (pt/วิ) × 2 px/pt
const START_X = 130, OUT_X = 1500, LANE_Y = 560
// ── เวลา (ตรงกับ summon.tsx) ──
const PHASE_A = 19.5, PHASE_B = 34.5, EQUIP_AT = 32.0, SUMMARY = 48.0, END = 55
const REGEN_BEFORE = 4.0                       // 8 × (1 − 0.5)
const REGEN_AFTER = Math.fround(Math.fround(8 + Math.fround(-1.134 * 8 * 0.5)) * 0.5)   // 1.732
const SPAWNS = MODE === 'regen-time'
  ? [...[0, 1, 2].map(k => PHASE_A + k * REGEN_BEFORE), ...[0, 1, 2, 3, 4, 5, 6].map(k => PHASE_B + k * REGEN_AFTER)]
  : [PHASE_A, ...[0, 1, 2, 3].map(k => PHASE_B + k * REGEN_BEFORE)]   // แร่ 3,000: ก่อน 1 ตัว · หลัง 4 ตัว (ทุก 4 วิ)

const clone = o => JSON.parse(JSON.stringify(o))
const src = JSON.parse(fs.readFileSync(inPath, 'utf8'))
const tpl = src.actors.find(a => a.tag === 'ally')
const asset = { ...clone(src.assets.find(a => a.id === tpl.assetId)), id: `r_${RANGER.id}`, rangerId: RANGER.id, name: RANGER.name }
const walkDur = (OUT_X - START_X) / MOVE_PX
const actors = SPAWNS.map((_, i) => ({ ...clone(tpl), id: `summon_${i}`, name: `${RANGER.name} #${i + 1}`, assetId: asset.id, tag: `ally_${i}`, x: START_X, y: LANE_Y + (i % 3) * 14, flip: false }))
const cues = []
SPAWNS.forEach((at, i) => {
  cues.push(
    { id: `show_${i}`, type: 'show', actorId: `summon_${i}`, start: +at.toFixed(3), duration: +(walkDur + 0.2).toFixed(3), fadeIn: 0.25, fadeOut: 0.1 },
    { id: `walk_${i}`, type: 'move', actorId: `summon_${i}`, start: +(at + 0.35).toFixed(3), to: { x: OUT_X, y: LANE_Y + (i % 3) * 14 }, duration: +walkDur.toFixed(3), ease: 'linear', clip: 'walk' },
  )
})
const W = src.width ?? 1280, H = src.height ?? 720
const clampTo = (v, half, size) => Math.min(Math.max(v, half), size - half)
const cam = (id, start, x, y, zoom, duration, ease = 'easeInOut') => ({ id, type: 'camera', actorId: '__camera', start, center: { x: clampTo(x, W / 2 / zoom, W), y: clampTo(y, H / 2 / zoom, H) }, zoom, duration, ease })
cues.push(cam('cam0', 0, 640, 380, 1.05, 0), cam('cam_outro', SUMMARY, 640, 380, 1.1, END - SUMMARY, 'linear'))
// ── เสียง ──
const sound = (id, name, file) => ({ id, type: 'audio', name, url: `/api/res/_raw/sounds/${file}` })
const sounds = [
  sound('snd_bgm', 'bgm_lobby2', 'bgm_lobby2_20151123104811121.ogg'),
  sound('snd_equip', 'gear_equip', 'gear_equip_20151123104728600.ogg'),
]
const sfx = (id, assetId, start, volume = 1, extra = {}) => ({ id, type: 'sound', actorId: '__audio', start, assetId, volume, offset: 0, duration: 0, fadeIn: 0, fadeOut: 0, ...extra })
cues.push(sfx('bgm', 'snd_bgm', 0, 1, { duration: END, fadeIn: 1, fadeOut: 2 }), sfx('sfx_equip', 'snd_equip', EQUIP_AT))
const scene = { ...clone(src), name: MODE === 'regen-time' ? 'Ranger Regeneration Time — Rock Legend Brown' : 'Mineral Production cost — Rock Legend Brown', duration: END, depthSort: true, actors, assets: [asset, ...sounds], cues }
fs.writeFileSync(outPath, JSON.stringify(scene, null, 1) + '\n')
console.log('wrote', outPath, 'spawns', SPAWNS.map(x => x.toFixed(2)).join(' '), 'regenAfter', REGEN_AFTER)
