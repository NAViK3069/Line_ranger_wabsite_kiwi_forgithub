// ====================================================
// วิดีโออัตราแบบสุ่ม 3 ค่า (ใช้ฉากเดียวกัน — ซ้าย = ALLY = ตัวที่ใส่เกียร์ · ขวา = ENEMY):
//   skill-use   อัตราการใช้ทักษะ      Brown ตำนานร็อค ตี Brown อนูบิสเพชฌฆาต — สุ่มติด = ร่ายทักษะ · ไม่ติด = ตีปกติ
//   skill-evade อัตราการหลบทักษะ      Brown ตำนานร็อค ยิงทักษะใส่ Ares Cony (ตัวใส่เกียร์หลบ) — โดน / MISS
//   skill-hit   อัตราความแม่นยำทักษะ   Brown ตำนานร็อค (ตัวใส่เกียร์แม่นยำ) ยิงทักษะใส่ Ares Cony — โดน / MISS
// overlay: src/app/gear-options/tutorials/skill-rates.tsx (TL / ROLLS ต้องตรงกัน)
// Run: node scripts/gear-options/build-skillrate-scene.cjs <mode> scripts/gear-options/atk-base.anme.json public/gear-options/scenes/<mode>.anme.json
//
// กฎของเกม (ถอดจาก libgame.so):
//   ใช้ทักษะ (UnitNode 0x6e0 → 0xd02d84 → SkillData 0xd38934): ทุกครั้งที่ถึงจังหวะโจมตี สุ่มทักษะทีละตัว
//     โอกาส = probability ของทักษะ (+ Skill Use Rate จากเกียร์บวกเข้าไปตรงๆ) + บัฟ → ≥ 95% ตัดเหลือ 95% · ตัดเศษเป็น %
//     สุ่ม 0–99 < โอกาส และต้องพ้นเวลารอทักษะ (skillDelayTime) → ร่ายทักษะแทนตีปกติ · ไม่ติด → ตีปกติ
//   หลบทักษะ (UnitNode 0xd01fd8): หลบ = min(0.99 [MAX_SKILL_AVOID_FACTOR], skillAvoidProbability + Skill Evade Rate + บัฟ)
//     โอกาสโดน % = (100 − หลบ%) × (1 + ความแม่นยำทักษะของผู้ยิง) + ski_atk_acc ของคู่ธาตุ × 100 (UnitNode 0x4a0) · สุ่ม 1–100 ≤ โอกาสโดน → โดน · ไม่งั้น MISS
//     ความแม่นยำ = antiSkillAvoidProb + Skill Hit Rate จากเกียร์ + บัฟ (0xcf132c)
// ====================================================
const { ALLY, ENEMY, gameAttack } = require('./scene-lib.cjs')

