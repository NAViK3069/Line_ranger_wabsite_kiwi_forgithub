// ====================================================
// สร้างสารบัญของไฟล์เกมที่เก็บในเว็บเอง (public/gameres/hd ← assets/images/hd ของ APK เวอร์ชันล่าสุด)
//   GitHub Pages ไม่มี directory listing → หน้า /res?p=hd/... อ่านสารบัญจากไฟล์นี้แทนการอ่าน index ของ lerico
//   ผลลัพธ์: public/gameres/hd/_index.json = { "<พาธโฟลเดอร์ใต้ res/>": DirEntry[] } (รูปแบบเดียวกับ src/lib/resIndex.ts)
// Run: node scripts/build-gameres-index.cjs   (รันใหม่ทุกครั้งที่อัปเดตไฟล์ใน public/gameres/hd)
// ====================================================
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..', 'public', 'gameres')
const TOP = 'hd'
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pad = n => String(n).padStart(2, '0')
/** "11-Feb-2026 03:55" แบบ index ของ lerico */
const fmtDate = d => `${pad(d.getDate())}-${MONTHS[d.getMonth()]}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
const cmp = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

const index = {}
function walk(rel) {
  const abs = path.join(ROOT, rel)
  const entries = []
  for (const name of fs.readdirSync(abs)) {
    if (name === '_index.json') continue
    const st = fs.statSync(path.join(abs, name))
    if (st.isDirectory()) {
      walk(`${rel}/${name}`)
      // ข้ามโฟลเดอร์ว่าง (แบบเดียวกับที่หน้า /res ซ่อนโฟลเดอร์ว่างของ lerico)
      if ((index[`${rel}/${name}`] ?? []).length) entries.push({ name, kind: 'dir', date: fmtDate(st.mtime), size: null })
    } else {
      entries.push({ name, kind: 'file', date: fmtDate(st.mtime), size: st.size })
    }
  }
  entries.sort((a, b) => (a.kind !== b.kind ? (a.kind === 'dir' ? -1 : 1) : cmp.compare(a.name, b.name)))
  index[rel] = entries
}
walk(TOP)
fs.writeFileSync(path.join(ROOT, TOP, '_index.json'), JSON.stringify(index))
const files = Object.values(index).reduce((n, e) => n + e.filter(x => x.kind === 'file').length, 0)
console.log(`wrote public/gameres/${TOP}/_index.json · ${Object.keys(index).length} folders · ${files} files`)
