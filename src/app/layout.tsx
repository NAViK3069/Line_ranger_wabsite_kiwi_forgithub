// ====================================================
// Root Layout - โครงสร้างหลักของทุกหน้า
// ====================================================

import type { Metadata } from 'next'
import './globals.css'
import DevToolsEgg from '@/components/DevToolsEgg'
import { LanguageProvider } from '@/contexts/LanguageContext'
import { SoundProvider } from '@/contexts/SoundContext'
import { SITE_URL } from '@/lib/site'
import UiClickSound from '@/components/UiClickSound'
import { WORKER_URL } from '@/lib/staticApi'

/**
 * Content-Security-Policy แบบ <meta> (GitHub Pages ตั้ง header เองไม่ได้)
 * - script: เฉพาะไฟล์ของเว็บ + สคริปต์นับสถิติ Cloudflare · 'unsafe-inline' จำเป็น เพราะ Next (static export)
 *   ฝังสคริปต์ข้อมูลหน้าไว้ใน HTML และ static site ใช้ nonce ไม่ได้ — แต่โหลดสคริปต์จากโดเมนอื่นไม่ได้แล้ว
 * - img/media/connect: เปิด https: ไว้ (รูปจาก lerico/Worker, ฟีเจอร์ "นำเข้าจากลิงก์" ในหน้า custom-video)
 * - object-src 'none' / base-uri / form-action: ปิดช่อง <object>, <base> ปลอม, ฟอร์มส่งออกนอกเว็บ
 * (frame-ancestors ใส่ใน <meta> ไม่ได้ — ต้องเป็น header เท่านั้น)
 */
const isDev = process.env.NODE_ENV === 'development'
// (Worker ในเครื่องเป็น http://127.0.0.1:8787 — ต้องใส่ origin ตรงๆ เพราะ https: ไม่ครอบคลุม)
const workerOrigin = (() => { try { return WORKER_URL ? ` ${new URL(WORKER_URL).origin}` : '' } catch { return '' } })()
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://static.cloudflareinsights.com`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  `img-src 'self' data: blob: https:${workerOrigin}`,
  `media-src 'self' data: blob: https:${workerOrigin}`,
  `connect-src 'self' https: data: blob:${workerOrigin}${isDev ? ' ws: http://localhost:* http://127.0.0.1:*' : ''}`,
  "worker-src 'self' blob:",
  "frame-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')


export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Line Ranger Kiwi — Gacha Simulator & PVP Meta',
    template: '%s | Line Ranger Kiwi',
  },
  description:
    'Line Ranger Kiwi เว็บแฟนสำหรับเกม Line Rangers — สุ่ม Gacha เรนเจอร์ & เกียร์ ดูอัตราสุ่ม และเช็คอันดับ Meta PVP Legend League',
  keywords: [
    'Line Ranger', 'Line Rangers', 'Kiwi', 'line ranger kiwi',
    'Gacha Simulator', 'สุ่มเรนเจอร์', 'สุ่มเกียร์', 'Meta PVP',
    'Legend League', 'PVP Tracker', 'line ranger gacha', 'line rangers meta',
  ],
  authors: [{ name: 'NAViK3069' }],
  creator: 'NAViK3069',
  openGraph: {
    type: 'website',
    locale: 'th_TH',
    url: SITE_URL,
    siteName: 'Line Ranger Kiwi',
    title: 'Line Ranger Kiwi — Gacha Simulator & PVP Meta',
    description:
      'เว็บแฟน Line Rangers — สุ่ม Gacha เรนเจอร์ & เกียร์ ดูอัตราสุ่ม และเช็คอันดับ Meta PVP Legend League',
    images: [{ url: '/gacha/images/LogoKiwi.png', width: 512, height: 512, alt: 'Line Ranger Kiwi' }],
  },
  twitter: {
    card: 'summary',
    title: 'Line Ranger Kiwi — Gacha Simulator & PVP Meta',
    description: 'เว็บแฟน Line Rangers — สุ่ม Gacha & เช็ค Meta PVP Legend League',
    images: ['/gacha/images/LogoKiwi.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  verification: {
    google: 'Ll_Mx8QLmCJgMQWviLuLJVojvZXfFrboQc22QCzKT-o',
  },
  icons: {
    icon: [
      { url: '/gacha/images/LogoKiwi.png', type: 'image/png', sizes: '512x512' },
    ],
    shortcut: '/gacha/images/LogoKiwi.png',
    apple: '/gacha/images/LogoKiwi.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="th">
      <head>
        <meta httpEquiv="Content-Security-Policy" content={CSP} />
        <meta name="referrer" content="strict-origin-when-cross-origin" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/icon?family=Material+Icons+Round"
        />
        {/* โหลดฟอนต์หัวข้อ (LineBold) ตั้งแต่ต้น — ไม่งั้นหัวข้อขึ้นเป็นฟอนต์สำรองก่อนแล้วค่อยเปลี่ยน (กระพริบตอน F5) */}
        <link rel="preload" href="/fonts/linebold.ttf" as="font" type="font/ttf" crossOrigin="anonymous" />
        <link rel="preload" href="/gacha/images/LogoKiwi-160.webp" as="image" type="image/webp" />
        {/* JSON-LD: บอก Google ชื่อเว็บที่ถูกต้อง (แทน "Vercel") */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebSite',
              name: 'Line Ranger Kiwi',
              alternateName: 'Line Ranger Kiwi — Gacha Simulator & PVP Meta',
              url: SITE_URL,
              description: 'เว็บแฟน Line Rangers — สุ่ม Gacha เรนเจอร์ & เกียร์ ดูอัตราสุ่ม และเช็คอันดับ Meta PVP Legend League',
            })
          }}
        />
        {/* สถิติคนเข้าเว็บ — Cloudflare Web Analytics (ไม่ใช้คุกกี้ ไม่เก็บข้อมูลส่วนตัว)
            ใส่ token ที่ GitHub Variable CF_BEACON_TOKEN · ไม่ได้ตั้ง = ไม่โหลดสคริปต์ */}
        {process.env.NEXT_PUBLIC_CF_BEACON_TOKEN && (
          <script
            defer
            src="https://static.cloudflareinsights.com/beacon.min.js"
            data-cf-beacon={JSON.stringify({ token: process.env.NEXT_PUBLIC_CF_BEACON_TOKEN })}
          />
        )}
      </head>
      <body className="min-h-screen bg-lr-dark antialiased">
        <LanguageProvider>
            <SoundProvider>
              <UiClickSound />
              {children}
              <DevToolsEgg />
            </SoundProvider>
        </LanguageProvider>
      </body>
    </html>
  )
}
