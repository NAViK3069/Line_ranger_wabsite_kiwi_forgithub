// วิดีโอ DEF: เรา (ซ้าย, Executor Anubis Brown) ใส่ Azure Sky Wing Shield (DEF กายภาพ +80.4% · ต้านสกิล +36%)
//   ศัตรู (ขวา, Brown พรานจระเข้ = ไกรทอง 9★ u1317e-brown ธาตุแสง) ใส่เกียร์ ATK เต็มที่ เป็นฝ่ายตีเรา
//   DEF ลดดาเมจตีปกติ แต่สกิลไม่โดนลดด้วย DEF (ยืนยันจากโค้ดเกม) → โดนสกิลแล้วตายทั้ง 2 รอบ
//   กระสุนตีปกติ / สกิล "เทียนเวทมนตร์" ใช้วิถีแบบในเกมเป๊ะ (fx.game — ถอดจาก libgame.so) จากข้อมูล projectile ของเกม
// overlay: src/app/gear-options/tutorials/def.tsx (ALLY / ENEMY ต้องตรงกัน)
// Run: node scripts/gear-options/build-def-scene.cjs scripts/gear-options/atk-base.anme.json public/gear-options/scenes/def.anme.json
const { ALLY, ENEMY, run, gameAttack } = require('./scene-lib.cjs')

const ATTACKER = 'u1317e-brown'
const ATTACKER_FILES = ['bul', 'bul3']   // ไฟล์กระสุนที่มีจริงใน res/u1317e-brown/ (ไม่มี bul2)

run({
  name: 'DEF — Azure Sky Wing Shield vs Crocodile Hunter Brown',
  rangers: {
    [ALLY]: { id: 'u1242e-brown', name: 'Brown อนูบิสเพชฌฆาต' },
    [ENEMY]: { id: ATTACKER, name: 'Brown พรานจระเข้' },
  },
  attacker: ENEMY,
  victim: ALLY,
  normal: gameAttack(ATTACKER, 'normal', ATTACKER_FILES),     // หอก: CURVE จาก (180, 385) มุม −75° → 0° ความเร็ว 45
  skill: gameAttack(ATTACKER, 'skill2', ATTACKER_FILES),      // เทียนเวทมนตร์ (hsk1316 — สกิลไฮเปอร์ของตระกูลไกรทอง): CURVE จาก (220, 180) มุม −75° → 0° ความเร็ว 45
  // คิวสกิลเริ่ม → โดน: ท่าเตรียม s2_attack_ready จนถึงเฟรมปล่อย + เวลาบิน (วัดจากไทม์ไลน์ของตัวเล่น)
  skillHitOffset: 2.068,
  dies: [true, true],     // สกิล 660M / หลังใส่ (ต้านสกิล 30% → 66%) ~320M ≥ HP 17.2M — สกิลไม่โดน DEF · เกียร์นี้ไม่เพิ่ม HP
  respawn: 34.4,          // เรากลับมาก่อนกล้องซูมเข้าไปใส่เกียร์
  respawnFade: 0.5,
})
