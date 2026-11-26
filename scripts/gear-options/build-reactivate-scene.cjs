// ====================================================
// วิดีโอ อัตราการใช้ทักษะอีกครั้ง (Skill Reactivation Rate): Brown ตำนานร็อค (ซ้าย ใส่เกียร์) ตี Brown อนูบิสเพชฌฆาต (ขวา)
//   ไม่ใส่เกียร์: ร่ายทักษะ (0% — เกมไม่สุ่ม) → จังหวะถัดไปตีปกติ
//   ใส่ [TR2] Block Fence +5 (+40.2%): ร่ายทักษะ → หมุนวงล้อ ติด → จังหวะถัดไปร่ายทักษะเดิมซ้ำ · รอบ 2 ไม่ติด → ตีปกติ
// overlay: src/app/gear-options/tutorials/skill-reactivate.tsx (ROUNDS / NEXT_GAP / EQUIP_AT ต้องตรงกัน)
// Run: node scripts/gear-options/build-reactivate-scene.cjs scripts/gear-options/atk-base.anme.json public/gear-options/scenes/skill-reactivate.anme.json
//
// กฎของเกม (ถอดจาก libgame.so — ฟังก์ชันจังหวะโจมตี UnitNode slot 0xcf8 = 0xd00f88):
//   เกียร์ DOUBLE_SKL_PROB_MUL (0x26) → doubleSkillProb ของยูนิต (UnitData setter 0x8c8 / getter 0x8c0)
//   ถึงจังหวะโจมตี:
//     มีทักษะที่จองไว้ (slot 0x6d0 = [unit+0x240]) → ร่ายทันที (0xd40) ไม่ผ่าน checkSkill = ไม่สุ่มโอกาสใช้ทักษะ ไม่เช็คเวลารอ (0xd033ec)
//       + ไอคอน doubleskill.png เหนือหัว (0xd01564) → ล้างการจอง · ไม่สุ่มต่อ (ซ้ำได้ครั้งเดียว)
//     ไม่มี → checkSkill (0xd00) ได้ทักษะ → ร่าย → สุ่ม arc4random()/2^32 < doubleSkillProb (0x193c540; 0 = ไม่สุ่ม)
//       ติด → จองทักษะที่เพิ่งร่าย (slot 0xd38) ไว้ใช้จังหวะถัดไป · ไม่ติด → ไม่จอง · ไม่ได้ทักษะ → ตีปกติ (0xcdc0c8)
// ====================================================
const { ALLY, ENEMY, gameAttack } = require('./scene-lib.cjs')

const SHOOTER = 'u1260e-brown'
const RANGERS = { [ALLY]: { id: SHOOTER, name: 'Brown ตำนานร็อค' }, [ENEMY]: { id: 'u1242e-brown', name: 'Brown อนูบิสเพชฌฆาต' } }
// รอบละ: ร่ายทักษะ (ตามปกติ) → จังหวะถัดไป · ok = ผลสุ่มใช้ทักษะอีกครั้ง (null = 0% ไม่สุ่ม)
const ROUNDS = [{ at: 18.6, ok: null }, { at: 30.6, ok: true }, { at: 38.0, ok: false }]
const NEXT_GAP = 3.4                        // ร่ายทักษะ → จังหวะโจมตีถัดไป
const SPIN_FROM = 0.3, SPIN_TO = 1.6         // วงล้อ (นับจากเริ่มร่าย)
const EQUIP_AT = 28.6
const SUMMARY = 45.2, END = 53

const clone = o => JSON.parse(JSON.stringify(o))
const mergeCue = (base, over) => ({ ...clone(base), ...clone(over), fx: over.fx === null ? null : { ...clone(base.fx), ...clone(over.fx ?? {}) } })

function buildScene(src) {
  const baseAtk = src.cues.find(c => c.label === 'โจมตีปกติ')
  const baseSk1 = src.cues.find(c => c.label === 'สกิล 1')
  if (!baseAtk || !baseSk1) throw new Error('base cues missing')
  const W = src.width ?? 1280, H = src.height ?? 720
  const scene = { ...clone(src), name: 'Skill Reactivation Rate — Brown', duration: END, depthSort: false }

  for (const [actorId, r] of Object.entries(RANGERS)) {
    const actor = scene.actors.find(a => a.id === actorId)
    const def = { ...clone(src.assets.find(a => a.id === actor.assetId)), id: `r_${r.id}_${actorId}`, rangerId: r.id, name: r.name }
    scene.assets.push(def)
    actor.assetId = def.id
    actor.name = r.name
  }
  scene.assets = scene.assets.filter(a => a.type !== 'ranger' || scene.actors.some(x => x.assetId === a.id))

  // ── คิว: skill_<k> (ร่ายตามปกติ) · next_<k> (จังหวะถัดไป: ทักษะซ้ำ / ตีปกติ) ──
  const atkN = gameAttack(SHOOTER, 'normal'), atkS = gameAttack(SHOOTER, 'skill1')
  for (const a of [...atkN.assets, ...atkS.assets]) if (!scene.assets.some(x => x.id === a.id)) scene.assets.push(a)
  const normal = mergeCue(baseAtk, atkN.cue), skill = mergeCue(baseSk1, atkS.cue)
  const base = { actorId: ALLY, targetId: ENEMY }
  const cues = ROUNDS.flatMap((r, k) => [
    { ...clone(skill), ...base, start: r.at, id: `skill_${k}`, label: `ทักษะ #${k + 1}` },
    r.ok
      ? { ...clone(skill), ...base, start: r.at + NEXT_GAP, id: `next_${k}`, label: `ใช้ทักษะอีกครั้ง #${k + 1}` }
      : { ...clone(normal), ...base, start: r.at + NEXT_GAP, id: `next_${k}`, label: `ตีปกติ #${k + 1}` },
  ])

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
    cam('cam_fight0', ROUNDS[0].at - 0.6, ...FIGHT, 0.7),
    cam('cam_equip', EQUIP_AT - 1.05, 470, 470, 1.65, 0.7),
    cam('cam_fight1', ROUNDS[1].at - 0.7, ...FIGHT, 0.7),
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

  // ── เสียง: เพลง · ใส่เกียร์ · วงล้อ (เฉพาะรอบที่ใส่เกียร์) ──
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
    ...ROUNDS.flatMap((r, k) => (r.ok == null ? [] : [
      sfx(`sfx_spin${k}`, 'snd_spin', r.at + SPIN_FROM, 0.8, { duration: SPIN_TO - SPIN_FROM, fadeOut: 0.15 }),
      sfx(`sfx_result${k}`, r.ok ? 'snd_win' : 'snd_lose', r.at + SPIN_TO, 0.9),
    ])),
  )
  scene.cues = cues
  return scene
}

const fs = require('fs')
const [inPath, outPath] = process.argv.slice(2)
if (!inPath || !outPath) throw new Error('usage: node build-reactivate-scene.cjs <base.anme.json> <out.anme.json>')
const scene = buildScene(JSON.parse(fs.readFileSync(inPath, 'utf8')))
fs.writeFileSync(outPath, JSON.stringify(scene, null, 1) + '\n')
console.log('wrote', outPath, scene.cues.length, 'cues ·', ROUNDS.map((r, k) => `round${k}@${r.at}=${r.ok}`).join(' '))
