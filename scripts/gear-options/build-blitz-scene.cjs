// ====================================================
// วิดีโอ โอกาสโจมตีต่อเนื่อง (Blitz Rush Odds): Brown ตำนานร็อค (ซ้าย ใส่เกียร์) ตีปกติใส่ Brown อนูบิสเพชฌฆาต (ขวา)
//   ไม่ใส่เกียร์ 2 ครั้ง (0% — เกมไม่สุ่ม · โดนครั้งเดียว) → ใส่ [MG]Sword Kokorowatari +5 (+42%) → 2 ครั้ง หมุนวงล้อ (ติด / ไม่ติด)
// overlay: src/app/gear-options/tutorials/blitz-rush.tsx (ROLLS / EQUIP_AT / NORMAL_HIT ต้องตรงกัน)
// Run: node scripts/gear-options/build-blitz-scene.cjs scripts/gear-options/atk-base.anme.json public/gear-options/scenes/blitz-rush.anme.json
//
// กฎของเกม (ถอดจาก libgame.so):
//   เกียร์: DOUBLE_ATK_PROB_MUL = type 0x24 → รวม (0x111d8c8) แล้วตั้งค่า doubleAttackProb ของยูนิต (UnitData setter 0x8b8, fn 0xd5d490)
//   ตีปกติโดน (0xcd8e50 — ประชิด = ตอนปล่อยท่า · กระสุน = ตอนกระสุนถึง 0xce3094):
//     โอกาส > 0 → สุ่ม arc4random()/2^32 < โอกาส (0x193c540) · โอกาส 0 = ไม่สุ่ม
//     ติด → 0xced7e4 คำนวณดาเมจตีปกติอีกชุด (0xcec4d0) แล้ว CCDelayTime 0.3 วิ → โดนซ้ำ (0xcedd40: เอฟเฟกต์โดน + ดาเมจ) — ไม่มีกระสุน/ท่าใหม่
//     ตีกระจายโดนหลายตัว ใช้ผลสุ่มเดียวกันทุกตัว (0xcedd34) · ครั้งที่ 2 ไม่สุ่มต่อ (ไม่มีครั้งที่ 3)
//   ทักษะใช้ค่าแยก DOUBLE_SKL_PROB_MUL (0x26 — อัตราการใช้ทักษะอีกครั้ง)
// ====================================================
const { ALLY, ENEMY, gameAttack } = require('./scene-lib.cjs')

const SHOOTER = 'u1260e-brown'
const RANGERS = { [ALLY]: { id: SHOOTER, name: 'Brown ตำนานร็อค' }, [ENEMY]: { id: 'u1242e-brown', name: 'Brown อนูบิสเพชฌฆาต' } }
// ผลสุ่มแต่ละรอบ (true = ติด โดนซ้ำ) · 2 รอบแรกไม่ใส่เกียร์ (0% ไม่สุ่ม)
const ROLL_OK = [false, false, true, false]

// ── เวลา (ต้องตรงกับ blitz-rush.tsx) ──
const ROLLS = [18.6, 23.0, 30.6, 35.0]      // ป้าย/วงล้อโผล่ · วงล้อหมุน +0.3 → +SPIN_TO (= จังหวะโดน)
const SPIN_FROM = 0.3, SPIN_TO = 1.9
const NORMAL_HIT = 0.994                    // เริ่มคิวตีปกติ → กระสุนถึง (วินาที — วัดจากตัวเล่น)
const FOLLOW = 0.3                          // โดนซ้ำหลังโดนครั้งแรก (CCDelayTime 0.3 ใน 0xced7e4)
const EQUIP_AT = 28.6
const SUMMARY = 40.2, END = 48

const clone = o => JSON.parse(JSON.stringify(o))
const mergeCue = (base, over) => ({ ...clone(base), ...clone(over), fx: over.fx === null ? null : { ...clone(base.fx), ...clone(over.fx ?? {}) } })

