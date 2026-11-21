// ====================================================
// safeUrl — กรองลิงก์ที่มาจากข้อมูล (content/*.json ที่แอดมินแก้, ไฟล์ที่ผู้ใช้นำเข้า)
//
// React 18 ไม่บล็อก href="javascript:..." (แค่เตือนใน console) ลิงก์จากข้อมูลจึงต้องผ่านตัวนี้ก่อนใส่ href
// ยอมเฉพาะ http(s): / mailto: และลิงก์ภายในเว็บ (/...) — อย่างอื่นคืน undefined (ลิงก์ไม่ทำงาน)
// ====================================================

const ALLOWED = new Set(['http:', 'https:', 'mailto:'])

export function safeUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const s = raw.trim()
  if (!s) return undefined
  // ลิงก์ภายใน "/path" (ไม่ใช่ "//host" ที่พาไปโดเมนอื่น หรือ "/\host")
  if (s.startsWith('/') && !s.startsWith('//') && !s.startsWith('/\\')) return s
  try {
    const u = new URL(s)
    return ALLOWED.has(u.protocol) ? u.href : undefined
  } catch {
    return undefined
  }
}
