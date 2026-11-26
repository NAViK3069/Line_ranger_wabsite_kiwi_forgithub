// วิดีโอ ATK: เรา (ซ้าย, Rock Legend Brown) ใส่ร่มกันจันทรา ตีเป้าหมาย (ขวา, Executor Anubis Brown ใส่เกียร์ชุด HP สูงสุด) — เป้าหมายรอดทุกรอบ
// overlay: src/app/gear-options/tutorials/atk.tsx (ALLY / ENEMY ต้องตรงกัน)
// Run: node scripts/gear-options/build-atk-scene.cjs scripts/gear-options/atk-base.anme.json public/gear-options/scenes/atk.anme.json
const { ALLY, ENEMY, run, gameAttack } = require('./scene-lib.cjs')

// กระสุนตามข้อมูลเกม (fx.game — วิถี/ความเร็วจาก projectile ของเกม): ตีปกติโค้ง moveSpeed 30 · สกิล 1 WEAPON moveSpeed 0 = วาร์ปโดนทันที
const SHOOTER = 'u1260e-brown'
// คิวสกิลเริ่ม → โดน (วินาที): ท่าเตรียม s_attack_ready จนถึงเฟรมปล่อย (วาร์ป ไม่มีเวลาบิน) — วัดจากไทม์ไลน์ของตัวเล่น
const SKILL_HIT = 1.5

run({
  name: 'ATK — Moonbrella',
  rangers: {
    [ALLY]: { id: 'u1260e-brown', name: 'Brown ตำนานร็อค' },
    [ENEMY]: { id: 'u1242e-brown', name: 'Brown อนูบิสเพชฌฆาต' },
  },
  attacker: ALLY,
  victim: ENEMY,
  normal: gameAttack(SHOOTER, 'normal'),
  skill: gameAttack(SHOOTER, 'skill1'),
  skillHitOffset: SKILL_HIT,
  // เป้าหมายใส่ชุด HP สูงสุด: HP 277.7M · ต้านสกิล 79.8% → สกิล 21.4M (ไม่ใส่เกียร์) / 116.5M (ใส่เกียร์) ไม่ถึงตาย
  //   (ตัวเลขจาก src/app/gear-options/tutorials/atk.tsx — เปลี่ยนเกียร์/เรนเจอร์ต้องเช็คใหม่ว่าตายไหม)
  dies: [false, false],
})
