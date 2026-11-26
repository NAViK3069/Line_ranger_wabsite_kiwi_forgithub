// ====================================================
// วิดีโอ Attack Speed: MEGA MAN 2 ตัวแข่งยิง (บน = ไม่ใส่เกียร์ · ล่าง = ใส่ชุด Attack Speed +225%) แล้วนับจำนวนนัด
// overlay: src/app/gear-options/tutorials/atk-speed.tsx (ค่าคงที่ใน RACE / LANES ต้องตรงกัน)
// Run: node scripts/gear-options/build-atkspeed-scene.cjs scripts/gear-options/atk-base.anme.json public/gear-options/scenes/atk-speed.anme.json
//
// กฎของเกม (ถอดจาก libgame.so):
//   attackDelay ที่ใส่เกียร์ = ตัดเศษ(attackDelay ÷ (1 + r))       r = Attack Speed รวม (Basic ทุกชิ้น + Switchable สูงสุดตัวเดียว)
//   ช่วงยิง = max(attackDelay ÷ 30, (เฟรม attack_ready + attack) ÷ 30)   — ยิงเร็วกว่าความยาวท่ายิงไม่ได้
//   MEGA MAN (u1010e-rockman): attackDelay 80 · ท่ายิง 13 + 11 = 24 เฟรม
//     ไม่ใส่เกียร์ → 80 เฟรม = 2.667 วิ/นัด · ใส่ +225% → ตัดเศษ(80 ÷ 3.25) = 24 เฟรม = 0.8 วิ/นัด (ชนเพดานท่ายิงพอดี)
// ====================================================
const { ALLY, ENEMY, gameAttack } = require('./scene-lib.cjs')

const RANGER = { id: 'u1010e-rockman', name: 'MEGA MAN' }
const ATTACK_DELAY = 80          // unit.attackDelay (เฟรม)
const ANIM_FRAMES = 13 + 11      // attack_ready + attack ของ u1010e-rockman-body.sam
const GEAR_RATE = 2.25           // Attack Speed รวมของชุด (3 × 75% Basic ที่ +5)
const f32 = Math.fround
/** สูตรเกม (0x1124d64 + 0xd5d490): attackDelay + r × (−1/(1+r)) × attackDelay แล้วตัดเศษ (float32) */
const gearDelay = (d, r) => Math.trunc(f32(f32(d) + f32(f32(f32(-1) / f32(r + 1)) * f32(d) * f32(r))))
const interval = d => Math.max(d, ANIM_FRAMES) / 30

// ── เวลา (ต้องตรงกับ TL ใน atk-speed.tsx) ──
const RACE = { start: 21, end: 37 }   // แข่ง 16 วินาที (หน้าเว็บเล่นช่วงนี้เร็ว ×2)
const END = 46
// ── แผนที่: ตู้รถไฟ res/space_train_battle (2 เลนบน/ล่าง แบบในเกม) — overlay วาดลง canvas เอง (drawSpaceTrain ใน atk-speed.tsx)
//   ภาพตู้ spacetrain_battle_bg 692×640 ย่อให้สูงเต็มจอ (×720/640) · เลนบน = แถว 270–368 · เส้นฟ้า 370–378 · เลนล่าง = 380–480 ของภาพ
const MAP_SCALE = 720 / 640
const LANE_FEET = [322, 454]     // แถวเท้าในภาพตู้ (เลนบนค่อนขึ้น · เลนล่างค่อนลง ให้ 2 แถวห่างกัน)
// เลนบน / ล่าง: ตำแหน่งเท้า (พิกเซลเวที) · เป้ายืนในระยะยิงของ MEGA MAN (attackRange 80 pt = 160 px จากกลางตัว)
const LANES = [
  { id: 'base', shooter: 'mm_base', target: 'tg_base', y: Math.round(LANE_FEET[0] * MAP_SCALE), delay: ATTACK_DELAY },
  { id: 'gear', shooter: 'mm_gear', target: 'tg_gear', y: Math.round(LANE_FEET[1] * MAP_SCALE), delay: gearDelay(ATTACK_DELAY, GEAR_RATE) },
]
const SHOOTER_X = 410, TARGET_X = 830   // ห่างกัน 420 px ให้เห็นกระสุนวิ่ง

const clone = o => JSON.parse(JSON.stringify(o))