const MODE = process.argv[2]
const MODES = {
  'skill-use': {
    name: 'Skill Use Rate — Brown',
    rangers: { [ALLY]: { id: 'u1260e-brown', name: 'Brown ตำนานร็อค' }, [ENEMY]: { id: 'u1242e-brown', name: 'Brown อนูบิสเพชฌฆาต' } },
    attacker: ALLY, target: ENEMY,
    // ผลสุ่มแต่ละรอบ: true = ใช้ทักษะ · ก่อนใส่ 35% (ไม่ติด, ติด) · หลังใส่ 95% (ติด, ไม่ติด 5%)
    rolls: [false, true, true, false],
  },
  'skill-evade': {
    name: 'Skill Evade Rate — Ares Cony',
    rangers: { [ALLY]: { id: 'u1002e-cony', name: 'Ares Cony' }, [ENEMY]: { id: 'u1260e-brown', name: 'Brown ตำนานร็อค' } },
    attacker: ENEMY, target: ALLY,
    // true = ทักษะโดน · ก่อนใส่ โดน 96% (โดน, MISS) · หลังใส่ โดน 6% (MISS, โดน)
    rolls: [true, false, false, true],
  },
  'skill-hit': {
    name: 'Skill Hit Rate — Brown',
    rangers: { [ALLY]: { id: 'u1260e-brown', name: 'Brown ตำนานร็อค' }, [ENEMY]: { id: 'u1002e-cony', name: 'Ares Cony' } },
    attacker: ALLY, target: ENEMY,
    // true = ทักษะโดน · ก่อนใส่ โดน 96% (MISS, โดน) · หลังใส่ ≥ 100% (โดน, โดน — พลาดไม่ได้)
    rolls: [false, true, true, true],
  },
  // ── ตีปกติ (overlay: normal-rates.tsx) — สุ่มหลบ/โดนแบบเดียวกับทักษะ แต่ใช้ค่าของตีปกติ (UnitNode 0xced0e0) ──
  evade: {
    name: 'Evade Rate — Ares Cony', normal: true,
    rangers: { [ALLY]: { id: 'u1002e-cony', name: 'Ares Cony' }, [ENEMY]: { id: 'u1260e-brown', name: 'Brown ตำนานร็อค' } },
    attacker: ENEMY, target: ALLY,
    // true = โดน · ก่อนใส่ โดน 96% (โดน, MISS) · หลังใส่ หลบ 99% → โดน 6% (MISS, โดน)
    rolls: [true, false, false, true],
  },
  'hit-rate': {
    name: 'Hit Rate — Brown', normal: true,
    rangers: { [ALLY]: { id: 'u1260e-brown', name: 'Brown ตำนานร็อค' }, [ENEMY]: { id: 'u1002e-cony', name: 'Ares Cony' } },
    attacker: ALLY, target: ENEMY,
    // true = โดน · ก่อนใส่ โดน 96% (MISS, โดน) · หลังใส่ 125% → พลาดไม่ได้ (โดน, โดน)
    rolls: [false, true, true, true],
  },
  'elem-hit': {
    name: 'Elemental Hit — Brown vs Elephant Soldier Brown', normal: true,
    rangers: { [ALLY]: { id: 'u1260e-brown', name: 'Brown ตำนานร็อค' }, [ENEMY]: { id: 'u1483e-brown', name: 'Brown นักรบช้าง' } },
    attacker: ALLY, target: ENEMY,
    // เป้า (มืด) ใส่เกียร์หลบเต็ม → หลบ 99% · true = โดน · ก่อนใส่ โดน 31% (MISS, โดน) · หลังใส่ 55% (โดน, โดน)
    rolls: [false, true, true, true],
  },
}
const cfg = MODES[MODE]
if (!cfg) throw new Error(`mode: ${Object.keys(MODES).join(' | ')}`)

// ── เวลา (ต้องตรงกับ TL ใน skill-rates.tsx) ──
const ROLLS = [18.6, 23.0, 30.6, 35.0]      // วงล้อโผล่ · หมุน +0.3 → +1.9 · ลงมือ +2.1
const SPIN = { from: 0.3, to: 1.9 }, ACT = 2.1
const EQUIP_AT = 28.6
const SUMMARY = 40.2, END = 48

const clone = o => JSON.parse(JSON.stringify(o))
const mergeCue = (base, over) => ({ ...clone(base), ...clone(over), fx: over.fx === null ? null : { ...clone(base.fx), ...clone(over.fx ?? {}) } })