function buildScene(src) {
  const baseAtk = src.cues.find(c => c.label === 'โจมตีปกติ')
  if (!baseAtk) throw new Error('base cue missing')
  const W = src.width ?? 1280, H = src.height ?? 720
  const scene = { ...clone(src), name: 'Blitz Rush Odds — Brown', duration: END, depthSort: false }

  for (const [actorId, r] of Object.entries(RANGERS)) {
    const actor = scene.actors.find(a => a.id === actorId)
    const def = { ...clone(src.assets.find(a => a.id === actor.assetId)), id: `r_${r.id}_${actorId}`, rangerId: r.id, name: r.name }
    scene.assets.push(def)
    actor.assetId = def.id
    actor.name = r.name
  }
  scene.assets = scene.assets.filter(a => a.type !== 'ranger' || scene.actors.some(x => x.assetId === a.id))

  // ── คิวตีปกติแต่ละรอบ (id = roll_<k>) · ติด = followUp [0.3] ──
  const atkN = gameAttack(SHOOTER, 'normal')
  for (const a of atkN.assets) if (!scene.assets.some(x => x.id === a.id)) scene.assets.push(a)
  const normal = mergeCue(baseAtk, atkN.cue)
  const cues = ROLLS.map((r, k) => ({
    ...clone(normal), actorId: ALLY, targetId: ENEMY, start: r + SPIN_TO - NORMAL_HIT, id: `roll_${k}`,
    label: ROLL_OK[k] ? `ตีปกติ + โดนซ้ำ #${k + 1}` : `ตีปกติ #${k + 1}`,
    ...(ROLL_OK[k] ? { followUp: [FOLLOW] } : {}),
  }))

  // ── กล้อง ──
  const clampTo = (v, half, size) => Math.min(Math.max(v, half), size - half)
  const cam = (id, start, x, y, zoom, duration, ease = 'easeInOut') => ({
    id, type: 'camera', actorId: '__camera', start,
    center: { x: clampTo(x, W / 2 / zoom, W), y: clampTo(y, H / 2 / zoom, H) }, zoom, duration, ease,
  })
  const WIDE = [640, 360, 1]
  const FIGHT = [640, 420, 1.12]
  cues.push(
    cam('cam_wide0', 0, ...WIDE, 0),
    cam('cam_ally', 7.5, 470, 470, 1.65, 0.9),
    cam('cam_wide1', 12.2, ...WIDE, 0.8),
    cam('cam_fight0', ROLLS[0] - 0.6, ...FIGHT, 0.7),
    cam('cam_equip', EQUIP_AT - 1.05, 470, 470, 1.65, 0.7),
    cam('cam_fight1', ROLLS[2] - 0.7, ...FIGHT, 0.7),
    cam('cam_outro', SUMMARY, 640, 400, 1.08, END - SUMMARY, 'linear'),
  )

  // ── แสงตอนใส่เกียร์ ──
  const LIGHT_SCALE = 2.2, LIGHT_SPEED = 0.8, LIGHT_DUR = 23 / 30 / LIGHT_SPEED
  const ally = scene.actors.find(a => a.id === ALLY)
  scene.assets.push({
    id: 'fx_light_b', type: 'ranger', source: 'upload', name: 'icon_ab_light_eff2_b', body: 'body',
    sets: { body: { sam: '/api/res/icon_ab_light_eff2/icon_ab_light_eff2_b.sam', plist: '/api/res/icon_ab_light_eff2/icon_ab_light_eff2_b.plist', png: '/api/res/icon_ab_light_eff2/icon_ab_light_eff2_b.png' } },
  })
  scene.actors.unshift({
    ...clone(ally), id: 'a_light_b', name: 'fx_light_b', assetId: 'fx_light_b', tag: 'prop', y: ally.y + (785 - 560) * LIGHT_SCALE / 3.2,
    flip: false, idleClip: 'start', loop: false, muted: true, scale: LIGHT_SCALE,
  })
  cues.push(
    { id: 'light_once', type: 'anim', actorId: 'a_light_b', start: EQUIP_AT, clip: 'start', speed: LIGHT_SPEED, loop: false, hold: true, duration: LIGHT_DUR },
    { id: 'show_light_b', type: 'show', actorId: 'a_light_b', start: EQUIP_AT, duration: LIGHT_DUR, fadeIn: 0.05, fadeOut: 0.2 },
  )

  // ── เสียง: เพลง · ใส่เกียร์ · วงล้อ (เฉพาะรอบที่ใส่เกียร์ — 0% เกมไม่สุ่ม) ──
  const sound = (id, name, file) => ({ id, type: 'audio', name, url: `/api/res/_raw/sounds/${file}` })
  scene.assets.push(
    sound('snd_bgm', 'bgm_lobby2', 'bgm_lobby2_20151123104811121.ogg'),
    sound('snd_equip', 'gear_equip', 'gear_equip_20151123104728600.ogg'),
    sound('snd_spin', 'roulette_spin', 'roulette_spin_20230820235101402.ogg'),
    sound('snd_win', 'slot_result_success', 'labyrinth_revivalstage_slot_result_success_20240220133016681.ogg'),
    sound('snd_lose', 'slot_result_fail', 'labyrinth_revivalstage_slot_result_fail_20240220133014809.ogg'),
  )
  const sfx = (id, assetId, start, volume = 1, extra = {}) =>
    ({ id, type: 'sound', actorId: '__audio', start, assetId, volume, offset: 0, duration: 0, fadeIn: 0, fadeOut: 0, ...extra })
  cues.push(
    sfx('bgm', 'snd_bgm', 0, 1, { duration: END, fadeIn: 1, fadeOut: 2 }),
    sfx('sfx_equip', 'snd_equip', EQUIP_AT),
    ...ROLLS.slice(2).flatMap((r, i) => {
      const k = i + 2
      return [
        sfx(`sfx_spin${k}`, 'snd_spin', r + SPIN_FROM, 0.8, { duration: SPIN_TO - SPIN_FROM, fadeOut: 0.15 }),
        sfx(`sfx_result${k}`, ROLL_OK[k] ? 'snd_win' : 'snd_lose', r + SPIN_TO + (ROLL_OK[k] ? FOLLOW : 0), 0.9),
      ]
    }),
  )
  scene.cues = cues
  return scene
}

const fs = require('fs')
const [inPath, outPath] = process.argv.slice(2)
if (!inPath || !outPath) throw new Error('usage: node build-blitz-scene.cjs <base.anme.json> <out.anme.json>')
const scene = buildScene(JSON.parse(fs.readFileSync(inPath, 'utf8')))
fs.writeFileSync(outPath, JSON.stringify(scene, null, 1) + '\n')
console.log('wrote', outPath, scene.cues.length, 'cues ·', ROLLS.map((r, k) => `roll${k}@${r}=${ROLL_OK[k]}`).join(' '))
