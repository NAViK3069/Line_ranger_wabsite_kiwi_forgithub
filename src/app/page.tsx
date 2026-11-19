// ====================================================
// Homepage - หน้าแรกของเว็บ
// ====================================================

import Link from 'next/link'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import ProTitle from '@/components/ProTitle'
import LobbyLink from '@/components/LobbyLink'
import ResFolderLink from '@/components/ResFolderLink'

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 relative pb-8">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl" />
      </div>

      {/* About Me + Folder + Donate + Beta + Language — มุมขวาบน
          มือถือ: แถว 1 = About/Folder/Donate (wrap ได้กันล้นจอ), แถว 2 = Language + Beta ต่อท้าย
          เดสก์ท็อป: ทุกปุ่มแถวเดียวกัน (Language ซ้ายสุด, Beta ขวาสุดหลัง Donate) — Beta render ซ้ำ 2 จุด โชว์ตามจอ */}
      <div className="fixed top-2 right-2 left-2 sm:left-auto z-50 flex flex-col sm:flex-row items-end sm:items-center gap-1.5">
        <div className="flex items-center flex-wrap justify-end gap-1.5">
          <Link
            href="/about"
            className="px-3 py-1.5 sm:px-4 sm:py-2 card-glass text-gray-400 hover:text-white text-xs sm:text-sm rounded-xl flex items-center gap-1.5 transition-all hover:bg-white/10 border border-white/5"
          >
            <span className="material-icons-round text-sm sm:text-base">person</span>
            About
          </Link>
          {/* Folder — โผล่เฉพาะคนที่ปลดล็อค Beta (ตัดสินฝั่ง client จึงแยกเป็นคอมโพเนนต์) */}
          <ResFolderLink />
          <a
            href="https://ko-fi.com/navik3069"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 sm:px-4 sm:py-2 card-glass text-sky-300 hover:text-sky-200 text-xs sm:text-sm rounded-xl flex items-center gap-1.5 transition-all hover:bg-sky-500/10 border border-sky-500/20"
          >
            <span className="material-icons-round text-sm sm:text-base">local_cafe</span>
            Donate
          </a>
        </div>
        {/* language: มือถือ = แถวถัดไป (มี Beta ต่อท้ายขวา), เดสก์ท็อป = แถวเดียวกัน (sm:order-first ให้อยู่ซ้ายสุดบน desktop) */}
        <div className="flex items-center gap-1.5 sm:order-first">
          <LanguageSwitcher />
        </div>
      </div>

      {/* sm:pt-12 (= padding-top: 3rem): เดิม sm:pt-0 ชนเมนู, sm:pt-24 (6rem) ดันลงมาเยอะไป ลดเหลือ 3rem */}
      <div className="relative z-10 text-center max-w-3xl mx-auto pt-28 sm:pt-12">
        {/* Title (โลโก้ Kiwi ย้ายไปอยู่หน้าคำว่า "Kiwi" ข้างในแล้ว — ดู ProTitle.tsx) */}
        <ProTitle />

        {/* ป้ายโฆษณา — ลิงก์ไป Facebook Fanpage (รูป 3496×1024, ratio ~3.41:1)
            wrapper p-[3px] + banner-glow-border = กรอบไล่สีทอง/ส้ม/แดงที่ไหลวนตลอด (ดู globals.css) */}
        <div className="w-full max-w-md mx-auto mb-8 rounded-2xl p-[3px] banner-glow-border shadow-lg hover:scale-[1.02] transition-all">
          <a
            href="https://www.facebook.com/Kornsus.fanpage"
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-2xl overflow-hidden bg-[#0d1220]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/gacha/images/Kornsus.jpg"
              alt="Kornsus Fanpage"
              width={3496}
              height={1024}
              className="w-full h-auto block rounded-2xl"
            />
          </a>
        </div>

        {/* CTA Buttons — Row 1
            ปุ่มทุกใบกว้างเท่ากัน (sm:w-60) สองแถวจึงเรียงเป็นคอลัมน์ตรงกันพอดี
            ถ้าแถวล่างมีแค่ 2 ปุ่ม (ยังไม่ปลดล็อค Beta) ก็ยังจัดกลางสมมาตรอยู่ */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          {/* Gacha Ranger + Gacha Gear รวมเป็นปุ่มเดียว — สลับ Ranger/Gear ด้วยแท็บบนหน้า Gacha */}
          <Link
            href="/gacha-ranger"
            className="w-full sm:w-60 px-4 py-4 bg-gradient-to-r from-yellow-400 to-orange-500 text-black font-bold text-lg rounded-2xl hover:opacity-90 transition-all hover:scale-105 active:scale-95 shadow-lg glow-gold flex items-center justify-center gap-2"
          >
            <span className="material-icons-round text-lg">auto_awesome</span>
            Gacha Simulator
          </Link>
          <Link
            href="/custom-tierlist"
            className="w-full sm:w-60 px-4 py-4 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold text-lg rounded-2xl hover:opacity-90 transition-all hover:scale-105 active:scale-95 shadow-lg flex items-center justify-center gap-2"
          >
            <span className="material-icons-round text-lg">leaderboard</span>
            Tier List
          </Link>
          <Link
            href="/meta"
            className="w-full sm:w-60 px-4 py-4 card-glass text-white font-bold text-lg rounded-2xl hover:bg-white/10 transition-all hover:scale-105 active:scale-95 border border-yellow-500/30 flex items-center justify-center gap-2"
          >
            <span style={{ filter: 'sepia(1) saturate(3) hue-rotate(5deg) brightness(1.2)' }}>⚔️</span>
            Meta Ranger
          </Link>
        </div>

        {/* CTA Buttons — Row 2 (Books) */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center mt-4">
          <Link
            href="/ranger-book"
            className="w-full sm:w-60 px-4 py-4 card-glass text-white font-bold text-lg rounded-2xl hover:bg-white/10 transition-all hover:scale-105 active:scale-95 border border-yellow-400/30 flex items-center justify-center gap-2"
          >
            <span className="material-icons-round text-yellow-400 text-lg">menu_book</span>
            Ranger Book
          </Link>
          <Link
            href="/gear-book"
            className="w-full sm:w-60 px-4 py-4 card-glass text-white font-bold text-lg rounded-2xl hover:bg-white/10 transition-all hover:scale-105 active:scale-95 border border-purple-400/30 flex items-center justify-center gap-2"
          >
            <span className="material-icons-round text-purple-400 text-lg">inventory_2</span>
            Gear Book
          </Link>
          {/* โผล่เฉพาะคนที่ปลดล็อค Beta แล้ว (ตัดสินฝั่ง client จึงแยกเป็นคอมโพเนนต์) */}
          <LobbyLink />
        </div>

      </div>

      {/* Footer disclaimer — อยู่ใน flow ปกติ ไม่ absolute เพื่อไม่ทับปุ่มบนมือถือ
          mt-2 (เดิม mt-10) ลดระยะห่างด้านบนลงมากๆ / max-w กว้างขึ้นบน desktop */}
      <p className="mt-6 text-center text-xs text-gray-600 px-6 leading-relaxed max-w-2xl md:max-w-3xl">
        This is a non-official fan project. Game assets and data are copyrighted by their original creators, with reference information provided by the LINE Rangers Handbook and Warmycat. This site is for community use only, generates no revenue, and is not affiliated with the official LINE Rangers team.
      </p>
    </main>
  )
}
