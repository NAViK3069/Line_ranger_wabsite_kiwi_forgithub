// หน้า /gacha-ranger-test/[id] — สร้างไว้ล่วงหน้าทุกตู้ตอน build (static export)
import RangerRoll from '@/views/gacha/RangerRoll'
import { poolIds } from '@/lib/contentIds'

export const dynamicParams = false

export function generateStaticParams() {
  return poolIds('ranger')
}

export default function Page() {
  return <RangerRoll />
}
