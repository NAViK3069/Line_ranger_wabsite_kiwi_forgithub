// ====================================================
// API: GET /api/custom-assets
// รายชื่อไฟล์ประกอบฉากของหน้า /custom-gacha-ranger ใน public/gacha/custom-gacha-ranger/
//   anims  = ชื่อที่มีครบชุด .sam + .plist + .png (ใช้เป็นอนิเมชั่น)
//   images = .png ที่ไม่มี .sam ชื่อเดียวกัน (ใช้เป็นรูปนิ่ง)
// อ่านโฟลเดอร์ในเครื่องเฉยๆ ไม่แตะ DB/Redis — วางไฟล์เพิ่มแล้วกดรีเฟรชลิสต์ในแผงตั้งค่าก็เห็นทันที
// ====================================================

import { NextResponse } from 'next/server'
import { readdir } from 'fs/promises'
import path from 'path'

export const dynamic = 'force-dynamic'

const CUSTOM_ASSET_DIR = 'gacha/custom-gacha-ranger'

export async function GET() {
  let files: string[] = []
  try {
    files = await readdir(path.join(process.cwd(), 'public', CUSTOM_ASSET_DIR))
  } catch {
    // ยังไม่มีโฟลเดอร์ = ยังไม่มีไฟล์
  }
  const base = (f: string) => f.replace(/\.[^.]+$/, '')
  const has = new Set(files.map(f => f.toLowerCase()))
  const anims: string[] = []
  const images: string[] = []
  for (const f of files) {
    const low = f.toLowerCase()
    if (low.endsWith('.sam')) {
      const b = base(f)
      if (has.has(`${b.toLowerCase()}.plist`) && has.has(`${b.toLowerCase()}.png`)) anims.push(b)
    } else if (low.endsWith('.png') && !has.has(`${base(low)}.sam`)) {
      images.push(f)
    }
  }
  anims.sort()
  images.sort()
  return NextResponse.json(
    { dir: `/${CUSTOM_ASSET_DIR}`, anims, images },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
