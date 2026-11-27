// ====================================================
// วิดีโอ ค่าใช้จ่ายการผลิตแร่ (mineral-cost) / ระยะเวลาที่สร้างเรนเจอร์ใหม่ (regen-time)
//   ตู้รถไฟอวกาศ 2 เลน (แบบ atk-speed): บน = ไม่ใส่เกียร์ · ล่าง = ใส่เกียร์ · แต่ละเลนมีป้อม twr09 = ป้อมพื้นฐาน (ไม่มีสกิน) ของ HQ ระดับอัลตร้ามาสเตอร์
//     (0xcc525c เลือกป้อมพื้นฐานตามเลเวล HQ: 1–10 twr01 · 11–20 twr02 · 21–40 twr03 · 41–60 twr04 · 61–80 twr05 · 81–98 twr06 · 99–197 twr07 · 198–296 twr08 · 297–396 twr09)
//   แข่งกดเรียก Rock Legend Brown 16 วินาที (หน้าเว็บเล่น ×2) — กดทันทีที่ปุ่มพร้อม (แร่พอเสมอ) → ตัวใหม่โผล่หน้าป้อมแล้วเดินออกขวา
//     regen-time: บนทุก 4 วิ · ล่างทุก 1.732 วิ → นับจำนวนตัวที่ปล่อย
//     mineral-cost: เวลาเกิดใหม่เท่ากัน (4 วิ) → ปล่อยเท่ากัน แต่นับแร่ที่ใช้ (บนตัวละ 1,800 · ล่างตัวละค่าแร่หลังลด)
//   กฎของเกม:
//     แร่ (SUMMON_ENGY_MUL 0x14 — 0x111da60 คูณกัน + 0xd5e054): ค่าแร่ = max(1, ตัดเศษ(ค่าแร่ × Π(1 − |ค่าเกียร์|)))
//     เวลาเกิดใหม่ (PRD_SPE_MUL 0x15 — 0x1124f0c + UI 0x132f114): T' = T × (1 + r × (1 − X)) · ใช้จริง max(1.3, T' × (1 − X))
//       X = productionSpeedDecreaseRate ของ unit_level_expansion — Lv.180 (ลิมิตเบรก 4 ขั้น) = 0.5
//     ปุ่มนับเวลารอ +0x170 ตั้งเป็น 0 ตอนกดเรียก (0xc87dd8) · พร้อมเมื่อ ≥ productionTime (0xc87ecc)
//     เดิน movingSpeed 95 pt/วิ = 190 px/วิ · เสียงกด click_summon (ตั้งที่ปุ่ม 0xc86a40)
// overlay: src/app/gear-options/tutorials/summon.tsx (TL / LANES / ค่าคงที่ต้องตรงกัน)
// Run: node scripts/gear-options/build-summon-scene.cjs <mineral-cost|regen-time> scripts/gear-options/atk-base.anme.json public/gear-options/scenes/<mode>.anme.json
// ====================================================
const fs = require('fs')
const MODE = process.argv[2]
if (!['mineral-cost', 'regen-time'].includes(MODE)) throw new Error('mode: mineral-cost | regen-time')
const [inPath, outPath] = process.argv.slice(3)
const f32 = Math.fround

const RANGER = { id: 'u1260e-brown', name: 'Brown ตำนานร็อค' }
const MOVE_PX = 95 * 2
// ── เวลา (ตรงกับ TL ใน summon.tsx) ──
const RACE = { start: 21, end: 37 }
const EQUIP_AT = 19.4, END = 46
// ── เวลาเกิดใหม่ (ตรงกับ loadData ใน summon.tsx — ค่าเกียร์รวม regen −113.4% จาก 3 ชิ้น) ──
const PROD = 8, X_RATE = 0.5
const REGEN_BASE = Math.max(1.3, f32(PROD * (1 - X_RATE)))                                   // 4
const REGEN_GEAR = Math.max(1.3, f32(f32(PROD + f32(f32(-1.134 * PROD) * (1 - X_RATE))) * (1 - X_RATE)))   // 1.732
const REGEN = MODE === 'regen-time' ? [REGEN_BASE, REGEN_GEAR] : [REGEN_BASE, REGEN_BASE]

// ── แผนที่ตู้รถไฟ (ตรงกับ spaceTrain.ts): เท้าเลนบน/ล่าง ──
const MAP_SCALE = 720 / 640
const LANE_Y = [322, 454].map(v => Math.round(v * MAP_SCALE))   // 362 · 511
const TOWER_X = 110, TOWER_SCALE = 1
const SPAWN_X = 236, OUT_X = 1420

/** จังหวะกดเรียก: เริ่มพร้อมกดที่ RACE.start แล้วกดทุกครั้งที่ปุ่มพร้อม */
const spawnsOf = regen => { const out = []; for (let k = 0; ; k++) { const t = RACE.start + k * regen; if (t >= RACE.end - 1e-6) break; out.push(+t.toFixed(4)) } return out }
const SPAWNS = REGEN.map(spawnsOf)

const clone = o => JSON.parse(JSON.stringify(o))
const src = JSON.parse(fs.readFileSync(inPath, 'utf8'))
const tpl = src.actors.find(a => a.tag === 'ally')
const asset = { ...clone(src.assets.find(a => a.id === tpl.assetId)), id: `r_${RANGER.id}`, rangerId: RANGER.id, name: RANGER.name }
const towerAsset = { id: 'tw_twr09', type: 'ranger', source: 'upload', name: 'twr09-body', body: 'body',
  sets: { body: { sam: '/api/res/twr09/twr09-body.sam', plist: '/api/res/twr09/twr09-body.plist', png: '/api/res/twr09/twr09-body.png' } } }
