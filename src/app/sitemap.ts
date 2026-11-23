import { MetadataRoute } from 'next'

export const dynamic = 'force-static'
import { SITE_URL } from '@/lib/site'

// หน้าสาธารณะทั้งหมดที่อยากให้ Google เจอ (ไม่รวม /admin, หน้าทดสอบ, /res)
// เพิ่มหน้าใหม่ = เพิ่มบรรทัดที่นี่
type Freq = MetadataRoute.Sitemap[number]['changeFrequency']
const PAGES: [path: string, freq: Freq, priority: number][] = [
  ['',                    'weekly',  1],
  ['/gacha-ranger',       'weekly',  0.9],
  ['/gacha-gear',         'weekly',  0.9],
  ['/meta',               'daily',   0.8],
  ['/ranger-book',        'daily',   0.8],
  ['/gear-book',          'daily',   0.8],
  ['/custom-tierlist',    'weekly',  0.7],
  ['/custom',             'monthly', 0.6],
  ['/lobby',              'monthly', 0.6],
  ['/custom-gacha-ranger','monthly', 0.6],
  ['/custom-video',       'monthly', 0.6],
  ['/about',              'monthly', 0.5],
]

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date()
  return PAGES.map(([path, changeFrequency, priority]) => ({
    url: `${SITE_URL}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }))
}
