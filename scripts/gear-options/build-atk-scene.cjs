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
const cam = (id, start, x, y, zoom, duration, ease = 'easeInOut') =>
  ({ id, type: 'camera', actorId: '__camera', start, center: { x, y }, zoom, duration, ease })

// stage points: ally feet (358, 560), enemy feet (898, 560)
const WIDE = [640, 360, 1]
const scene = {
  ...src,
  name: 'ATK — Moonbrella',
  duration: 48,
  cues: [
    cam('cam_wide0', 0, ...WIDE, 0),
    cam('cam_ally', 7.5, 470, 470, 1.65, 0.9),       // ally left of centre → card on the right
    cam('cam_enemy', 11.9, 790, 470, 1.65, 0.9),     // enemy right of centre → card on the left
    cam('cam_wide1', 15.9, ...WIDE, 0.8),
    cue(atk, 'atk_before', 21.2, { label: 'ATK (no gear)' }),
    cam('cam_equip', 24.2, 470, 470, 1.65, 0.7),     // equip close-up — gear glow only, the ranger stays idle
    cam('cam_wide2', 27.8, ...WIDE, 0.7),
    cue(atk, 'atk_after', 28.6, { label: 'ATK (Moonbrella)' }),
    // skill formula card 31.6–36.8 (wide), then the skill
    cam('cam_skill', 36.6, 660, 420, 1.12, 0.8),
    cue(sk1, 'skill_after', 37.2, { label: 'Skill 1 (Moonbrella)' }),
    cam('cam_wide3', 40.6, ...WIDE, 0.6),
    // slow push-in under the summary — also makes the scene run to 48s (the player ends after the last cue)
    cam('cam_outro', 41.4, 640, 400, 1.08, 6.6, 'linear'),
  ],
}
if (!scene.actors.find(a => a.id === ALLY) || !scene.actors.find(a => a.id === ENEMY)) throw new Error('actors missing')

// ── equip light (res/icon_ab_light_eff2_b = sunburst) behind the ranger — only visible while equipping ──
// (_f is a rounded-square frame meant for ability icons, so it isn't used on a ranger)
const HIT_SKILL = 38.733            // measured from the player timeline (skill_after impact)
const EQUIP = 25.25, EQUIP_DUR = 2.7
const LIGHT_Y = 785                 // จุดยืนของแสง — ให้กลางแสงตกกลางตัวเรนเจอร์
const lightAsset = (id, layer) => ({
  id, type: 'ranger', source: 'upload', name: `icon_ab_light_eff2_${layer}`, body: 'body',
  sets: { body: { sam: `/api/res/icon_ab_light_eff2/icon_ab_light_eff2_${layer}.sam`, plist: `/api/res/icon_ab_light_eff2/icon_ab_light_eff2_${layer}.plist`, png: `/api/res/icon_ab_light_eff2/icon_ab_light_eff2_${layer}.png` } },
})
scene.assets.push(lightAsset('fx_light_b', 'b'))
const allyActor = scene.actors.find(a => a.id === ALLY)
const lightActor = (id, assetId, y) => ({
  ...clone(allyActor), id, name: assetId, assetId, tag: 'prop', y, flip: false, idleClip: 'start', loop: true, muted: true, scale: 3.2,
})
scene.depthSort = false            // ลำดับวาด = ลำดับใน actors: แสง → เรนเจอร์ (ทุกตัวยืนเส้นพื้นเดียวกัน)
scene.actors.unshift(lightActor('a_light_b', 'fx_light_b', LIGHT_Y))
const show = (id, actorId, start, duration, fadeIn, fadeOut) => ({ id, type: 'show', actorId, start, duration, fadeIn, fadeOut })
scene.cues.push(
  show('show_light_b', 'a_light_b', EQUIP, EQUIP_DUR, 0.12, 0.5),
  // target dies on the skill hit: knockback (36 frames = 1.2s) then fades out → the overlay shows its soul flying away
  { id: 'enemy_knockback', type: 'anim', actorId: ENEMY, start: HIT_SKILL + 0.02, clip: 'knockback', speed: 1, loop: false, duration: 1.2 },
  show('show_enemy', ENEMY, 0, HIT_SKILL + 1.2 + 0.25, 0, 0.3),
)
fs.writeFileSync(out, JSON.stringify(scene, null, 1) + '\n')
console.log('wrote', out, scene.cues.length, 'cues')
