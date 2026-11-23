// Builds public/gear-options/scenes/atk.anme.json from the user's Video Studio scene (scripts/gear-options/atk-base.anme.json):
// rangers, tuned projectiles and sounds are kept; cues/camera are re-timed to match src/app/gear-options/tutorials/atk.tsx.
// Run: node scripts/gear-options/build-atk-scene.cjs scripts/gear-options/atk-base.anme.json public/gear-options/scenes/atk.anme.json
// Story: normal attack before gear → equip (overlay only, no ranger skill) → normal attack after gear → skill 1 after gear.
const fs = require('fs')
const src = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const out = process.argv[3]

const ALLY = 'ak1zzx9ceu', ENEMY = 'a9ijjdi134'
const atk = src.cues.find(c => c.label === 'โจมตีปกติ')
const sk1 = src.cues.find(c => c.label === 'สกิล 1')
if (!atk || !sk1) throw new Error('cues not found')

const clone = o => JSON.parse(JSON.stringify(o))
const cue = (base, id, start, extra = {}) => ({ ...clone(base), id, start, ...extra })
// กล้องต้องไม่เห็นเลยขอบแผนที่ — บีบจุดกลางให้กรอบภาพ (เวที ÷ ซูม) อยู่ในเวทีเสมอ
const W = src.width ?? 1280, H = src.height ?? 720
const clampTo = (v, half, size) => Math.min(Math.max(v, half), size - half)
const cam = (id, start, x, y, zoom, duration, ease = 'easeInOut') => ({
  id, type: 'camera', actorId: '__camera', start,
  center: { x: clampTo(x, W / 2 / zoom, W), y: clampTo(y, H / 2 / zoom, H) }, zoom, duration, ease,
})

// stage points: ally feet (358, 560), enemy feet (898, 560)
// ── เวลา (ต้องตรงกับ src/app/gear-options/tutorials/atk.tsx → const TL) ──
const T = {
  atkBefore: 21.2,      // รอบ 1: โจมตีปกติ ไม่ใส่เกียร์
  skillBefore: 29.8,    // รอบ 2: สกิล ไม่ใส่เกียร์ → เป้าหมายตาย
  respawn: 35.6,        // เป้าหมายกลับมา (กล้องซูมตัวเราอยู่ — มองไม่เห็นตอนโผล่)
  equip: 35.95,         // เกียร์ลงช่อง → แสงหลังเรนเจอร์
  atkAfter: 39.3,       // รอบ 3: โจมตีปกติ ใส่เกียร์
  skillAfter: 42.9,     // รอบ 4: สกิล ใส่เกียร์ → เป้าหมายตาย
  summary: 48.0,
  end: 55,
}
const HIT_OFFSET = 1.533   // คิวสกิลเริ่ม → กระสุนโดน (วัดจากไทม์ไลน์ของตัวเล่น)
// นับจากจังหวะโดน: knockback (1.2 วิ) → ค้างเฟรมสุดท้าย → จางหาย 0.15 วิ · soul = วิญญาณออก + เสียงตาย
// (soul ต้องตรงกับ DEATH.soul ใน src/app/gear-options/tutorials/atk.tsx)
const DEATH = { knock: 0.02, fadeFrom: 1.3, fadeTo: 1.45, soul: 1.3 }

const WIDE = [640, 360, 1]
const SKILL_CAM = [660, 420, 1.12]
const scene = {
  ...src,
  name: 'ATK — Moonbrella',
  duration: T.end,
  cues: [
    cam('cam_wide0', 0, ...WIDE, 0),
    cam('cam_ally', 7.5, 470, 470, 1.65, 0.9),       // ally left of centre → card on the right
    cam('cam_enemy', 11.9, 790, 470, 1.65, 0.9),     // enemy right of centre → card on the left
    cam('cam_wide1', 15.9, ...WIDE, 0.8),
    cue(atk, 'atk_before', T.atkBefore, { label: 'ATK (no gear)' }),
    // skill formula card 24.4–29.3 (wide), then the skill without gear
    cam('cam_skill0', T.skillBefore - 0.6, ...SKILL_CAM, 0.8),
    cue(sk1, 'skill_before', T.skillBefore, { label: 'Skill 1 (no gear)' }),
    cam('cam_equip', T.equip - 1.05, 470, 470, 1.65, 0.7),   // equip close-up — gear glow only, the ranger stays idle
    cam('cam_wide2', T.atkAfter - 0.8, ...WIDE, 0.7),
    cue(atk, 'atk_after', T.atkAfter, { label: 'ATK (Moonbrella)' }),
    cam('cam_skill1', T.skillAfter - 0.6, ...SKILL_CAM, 0.8),
    cue(sk1, 'skill_after', T.skillAfter, { label: 'Skill 1 (Moonbrella)' }),
    cam('cam_wide3', T.skillAfter + HIT_OFFSET + 2.9, ...WIDE, 0.6),
    // slow push-in under the summary — also makes the scene run to the end (the player ends after the last cue)
    cam('cam_outro', T.summary, 640, 400, 1.08, T.end - T.summary, 'linear'),
  ],
}
if (!scene.actors.find(a => a.id === ALLY) || !scene.actors.find(a => a.id === ENEMY)) throw new Error('actors missing')

