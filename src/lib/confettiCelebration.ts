import confetti from 'canvas-confetti'

function randomInRange(min: number, max: number): number {
  return Math.random() * (max - min) + min
}

// canvas-confetti export ตัวเริ่มต้น (import confetti from ...) ใช้ Web Worker + OffscreenCanvas
// เสมอ (useWorker: true ฝังมาในไลบรารี) — บางสภาพแวดล้อม worker วาดสำเร็จแต่ไม่ composite ขึ้นจอ
// เงียบๆ ไม่มี error เลย เลยสร้าง canvas + instance ของเราเอง บังคับ useWorker: false ให้วาดบน
// main thread ตรงๆ แทน เชื่อถือได้กว่า
let confettiCannon: ReturnType<typeof confetti.create> | null = null
function getConfettiCannon() {
  if (confettiCannon) return confettiCannon
  const canvas = document.createElement('canvas')
  canvas.style.position = 'fixed'
  canvas.style.inset = '0'
  canvas.style.width = '100%'
  canvas.style.height = '100%'
  canvas.style.pointerEvents = 'none'
  canvas.style.zIndex = '9999'
  document.body.appendChild(canvas)
  confettiCannon = confetti.create(canvas, { resize: true, useWorker: false })
  return confettiCannon
}

export function fireConfetti(durationMs = 2000): void {
  const cannon = getConfettiCannon()
  const animationEnd = Date.now() + durationMs
  const defaults = { startVelocity: 30, spread: 360, ticks: 60 }
  const interval = window.setInterval(() => {
    const timeLeft = animationEnd - Date.now()
    if (timeLeft <= 0) { window.clearInterval(interval); return }
    const particleCount = 50 * (timeLeft / durationMs)
    cannon({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } })
    cannon({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } })
  }, 250)
}
