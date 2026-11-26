// วิดีโอ อัพเกรดธาตุ (Elemental Prowess): เรา (ซ้าย, Rock Legend Brown ธาตุแสง) ใส่ Brown Keychain of Light +10 (Switchable อัพเกรดธาตุ +250% · เงื่อนไขแสง)
//   ตีเป้าหมาย (ขวา, Brown นักรบช้าง u1483e-brown ธาตุมืด · STR — ใส่ชุด HP สูงสุดแบบวิดีโอ ATK) · แสงชนะมืด ×3 → ใส่เกียร์ ×3 × (1 + 250%) = ×10.5 · เป้าหมายรอดทุกรอบ
//   กฎของเกม (libgame.so): ตัวคูณธาตุ (UnitNode 0x490 = 0xd076d8) = inc_rate ของตาราง unit_elmt_cntrry × (1 + อัพเกรดธาตุ) ใช้ทั้งตีปกติและสกิล
// overlay: src/app/gear-options/tutorials/element.tsx (ALLY / ENEMY ต้องตรงกัน)
// Run: node scripts/gear-options/build-element-scene.cjs scripts/gear-options/atk-base.anme.json public/gear-options/scenes/element.anme.json
const { ALLY, ENEMY, run, gameAttack } = require('./scene-lib.cjs')

const SHOOTER = 'u1260e-brown'   // กระสุนตามข้อมูลเกม · คิวสกิลเริ่ม → โดน 1.5 วิ (วัดจากตัวเล่น)

run({
  name: 'Elemental Prowess — Brown Keychain of Light',
  rangers: {
    [ALLY]: { id: SHOOTER, name: 'Brown ตำนานร็อค' },
    [ENEMY]: { id: 'u1483e-brown', name: 'Brown นักรบช้าง' },
  },
  attacker: ALLY,
  victim: ENEMY,
  normal: gameAttack(SHOOTER, 'normal'),
  skill: gameAttack(SHOOTER, 'skill1'),
  skillHitOffset: 1.5,
  dies: [false, false],   // เป้าหมายใส่ชุด HP สูงสุด — ดาเมจสกิล ×10.5 ยังไม่ถึงตาย (ตัวเลขจาก element.tsx)
})
