// ====================================================
// Homepage - หน้าแรกของเว็บ
// ====================================================

import Link from 'next/link'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import ProTitle from '@/components/ProTitle'
import HomeMenu from '@/components/HomeMenu'
import ResFolderLink from '@/components/ResFolderLink'

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 relative pb-8">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl" />
      </div>

      {/* About Me + Folder + Donate + Language — มุมขวาบน
          มือถือ: แถว 1 = About/Folder/Donate (wrap ได้กันล้นจอ), แถว 2 = Language
          เดสก์ท็อป: ทุกปุ่มแถวเดียวกัน (Language ซ้ายสุด) */}
      <div className="fixed top-2 right-2 left-2 sm:left-auto z-50 flex flex-col sm:flex-row items-end sm:items-center gap-1.5">
        <div className="flex items-center flex-wrap justify-end gap-1.5">
          <Link
            href="/about"
            className="px-3 py-1.5 sm:px-4 sm:py-2 card-glass text-gray-400 hover:text-white text-xs sm:text-sm rounded-xl flex items-center gap-1.5 transition-all hover:bg-white/10 border border-white/5"
          >
            <span className="material-icons-round text-sm sm:text-base">person</span>
            About
          </Link>
          {/* Folder — ลิงก์ไปหน้า /res (ดู ResFolderLink.tsx) */}
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
        {/* language: มือถือ = แถวถัดไป, เดสก์ท็อป = แถวเดียวกัน (sm:order-first ให้อยู่ซ้ายสุดบน desktop) */}
        <div className="flex items-center gap-1.5 sm:order-first">
          <LanguageSwitcher />
        </div>
      </div>

      {/* sm:pt-12 (= padding-top: 3rem): เดิม sm:pt-0 ชนเมนู, sm:pt-24 (6rem) ดันลงมาเยอะไป ลดเหลือ 3rem */}
      <div className="relative z-10 w-full text-center max-w-3xl lg:max-w-6xl mx-auto pt-28 sm:pt-12">
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

        {/* เมนูหลัก — 8 ช่องเท่ากัน (ดู src/components/HomeMenu.tsx) */}
        <div className="flex justify-center">
          <HomeMenu />
        </div>

      </div>

    </main>
  )
}
