// ====================================================
// ออพชั่นเกียร์ที่มีวิดีโอสอน (หน้า /gear-options)
//
// เพิ่มวิดีโอให้ออพชั่นไหน:
//   1. ทำฉากใน Video Studio (/custom-video) → บันทึกเป็นไฟล์ .anme.json
//   2. วางไฟล์ไว้ที่ public/gear-options/scenes/<id>.anme.json
//   3. ใส่ scene: '<id>' ที่ออพชั่นนั้นข้างล่าง
// ออพชั่นที่ยังไม่มีวิดีโอ → เล่นฉากตัวอย่าง (SAMPLE_SCENE) พร้อมป้าย "ยังไม่มีวิดีโอ"
//
// ชื่อภาษาอังกฤษใช้คำเดียวกับในเกม (public/data/translations/en.json → equips.GEAR_ATTR_* / SKILL_PLUS_*)
// ====================================================

export interface GearOption {
  id: string
  th: string
  en: string
  /** ชื่อไฟล์ฉากใน public/gear-options/scenes/ (ไม่ต้องใส่ .anme.json) · ไม่มี = ยังไม่ได้ทำวิดีโอ */
  scene?: string
}

export const SAMPLE_SCENE = 'sample'

export const sceneUrl = (name: string) => `/gear-options/scenes/${encodeURIComponent(name)}.anme.json`

export const GEAR_OPTIONS: GearOption[] = [
  { id: 'atk',             th: 'พลังโจมตี',                      en: 'ATK', scene: 'atk' },   // + การ์ด/ตัวเลข: tutorials/atk.tsx
  { id: 'hp',              th: 'พลังชีวิต',                      en: 'HP', scene: 'hp' },     // tutorials/hp.tsx
  { id: 'def',             th: 'พลังป้องกัน',                    en: 'DEF', scene: 'def' },   // tutorials/def.tsx
  { id: 'atk-speed',       th: 'ความเร็วในการโจมตี',             en: 'Attack Speed', scene: 'atk-speed' },   // tutorials/atk-speed.tsx
  { id: 'move-speed',      th: 'ความเร็วการเคลื่อนที่',          en: 'Move Speed', scene: 'move-speed' },   // tutorials/move-speed.tsx
  { id: 'skill-use',       th: 'อัตราการใช้ทักษะ',               en: 'Skill Use Rate' },
  { id: 'skill-evade',     th: 'อัตราการหลบทักษะ',               en: 'Skill Evade Rate' },
  { id: 'skill-hit',       th: 'อัตราความแม่นยำของทักษะ',        en: 'Skill Hit Rate' },
  { id: 'skill-resist',    th: 'การต้านทักษะ',                   en: 'Skill Resistance' },
  { id: 'dmg-reduction',   th: 'ลดความเสียหาย',                  en: 'Damage Reduction' },
  { id: 'element',         th: 'อัพเกรดธาตุ',                    en: 'Elemental Prowess' },
  { id: 'blitz-rush',      th: 'โอกาสโจมตีต่อเนื่อง',            en: 'Blitz Rush Odds' },
  { id: 'skill-reactivate',th: 'อัตราการใช้ทักษะอีกครั้ง',       en: 'Skill Reactivation Rate' },
  { id: 'surehit',         th: 'อัตราโจมตีโดนแน่นอน',            en: 'Surehit Rate' },
  { id: 'skill-surehit',   th: 'อัตราโจมตีโดนแน่นอนของทักษะ',    en: 'Skill Surehit Rate' },
  { id: 'skill-cooldown',  th: 'เวลารอทักษะ',                    en: 'Skill Cooldown' },
  { id: 'skill-pierce',    th: 'อัตราการเจาะทักษะ',              en: 'Skill Pierce Rate' },
  { id: 'blood-veil',      th: 'ม่านโลหิต',                      en: 'Blood Veil' },
  { id: 'atk-cancel',      th: 'อัตราต้านการโจมตีปกติ',          en: 'Normal Attack Cancel Rate' },
  { id: 'skill-cancel',    th: 'อัตราต้านการโจมตีด้วยทักษะ',     en: 'Skill Attack Cancel Rate' },
]
