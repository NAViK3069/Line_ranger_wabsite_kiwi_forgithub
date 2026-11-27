// วิดีโอ ม่านโลหิต (Blood Veil): เรา (ซ้าย, Rock Legend Brown — ใส่ [GA]Rudo's Gas Mask) ตีเป้าหมาย (ขวา, Executor Anubis Brown ใส่ชุด HP สูงสุด แบบวิดีโอ ATK)
//   กฎของเกม (0xceb914 — เรียกจาก onDamaged ของฝั่งที่โดน เมื่อดาเมจ > 0 และเป็นตีปกติ/ทักษะ [kind 1–3]):
//     ทุกครั้งที่ตัวใส่ "ตีโดน" → ฟื้น = ตัดเศษ(ม่านโลหิต × HP สูงสุด) · เติมเลือดที่ขาดก่อน ส่วนที่เกินเป็นโล่ (0xcee760 · มีเพดานตาม config)
// overlay: src/app/gear-options/tutorials/blood-veil.tsx
// Run: node scripts/gear-options/build-bloodveil-scene.cjs scripts/gear-options/atk-base.anme.json public/gear-options/scenes/blood-veil.anme.json
const { ALLY, ENEMY, run, gameAttack } = require('./scene-lib.cjs')
const SHOOTER = 'u1260e-brown'
run({
  name: "Blood Veil — [GA]Rudo's Gas Mask",
  rangers: {
    [ALLY]: { id: SHOOTER, name: 'Brown ตำนานร็อค' },
    [ENEMY]: { id: 'u1242e-brown', name: 'Brown อนูบิสเพชฌฆาต' },
  },
  attacker: ALLY,
  victim: ENEMY,
  normal: gameAttack(SHOOTER, 'normal'),
  skill: gameAttack(SHOOTER, 'skill1'),
  skillHitOffset: 1.5,
  dies: [false, false],   // เกียร์นี้ไม่เพิ่ม ATK → ดาเมจน้อยกว่าวิดีโอ ATK ที่เป้ารอดอยู่แล้ว
})