const walkDur = (OUT_X - SPAWN_X) / MOVE_PX

// ลำดับวาด: เลนบน (ป้อม → ตัวที่เรียก) แล้วเลนล่าง — เลนล่างอยู่หน้า
const actors = [], cues = []
LANE_Y.forEach((y, lane) => {
  actors.push({ ...clone(tpl), id: `tower_${lane}`, name: `twr09 (${lane ? 'gear' : 'base'})`, assetId: towerAsset.id, tag: 'prop', x: TOWER_X, y, flip: false, idleClip: 'normal_idle', loop: true, muted: true, scale: TOWER_SCALE })
  SPAWNS[lane].forEach((at, i) => {
    const id = `summon_${lane}_${i}`
    actors.push({ ...clone(tpl), id, name: `${RANGER.name} ${lane ? 'gear' : 'base'} #${i + 1}`, assetId: asset.id, tag: `ally_${lane}_${i}`, x: SPAWN_X, y, flip: false })
    cues.push(
      { id: `show_${id}`, type: 'show', actorId: id, start: at, duration: +(walkDur + 0.1).toFixed(3), fadeIn: 0.12, fadeOut: 0.05 },
      { id: `walk_${id}`, type: 'move', actorId: id, start: at, to: { x: OUT_X, y }, duration: +walkDur.toFixed(3), ease: 'linear', clip: 'walk' },
    )
  })
})

const W = src.width ?? 1280, H = src.height ?? 720
const clampTo = (v, half, size) => Math.min(Math.max(v, half), size - half)
const cam = (id, start, x, y, zoom, duration, ease = 'easeInOut') => ({ id, type: 'camera', actorId: '__camera', start, center: { x: clampTo(x, W / 2 / zoom, W), y: clampTo(y, H / 2 / zoom, H) }, zoom, duration, ease })
cues.push(
  cam('cam0', 0, 640, 360, 1.0, 0),
  cam('cam_equip', EQUIP_AT - 1.1, 330, LANE_Y[1] - 150, 1.5, 0.7),   // ป้อมล่าง (การ์ดใส่เกียร์อยู่ขวา)
  cam('cam_race', RACE.start - 0.8, 640, 360, 1.0, 0.7),
)

// ── แสงตอนใส่เกียร์ที่หน้าป้อมล่าง ──
const LIGHT_SCALE = 2.2, LIGHT_SPEED = 0.8, LIGHT_DUR = 23 / 30 / LIGHT_SPEED
const lightAsset = { id: 'fx_light_b', type: 'ranger', source: 'upload', name: 'icon_ab_light_eff2_b', body: 'body',
  sets: { body: { sam: '/api/res/icon_ab_light_eff2/icon_ab_light_eff2_b.sam', plist: '/api/res/icon_ab_light_eff2/icon_ab_light_eff2_b.plist', png: '/api/res/icon_ab_light_eff2/icon_ab_light_eff2_b.png' } } }
actors.unshift({ ...clone(tpl), id: 'a_light_b', name: 'fx_light_b', assetId: 'fx_light_b', tag: 'prop', x: TOWER_X + 40, y: LANE_Y[1] + (785 - 560) * LIGHT_SCALE / 3.2, flip: false, idleClip: 'start', loop: false, muted: true, scale: LIGHT_SCALE })
cues.push(
  { id: 'light_once', type: 'anim', actorId: 'a_light_b', start: EQUIP_AT, clip: 'start', speed: LIGHT_SPEED, loop: false, hold: true, duration: LIGHT_DUR },
  { id: 'show_light_b', type: 'show', actorId: 'a_light_b', start: EQUIP_AT, duration: LIGHT_DUR, fadeIn: 0.05, fadeOut: 0.2 },
)

// ── เสียง ──
const sound = (id, name, file) => ({ id, type: 'audio', name, url: `/api/res/_raw/sounds/${file}` })
const sounds = [
  sound('snd_bgm', 'bgm_lobby2', 'bgm_lobby2_20151123104811121.ogg'),
  sound('snd_equip', 'gear_equip', 'gear_equip_20151123104728600.ogg'),
  sound('snd_click', 'click_summon', 'click_summon_20140603152639436.ogg'),
]
const sfx = (id, assetId, start, volume = 1, extra = {}) => ({ id, type: 'sound', actorId: '__audio', start, assetId, volume, offset: 0, duration: 0, fadeIn: 0, fadeOut: 0, ...extra })
cues.push(
  // ช่วงแข่งเล่น ×2 แต่เสียงเล่นความเร็วปกติ → เพลงยาวเท่าเวลาจริงของวิดีโอ
  sfx('bgm', 'snd_bgm', 0, 1, { duration: END - (RACE.end - RACE.start) / 2, fadeIn: 1, fadeOut: 2 }),
  sfx('sfx_equip', 'snd_equip', EQUIP_AT),
)
SPAWNS.forEach((list, lane) => list.forEach((at, i) => cues.push(sfx(`sfx_click_${lane}_${i}`, 'snd_click', at, 0.7))))

const background = { ...clone(src.background), kind: 'color', color: '#0a0d1c' }   // ภาพตู้รถไฟวาดจาก overlay (spaceTrain.ts)
const scene = { ...clone(src), name: MODE === 'regen-time' ? 'Ranger Regeneration Time — Rock Legend Brown' : 'Mineral Production cost — Rock Legend Brown',
  duration: END, depthSort: false, background, actors, assets: [asset, towerAsset, lightAsset, ...sounds], cues }
fs.writeFileSync(outPath, JSON.stringify(scene, null, 1) + '\n')
console.log('wrote', outPath, 'regen', REGEN.map(r => r.toFixed(3)).join(' / '), 'spawns', SPAWNS.map(l => l.length).join(' / '))
