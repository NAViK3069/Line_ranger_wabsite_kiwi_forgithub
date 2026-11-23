// วิดีโอ DEF: เรา (ซ้าย, Executor Anubis Brown) ใส่ [MIKU] Snowman (DEF กายภาพ/เวท +438%)
//   ศัตรู (ขวา, Brown ผู้มีวิชาอาคม = ไกรทอง ร่างไฮเปอร์ u1316h-brown ธาตุแสง) ใส่เกียร์ ATK เต็มที่ เป็นฝ่ายตีเรา
//   DEF ลดดาเมจตีปกติ แต่สกิลไม่โดนลดด้วย DEF (ยืนยันจากโค้ดเกม) → โดนสกิลแล้วตายทั้ง 2 รอบ
//   กระสุนตีปกติ / สกิล "เทียนเวทมนตร์" ใช้วิถีแบบในเกมเป๊ะ (fx.game — ถอดจาก libgame.so) จากข้อมูล projectile ของเกม
// overlay: src/app/gear-options/tutorials/def.tsx (ALLY / ENEMY ต้องตรงกัน)
// Run: node scripts/gear-options/build-def-scene.cjs scripts/gear-options/atk-base.anme.json public/gear-options/scenes/def.anme.json
const { ALLY, ENEMY, run, gameAttack } = require('./scene-lib.cjs')

const ATTACKER = 'u1316h-brown'

run({
  name: 'DEF — [MIKU] Snowman vs Wizard Brown',
  rangers: {
    [ALLY]: { id: 'u1242e-brown', name: 'Brown อนูบิสเพชฌฆาต' },
    [ENEMY]: { id: ATTACKER, name: 'Brown ผู้มีวิชาอาคม' },
  },
  attacker: ENEMY,
  victim: ALLY,
  normal: gameAttack(ATTACKER, 'normal'),     // หอก: CURVE จาก (180, 385) มุม −75° → 0° ความเร็ว 45
  skill: gameAttack(ATTACKER, 'skill2'),      // เทียนเวทมนตร์ (hsk1316): CURVE จาก (220, 180) มุม −75° → 0° ความเร็ว 45
  // คิวสกิลเริ่ม → โดน: ท่าเตรียม s2_attack_ready จนถึงเฟรมปล่อย + เวลาบิน (วัดจากไทม์ไลน์ของตัวเล่น)
  skillHitOffset: 2.035,
  dies: [true, true],     // สกิล 28.4M / 413M ≥ HP 17.2M ทั้งก่อนและหลังใส่เกียร์ (เกียร์นี้ไม่เพิ่ม HP · สกิลไม่โดน DEF)
  respawn: 34.4,          // เรากลับมาก่อนกล้องซูมเข้าไปใส่เกียร์
  respawnFade: 0.5,
})
