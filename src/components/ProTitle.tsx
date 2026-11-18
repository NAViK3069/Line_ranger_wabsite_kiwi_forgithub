'use client'

export default function ProTitle() {
  return (
    <h1 className="text-5xl md:text-7xl font-black leading-snug">
      <span className="text-gradient-gold">Line Ranger</span>
      <br />
      {/* md:mt-3 ดันบรรทัด Kiwi ลงนิดหน่อยเฉพาะ PC (มือถือ leading-snug พอแล้ว)
          md:-mb-3 หักล้างความสูงที่เพิ่ม (inline-flex นับ margin เหมือน inline-block)
          กันไม่ให้ดัน banner/ปุ่มด้านล่างลงไปอีก — ผลรวมคือขยับแค่ "Kiwi" ลง ไม่กระทบ layout ต่อ */}
      {/* Beta อยู่ใน flex container เดียวกับ Kiwi (flex เริ่มต้นไม่ wrap) → การันตีอยู่บรรทัดเดียวกันเสมอ */}
      <span className="text-white inline-flex items-center justify-center gap-2 md:gap-3 md:mt-3 md:-mb-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {/* -my-* ชดเชยความสูงที่เพิ่ม กันไม่ให้ดัน banner/ปุ่มด้านล่างลง */}
        <img src="/gacha/images/LogoKiwi.png" alt="" className="h-14 md:h-20 w-auto object-contain -my-1 md:-my-2" />
        Kiwi
      </span>
    </h1>
  )
}
