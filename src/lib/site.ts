// URL จริงของเว็บ — ตั้งใน GitHub Actions variable NEXT_PUBLIC_SITE_URL (เช่น https://kiwi.example.com)
// ใช้ใน metadata / sitemap / robots / JSON-LD
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://navik3069.github.io').replace(/\/+$/, '')
