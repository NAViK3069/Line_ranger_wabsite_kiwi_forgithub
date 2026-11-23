// ====================================================
// battleStages.ts — ด่านในเกมที่ใช้เป็นพื้นหลัง (ใช้ร่วมกัน: Video Studio /custom-video + ตัวเล่นอนิเมชั่นเรนเจอร์ตอนเปิดวอลเปเปอร์)
// ทุกโฟลเดอร์บน lerico มีไฟล์ชุดเดียวกัน: bg.png + object1..6.png (ประกอบฉากด้วยวิธีเดียวกัน)
// ====================================================

/** ด่านปกติ */
const STORY = [
  'battle00', 'battle01', 'battle01-2', 'battle02', 'battle02-2', 'battle03', 'battle03-2',
  'battle04', 'battle04-2', 'battle05', 'battle05-2', 'battle06', 'battle06-2', 'battle07',
  'battle07-3', 'battle08-2', 'battle08-3', 'battle09', 'battle09-2', 'battle09-3',
  'battle10', 'battle10-2', 'battle11', 'battle12', 'battle12-2', 'battle13', 'battle13-2',
  'battle14', 'battle14-2', 'battle15', 'battle16', 'battle17', 'battle18', 'battle19',
  'battle20', 'battle21', 'battle22', 'battle23', 'battle24', 'battle25', 'battle26',
  'battle28', 'battle30', 'battle31', 'battle32', 'battle33', 'battle34', 'battle35',
  'battle36', 'battle37', 'battle38',
]

/**
 * ด่านพิเศษ (res/spbattleXX) — ไฟล์ชุดเดียวกับด่านปกติ (bg.png + object1..6.png)
 * บน lerico ไม่มี 08 / 12 / 14 / 18 (เช็คแล้ว 2026-11-23)
 */
const SPECIAL = [
  'spbattle01', 'spbattle01-2', 'spbattle02', 'spbattle03', 'spbattle04', 'spbattle05', 'spbattle06',
  'spbattle07', 'spbattle09', 'spbattle10', 'spbattle11', 'spbattle13', 'spbattle15', 'spbattle16',
  'spbattle17', 'spbattle19', 'spbattle20',
]

/** อารีน่า / ด่านทีม (ปกติ + Legend) / อีเวนต์เรด */
const EXTRA = [
  'arena_battle01',
  'battleteam01', 'battleteam01_legend', 'battleteam02', 'battleteam02_legend',
  'battleteam03', 'battleteam03_legend', 'battleteam04', 'battleteam04_legend',
  'eventraid_battle01', 'eventraid_battle02', 'eventraid_battle03', 'eventraid_battle04', 'eventraid_battle05',
]

export const BATTLE_STAGES: string[] = [...STORY, ...SPECIAL, ...EXTRA]

/**
 * ชื่อแสดงผลของด่าน
 *   short (ปุ่มเล็กในตัวเล่นอนิเมชั่น): 01-2 · SP 01 · Arena 01 · Team 01 · Team 01 L · Raid 01
 *   ปกติ: [prefix]01-2 · Special 01 · Arena 01 · Team 01 · Team 01 Legend · Event Raid 01
 */
export function stageLabel(stage: string, opts: { short?: boolean; storyPrefix?: string } = {}): string {
  const { short = false, storyPrefix = '' } = opts
  let m = stage.match(/^spbattle(.+)$/)
  if (m) return `${short ? 'SP' : 'Special'} ${m[1]}`
  m = stage.match(/^arena_battle(\d+)$/)
  if (m) return `Arena ${m[1]}`
  m = stage.match(/^battleteam(\d+)(_legend)?$/)
  if (m) return `Team ${m[1]}${m[2] ? (short ? ' L' : ' Legend') : ''}`
  m = stage.match(/^eventraid_battle(\d+)$/)
  if (m) return `${short ? 'Raid' : 'Event Raid'} ${m[1]}`
  m = stage.match(/^battle(.+)$/)
  if (m) return `${storyPrefix}${m[1]}`
  return stage
}
