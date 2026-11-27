// วิดีโอ ระยะโจมตี (Attack Range): Executor Anubis Brown (ซ้าย, ระยะ 100 pt) เดินเข้าหา Rock Legend Brown (ขวา ยืนนิ่ง) แล้วตีเมื่อเข้าระยะ
//   รอบ A ไม่ใส่เกียร์ · รอบ B ใส่เกียร์ระยะ +108.6% → ระยะ 100 + ตัดเศษ(100 × 1.086) = 208 pt → หยุดตีไกลกว่าเดิม
//   กฎของเกม:
//     เกียร์ ATK_RNGE_MUL (0x16) → โบนัส = ตัดเศษ(ระยะ × ค่ารวม) บวกเข้า attackRange (UnitData 0x160 — 0x1124fb4 + 0xd5dd24)
//     หาเป้า (0xcd6f90): ช่องตรวจจับ = [x ของเรา, x + ระยะ] · กรอบเป้า = [x − กว้าง/2, x + กว้าง/2] (กว้าง = กรอบเวที .sam) → ทับกัน = ในระยะ หยุดเดินแล้วตี
//   1 pt = 2 px · เดิน movingSpeed 110 pt/วิ = 220 px/วิ
// overlay: src/app/gear-options/tutorials/atk-range.tsx (ค่าคงที่ต้องตรงกัน)
// Run: node scripts/gear-options/build-range-scene.cjs scripts/gear-options/atk-base.anme.json public/gear-options/scenes/atk-range.anme.json
const fs = require('fs')
const { gameAttack } = require('./scene-lib.cjs')
const [inPath, outPath] = process.argv.slice(2)

const WALKER = { id: 'u1242e-brown', name: 'Brown อนูบิสเพชฌฆาต' }
const TARGET = { id: 'u1260e-brown', name: 'Brown ตำนานร็อค' }
const START_X = 150, TARGET_X = 1000, Y = 560
const TARGET_HALF_W = 70          // กรอบเวที u1260e-brown กว้าง 140 px
const SPEED_PX = 110 * 2
const RANGE_A = 100, RANGE_B = 100 + Math.trunc(100 * 1.086)   // 208
const stopX = r => TARGET_X - TARGET_HALF_W - r * 2
// ── เวลา (ตรงกับ atk-range.tsx) ──
const GO_A = 19.6, GO_B = 34.6, EQUIP_AT = 31.5, SUMMARY = 46.5, END = 54

