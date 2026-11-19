// ====================================================
// scope-anme-css.cjs — แปลง CSS ของ ANME (เขียนแบบ global) ให้มีผลเฉพาะใน .anme-root
//
// ANME เดิมเป็นแอพหน้าเดียว CSS จึงเขียนกับ body / button / .btn / .row ตรงๆ
// ถ้าใส่เข้ามาในเว็บนี้ตรงๆ จะไปทับหน้าอื่นทั้งเว็บ (Tailwind ก็มี .grow / .small ฯลฯ)
//
// ใช้:  node scripts/scope-anme-css.cjs   (อ่าน src/anme/styles.src.css → เขียน src/anme/anme.css)
// แก้สไตล์ของ ANME ที่ styles.src.css แล้วรันคำสั่งนี้ใหม่
// ====================================================
const fs = require('fs')
const path = require('path')
const postcss = require('postcss')

const ROOT = '.anme-root'
const src = path.join(__dirname, '..', 'src', 'anme', 'styles.src.css')
const out = path.join(__dirname, '..', 'src', 'anme', 'anme.css')

function scope(sel) {
  sel = sel.trim()
  // ตัวแปรสี + ฟอนต์พื้นฐานของแอพ → ย้ายไปไว้ที่กล่องราก
  if (sel === ':root' || sel === 'html' || sel === 'body' || sel === '#root') return ROOT
  if (sel === '*') return `${ROOT}, ${ROOT} *`
  if (sel.startsWith('::')) return `${ROOT} ${sel}`
  if (sel.startsWith('.app')) return `${ROOT} ${sel}`
  return `${ROOT} ${sel}`
}

const plugin = () => ({
  postcssPlugin: 'scope-anme',
  Rule(rule) {
    if (rule.parent && rule.parent.type === 'atrule' && /keyframes/i.test(rule.parent.name)) return
    if (rule.__scoped) return
    rule.selectors = [...new Set(rule.selectors.flatMap(s => scope(s).split(/\s*,\s*/)))]
    rule.__scoped = true
  },
  AtRule: {
    'font-face'(at) {
      // ฟอนต์ LineBold ของเว็บนี้อยู่ที่ /fonts/linebold.ttf
      at.walkDecls('src', d => { d.value = d.value.replace(/url\([^)]*linebold\.ttf[^)]*\)/i, "url('/fonts/linebold.ttf')") })
    },
  },
})
plugin.postcss = true

const css = fs.readFileSync(src, 'utf8')
postcss([plugin]).process(css, { from: src, to: out }).then(result => {
  const header = `/* สร้างอัตโนมัติจาก styles.src.css โดย scripts/scope-anme-css.cjs — อย่าแก้ไฟล์นี้ตรงๆ */\n` +
    // ยกเลิก Tailwind preflight ในกล่อง ANME (ANME ออกแบบบนค่าเริ่มต้นของเบราว์เซอร์ ไม่ใช่ preflight)
    // specificity (0,1,0): ชนะ preflight (button = 0,0,1) แต่แพ้กฎของ ANME (.anme-root .btn = 0,2,0 / .anme-root button = 0,1,1)
    // ไม่แตะ svg ทั้งตัวและลูก — fill="none" / stroke="currentColor" ที่เขียนเป็น attribute ของไอคอน
    // ถ้าโดน all: revert จะถูกล้างเป็นค่าเริ่มต้น (fill ดำ, ไม่มีเส้น) → ไอคอนกลายเป็นก้อนสีดำ
    `.anme-root :where(*:not(svg, svg *)) { all: revert; }\n` +
    // svg: คืนเฉพาะ display / vertical-align ที่ preflight เปลี่ยน (preflight ตั้ง svg เป็น display:block)
    `.anme-root :where(svg) { display: revert; vertical-align: revert; }\n` +
    // all: revert ไปล้าง display:none ของ attribute hidden ด้วย (ช่องเลือกไฟล์ที่ซ่อนไว้โผล่) → บังคับกลับ
    `.anme-root [hidden] { display: none !important; }\n`
  // ทั้งสตูดิโอห้ามลากเลือกข้อความ (ลากเลื่อนเวลา/บล็อก/ตัวละครแล้วตัวหนังสือถูกคลุมฟ้า) — ยกเว้นช่องพิมพ์
  // วางท้ายไฟล์ + specificity (0,1,x) สูงกว่า all: revert ด้านบน จึงชนะทุกจุด
  const footer = `\n/* ห้ามเลือกข้อความทั้งสตูดิโอ ยกเว้นช่องพิมพ์ (scripts/scope-anme-css.cjs) */\n` +
    `.anme-root, .anme-root *:not(input):not(textarea):not(select):not([contenteditable="true"]) { user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }\n` +
    `.anme-root input, .anme-root textarea, .anme-root [contenteditable="true"] { user-select: text; -webkit-user-select: text; }\n`
  fs.writeFileSync(out, header + result.css + footer)
  console.log('wrote', path.relative(process.cwd(), out))
})
