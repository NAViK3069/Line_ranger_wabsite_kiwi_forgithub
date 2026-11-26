// ====================================================
// วิดีโอ อัตราโจมตีโดนแน่นอน (surehit — ตีปกติ) / อัตราโจมตีโดนแน่นอนของทักษะ (skill-surehit — ทักษะ)
//   ผู้ตี (ซ้าย ใส่เกียร์) Brown ตำนานร็อค · เป้า (ขวา) Ares Cony ใส่ชุดหลบสูงสุด → หลบติดเพดาน 99%
//   ไม่ใส่เกียร์ 2 ครั้ง (โอกาสโดน 6% → MISS ทั้งคู่) → ใส่อาวุธโดนแน่นอน → 2 ครั้ง: ติด = โดนแน่นอน · ไม่ติด = สุ่มหลบปกติ → MISS
// overlay: src/app/gear-options/tutorials/surehit.tsx (ROLLS / EQUIP_AT ต้องตรงกัน)
// Run: node scripts/gear-options/build-surehit-scene.cjs <surehit|skill-surehit> scripts/gear-options/atk-base.anme.json public/gear-options/scenes/<mode>.anme.json
//
// กฎของเกม (ถอดจาก libgame.so):
//   ตีปกติ 0xced0e0 / ทักษะ 0xcf132c (คืน 1 = พลาด):
//     S = โดนแน่นอนของผู้ตี (CLN_AVD 0x28 getter 0x8d0 · ทักษะ CLN_SKLAVD 0x29 getter 0x8e0) > 0 → สุ่ม 0–1 < S
//     C = ต้านการโจมตีของเป้า (FIX_AVD 0x2c getter 0x900 · ทักษะ FIX_SKLAVD 0x2d getter 0x910) > 0 → สุ่ม 0–1 < C
//     S ติด C ไม่ติด → โดนแน่นอน · C ติด S ไม่ติด → พลาดแน่นอน · อื่นๆ → สุ่มหลบปกติ:
//       หลบ = min(0.99, หลบ + เกียร์ + บัฟ) · โอกาสโดน % = (100 − หลบ%) × (1 + แม่นยำ) + โบนัสคู่ธาตุ × 100 · สุ่ม 1–100 ≤ โอกาสโดน = โดน
// ====================================================
const { ALLY, ENEMY, gameAttack } = require('./scene-lib.cjs')

const MODE = process.argv[2]
if (!['surehit', 'skill-surehit', 'skill-cancel'].includes(MODE)) throw new Error('mode: surehit | skill-surehit | skill-cancel')
const SKILL = MODE !== 'surehit'
// skill-cancel: ตัวใส่เกียร์ = เป้า (Ares Cony อยู่ซ้าย ใส่เกียร์ต้าน) · Brown ตำนานร็อค (ขวา) ยิงทักษะใส่
const CANCEL = MODE === 'skill-cancel'
const SHOOTER = 'u1260e-brown'
const RANGERS = CANCEL
  ? { [ALLY]: { id: 'u1002e-cony', name: 'Ares Cony' }, [ENEMY]: { id: SHOOTER, name: 'Brown ตำนานร็อค' } }
  : { [ALLY]: { id: SHOOTER, name: 'Brown ตำนานร็อค' }, [ENEMY]: { id: 'u1002e-cony', name: 'Ares Cony' } }
const ATTACKER = CANCEL ? ENEMY : ALLY, TARGET = CANCEL ? ALLY : ENEMY
// ผลแต่ละรอบ (true = โดน) · 2 รอบแรกไม่ใส่เกียร์ (โดน 6%) · 2 รอบหลังใส่เกียร์ (โดนแน่นอนติด / ไม่ติด → หลบได้)
// skill-cancel: ไม่ใส่ โดน 96% (โดน, โดน) · ใส่เกียร์ ต้าน 24% (ต้านติด → MISS, ไม่ติด → สุ่มหลบ โดน)
//   + รอบ 5: ผู้ยิงใส่ "โดนแน่นอนของทักษะ" 24% → ต้านติด + โดนแน่นอนติด พร้อมกัน = หักล้าง → สุ่มหลบปกติ → โดน
const ROLL_OK = CANCEL ? [true, true, false, true, true] : [false, false, true, false]
// รอบที่ขั้นแรกไม่ตัดสินผล → ต้องหมุนวงล้อหลบปกติต่อ (แถวที่ 2 ใน rollstack.tsx)
const FALLBACK = CANCEL ? [false, false, false, true, true] : [false, false, false, true]