const clone = o => JSON.parse(JSON.stringify(o))
const src = JSON.parse(fs.readFileSync(inPath, 'utf8'))
const allyTpl = src.actors.find(a => a.tag === 'ally'), enemyTpl = src.actors.find(a => a.tag === 'enemy')
const baseAtk = src.cues.find(c => c.label === 'โจมตีปกติ')
const mkAsset = (r, tpl) => ({ ...clone(src.assets.find(a => a.id === tpl.assetId)), id: `r_${r.id}`, rangerId: r.id, name: r.name })
const wAsset = mkAsset(WALKER, allyTpl), tAsset = mkAsset(TARGET, enemyTpl)
const atk = gameAttack(WALKER.id, 'normal')
const actors = [
  { ...clone(enemyTpl), id: 'target', name: TARGET.name, assetId: tAsset.id, x: TARGET_X, y: Y, flip: true, tag: 'enemy' },
  { ...clone(allyTpl), id: 'walker_a', name: `${WALKER.name} A`, assetId: wAsset.id, x: START_X, y: Y, flip: false, tag: 'ally' },
  { ...clone(allyTpl), id: 'walker_b', name: `${WALKER.name} B`, assetId: wAsset.id, x: START_X, y: Y, flip: false, tag: 'ally_b' },
]
const cues = []
const round = (actor, go, range, showFrom, showTo) => {
  const sx = stopX(range)
  const walk = (sx - START_X) / SPEED_PX
  cues.push(
    { id: `show_${actor}`, type: 'show', actorId: actor, start: showFrom, duration: showTo - showFrom, fadeIn: 0.3, fadeOut: 0.3 },
    { id: `walk_${actor}`, type: 'move', actorId: actor, start: go, to: { x: sx, y: Y }, duration: +walk.toFixed(3), ease: 'linear', clip: 'walk' },
  )
  const hit = { ...clone(baseAtk), ...clone(atk.cue), id: `hit_${actor}`, actorId: actor, targetId: 'target', start: +(go + walk + 0.15).toFixed(3), label: `ตี ${actor}` }
  hit.fx = atk.cue.fx === null ? null : { ...clone(baseAtk.fx ?? {}), ...clone(atk.cue.fx ?? {}) }
  cues.push(hit, { ...clone(hit), id: `hit2_${actor}`, start: +(go + walk + 1.6).toFixed(3) })
  return { stop: sx, walk }
}
const A = round('walker_a', GO_A, RANGE_A, 0, EQUIP_AT - 1.5)
const B = round('walker_b', GO_B, RANGE_B, EQUIP_AT - 1.2, END)
// ── กล้อง ──
const W = src.width ?? 1280, H = src.height ?? 720
const clampTo = (v, half, size) => Math.min(Math.max(v, half), size - half)
const cam = (id, start, x, y, zoom, duration, ease = 'easeInOut') => ({ id, type: 'camera', actorId: '__camera', start, center: { x: clampTo(x, W / 2 / zoom, W), y: clampTo(y, H / 2 / zoom, H) }, zoom, duration, ease })
cues.push(cam('cam0', 0, 640, 400, 1.0, 0), cam('cam_outro', SUMMARY, 640, 400, 1.05, END - SUMMARY, 'linear'))
// ── แสงตอนใส่เกียร์หลังตัวเดิน (B) ──
const LIGHT_SCALE = 2.2, LIGHT_SPEED = 0.8, LIGHT_DUR = 23 / 30 / LIGHT_SPEED
const lightAsset = { id: 'fx_light_b', type: 'ranger', source: 'upload', name: 'icon_ab_light_eff2_b', body: 'body',
  sets: { body: { sam: '/api/res/icon_ab_light_eff2/icon_ab_light_eff2_b.sam', plist: '/api/res/icon_ab_light_eff2/icon_ab_light_eff2_b.plist', png: '/api/res/icon_ab_light_eff2/icon_ab_light_eff2_b.png' } } }
actors.unshift({ ...clone(allyTpl), id: 'a_light_b', name: 'fx_light_b', assetId: 'fx_light_b', tag: 'prop', x: START_X, y: Y + (785 - 560) * LIGHT_SCALE / 3.2, flip: false, idleClip: 'start', loop: false, muted: true, scale: LIGHT_SCALE })
cues.push(
  { id: 'light_once', type: 'anim', actorId: 'a_light_b', start: EQUIP_AT, clip: 'start', speed: LIGHT_SPEED, loop: false, hold: true, duration: LIGHT_DUR },
  { id: 'show_light_b', type: 'show', actorId: 'a_light_b', start: EQUIP_AT, duration: LIGHT_DUR, fadeIn: 0.05, fadeOut: 0.2 },
)
// ── เสียง ──
const sound = (id, name, file) => ({ id, type: 'audio', name, url: `/api/res/_raw/sounds/${file}` })
const sfx = (id, assetId, start, volume = 1, extra = {}) => ({ id, type: 'sound', actorId: '__audio', start, assetId, volume, offset: 0, duration: 0, fadeIn: 0, fadeOut: 0, ...extra })
const sounds = [sound('snd_bgm', 'bgm_lobby2', 'bgm_lobby2_20151123104811121.ogg'), sound('snd_equip', 'gear_equip', 'gear_equip_20151123104728600.ogg')]
cues.push(sfx('bgm', 'snd_bgm', 0, 1, { duration: END, fadeIn: 1, fadeOut: 2 }), sfx('sfx_equip', 'snd_equip', EQUIP_AT))
const keepAudio = src.assets.filter(a => a.type === 'audio')
const scene = { ...clone(src), name: 'Attack Range — Executor Anubis Brown', duration: END, depthSort: false, actors, assets: [wAsset, tAsset, lightAsset, ...keepAudio, ...sounds, ...atk.assets.filter(x => !keepAudio.some(k => k.id === x.id))], cues }
fs.writeFileSync(outPath, JSON.stringify(scene, null, 1) + '\n')
console.log('wrote', outPath, 'A stop', A.stop, 'walk', A.walk.toFixed(2), '· B stop', B.stop, 'walk', B.walk.toFixed(2), 'rangeB', RANGE_B)
