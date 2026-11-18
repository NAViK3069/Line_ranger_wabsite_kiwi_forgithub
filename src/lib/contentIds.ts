// อ่าน id ของตู้กาชาจาก content/*.json ตอน build — ใช้ทำ generateStaticParams ของหน้า /gacha-*/[id]
// (static export ต้องรู้ล่วงหน้าว่ามีหน้าไหนบ้าง — แอดมินเพิ่มตู้ใหม่ → commit → build ใหม่ → ได้หน้าใหม่)
import fs from 'fs'
import path from 'path'

export function poolIds(kind: 'ranger' | 'gear'): { id: string }[] {
  const file = kind === 'ranger' ? 'gacha-pools.json' : 'gacha-gear-pools.json'
  try {
    const rows = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'content', file), 'utf8')) as { id: string }[]
    if (rows.length) return rows.map(r => ({ id: r.id }))
  } catch { /* ไม่มีไฟล์ */ }
  // static export ห้ามคืนอาเรย์ว่าง — ใส่ id หลอกไว้ 1 หน้า (จะขึ้นว่าไม่พบตู้)
  return [{ id: 'none' }]
}
