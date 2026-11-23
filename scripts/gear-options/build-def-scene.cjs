// วิดีโอ DEF: ฝั่งเดียวกับวิดีโอ HP — เรา (ซ้าย, Executor Anubis Brown) ใส่ [MIKU] Snowman (DEF กายภาพ/เวท +438%)
//   ศัตรู (ขวา, Rock Legend Brown) ไม่ใส่เกียร์ เป็นฝ่ายตีเรา
//   DEF ลดดาเมจตีปกติ แต่สกิลไม่โดนลดด้วย DEF (ยืนยันจากโค้ดเกม) → โดนสกิลแล้วตายทั้ง 2 รอบ
// overlay: src/app/gear-options/tutorials/def.tsx (ALLY / ENEMY ต้องตรงกัน)
// Run: node scripts/gear-options/build-def-scene.cjs scripts/gear-options/atk-base.anme.json public/gear-options/scenes/def.anme.json
const { ALLY, ENEMY, run } = require('./scene-lib.cjs')

run({
  name: 'DEF — [MIKU] Snowman',
  rangers: {
    [ALLY]: { id: 'u1242e-brown', name: 'Brown อนูบิสเพชฌฆาต' },
    [ENEMY]: { id: 'u1260e-brown', name: 'Brown ตำนานร็อค' },
  },
  attacker: ENEMY,
  victim: ALLY,
  dies: [true, true],     // สกิล 74.2M ≥ HP 17.2M ทั้งก่อนและหลังใส่เกียร์ (เกียร์นี้ไม่เพิ่ม HP · สกิลไม่โดน DEF)
  respawn: 34.4,          // เรากลับมาก่อนกล้องซูมเข้าไปใส่เกียร์
  respawnFade: 0.5,
})
