// ====================================================
// ตัวสร้างฉากวิดีโอสอนออพชั่นเกียร์ (ใช้ร่วมทุกวิดีโอ) — จากฉาก Video Studio ต้นฉบับของผู้ใช้ (atk-base.anme.json):
//   เก็บเรนเจอร์ 2 ตัว + กระสุน/เสียงที่จูนไว้ (คิว "โจมตีปกติ" / "สกิล 1") แล้วจัดเวลา/กล้องใหม่ให้ตรงกับ
//   src/app/gear-options/tutorials/kit.tsx (const TL) — แก้เวลาต้องแก้ทั้งสองไฟล์
//
// buildScene(src, cfg)
//   cfg.name                ชื่อฉาก
//   cfg.rangers             { [actorId]: { id, name } } — เรนเจอร์ที่ยืนแต่ละตำแหน่ง (ซ้าย = ALLY = ตัวที่ใส่เกียร์ · ขวา = ENEMY)
//   cfg.attacker / victim   actor ที่ตี / โดนตี (คิวตีทั้ง 4 รอบ)
//   cfg.dies                [ตายตอนสกิลรอบ 2, ตายตอนสกิลรอบ 4] — ดาเมจสกิล ≥ HP ของฝั่งที่โดน (โจมตีปกติไม่ถึงตาย)
//   cfg.respawn             เวลาที่ฝั่งโดนตีกลับมา หลังตายรอบ 2 (fade in cfg.respawnFade วิ)
//   cfg.normal / cfg.skill  คิวโจมตีปกติ / สกิลของผู้ตี (ไม่ใส่ = ใช้คิวที่จูนไว้ในฉากต้นฉบับ) — สร้างจาก gameAttack()
//   cfg.skillHitOffset      คิวสกิลเริ่ม → กระสุนโดน (วินาที) ของผู้ตีตัวนั้น · ไม่ใส่ = HIT_OFFSET ของฉากต้นฉบับ
// ====================================================
const ALLY = 'ak1zzx9ceu', ENEMY = 'a9ijjdi134'

// ── เวลา (ต้องตรงกับ TL ใน kit.tsx) ──
const T = {
  atkBefore: 21.2,      // รอบ 1: โจมตีปกติ ไม่ใส่เกียร์
  skillBefore: 29.8,    // รอบ 2: สกิล ไม่ใส่เกียร์
  equip: 35.95,         // เกียร์ลงช่อง → แสงหลังเรนเจอร์
  atkAfter: 39.3,       // รอบ 3: โจมตีปกติ ใส่เกียร์
  skillAfter: 42.9,     // รอบ 4: สกิล ใส่เกียร์
  summary: 48.0,
  end: 55,
}
const HIT_OFFSET = 1.533   // คิวสกิลเริ่ม → กระสุนโดน (วัดจากไทม์ไลน์ของตัวเล่น)
// นับจากจังหวะโดน: knockback (≈ 1.2–1.33 วิ) → ค้างเฟรมสุดท้าย → จางหาย 0.15 วิ · soul = วิญญาณออก + เสียงตาย (ตรงกับ DEATH ใน kit.tsx)
const DEATH = { knock: 0.02, fadeFrom: 1.4, fadeTo: 1.55, soul: 1.4 }
const BGM_VOLUME = 0.5

const clone = o => JSON.parse(JSON.stringify(o))

