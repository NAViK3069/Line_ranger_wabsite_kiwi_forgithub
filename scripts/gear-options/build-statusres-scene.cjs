// วิดีโอ การต้านการถอยกลับ (knockback-resist) / การต้านความมึนงง (stun-resist)
//   เรา (ซ้าย, Executor Anubis Brown — ตัวใส่เกียร์) โดน Jessica (ขวา) ใช้ทักษะที่มีผลถอยกลับ 4 รอบ (คลิปนี้แสดงเฉพาะครั้งที่ผลถอยกลับติด)
//   กฎของเกม (0xcf7728 → 0xcf7978): ทักษะโดนแล้ว → สุ่มต้าน p = ตัดเศษ(min(ต้านถอยกลับ, 0.95) × 100) · p ≥ 1 และ สุ่ม 0–99 < p → ไม่ถอย + ป้าย MISS ม่วง (vfunc 0x440(1) · ml_guild_raid_miss02)
//     ไม่ต้าน → 0xcd5088: เล่นท่า "knockback" + เสียง knockback · CCMoveBy(0.2 วิ, 48 pt ไปด้านหลัง) — ฝั่งเรา (ซ้าย) ถอยไปทางซ้าย
//   ผลแต่ละรอบ ROLLS: true = ถอยกลับ · ก่อนใส่ (ต้าน 0% → ไม่สุ่ม → ถอยทั้ง 2 รอบ) · หลังใส่ (ต้าน 95%): ต้านได้, ไม่ติด 5%
// overlay: src/app/gear-options/tutorials/status-resist.tsx (ROLLS / HIT_OFFSET ต้องตรงกัน)
//   stun: Naraku (ขวา) ใช้ทักษะ Tentacles (มีผลมึนงง unit22-stun · ระยะเวลา = ดาวของผู้ใช้ + 2 = 10 วิ — 0xcefd18) · มึนงงอยู่แล้วติดซ้ำไม่ได้ (vfunc 0x950)
//     → 2 รอบ: ไม่ใส่เกียร์ (มึนงง 10 วิ) · ใส่เกียร์หลังหายมึน (ต้าน 95% → ต้านได้) · เอฟเฟกต์มึนงงวาดในชั้นซ้อน (status-resist.tsx)
// Run: node scripts/gear-options/build-statusres-scene.cjs <knockback|stun> scripts/gear-options/atk-base.anme.json public/gear-options/scenes/<knockback|stun>-resist.anme.json
const fs = require('fs')
const { ALLY, ENEMY, gameAttack } = require('./scene-lib.cjs')
const MODE = process.argv[2]
if (!['knockback', 'stun'].includes(MODE)) throw new Error('mode: knockback | stun')
const [inPath, outPath] = process.argv.slice(3)
const STUN = MODE === 'stun'

const WEARER = { id: 'u1242e-brown', name: 'Brown อนูบิสเพชฌฆาต' }
const CASTER = STUN ? { id: 'u2023e-naraku', name: 'Naraku' } : { id: 'u1003e-jessica', name: 'Jessica' }
// ต้องตรงกับ MODES ใน status-resist.tsx
const ROLLS = STUN ? [18.6, 34.4] : [18.6, 23.0, 30.6, 35.0]
const ACT = 2.1, EQUIP_AT = STUN ? 32.3 : 28.6, SUMMARY = 40.2, END = 48
const KNOCKED = STUN ? [true, false] : [true, true, false, true]   // stun: true = มึนงง
const FIRST_AFTER = STUN ? 1 : 2
const HIT_OFFSET = +(process.env.HIT_OFFSET ?? (STUN ? 1.0667 : 1.0333))   // คิวทักษะเริ่ม → โดน (วัดจากไทม์ไลน์ของตัวเล่น)
const PUSH_PX = 48 * 2, PUSH_DUR = 0.2, KNOCK_DUR = 1.3
const START_X = 470

