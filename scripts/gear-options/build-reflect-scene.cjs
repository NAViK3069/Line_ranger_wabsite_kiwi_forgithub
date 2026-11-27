// วิดีโอ อัตราสะท้อนการโจมตีกายภาพ (phys-reflect) / เวทมนตร์ (mag-reflect)
//   เรา (ซ้าย, Executor Anubis Brown) ใส่เกียร์สะท้อน · ศัตรู (ขวา, Brown พรานจระเข้ u1317e-brown) ใส่เกียร์ ATK เต็มที่ เป็นฝ่ายตี
//   ใช้ฉาก/จังหวะเดียวกับวิดีโอ DEF (build-def-scene.cjs): รอบ 1 ตีปกติ · 2 สกิล (ตาย) · ใส่เกียร์ · 3 ตีปกติ · 4 สกิล (ตาย)
//   กฎของเกม (UnitNode vfunc 0x418 = 0xceb7b4 → 0xcebad8): โดนดาเมจแบบ kind 3 (ตีปกติ 0xced4d8) → สะท้อนกลับใส่ผู้ตี
//     ดาเมจสะท้อน = ตัดเศษ(ดาเมจที่โดน × (สะท้อนกายภาพ + บัฟ)) + ตัดเศษ(ดาเมจที่โดน × สะท้อนเวท) · ส่งเป็นดาเมจตรง (vfunc 0x3f8 ไม่ผ่าน DEF)
//     ทักษะ (kind 1) ไปอีกทาง (0xd07278) ที่ไม่อ่านค่าสะท้อนจากเกียร์ → ทักษะไม่สะท้อน
// overlay: src/app/gear-options/tutorials/reflect.tsx
// Run: node scripts/gear-options/build-reflect-scene.cjs <phys-reflect|mag-reflect> scripts/gear-options/atk-base.anme.json public/gear-options/scenes/<mode>.anme.json
const { ALLY, ENEMY, run, gameAttack } = require('./scene-lib.cjs')

const MODE = process.argv[2]
if (!['phys-reflect', 'mag-reflect'].includes(MODE)) throw new Error('mode: phys-reflect | mag-reflect')
process.argv.splice(2, 1)   // run() อ่าน <base> <out> จาก argv[2..3]

const ATTACKER = 'u1317e-brown'
const ATTACKER_FILES = ['bul', 'bul3']   // ไฟล์กระสุนที่มีจริงใน res/u1317e-brown/ (ไม่มี bul2)

run({
  name: MODE === 'phys-reflect' ? "Physical ATK Reflect — [TS] Shion's Suit" : "Magical ATK Reflect — [TS2] Shuna's Robes",
  rangers: {
    [ALLY]: { id: 'u1242e-brown', name: 'Brown อนูบิสเพชฌฆาต' },
    [ENEMY]: { id: ATTACKER, name: 'Brown พรานจระเข้' },
  },
  attacker: ENEMY,
  victim: ALLY,
  normal: gameAttack(ATTACKER, 'normal', ATTACKER_FILES),
  skill: gameAttack(ATTACKER, 'skill2', ATTACKER_FILES),
  skillHitOffset: 2.068,
  dies: [true, true],     // สกิลแรงกว่า HP ทั้งก่อน/หลังใส่เกียร์ (เกียร์สะท้อนไม่ช่วยกันสกิล)
  respawn: 34.4,
  respawnFade: 0.5,
})
