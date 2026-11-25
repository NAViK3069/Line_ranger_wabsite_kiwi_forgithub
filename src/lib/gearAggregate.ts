// ====================================================
// รวมข้อมูลเกียร์ของทั้งลีค (ข้อมูล PvP ใน .data/db/ranger-gear.json) — ใช้ตอน build
//   /api/meta/gear-ranking = อันดับเกียร์ทั้งลีค · scripts/emit-data.ts = รายชื่อเรนเจอร์ที่ใช้เกียร์แต่ละชิ้น
// ====================================================

export interface GearItem {
  slot: string
  name: string
  iconUrl: string
  grade: number | null
  count: number
}

export interface GearRanking {
  WPN: GearItem[]
  AMR: GearItem[]
  ACC: GearItem[]
}

/** แถวเกียร์ของเรนเจอร์หนึ่งตัวในลีค — รูปเดียวกับทั้งแถว DB และค่าใน gearBatch */
export interface RangerGearRow {
  rangerId: string
  gearData: GearRanking
  sampled: number
}

/** อันดับเกียร์ทั้งลีค (หน้า Meta แท็บเกียร์) */
export function aggregateGearRanking(
  rows: RangerGearRow[],
  gradeOf: (itemCode: string) => number | null,
): { gears: GearItem[]; totalSampled: number } {
  const gearMap = new Map<string, GearItem>()
  let totalSampled = 0
  for (const row of rows) {
    totalSampled += row.sampled
    for (const slot of ['WPN', 'AMR', 'ACC'] as const) {
      for (const item of row.gearData?.[slot] ?? []) {
        const existing = gearMap.get(item.iconUrl)
        if (existing) {
          existing.count += item.count
        } else {
          // grade เป็น null (ข้อมูลเก่า) → หาจากรหัสเกียร์ในชื่อไฟล์ไอคอนแทน
          const grade = item.grade ?? (() => {
            const m = item.iconUrl.match(/\/gear_icon\/(.+)_icon\.png$/)
            return m ? gradeOf(m[1]) : null
          })()
          gearMap.set(item.iconUrl, { slot, name: item.name, iconUrl: item.iconUrl, grade, count: item.count })
        }
      }
    }
  }
  return { gears: Array.from(gearMap.values()).sort((a, b) => b.count - a.count), totalSampled }
}

export interface GearDetailRanger {
  rangerId: string
  name: string
  imageUrl: string
  slot: string
  count: number
  sampled: number
  pct: number
}

/** เรนเจอร์ที่ใส่เกียร์ชิ้นนี้ในลีค (ป๊อปอัพรายละเอียดเกียร์) */
export function gearDetailRangers(
  rows: RangerGearRow[],
  iconUrl: string,
  nameOf: (rangerId: string) => string,
): GearDetailRanger[] {
  const out: GearDetailRanger[] = []
  for (const row of rows) {
    if (row.sampled === 0) continue
    for (const slot of ['WPN', 'AMR', 'ACC'] as const) {
      const found = (row.gearData?.[slot] ?? []).find(item => item.iconUrl === iconUrl)
      if (found) {
        out.push({
          rangerId: row.rangerId,
          name: nameOf(row.rangerId),
          imageUrl: `https://rangers.lerico.net/res/${row.rangerId}/${row.rangerId}-thum.png`,
          slot,
          count: found.count,
          sampled: row.sampled,
          pct: (found.count / row.sampled) * 100,
        })
        break   // เรนเจอร์หนึ่งตัวมีเกียร์ชิ้นหนึ่งได้แค่ช่องเดียว
      }
    }
  }
  return out.sort((a, b) => b.count - a.count || b.pct - a.pct)
}
