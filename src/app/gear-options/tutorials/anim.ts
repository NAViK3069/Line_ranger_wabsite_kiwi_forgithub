// ====================================================
// ตัวช่วยอนิเมชันของชั้นซ้อนวิดีโอสอน (คำนวณจากเวลา t ล้วน — ไม่มี state / CSS transition)
// ลากแถบเวลาไปจุดไหนก็ได้ภาพเดียวกันเป๊ะ เหมือนตัดต่อวิดีโอจริง
// ====================================================

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

/** ความคืบหน้า 0..1 ของช่วง [a, b] */
export const prog = (t: number, a: number, b: number) => (b <= a ? (t >= a ? 1 : 0) : clamp01((t - a) / (b - a)))

export const easeOut = (x: number) => 1 - Math.pow(1 - x, 3)
export const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
/** เด้งเลยนิดแล้วกลับ — ใช้กับป๊อปอัพ */
export const easeOutBack = (x: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2) }

/**
 * ช่วงแสดงผลของชิ้นหนึ่ง: เข้า (fadeIn) → ค้าง → ออก (fadeOut)
 *   enter 0→1 ตอนเข้า · exit 0→1 ตอนออก · alpha = ความทึบรวม · on = ยังต้อง render ไหม
 */
export function span(t: number, start: number, end: number, fadeIn = 0.45, fadeOut = 0.35) {
  const enter = prog(t, start, start + fadeIn)
  const exit = prog(t, end - fadeOut, end)
  return { on: t >= start && t <= end, enter, exit, alpha: enter * (1 - exit) }
}

/** สไตล์ป๊อปอัพมาตรฐาน: ขยายเด้ง + เลื่อนขึ้นตอนเข้า · ย่อ + จางตอนออก */
export function popStyle(s: { enter: number; exit: number; alpha: number }, dy = 26): React.CSSProperties {
  const e = easeOutBack(s.enter)
  const scale = 0.86 + 0.14 * e - 0.06 * s.exit
  return { opacity: s.alpha, transform: `translateY(${(1 - easeOut(s.enter)) * dy - s.exit * 10}px) scale(${scale})` }
}

/** ตัวเลขวิ่งจาก from → to ในช่วง [a, b] */
export const countUp = (t: number, a: number, b: number, from: number, to: number) =>
  from + (to - from) * easeOut(prog(t, a, b))

/** แสงกระพริบเป็นจังหวะ 0..1 (ใช้กับไฮไลท์) */
export const pulse = (t: number, hz = 1.4) => 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * hz)

export const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US')