// ── ท่าโจมตีจากข้อมูลเกม (public/data/ranger/projectile/<id>.json) → คิวสกิลของ Video Studio ──
//   กระสุนใช้ fx.game = วิถีแบบในเกมเป๊ะ (ถอดจาก libgame.so — ดู SkillFx.game ใน src/anme/engine/types.ts)
//   kind: 'normal' | 'skill1' | 'skill2' · คืน { cue (ส่วนที่ทับคิวต้นฉบับ), assets (เสียง) }
const CLIP = { normal: 'attack', skill1: 's_attack', skill2: 's2_attack' }
const HIT_RATE = { normal: 'normalHitPointRate', skill1: 'skill1HitPointRate', skill2: 'skill2HitPointRate' }
function gameAttack(rangerId, kind) {
  const d = require(`../../public/data/ranger/projectile/${rangerId}.json`)
  const u = d.unit, k = u[kind]
  if (!k) throw new Error(`${rangerId} has no ${kind}`)
  const m = k.motion ?? {}
  if (!m.enabled || !(k.moveSpeed > 0)) throw new Error(`${rangerId} ${kind}: not a flying projectile`)
  const sound = (url, tag) => {
    if (!url) return null
    const file = url.split('/').pop()
    return { id: `snd_${kind}_${tag}`, type: 'audio', name: file.replace(/_\d+\.ogg$/, ''), url: `/api/res/_raw/sounds/${file}` }
  }
  const snd = d.soundUrls?.[kind] ?? {}
  const prep = sound(snd.preparation, 'prep'), hit = sound(snd.underAttack, 'hit')
  const clip = CLIP[kind]
  return {
    assets: [prep, hit].filter(Boolean),
    cue: {
      cast: [`${clip}_ready`],
      release: clip,
      fx: {
        set: k.animationPart, mode: 'projectile', flight: 'normal', finish: 'finish',
        game: {
          // เกมตัดสินทรงวิถีจาก attackType: WEAPON / ENERGY / DOUBLE = เส้นตรง · อื่นๆ = โค้ง (ดู gameMotionOf)
          motion: ['WEAPON', 'ENERGY', 'DOUBLE'].includes(k.attackType) ? 'LINEAR' : 'CURVE',
          start: { x: k.start.x, y: k.start.y },
          angle: { start: k.angle?.start ?? 0, end: k.angle?.end ?? 0 },
          moveSpeed: k.moveSpeed,
          hitRate: u.hitTiming?.[HIT_RATE[kind]] ?? 100,
        },
      },
      gameSounds: [
        prep && { assetId: prep.id, at: 'cast', volume: 1, enabled: true },
        hit && { assetId: hit.id, at: 'impact', volume: 1, enabled: true },
      ].filter(Boolean),
    },
  }
}
const mergeCue = (base, over) => (over ? { ...clone(base), ...clone(over), fx: { ...clone(base.fx), ...clone(over.fx ?? {}) } } : base)

