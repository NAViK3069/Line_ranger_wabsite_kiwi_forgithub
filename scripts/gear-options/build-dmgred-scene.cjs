// วิดีโอ ลดความเสียหาย (Damage Reduction): เรา (ซ้าย, Executor Anubis Brown) ใส่ [YD]Yozakura T-Shirt (−30%) + [DA] Hikari's Whistle (−30%)
//   ศัตรู (ขวา, Vocalist Brown) ไม่ใส่เกียร์ เป็นฝ่ายตีเรา · ไม่ใส่เกียร์โดนสกิลตาย · ใส่เกียร์แล้ว (1 − 0.3)(1 − 0.3) = 0.49 → รอด
//   กฎของเกม (libgame.so): ลดความเสียหาย (ชนิด 0x2a) รวมแบบ "คูณ" (0x111da60) และคูณดาเมจทั้งตีปกติ (0xcec4d0) และสกิล (0xcf7228)
// overlay: src/app/gear-options/tutorials/dmg-reduction.tsx (ALLY / ENEMY ต้องตรงกัน)
// Run: node scripts/gear-options/build-dmgred-scene.cjs scripts/gear-options/atk-base.anme.json public/gear-options/scenes/dmg-reduction.anme.json
const { ALLY, ENEMY, run, gameAttack } = require('./scene-lib.cjs')

const SHOOTER = 'u1224e-brown'   // กระสุนตามข้อมูลเกม
const SKILL_HIT = 1.5   // คิวสกิลเริ่ม → โดน (วัดจากตัวเล่น — วาร์ป moveSpeed 0)

run({
  name: 'Damage Reduction — Yozakura T-Shirt + Hikari\'s Whistle',
  rangers: {
    [ALLY]: { id: 'u1242e-brown', name: 'Brown อนูบิสเพชฌฆาต' },
    [ENEMY]: { id: SHOOTER, name: 'Vocalist Brown' },
  },
  attacker: ENEMY,
  victim: ALLY,
  normal: gameAttack(SHOOTER, 'normal'),
  skill: gameAttack(SHOOTER, 'skill1'),
  skillHitOffset: SKILL_HIT,
  dies: [true, false],    // สกิล 21.1M ≥ HP 17.2M · × 0.49 = 10.3M รอด
  respawn: 34.4,
  respawnFade: 0.5,
})