function buildScene(src) {
  const baseAtk = src.cues.find(c => c.label === 'โจมตีปกติ')
  const baseSk1 = src.cues.find(c => c.label === 'สกิล 1')
  if (!baseAtk || !baseSk1) throw new Error('base cues missing')
  const W = src.width ?? 1280, H = src.height ?? 720
  const scene = { ...clone(src), name: cfg.name, duration: END, depthSort: false }

  // ── เรนเจอร์แต่ละตำแหน่ง (ทำสำเนา asset ของตำแหน่งนั้นแล้วเปลี่ยนตัว) ──
  for (const [actorId, r] of Object.entries(cfg.rangers)) {
    const actor = scene.actors.find(a => a.id === actorId)
    const def = { ...clone(src.assets.find(a => a.id === actor.assetId)), id: `r_${r.id}_${actorId}`, rangerId: r.id, name: r.name }
    scene.assets.push(def)
    actor.assetId = def.id
    actor.name = r.name
  }
  scene.assets = scene.assets.filter(a => a.type !== 'ranger' || scene.actors.some(x => x.assetId === a.id))

  // ── คิวลงมือแต่ละรอบ (id = roll_<k>) ──
  const shooter = cfg.rangers[cfg.attacker].id
  const atkN = gameAttack(shooter, 'normal'), atkS = gameAttack(shooter, 'skill1')
  for (const a of [...atkN.assets, ...atkS.assets]) if (!scene.assets.some(x => x.id === a.id)) scene.assets.push(a)
  const normal = mergeCue(baseAtk, atkN.cue), skill = mergeCue(baseSk1, atkS.cue)
  const actCue = (k, outcome) => {
    const start = ROLLS[k] + ACT
    const base = { actorId: cfg.attacker, targetId: cfg.target, start, id: `roll_${k}` }
    if (MODE === 'skill-use') return { ...clone(outcome ? skill : normal), ...base, label: outcome ? `ใช้ทักษะ #${k + 1}` : `ตีปกติ #${k + 1}` }
    // หลบ / แม่นยำ: ทุกรอบร่ายทักษะ (โหมดตีปกติ = ตีปกติ) · MISS = ไม่สะดุ้ง ไม่แฟลช ไม่มีเสียงโดน (ชั้นซ้อนแสดงป้าย MISS)
    const c = { ...clone(cfg.normal ? normal : skill), ...base, label: outcome ? `โดน #${k + 1}` : `MISS #${k + 1}` }
    if (!outcome) {
      c.hitReact = false; c.flash = false
      c.gameSounds = (c.gameSounds ?? []).map(s => (s.at === 'impact' ? { ...s, enabled: false } : s))
    }
    return c
  }
  const cues = cfg.rolls.map((o, k) => actCue(k, o))

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
    cam('cam_ally', 7.5, 470, 470, 1.65, 0.9),             // การ์ดเรนเจอร์อยู่ขวา → ตัวใส่เกียร์ (ซ้าย) ชิดซ้าย
    cam('cam_wide1', 12.2, ...WIDE, 0.8),
    cam('cam_fight0', ROLLS[0] - 0.6, ...FIGHT, 0.7),
    cam('cam_equip', EQUIP_AT - 1.05, 470, 470, 1.65, 0.7),
    cam('cam_fight1', ROLLS[2] - 0.7, ...FIGHT, 0.7),
    cam('cam_outro', SUMMARY, 640, 400, 1.08, END - SUMMARY, 'linear'),
  )

  // ── แสงตอนใส่เกียร์หลังตัวใส่เกียร์ (ALLY) ──
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

  // ── เสียง: เพลง · ใส่เกียร์ · วงล้อหมุน (roulette_spin) · ผลสุ่ม (slot result success / fail) ──
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
  // ผลดีของตัวใส่เกียร์: ใช้ทักษะ / แม่นยำ = โดน · หลบ = MISS
  const good = o => (MODE === 'skill-evade' || MODE === 'evade' ? !o : o)
  cues.push(
    sfx('bgm', 'snd_bgm', 0, 1, { duration: END, fadeIn: 1, fadeOut: 2 }),
    sfx('sfx_equip', 'snd_equip', EQUIP_AT),
    ...ROLLS.flatMap((r, k) => [
      sfx(`sfx_spin${k}`, 'snd_spin', r + SPIN.from, 0.8, { duration: SPIN.to - SPIN.from, fadeOut: 0.15 }),
      sfx(`sfx_result${k}`, good(cfg.rolls[k]) ? 'snd_win' : 'snd_lose', r + SPIN.to, 0.9),
    ]),
  )
  scene.cues = cues
  return scene
}

const fs = require('fs')
const [inPath, outPath] = process.argv.slice(3)
if (!inPath || !outPath) throw new Error('usage: node build-skillrate-scene.cjs <mode> <base.anme.json> <out.anme.json>')
const scene = buildScene(JSON.parse(fs.readFileSync(inPath, 'utf8')))
fs.writeFileSync(outPath, JSON.stringify(scene, null, 1) + '\n')
console.log('wrote', outPath, scene.cues.length, 'cues ·', cfg.rolls.map((o, k) => `roll${k}@${ROLLS[k]}=${o}`).join(' '))