// ── equip light (res/icon_ab_light_eff2_b = sunburst) behind the ranger — plays once while equipping ──
// (_f is a rounded-square frame meant for ability icons, so it isn't used on a ranger)
const LIGHT_SCALE = 2.2
const LIGHT_SPEED = 0.8
const LIGHT_DUR = 23 / 30 / LIGHT_SPEED      // คลิป start = 23 เฟรม — เล่นครั้งเดียว
const LIGHT_Y = 560 + (785 - 560) * LIGHT_SCALE / 3.2   // จุดยืนของแสง — ให้กลางแสงตกกลางตัวเรนเจอร์ (วัดไว้ที่สเกล 3.2 → y 785)
const lightAsset = (id, layer) => ({
  id, type: 'ranger', source: 'upload', name: `icon_ab_light_eff2_${layer}`, body: 'body',
  sets: { body: { sam: `/api/res/icon_ab_light_eff2/icon_ab_light_eff2_${layer}.sam`, plist: `/api/res/icon_ab_light_eff2/icon_ab_light_eff2_${layer}.plist`, png: `/api/res/icon_ab_light_eff2/icon_ab_light_eff2_${layer}.png` } },
})
scene.assets.push(lightAsset('fx_light_b', 'b'))
const allyActor = scene.actors.find(a => a.id === ALLY)
const lightActor = (id, assetId, y) => ({
  ...clone(allyActor), id, name: assetId, assetId, tag: 'prop', y, flip: false, idleClip: 'start', loop: false, muted: true, scale: LIGHT_SCALE,
})
scene.depthSort = false            // ลำดับวาด = ลำดับใน actors: แสง → เรนเจอร์ (ทุกตัวยืนเส้นพื้นเดียวกัน)
scene.actors.unshift(lightActor('a_light_b', 'fx_light_b', LIGHT_Y))
const show = (id, actorId, start, duration, fadeIn, fadeOut) => ({ id, type: 'show', actorId, start, duration, fadeIn, fadeOut })
const anim = (id, actorId, start, clip, duration, speed = 1) => ({ id, type: 'anim', actorId, start, clip, speed, loop: false, hold: true, duration })
scene.cues.push(
  anim('light_once', 'a_light_b', T.equip, 'start', LIGHT_DUR, LIGHT_SPEED),
  show('show_light_b', 'a_light_b', T.equip, LIGHT_DUR, 0.05, 0.2),
)
// target dies on each skill hit: knockback (36 frames) → hold the last frame → fade out (the overlay shows its soul flying away)
// it comes back (fade in) during the equip close-up, while it's off camera
const hit0 = T.skillBefore + HIT_OFFSET, hit1 = T.skillAfter + HIT_OFFSET
scene.cues.push(
  anim('enemy_knockback0', ENEMY, hit0 + DEATH.knock, 'knockback', DEATH.fadeTo - DEATH.knock),
  anim('enemy_knockback1', ENEMY, hit1 + DEATH.knock, 'knockback', DEATH.fadeTo - DEATH.knock),
  show('show_enemy0', ENEMY, 0, hit0 + DEATH.fadeTo, 0, DEATH.fadeTo - DEATH.fadeFrom),
  show('show_enemy1', ENEMY, T.respawn, hit1 + DEATH.fadeTo - T.respawn, 0.4, DEATH.fadeTo - DEATH.fadeFrom),
)

// ── เสียง (ไฟล์เสียงของเกมบน lerico — ชื่อเดียวกับที่ผู้ใช้ส่งมา) ──
//   เพลงพื้นหลัง bgm_lobby2 (61 วิ ยาวกว่าคลิป) เบากว่าปกติ · เสียงใส่เกียร์ตอนเกียร์ลงช่อง · เสียงตายตอนวิญญาณออกจากร่าง
const sound = (id, name, file) => ({ id, type: 'audio', name, url: `/api/res/_raw/sounds/${file}` })
scene.assets.push(
  sound('snd_bgm', 'bgm_lobby2', 'bgm_lobby2_20151123104811121.ogg'),
  sound('snd_equip', 'gear_equip', 'gear_equip_20151123104728600.ogg'),
  sound('snd_death', 'death', 'death_20140603152639586.ogg'),
)
const sfx = (id, assetId, start, volume = 1, extra = {}) =>
  ({ id, type: 'sound', actorId: '__audio', start, assetId, volume, offset: 0, duration: 0, fadeIn: 0, fadeOut: 0, ...extra })
const BGM_VOLUME = 0.5
scene.cues.push(
  sfx('bgm', 'snd_bgm', 0, BGM_VOLUME, { duration: T.end, fadeIn: 1, fadeOut: 2 }),
  sfx('sfx_equip', 'snd_equip', T.equip),
  sfx('sfx_death0', 'snd_death', hit0 + DEATH.soul),
  sfx('sfx_death1', 'snd_death', hit1 + DEATH.soul),
)

fs.writeFileSync(out, JSON.stringify(scene, null, 1) + '\n')
console.log('wrote', out, scene.cues.length, 'cues', { hit0, hit1 })