// ── เวลา (ต้องตรงกับ surehit.tsx) ──
// แผงของรอบปกติ st → st+4.7 · รอบที่ต้องสุ่มหลบต่อ st → st+6.6 — เว้นระยะไม่ให้ทับการ์ด/รอบอื่น
const ROLLS = CANCEL ? [18.6, 22.6, 30.6, 36.0, 46.6] : [18.6, 22.6, 30.6, 36.0]
const SPIN = { from: 0.3, to: 1.9 }, ACT = 2.1
const EQUIP_AT = 28.6
const EQUIP2_AT = 44.3                   // skill-cancel: ผู้ยิงใส่เกียร์โดนแน่นอนของทักษะ
const SUMMARY = CANCEL ? 54 : 43.4, END = CANCEL ? 62 : 51
/** แถวที่ 2 ของวงล้อ (ตรงกับ ROW2 ใน rollstack.tsx) — รอบที่ต้องสุ่มหลบต่อ ผู้ตีลงมือหลังวงล้อนี้หยุด */
const ROW2 = { from: 2.15, to: 3.75 }
const row2 = r => [r + ROW2.from, r + ROW2.to]
const actAt = k => ROLLS[k] + (FALLBACK[k] ? ROW2.to + 0.25 : ACT)

const clone = o => JSON.parse(JSON.stringify(o))
const mergeCue = (base, over) => ({ ...clone(base), ...clone(over), fx: over.fx === null ? null : { ...clone(base.fx), ...clone(over.fx ?? {}) } })

