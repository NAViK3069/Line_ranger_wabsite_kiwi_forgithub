// วิดีโอ ATK: เรา (ซ้าย, Rock Legend Brown) ใส่ร่มกันจันทรา ตีเป้าหมาย (ขวา, Executor Anubis Brown) — เป้าหมายตายทั้ง 2 รอบที่โดนสกิล
// overlay: src/app/gear-options/tutorials/atk.tsx (ALLY / ENEMY ต้องตรงกัน)
// Run: node scripts/gear-options/build-atk-scene.cjs scripts/gear-options/atk-base.anme.json public/gear-options/scenes/atk.anme.json
const { ALLY, ENEMY, run } = require('./scene-lib.cjs')

run({
  name: 'ATK — Moonbrella',
  rangers: {
    [ALLY]: { id: 'u1260e-brown', name: 'Brown ตำนานร็อค' },
    [ENEMY]: { id: 'u1242e-brown', name: 'Brown อนูบิสเพชฌฆาต' },
  },
  attacker: ALLY,
  victim: ENEMY,
  dies: [true, true],     // สกิล 74M / 403M ≥ HP เป้าหมาย 17.2M
  respawn: 35.6,          // เป้าหมายกลับมาตอนกล้องซูมตัวเราอยู่ — มองไม่เห็นตอนโผล่
})
