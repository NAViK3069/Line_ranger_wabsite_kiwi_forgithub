// วิดีโอ อัตราการเจาะทักษะ (Skill Pierce Rate): เรา (ซ้าย, Rock Legend Brown) ใส่ [YD]Sakura Ring (เจาะทักษะ +20.4%)
//   ตีเป้าหมาย (ขวา, Executor Anubis Brown) ที่ใส่ [FA] Philosopher's Stone (ต้านทักษะ 30% + 78% = 108% → นับ 97%) · เป้าหมายรอดทุกรอบ
//   กฎของเกม (libgame.so): สกิล = ATK × ความแรง × (1 − clamp(ต้าน − เจาะ, 0, 0.97)) — เจาะลบก่อนเทียบเพดาน · ตีปกติไม่เกี่ยว
// overlay: src/app/gear-options/tutorials/skill-pierce.tsx (ALLY / ENEMY ต้องตรงกัน)
// Run: node scripts/gear-options/build-pierce-scene.cjs scripts/gear-options/atk-base.anme.json public/gear-options/scenes/skill-pierce.anme.json
const { ALLY, ENEMY, run, gameAttack } = require('./scene-lib.cjs')

const SHOOTER = 'u1260e-brown'   // กระสุนตามข้อมูลเกม · คิวสกิลเริ่ม → โดน 1.5 วิ (วัดจากตัวเล่น)

run({
  name: 'Skill Pierce Rate — [YD]Sakura Ring',
  rangers: {
    [ALLY]: { id: SHOOTER, name: 'Brown ตำนานร็อค' },
    [ENEMY]: { id: 'u1242e-brown', name: 'Brown อนูบิสเพชฌฆาต' },
  },
  attacker: ALLY,
  victim: ENEMY,
  normal: gameAttack(SHOOTER, 'normal'),
  skill: gameAttack(SHOOTER, 'skill1'),
  skillHitOffset: 1.5,
  dies: [false, false],   // สกิล 3.18M → 13.14M ยังไม่ถึง HP (ตัวเลขจาก skill-pierce.tsx)
})