function buildScene(src) {
  const baseAtk = src.cues.find(c => c.label === 'โจมตีปกติ')
  const baseSk1 = src.cues.find(c => c.label === 'สกิล 1')
  if (!baseAtk || !baseSk1) throw new Error('base cues missing')
  const W = src.width ?? 1280, H = src.height ?? 720
  const scene = { ...clone(src), name: CANCEL ? 'Skill Attack Cancel Rate — Ares Cony' : SKILL ? 'Skill Surehit Rate — Brown' : 'Surehit Rate — Brown', duration: END, depthSort: false }

  for (const [actorId, r] of Object.entries(RANGERS)) {
    const actor = scene.actors.find(a => a.id === actorId)
    const def = { ...clone(src.assets.find(a => a.id === actor.assetId)), id: `r_${r.id}_${actorId}`, rangerId: r.id, name: r.name }
    scene.assets.push(def)
    actor.assetId = def.id
    actor.name = r.name
  }
  scene.assets = scene.assets.filter(a => a.type !== 'ranger' || scene.actors.some(x => x.assetId === a.id))

  // ── คิวลงมือแต่ละรอบ (id = roll_<k>) · MISS = ไม่สะดุ้ง ไม่แฟลช ไม่มีเสียงโดน ──
  const atk = SKILL ? gameAttack(SHOOTER, 'skill1') : gameAttack(SHOOTER, 'normal')
  for (const a of atk.assets) if (!scene.assets.some(x => x.id === a.id)) scene.assets.push(a)
  const act = mergeCue(SKILL ? baseSk1 : baseAtk, atk.cue)
  const cues = ROLL_OK.map((ok, k) => {
    const c = { ...clone(act), actorId: ATTACKER, targetId: TARGET, start: actAt(k), id: `roll_${k}`, label: ok ? `โดน #${k + 1}` : `MISS #${k + 1}` }
    if (!ok) {
      c.hitReact = false; c.flash = false
      c.gameSounds = (c.gameSounds ?? []).map(s => (s.at === 'impact' ? { ...s, enabled: false } : s))
    }
    return c
  })

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
    CANCEL ? cam('cam_target', 7.5, 470, 470, 1.65, 0.9) : cam('cam_target', 7.5, 810, 470, 1.65, 0.9),           // การ์ดเป้าหมายอยู่ซ้าย → เป้า (ขวา) ชิดขวา
    cam('cam_wide1', 12.2, ...WIDE, 0.8),
    cam('cam_fight0', ROLLS[0] - 0.6, ...FIGHT, 0.7),
    cam('cam_equip', EQUIP_AT - 1.05, 470, 470, 1.65, 0.7),
    cam('cam_fight1', ROLLS[2] - 0.7, ...FIGHT, 0.7),
    ...(CANCEL ? [
      cam('cam_equip2', EQUIP2_AT - 1.05, 810, 470, 1.65, 0.7),
      cam('cam_fight2', ROLLS[4] - 0.7, ...FIGHT, 0.7),
    ] : []),
    cam('cam_outro', SUMMARY, 640, 400, 1.08, END - SUMMARY, 'linear'),
  )

  // ── แสงตอนใส่เกียร์ (ผู้ตี) ──
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
  if (CANCEL) {
    // แสงใส่เกียร์ของผู้ยิง (ขวา)
    const enemy = scene.actors.find(a => a.id === ENEMY)
    scene.actors.unshift({
      ...clone(enemy), id: 'a_light_e', name: 'fx_light_e', assetId: 'fx_light_b', tag: 'prop', y: enemy.y + (785 - 560) * LIGHT_SCALE / 3.2,
      flip: false, idleClip: 'start', loop: false, muted: true, scale: LIGHT_SCALE,
    })
    cues.push(
      { id: 'light_once_e', type: 'anim', actorId: 'a_light_e', start: EQUIP2_AT, clip: 'start', speed: LIGHT_SPEED, loop: false, hold: true, duration: LIGHT_DUR },
      { id: 'show_light_e', type: 'show', actorId: 'a_light_e', start: EQUIP2_AT, duration: LIGHT_DUR, fadeIn: 0.05, fadeOut: 0.2 },
    )
  }

  // ── เสียง ──
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
    ...(CANCEL ? [sfx('sfx_equip2', 'snd_equip', EQUIP2_AT)] : []),
    ...ROLLS.flatMap((r, k) => [
      sfx(`sfx_spin${k}`, 'snd_spin', r + SPIN.from, 0.8, { duration: SPIN.to - SPIN.from, fadeOut: 0.15 }),
      // ผลของขั้นแรก: ตัดสินได้ = ผลดี/เสียของตัวใส่เกียร์ · ต้องไปสุ่มหลบ = เสียงไม่ติด (cancel รอบ 5 หักล้าง = เสียงติดทั้งคู่)
      sfx(`sfx_result${k}`, (FALLBACK[k] ? (CANCEL && k === 4) : (CANCEL ? !ROLL_OK[k] : ROLL_OK[k])) ? 'snd_win' : 'snd_lose', r + SPIN.to, 0.9),
      ...(FALLBACK[k] ? [
        sfx(`sfx_spin${k}b`, 'snd_spin', row2(r)[0], 0.8, { duration: row2(r)[1] - row2(r)[0], fadeOut: 0.15 }),
        sfx(`sfx_result${k}b`, (CANCEL ? !ROLL_OK[k] : ROLL_OK[k]) ? 'snd_win' : 'snd_lose', row2(r)[1], 0.9),
      ] : []),
    ]),
  )
  scene.cues = cues
  return scene
}

const fs = require('fs')
const [inPath, outPath] = process.argv.slice(3)
if (!inPath || !outPath) throw new Error('usage: node build-surehit-scene.cjs <mode> <base.anme.json> <out.anme.json>')
const scene = buildScene(JSON.parse(fs.readFileSync(inPath, 'utf8')))
fs.writeFileSync(outPath, JSON.stringify(scene, null, 1) + '\n')
console.log('wrote', outPath, scene.cues.length, 'cues ·', ROLL_OK.map((o, k) => `roll${k}@${ROLLS[k]}=${o}`).join(' '))
