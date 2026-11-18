/** @type {import('next').NextConfig} */
// ====================================================
// Static export สำหรับ GitHub Pages
//   next build → โฟลเดอร์ out/ (HTML/JS/CSS ล้วน ไม่มีเซิร์ฟเวอร์)
//
// สิ่งที่ static export ทำไม่ได้ และย้ายไปที่อื่นแล้ว:
//   • rewrites (/gacha-ranger → /gacha)  → ย้ายหน้าไปอยู่ที่ path จริงแทน (src/app/gacha-ranger/...)
//   • headers (CSP / cache)              → ตั้งที่ Cloudflare (Transform Rules) เมื่อโดเมนผ่าน Cloudflare
//   • API routes                         → ไฟล์ JSON ใน public/data (scripts/emit-data.ts) + Cloudflare Worker
// ====================================================
const nextConfig = {
  output: 'export',
  // GitHub Pages ไม่มีตัวแปลงรูป → ใช้ไฟล์ตรงๆ
  images: { unoptimized: true },
  // ไม่ต้องให้ build ล้มเพราะ lint (ตรวจแยกด้วย npm run lint ได้)
  eslint: { ignoreDuringBuilds: true },
}

module.exports = nextConfig