function buildScene(src, cfg) {
  const baseAtk = src.cues.find(c => c.label === 'โจมตีปกติ')
  const baseSk1 = src.cues.find(c => c.label === 'สกิล 1')
  if (!baseAtk || !baseSk1) throw new Error('cues not found')
  const atk = mergeCue(baseAtk, cfg.normal?.cue)
  const sk1 = mergeCue(baseSk1, cfg.skill?.cue)
  const hitOffset = cfg.skillHitOffset ?? HIT_OFFSET
  if (!src.actors.find(a => a.id === ALLY) || !src.actors.find(a => a.id === ENEMY)) throw new Error('actors missing')
  const { attacker, victim } = cfg

  const cue = (base, id, start, label) => ({ ...clone(base), id, start, label, actorId: attacker, targetId: victim })
  // กล้องต้องไม่เห็นเลยขอบแผนที่ — บีบจุดกลางให้กรอบภาพ (เวที ÷ ซูม) อยู่ในเวทีเสมอ
  const W = src.width ?? 1280, H = src.height ?? 720
  const clampTo = (v, half, size) => Math.min(Math.max(v, half), size - half)
  const cam = (id, start, x, y, zoom, duration, ease = 'easeInOut') => ({
    id, type: 'camera', actorId: '__camera', start,
    center: { x: clampTo(x, W / 2 / zoom, W), y: clampTo(y, H / 2 / zoom, H) }, zoom, duration, ease,
  })
  const show = (id, actorId, start, duration, fadeIn, fadeOut) => ({ id, type: 'show', actorId, start, duration, fadeIn, fadeOut })
  const anim = (id, actorId, start, clip, duration, speed = 1) => ({ id, type: 'anim', actorId, start, clip, speed, loop: false, hold: true, duration })

  // stage points: ALLY feet (358, 560), ENEMY feet (898, 560)
  const WIDE = [640, 360, 1]
  const SKILL_CAM = [660, 420, 1.12]
  const scene = {
    ...clone(src),
    name: cfg.name,
    duration: T.end,
    cues: [
      cam('cam_wide0', 0, ...WIDE, 0),
      cam('cam_ally', 7.5, 470, 470, 1.65, 0.9),       // ALLY left of centre → card on the right
      cam('cam_enemy', 11.9, 790, 470, 1.65, 0.9),     // ENEMY right of centre → card on the left
      cam('cam_wide1', 15.9, ...WIDE, 0.8),
      cue(atk, 'atk_before', T.atkBefore, 'Normal (no gear)'),
      // skill formula card 24.4–29.3 (wide), then the skill without gear
      cam('cam_skill0', T.skillBefore - 0.6, ...SKILL_CAM, 0.8),
      cue(sk1, 'skill_before', T.skillBefore, 'Skill 1 (no gear)'),
      cam('cam_equip', T.equip - 1.05, 470, 470, 1.65, 0.7),   // equip close-up — gear glow only, the ranger stays idle
      cam('cam_wide2', T.atkAfter - 0.8, ...WIDE, 0.7),
      cue(atk, 'atk_after', T.atkAfter, 'Normal (gear)'),
      cam('cam_skill1', T.skillAfter - 0.6, ...SKILL_CAM, 0.8),
      cue(sk1, 'skill_after', T.skillAfter, 'Skill 1 (gear)'),
      cam('cam_wide3', T.skillAfter + hitOffset + 2.9, ...WIDE, 0.6),
      // slow push-in under the summary — also makes the scene run to the end (the player ends after the last cue)
      cam('cam_outro', T.summary, 640, 400, 1.08, T.end - T.summary, 'linear'),
    ],
  }

  // ── เรนเจอร์แต่ละตำแหน่ง: ใช้ asset เดิมในฉากถ้ามีตัวนั้นอยู่แล้ว ไม่งั้นทำสำเนา asset ของตำแหน่งนั้นแล้วเปลี่ยนตัว ──
  const baseAssets = scene.assets
  for (const [actorId, r] of Object.entries(cfg.rangers)) {
    const actor = scene.actors.find(a => a.id === actorId)
    let def = baseAssets.find(a => a.type === 'ranger' && a.rangerId === r.id)
    if (!def) {
      def = { ...clone(baseAssets.find(a => a.id === actor.assetId)), id: `r_${r.id}`, rangerId: r.id, name: r.name }
      baseAssets.push(def)
    }
    actor.assetId = def.id
    actor.name = r.name
  }
  // asset เรนเจอร์ที่ไม่มีใครใช้แล้ว → ทิ้ง (ไม่งั้นตัวเล่นจะโหลดไฟล์ตัวนั้นเปล่าๆ)
  scene.assets = baseAssets.filter(a => a.type !== 'ranger' || scene.actors.some(x => x.assetId === a.id))

  // ── แสงตอนใส่เกียร์ (res/icon_ab_light_eff2_b = sunburst) หลังตัวที่ใส่เกียร์ (ALLY) — เล่นครั้งเดียว ──
  // (_f เป็นกรอบสี่เหลี่ยมสำหรับไอคอนความสามารถ ไม่ใช้กับตัวเรนเจอร์)
  const LIGHT_SCALE = 2.2
  const LIGHT_SPEED = 0.8
  const LIGHT_DUR = 23 / 30 / LIGHT_SPEED      // คลิป start = 23 เฟรม
  const LIGHT_Y = 560 + (785 - 560) * LIGHT_SCALE / 3.2   // ให้กลางแสงตกกลางตัวเรนเจอร์ (วัดไว้ที่สเกล 3.2 → y 785)
  const layer = 'b'
  scene.assets.push({
    id: 'fx_light_b', type: 'ranger', source: 'upload', name: `icon_ab_light_eff2_${layer}`, body: 'body',
    sets: { body: { sam: `/api/res/icon_ab_light_eff2/icon_ab_light_eff2_${layer}.sam`, plist: `/api/res/icon_ab_light_eff2/icon_ab_light_eff2_${layer}.plist`, png: `/api/res/icon_ab_light_eff2/icon_ab_light_eff2_${layer}.png` } },
  })
  const allyActor = scene.actors.find(a => a.id === ALLY)
  scene.depthSort = false            // ลำดับวาด = ลำดับใน actors: แสง → เรนเจอร์ (ทุกตัวยืนเส้นพื้นเดียวกัน)
  scene.actors.unshift({
    ...clone(allyActor), id: 'a_light_b', name: 'fx_light_b', assetId: 'fx_light_b', tag: 'prop', y: LIGHT_Y,
    flip: false, idleClip: 'start', loop: false, muted: true, scale: LIGHT_SCALE,
  })
  scene.cues.push(
    anim('light_once', 'a_light_b', T.equip, 'start', LIGHT_DUR, LIGHT_SPEED),
    show('show_light_b', 'a_light_b', T.equip, LIGHT_DUR, 0.05, 0.2),
  )

  // ── ตาย: knockback ค้างท่าสุดท้าย → จางหาย (ชั้นซ้อนแสดงวิญญาณ) · ตายรอบ 2 แล้วกลับมาตอน cfg.respawn ──
  const hits = [T.skillBefore + hitOffset, T.skillAfter + hitOffset]
  const fadeOut = DEATH.fadeTo - DEATH.fadeFrom
  let segStart = 0, segFade = 0, open = false
  hits.forEach((hit, i) => {
    if (!cfg.dies[i]) return
    scene.cues.push(anim(`victim_knockback${i}`, victim, hit + DEATH.knock, 'knockback', DEATH.fadeTo - DEATH.knock))
    scene.cues.push(show(`show_victim${i}`, victim, segStart, hit + DEATH.fadeTo - segStart, segFade, fadeOut))
    open = false
    if (i === 0) { segStart = cfg.respawn; segFade = cfg.respawnFade ?? 0.4; open = true }
  })
  if (open) scene.cues.push(show('show_victim_end', victim, segStart, T.end - segStart, segFade, 0))

  // ── เสียง (ไฟล์เสียงของเกมบน lerico) ──
  //   เพลงพื้นหลัง bgm_lobby2 (61 วิ ยาวกว่าคลิป) · เสียงใส่เกียร์ตอนเกียร์ลงช่อง · เสียงตายตอนวิญญาณออกจากร่าง
  const sound = (id, name, file) => ({ id, type: 'audio', name, url: `/api/res/_raw/sounds/${file}` })
  for (const a of [...(cfg.normal?.assets ?? []), ...(cfg.skill?.assets ?? [])]) {
    if (!scene.assets.some(x => x.id === a.id)) scene.assets.push(a)
  }
  scene.assets.push(
    sound('snd_bgm', 'bgm_lobby2', 'bgm_lobby2_20151123104811121.ogg'),
    sound('snd_equip', 'gear_equip', 'gear_equip_20151123104728600.ogg'),
    sound('snd_death', 'death', 'death_20140603152639586.ogg'),
  )
  const sfx = (id, assetId, start, volume = 1, extra = {}) =>
    ({ id, type: 'sound', actorId: '__audio', start, assetId, volume, offset: 0, duration: 0, fadeIn: 0, fadeOut: 0, ...extra })
  scene.cues.push(
    sfx('bgm', 'snd_bgm', 0, BGM_VOLUME, { duration: T.end, fadeIn: 1, fadeOut: 2 }),
    sfx('sfx_equip', 'snd_equip', T.equip),
    ...hits.flatMap((hit, i) => (cfg.dies[i] ? [sfx(`sfx_death${i}`, 'snd_death', hit + DEATH.soul)] : [])),
  )
  return scene
}

/** อ่านฉากต้นฉบับ → สร้าง → เขียนไฟล์ (เรียกจาก build-*-scene.cjs) */
function run(cfg) {
  const fs = require('fs')
  const [inPath, outPath] = process.argv.slice(2)
  if (!inPath || !outPath) throw new Error('usage: node build-<name>-scene.cjs <base.anme.json> <out.anme.json>')
  const scene = buildScene(JSON.parse(fs.readFileSync(inPath, 'utf8')), cfg)
  fs.writeFileSync(outPath, JSON.stringify(scene, null, 1) + '\n')
  console.log('wrote', outPath, scene.cues.length, 'cues')
}

module.exports = { ALLY, ENEMY, T, DEATH, buildScene, run, gameAttack }
