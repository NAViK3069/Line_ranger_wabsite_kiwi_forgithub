// วิดีโอ HP: สลับตัวกับวิดีโอ ATK — เรา (ซ้าย, Executor Anubis Brown) ใส่ธนูคริสต์มาส ศักดิ์สิทธิ์ (HP +444%)
//   ศัตรู (ขวา, Rock Legend Brown) ไม่ใส่เกียร์ เป็นฝ่ายตีเรา · ไม่ใส่เกียร์โดนสกิลตาย · ใส่เกียร์แล้วรอด
// overlay: src/app/gear-options/tutorials/hp.tsx (ALLY / ENEMY ต้องตรงกัน)
// Run: node scripts/gear-options/build-hp-scene.cjs scripts/gear-options/atk-base.anme.json public/gear-options/scenes/hp.anme.json
const { ALLY, ENEMY, run, gameAttack } = require('./scene-lib.cjs')

// กระสุนตามข้อมูลเกม (fx.game — วิถี/ความเร็วจาก projectile ของเกม): ตีปกติโค้ง moveSpeed 30 · สกิล 1 WEAPON moveSpeed 0 = วาร์ปโดนทันที
const SHOOTER = 'u1260e-brown'
// คิวสกิลเริ่ม → โดน (วินาที): ท่าเตรียม s_attack_ready จนถึงเฟรมปล่อย (วาร์ป ไม่มีเวลาบิน) — วัดจากไทม์ไลน์ของตัวเล่น
const SKILL_HIT = 1.5

run({
  name: 'HP — Christmas Holy Bow',
  rangers: {
    [ALLY]: { id: 'u1242e-brown', name: 'Brown อนูบิสเพชฌฆาต' },
    [ENEMY]: { id: 'u1260e-brown', name: 'Brown ตำนานร็อค' },
  },
  attacker: ENEMY,
  victim: ALLY,
  normal: gameAttack(SHOOTER, 'normal'),
  skill: gameAttack(SHOOTER, 'skill1'),
  skillHitOffset: SKILL_HIT,
  dies: [true, false],    // สกิล 74.2M: ≥ HP 17.2M (ไม่ใส่เกียร์) · < HP 93.7M (ใส่เกียร์)
  respawn: 34.4,          // เรากลับมาก่อนกล้องซูมเข้าไปใส่เกียร์
  respawnFade: 0.5,
})