const clone = o => JSON.parse(JSON.stringify(o))
const src = JSON.parse(fs.readFileSync(inPath, 'utf8'))
const scene = { ...clone(src), name: STUN ? 'Stun Resistance — Naraku vs Executor Anubis Brown' : 'Knockback Resistance — Jessica vs Executor Anubis Brown', duration: END, depthSort: false }
for (const [actorId, r] of [[ALLY, WEARER], [ENEMY, CASTER]]) {
  const actor = scene.actors.find(a => a.id === actorId)
  const def = { ...clone(src.assets.find(a => a.id === actor.assetId)), id: `r_${r.id}_${actorId}`, rangerId: r.id, name: r.name }
  scene.assets.push(def); actor.assetId = def.id; actor.name = r.name
}
scene.actors.find(a => a.id === ALLY).x = START_X
scene.assets = scene.assets.filter(a => a.type !== 'ranger' || scene.actors.some(x => x.assetId === a.id))
const baseSk1 = src.cues.find(c => c.label === 'สกิล 1')
const sk = gameAttack(CASTER.id, 'skill1')
for (const a of sk.assets) if (!scene.assets.some(x => x.id === a.id)) scene.assets.push(a)
const cues = []
let x = START_X
ROLLS.forEach((r, k) => {
  const start = r + ACT
  const c = { ...clone(baseSk1), ...clone(sk.cue), id: `roll_${k}`, actorId: ENEMY, targetId: ALLY, start, label: KNOCKED[k] ? `ถอยกลับ #${k + 1}` : `ต้านได้ #${k + 1}` }
  c.fx = sk.cue.fx === null ? null : { ...clone(baseSk1.fx ?? {}), ...clone(sk.cue.fx ?? {}) }
  cues.push(c)
  if (KNOCKED[k] && !STUN) {
    const hit = start + HIT_OFFSET
    x -= PUSH_PX
    cues.push(
      { id: `knock_${k}`, type: 'anim', actorId: ALLY, start: +hit.toFixed(3), clip: 'knockback', speed: 1, loop: false, duration: KNOCK_DUR },
      { id: `push_${k}`, type: 'move', actorId: ALLY, start: +hit.toFixed(3), to: { x, y: 560 }, duration: PUSH_DUR, ease: 'easeOut' },
    )
  }
})
// ── กล้อง ──
const W = src.width ?? 1280, H = src.height ?? 720
const clampTo = (v, half, size) => Math.min(Math.max(v, half), size - half)
const cam = (id, start, cx, cy, zoom, duration, ease = 'easeInOut') => ({ id, type: 'camera', actorId: '__camera', start, center: { x: clampTo(cx, W / 2 / zoom, W), y: clampTo(cy, H / 2 / zoom, H) }, zoom, duration, ease })
cues.push(
  cam('cam_wide0', 0, 640, 360, 1, 0), cam('cam_ally', 7.5, 520, 470, 1.6, 0.9), cam('cam_wide1', 12.2, 640, 360, 1, 0.8),
  cam('cam_fight0', ROLLS[0] - 0.6, 640, 420, 1.08, 0.7), cam('cam_equip', EQUIP_AT - 1.05, STUN ? START_X - 50 : 420, 470, 1.6, 0.7),
  cam('cam_fight1', ROLLS[FIRST_AFTER] - 0.7, 640, 420, 1.08, 0.7), cam('cam_outro', SUMMARY, 640, 400, 1.05, END - SUMMARY, 'linear'),
)
// ── แสงตอนใส่เกียร์ (ที่ตำแหน่งตัวเราตอนนั้น) ──
const LIGHT_SCALE = 2.2, LIGHT_SPEED = 0.8, LIGHT_DUR = 23 / 30 / LIGHT_SPEED
const ally = scene.actors.find(a => a.id === ALLY)
scene.assets.push({ id: 'fx_light_b', type: 'ranger', source: 'upload', name: 'icon_ab_light_eff2_b', body: 'body',
  sets: { body: { sam: '/api/res/icon_ab_light_eff2/icon_ab_light_eff2_b.sam', plist: '/api/res/icon_ab_light_eff2/icon_ab_light_eff2_b.plist', png: '/api/res/icon_ab_light_eff2/icon_ab_light_eff2_b.png' } } })
scene.actors.unshift({ ...clone(ally), id: 'a_light_b', name: 'fx_light_b', assetId: 'fx_light_b', tag: 'prop', x: STUN ? START_X : START_X - PUSH_PX * 2, y: ally.y + (785 - 560) * LIGHT_SCALE / 3.2, flip: false, idleClip: 'start', loop: false, muted: true, scale: LIGHT_SCALE })
cues.push(
  { id: 'light_once', type: 'anim', actorId: 'a_light_b', start: EQUIP_AT, clip: 'start', speed: LIGHT_SPEED, loop: false, hold: true, duration: LIGHT_DUR },
  { id: 'show_light_b', type: 'show', actorId: 'a_light_b', start: EQUIP_AT, duration: LIGHT_DUR, fadeIn: 0.05, fadeOut: 0.2 },
)
// ── เสียง ──
const sound = (id, name, file) => ({ id, type: 'audio', name, url: `/api/res/_raw/sounds/${file}` })
scene.assets.push(
  sound('snd_bgm', 'bgm_lobby2', 'bgm_lobby2_20151123104811121.ogg'), sound('snd_equip', 'gear_equip', 'gear_equip_20151123104728600.ogg'),
  sound('snd_spin', 'roulette_spin', 'roulette_spin_20230820235101402.ogg'),
  sound('snd_win', 'slot_result_success', 'labyrinth_revivalstage_slot_result_success_20240220133016681.ogg'),
  sound('snd_lose', 'slot_result_fail', 'labyrinth_revivalstage_slot_result_fail_20240220133014809.ogg'),
)
const sfx = (id, assetId, start, volume = 1, extra = {}) => ({ id, type: 'sound', actorId: '__audio', start, assetId, volume, offset: 0, duration: 0, fadeIn: 0, fadeOut: 0, ...extra })
// stun: ช่วงมึนงง 23–31 วิ หน้าเว็บเล่น ×3 (status-resist.tsx STUN_FAST) แต่เสียงเล่นความเร็วปกติ → เพลงยาวเท่าเวลาจริงของวิดีโอ
const FAST_SAVED = STUN ? (31.0 - 23.0) * (1 - 1 / 3) : 0
cues.push(sfx('bgm', 'snd_bgm', 0, 1, { duration: END - FAST_SAVED, fadeIn: 1, fadeOut: 2 }), sfx('sfx_equip', 'snd_equip', EQUIP_AT))
// วงล้อสุ่มต้านมีเฉพาะหลังใส่เกียร์ (ต้าน 0% → เกมไม่สุ่ม)
ROLLS.slice(FIRST_AFTER).forEach((r, i) => {
  const k = i + FIRST_AFTER
  cues.push(sfx(`sfx_spin${k}`, 'snd_spin', r + 0.3, 0.8, { duration: 1.6, fadeOut: 0.15 }), sfx(`sfx_result${k}`, KNOCKED[k] ? 'snd_lose' : 'snd_win', r + 1.9, 0.9))
})
scene.cues = cues
fs.writeFileSync(outPath, JSON.stringify(scene, null, 1) + '\n')
console.log('wrote', outPath, 'HIT_OFFSET', HIT_OFFSET, 'final x', x)
