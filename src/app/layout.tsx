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
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/icon?family=Material+Icons+Round"
        />
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