function buildScene(src) {
  const baseAtk = src.cues.find(c => c.label === 'โจมตีปกติ')
  const allyTpl = src.actors.find(a => a.id === ALLY)
  const enemyTpl = src.actors.find(a => a.id === ENEMY)
  if (!baseAtk || !allyTpl || !enemyTpl) throw new Error('base scene missing actors/cues')
  const W = src.width ?? 1280, H = src.height ?? 720

  // ── asset ของ MEGA MAN: ทำสำเนา asset เรนเจอร์ของฉากต้นฉบับแล้วเปลี่ยนตัว (ตัวเล่นโหลดไฟล์ตาม rangerId) ──
  const allyAsset = src.assets.find(a => a.id === allyTpl.assetId)
  const mmAsset = { ...clone(allyAsset), id: `r_${RANGER.id}`, rangerId: RANGER.id, name: RANGER.name }
  const atk = gameAttack(RANGER.id, 'normal')
  const assets = src.assets.filter(a => a.type === 'ranger' && a.id === enemyTpl.assetId)   // เป้า = เรนเจอร์ฝั่งขวาของฉากต้นฉบับ
  assets.push(mmAsset, ...atk.assets)

  // ── ตัวแสดง: ยิง 2 ตัว + เป้า 2 ตัว (คนละเลน) · ลำดับวาด = เลนบนก่อน ──
  const actors = []
  for (const L of LANES) {
    actors.push({ ...clone(allyTpl), id: L.shooter, name: `${RANGER.name} (${L.id})`, assetId: mmAsset.id, tag: `ally_${L.id}`, x: SHOOTER_X, y: L.y, flip: false })
    actors.push({ ...clone(enemyTpl), id: L.target, name: `target (${L.id})`, tag: `enemy_${L.id}`, x: TARGET_X, y: L.y, flip: true })
  }

  // ── คิวยิง: ทุกนัดเริ่มห่างกันเท่าช่วงยิงของเลนนั้น · เริ่มนัดใหม่เฉพาะที่ท่ายิงจบก่อนหมดเวลา ──
  //   game: false = ใช้เป้าของเลนตัวเอง (กฎล็อคเป้าแบบเกมหา "ศัตรู" จาก tag ทั้งฉาก) · วิถีกระสุนยังเป็นแบบเกม (fx.game)
  const shotCue = (L, k, start) => ({
    ...clone(baseAtk), ...clone(atk.cue),
    fx: { ...clone(baseAtk.fx), ...clone(atk.cue.fx) },
    id: `${L.id}_${k}`, start, label: `${L.id} #${k + 1}`, actorId: L.shooter, targetId: L.target, game: false,
  })
  const cues = []
  for (const L of LANES) {
    const step = interval(L.delay)
    for (let k = 0; ; k++) {
      const start = +(RACE.start + k * step).toFixed(4)
      if (start + ANIM_FRAMES / 30 > RACE.end + 1e-6) break
      cues.push(shotCue(L, k, start))
    }
  }

  // ── กล้อง ──
  const clampTo = (v, half, size) => Math.min(Math.max(v, half), size - half)
  const cam = (id, start, x, y, zoom, duration, ease = 'easeInOut') => ({
    id, type: 'camera', actorId: '__camera', start,
    center: { x: clampTo(x, W / 2 / zoom, W), y: clampTo(y, H / 2 / zoom, H) }, zoom, duration, ease,
  })
  const midX = (SHOOTER_X + TARGET_X) / 2
  const midY = (LANES[0].y + LANES[1].y) / 2
  // กล้องมองค่อนขึ้น (ภาพทั้งหมดลงมาอยู่ล่างจอ) — ตัดผนังล่างของตู้ที่ว่างออก
  const WIDE = [midX, midY - 130, 1.22]            // ภาพกว้าง: 2 เลน + หน้าต่าง
  const RACE_VIEW = [midX, midY - 110, 1.3]        // ช่วงแข่ง: ใกล้ขึ้นอีกนิด
  cues.push(
    cam('cam_wide0', 0, ...WIDE, 0),
    cam('cam_shooter', 7.6, SHOOTER_X + 230, midY - 80, 1.45, 0.9),   // การ์ดเรนเจอร์อยู่ขวา → ตัวละครชิดซ้าย
    cam('cam_wide1', 12.2, ...WIDE, 0.8),
    cam('cam_equip', 18.0, SHOOTER_X + 250, LANES[1].y - 110, 1.4, 0.7),      // ใส่เกียร์ตัวล่าง
    cam('cam_race', RACE.start - 0.8, ...RACE_VIEW, 0.7),
    cam('cam_outro', RACE.end + 1.2, midX, midY - 110, 1.38, END - RACE.end - 1.2, 'linear'),
  )

  // ── แสงตอนใส่เกียร์หลังตัวล่าง (icon_ab_light_eff2_b) ──
  const EQUIP_AT = 19.4
  const LIGHT_SCALE = 2.2, LIGHT_SPEED = 0.8, LIGHT_DUR = 23 / 30 / LIGHT_SPEED
  const gearLane = LANES[1]
  assets.push({
    id: 'fx_light_b', type: 'ranger', source: 'upload', name: 'icon_ab_light_eff2_b', body: 'body',
    sets: { body: { sam: '/api/res/icon_ab_light_eff2/icon_ab_light_eff2_b.sam', plist: '/api/res/icon_ab_light_eff2/icon_ab_light_eff2_b.plist', png: '/api/res/icon_ab_light_eff2/icon_ab_light_eff2_b.png' } },
  })
  actors.unshift({
    ...clone(allyTpl), id: 'a_light_b', name: 'fx_light_b', assetId: 'fx_light_b', tag: 'prop',
    x: SHOOTER_X, y: gearLane.y + (785 - 560) * LIGHT_SCALE / 3.2, flip: false, idleClip: 'start', loop: false, muted: true, scale: LIGHT_SCALE,
  })
  cues.push(
    { id: 'light_once', type: 'anim', actorId: 'a_light_b', start: EQUIP_AT, clip: 'start', speed: LIGHT_SPEED, loop: false, hold: true, duration: LIGHT_DUR },
    { id: 'show_light_b', type: 'show', actorId: 'a_light_b', start: EQUIP_AT, duration: LIGHT_DUR, fadeIn: 0.05, fadeOut: 0.2 },
  )

  // ── เสียง: เพลงพื้นหลัง + เสียงใส่เกียร์ ──
  const sound = (id, name, file) => ({ id, type: 'audio', name, url: `/api/res/_raw/sounds/${file}` })
  assets.push(
    sound('snd_bgm', 'bgm_lobby2', 'bgm_lobby2_20151123104811121.ogg'),
    sound('snd_equip', 'gear_equip', 'gear_equip_20151123104728600.ogg'),
  )
  const sfx = (id, assetId, start, volume = 1, extra = {}) =>
    ({ id, type: 'sound', actorId: '__audio', start, assetId, volume, offset: 0, duration: 0, fadeIn: 0, fadeOut: 0, ...extra })
  cues.push(
    // หน้าเว็บเร่งช่วงแข่ง ×2 แต่เสียงเล่นความเร็วปกติ (ScenePlayer keepPitch) → เพลงยาวเท่าเวลาจริงของวิดีโอ ไม่ใช่ END
    sfx('bgm', 'snd_bgm', 0, 1, { duration: END - (RACE.end - RACE.start) / 2, fadeIn: 1, fadeOut: 2 }),
    sfx('sfx_equip', 'snd_equip', EQUIP_AT),
  )

  // พื้นหลังของฉาก = สีเรียบ (ภาพตู้รถไฟวาดทับจาก overlay)
  const background = { ...clone(src.background), kind: 'color', color: '#0a0d1c' }
  return { ...clone(src), name: 'Attack Speed — MEGA MAN', duration: END, depthSort: false, background, actors, assets, cues }
}

const fs = require('fs')
const [inPath, outPath] = process.argv.slice(2)
if (!inPath || !outPath) throw new Error('usage: node build-atkspeed-scene.cjs <base.anme.json> <out.anme.json>')
const scene = buildScene(JSON.parse(fs.readFileSync(inPath, 'utf8')))
fs.writeFileSync(outPath, JSON.stringify(scene, null, 1) + '\n')
const shots = LANES.map(L => `${L.id}: delay ${L.delay}f → ${interval(L.delay).toFixed(3)}s · ${scene.cues.filter(c => c.id.startsWith(L.id + '_')).length} shots`)
console.log('wrote', outPath, scene.cues.length, 'cues ·', shots.join(' | '))
