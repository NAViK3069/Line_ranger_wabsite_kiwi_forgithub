// วิดีโอ ต้านทักษะ (Skill Resistance): คู่เดียวกับวิดีโอ HP — เรา (ซ้าย, Executor Anubis Brown) ใส่ [FA] Philosopher's Stone (ต้านทักษะ +78%)
//   ศัตรู (ขวา, Rock Legend Brown) ไม่ใส่เกียร์ เป็นฝ่ายตีเรา · ไม่ใส่เกียร์โดนสกิลตาย · ใส่เกียร์แล้วต้าน 97% (เพดาน) รอด
//   ตีปกติไม่โดนต้านทักษะ (ดาเมจเท่าเดิม) — ยืนยันจากโค้ดเกม: สกิล = ATK × ความแรง × (1 − clamp(ต้าน − เจาะ, 0, 0.97))
// overlay: src/app/gear-options/tutorials/skill-resist.tsx (ALLY / ENEMY ต้องตรงกัน)
// Run: node scripts/gear-options/build-skillres-scene.cjs scripts/gear-options/atk-base.anme.json public/gear-options/scenes/skill-resist.anme.json
const { ALLY, ENEMY, run, gameAttack } = require('./scene-lib.cjs')

// กระสุนตามข้อมูลเกม: ตีปกติโค้ง moveSpeed 30 · สกิล 1 WEAPON moveSpeed 0 = วาร์ปโดนทันที (คิวสกิลเริ่ม → โดน 1.5 วิ วัดจากตัวเล่น)
const SHOOTER = 'u1260e-brown'

run({
  name: "Skill Resistance — [FA] Philosopher's Stone",
  rangers: {
    [ALLY]: { id: 'u1242e-brown', name: 'Brown อนูบิสเพชฌฆาต' },
    [ENEMY]: { id: SHOOTER, name: 'Brown ตำนานร็อค' },
  },
  attacker: ENEMY,
  victim: ALLY,
  normal: gameAttack(SHOOTER, 'normal'),
  skill: gameAttack(SHOOTER, 'skill1'),
  skillHitOffset: 1.5,
  dies: [true, false],    // สกิล 74.2M ≥ HP 17.2M (ต้าน 30%) · ต้าน 97% → 3.2M รอด
  respawn: 34.4,
  respawnFade: 0.5,
})
