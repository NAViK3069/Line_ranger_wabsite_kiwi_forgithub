// ====================================================
// cleanUnitName — ทำความสะอาดชื่อเรนเจอร์ที่ได้จาก lerico (/api/v2/translate?keys=en:UNIT)
//
// ชื่อบางตัวมีตัวขึ้นบรรทัดติดมาจากเกม ทั้งแบบตัวอักษร "\n" (backslash + n) และแบบขึ้นบรรทัดจริง
//   "Octagram\nDemon Lord Rimuru" → "Octagram Demon Lord Rimuru"
// แบบตัวอักษรจะโชว์ "\n" บนหน้าเว็บตรงๆ (Ranger Book, Meta, Evolution ฯลฯ) จึงต้องแปลงเป็นช่องว่างตั้งแต่ตอนดึงข้อมูล
// ====================================================

export function cleanUnitName(name: string): string {
  return name.replace(/\\[nr]/g, ' ').replace(/\s+/g, ' ').trim()
}
