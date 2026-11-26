// วิดีโอ ATK: เรา (ซ้าย, Rock Legend Brown) ใส่ร่มกันจันทรา ตีเป้าหมาย (ขวา, Executor Anubis Brown ใส่เกียร์ชุด HP สูงสุด) — เป้าหมายรอดทุกรอบ
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
  // เป้าหมายใส่ชุด HP สูงสุด: HP 277.7M · ต้านสกิล 79.8% → สกิล 21.4M (ไม่ใส่เกียร์) / 116.5M (ใส่เกียร์) ไม่ถึงตาย
  //   (ตัวเลขจาก src/app/gear-options/tutorials/atk.tsx — เปลี่ยนเกียร์/เรนเจอร์ต้องเช็คใหม่ว่าตายไหม)
  dies: [false, false],
})
