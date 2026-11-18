// หน้า /gacha-gear/[id] — สร้างไว้ล่วงหน้าทุกตู้ตอน build (static export)
import GearRoll from '@/views/gacha/GearRoll'
import { poolIds } from '@/lib/contentIds'

export const dynamicParams = false

export function generateStaticParams() {
  return poolIds('gear')
}

export default function Page() {
  return <GearRoll />
}
