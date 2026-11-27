// วิดีโอ อัตราติดคริทิคอล (crit-rate) / แรงโจมตีคริทิคอล (crit-damage)
//   เรา (ซ้าย ใส่เกียร์) Ares Cony (คริ 25% · แรงคริ ×3) ตีปกติใส่ Brown อนูบิสเพชฌฆาต (ขวา) 4 รอบ — ทั้ง 4 รอบเป็นตีปกติ (คริมีแค่ตีปกติ)
//   ใช้โครงเรื่องเดียวกับวิดีโอ ATK (scene-lib run): รอบ 1–2 ไม่ใส่เกียร์ · ใส่เกียร์ (แสง + ช่องเกียร์) · รอบ 3–4 ใส่เกียร์
//   กฎของเกม (libgame.so):
//     สุ่มคริ 0xd02304 (เรียกจากดาเมจตีปกติ 0xcec3f4 เท่านั้น): p = criticalProbability (+ Critical Rate เกียร์บวกตรง) + บัฟ
//       p ≥ 0.95 → 95 · ตัดเศษเป็น % · สุ่ม 0–99 < p = คริ
//     ตัวคูณคริ 0xcecfec: คริ = max(1, criticalRatio (+ Critical Damage เกียร์บวกตรง) + บัฟ) · ไม่คริ = 1
// overlay: src/app/gear-options/tutorials/crit.tsx
// Run: node scripts/gear-options/build-crit-scene.cjs <crit-rate|crit-damage> scripts/gear-options/atk-base.anme.json public/gear-options/scenes/<mode>.anme.json
const { ALLY, ENEMY, run, gameAttack } = require('./scene-lib.cjs')

const MODE = process.argv[2]
if (!['crit-rate', 'crit-damage', 'crit-resist'].includes(MODE)) throw new Error('mode: crit-rate | crit-damage | crit-resist')
// crit-resist: ตัวใส่เกียร์ (ลดความเสียหายคริติคอล) = ฝ่ายโดนตี ยืนซ้าย · Ares Cony ยืนขวาเป็นฝ่ายตี
const RESIST = MODE === 'crit-resist'
process.argv.splice(2, 1)   // run() อ่าน <base> <out> จาก argv[2..3]

const SHOOTER = 'u1002e-cony'
const NORMAL = gameAttack(SHOOTER, 'normal')

run({
  name: MODE === 'crit-rate' ? "Critical Rate — Thunder Brown's Cape" : RESIST ? 'Critical Resistance — [FT]Unique Gray' : 'Critical Damage — [SL] Shoulder Armor',
  rangers: RESIST
    ? { [ALLY]: { id: 'u1242e-brown', name: 'Brown อนูบิสเพชฌฆาต' }, [ENEMY]: { id: SHOOTER, name: 'Ares Cony' } }
    : { [ALLY]: { id: SHOOTER, name: 'Ares Cony' }, [ENEMY]: { id: 'u1242e-brown', name: 'Brown อนูบิสเพชฌฆาต' } },
  attacker: RESIST ? ENEMY : ALLY,
  victim: RESIST ? ALLY : ENEMY,
  normal: NORMAL,
  skill: NORMAL,            // ช่อง "สกิล" ของโครงเรื่องก็เป็นตีปกติ (คริเกิดแค่ตีปกติ)
  skillHitOffset: 1.0,      // วัดจริงจากไทม์ไลน์ → แก้ใน crit.tsx ถ้าเปลี่ยน
  dies: [false, false],
})
