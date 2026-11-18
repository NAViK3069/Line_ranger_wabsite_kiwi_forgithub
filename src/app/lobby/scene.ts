// ====================================================
// นิยามฉากของหน้า /lobby — แยกออกมาเพื่อให้หน้าเพจเหลือแต่การวาดกับแผงคุม
//
// พิกัดทุกอย่างอ้างผืนผ้า 1036x652 (ขนาดจริงของ Home_bg.png) แบบ 1:1
// x, y ของทุกชิ้น = ตำแหน่ง "กึ่งกลางภาพ" ไม่ใช่ origin ของไฟล์ (origin ใน .sam มักไม่อยู่กลางภาพ)
// ====================================================

export const CANVAS_W = 1036
export const CANVAS_H = 652

// ── ตัวชี้ไฟล์ ──
// ranger = ตัวละครจากโค้ดเรนเจอร์ ต้องไปถามรายชื่อไฟล์ก่อนว่าไฟล์ body ชื่ออะไร
//   alt = ใช้ไฟล์ "-e-body" (ตัวที่วาดไว้สำหรับหันกลับด้าน) ถ้าเรนเจอร์ตัวนั้นมี
//   เรนเจอร์ที่ไม่สมมาตร (เช่นผมสองสี) ถ้ามิเรอร์ไฟล์ปกติจะดูแปลก จึงมีไฟล์ -e- มาให้
// byShadow = ยึดตำแหน่งจาก "เงา" ที่วาดไว้ในไฟล์ ไม่ใช่กึ่งกลางภาพ (ใช้กับของที่ยืนบนพื้น)
export type AssetRef =
  | { kind: 'image'; url: string }
  | { kind: 'anim'; dir: string; name: string; anim: string; byShadow?: boolean }
  | { kind: 'ranger'; id: string; alt?: boolean }
  // รูปเดี่ยวที่ถูกแพ็ครวมอยู่ในไฟล์ใหญ่ (spritesheet) — ตัดเฉพาะกรอบที่ต้องการออกมาใช้
  // เกมเก็บพื้นหลังสามแบบไว้ในไฟล์เดียว จึงต้องบอกพิกัดกรอบด้วย ไม่ใช่แค่ URL
  | { kind: 'sprite'; sheet: string; x: number; y: number; w: number; h: number }

// ค่าของตัวเลือกใน dropdown เก็บเป็นสตริงเดียว เพื่อให้ใส่ใน <select> และพิมพ์ลงโค้ดได้ตรงๆ
//   image: "img:<url>"                    anim: "anim:<dir>|<name>|<anim>"
export const refToValue = (r: AssetRef): string =>
  r.kind === 'image' ? `img:${r.url}`
    : r.kind === 'ranger' ? `ranger:${r.id}${r.alt ? '|e' : ''}`
    : r.kind === 'sprite' ? `sprite:${r.sheet}|${r.x}|${r.y}|${r.w}|${r.h}`
    : `anim:${r.dir}|${r.name}|${r.anim}${r.byShadow ? '|s' : ''}`

export function valueToRef(v: string): AssetRef | null {
  if (v.startsWith('img:')) return { kind: 'image', url: v.slice(4) }
  if (v.startsWith('ranger:')) {
    const raw = v.slice(7).trim()
    const alt = raw.endsWith('|e')
    const id = (alt ? raw.slice(0, -2) : raw).trim()
    return id ? { kind: 'ranger', id, ...(alt ? { alt: true } : {}) } : null
  }
  if (v.startsWith('sprite:')) {
    const [sheet, x, y, w, h] = v.slice(7).split('|')
    const n = [x, y, w, h].map(Number)
    if (sheet && n.every(Number.isFinite)) {
      return { kind: 'sprite', sheet, x: n[0], y: n[1], w: n[2], h: n[3] }
    }
  }
  if (v.startsWith('anim:')) {
    const [dir, name, anim, flag] = v.slice(5).split('|')
    if (dir && name && anim) return { kind: 'anim', dir, name, anim, ...(flag === 's' ? { byShadow: true } : {}) }
  }
  return null
}

const img = (url: string) => refToValue({ kind: 'image', url })
const sprite = (sheet: string, x: number, y: number, w: number, h: number) =>
  refToValue({ kind: 'sprite', sheet, x, y, w, h })
const anim = (dir: string, name: string, a = 'loop') => refToValue({ kind: 'anim', dir, name, anim: a })
// อนิเมชั่นที่ยึดตำแหน่งจากเงาในไฟล์ (ของที่ยืนบนพื้น) แทนกึ่งกลางภาพ
const animShadow = (dir: string, name: string, a: string) =>
  refToValue({ kind: 'anim', dir, name, anim: a, byShadow: true })
const IMG = '/gacha/images'
const LERICO = 'https://rangers.lerico.net/res'

export interface PartOption { label: string; value: string }

// ── พื้นหลัง ──
// เกมแพ็คพื้นหลังสามแบบ + vignette ไว้ในไฟล์เดียว main_home_bg.png (1737x1960)
// พิกัดกรอบอ่านมาจาก main_home_bg.plist ที่มาคู่กัน
//
// ของเดิมเป็นไฟล์ Home_bg.png ในเครื่อง ขนาด 1036x652 = กรอบจริง 1032x648 บวกขอบ padding
// ของ atlas มาอีก 4px แปลว่าตอนแรกครอปจาก (0,0) แทนที่จะเป็น (4,4) — ติดขอบว่างมาด้วย
// คราวนี้ครอปตามกรอบจริง เลยต้องขยาย 1.007 เท่าให้เต็มเวที (ชดเชย 4px ที่หายไป)
const BG_SHEET = `${LERICO}/main_home_bg/main_home_bg.png`
export const BG_OPTIONS: PartOption[] = [
  { label: 'bg01',       value: sprite(BG_SHEET, 4, 4, 1032, 648) },
  { label: 'bg02',       value: sprite(BG_SHEET, 4, 656, 1032, 648) },
  { label: 'bg03',       value: sprite(BG_SHEET, 4, 1308, 1032, 648) },
  { label: 'vignetting', value: sprite(BG_SHEET, 1040, 4, 693, 640) },
  // ไฟล์เดิมในเครื่อง เก็บไว้เผื่ออยากกลับไปใช้ (ขนาดเต็มเวทีพอดี ไม่ต้องขยาย)
  { label: 'Home_bg (ไฟล์เดิม)', value: img(`${IMG}/Home_bg.png`) },
]

// ── ตัวเลือกของแต่ละส่วนในกลุ่มฐานยืน ──
export const BASE_OPTIONS: PartOption[] = [
  'none', 'supper', 'master', 'ultra', 'ultra_max', 'hyper', 'hyper_max', '9', '9_max',
].map(k => ({ label: `Base_${k}`, value: img(`${IMG}/Base_${k}.png`) }))

export const MAXFX_OPTIONS: PartOption[] = [
  // ชื่อโฟลเดอร์กับชื่อไฟล์ไม่ตรงกันในตัวแรก — จึงต้องเก็บ dir กับ name แยกกัน
  { label: 'ultra_master_deck_effect', value: anim(`${LERICO}/ultra_master_deck_effect`, 'fx78-intro-myhome-eff') },
  { label: 'myhome-eff02', value: anim(`${LERICO}/fx78-intro-myhome-eff02`, 'fx78-intro-myhome-eff02') },
  { label: 'myhome-eff03', value: anim(`${LERICO}/fx78-intro-myhome-eff03`, 'fx78-intro-myhome-eff03') },
]

// ดาวทุกระดับที่มีในเว็บอยู่แล้ว — 1-8 มีสามแบบ (ปกติ / + / #) ส่วน 9 มีแบบเดียว
// (9star_ability ไม่เอา — เป็นไอคอนของ ability ไม่ใช่ดาวระดับ)
//
// ต้อง encodeURIComponent ชื่อไฟล์: '#' ใน URL คือตัวเริ่ม fragment เบราว์เซอร์จะขอ
// "/gacha/images/1" แล้วทิ้ง "#star.png" ทิ้งไป → รูปกลุ่ม # ไม่ขึ้นเลย
// (ยืนยันแล้ว: 1%23star.png ตอบ 200 / 1#star.png ตอบ 404)
export const STAR_OPTIONS: PartOption[] = [
  ...[1, 2, 3, 4, 5, 6, 7, 8].flatMap(n =>
    ['', '+', '#'].map(sfx => ({
      label: `${n}${sfx}star`,
      value: img(`${IMG}/${encodeURIComponent(`${n}${sfx}star`)}.png`),
    }))
  ),
  { label: '9star', value: img(`${IMG}/9star.png`) },
]

// หอกลางเวที (twr45) — ยึดตำแหน่งจากเงาในไฟล์ เงาอยู่ที่ (110.9, 119.0) เหมือนกันทุก anim
export const TOWER_ANIM_OPTIONS: PartOption[] = [
  { label: 'normal_idle', value: animShadow(`${LERICO}/twr45`, 'twr45-body', 'normal_idle') },
  { label: 'normal_open', value: animShadow(`${LERICO}/twr45`, 'twr45-body', 'normal_open') },
  { label: 'item_cycle', value: animShadow(`${LERICO}/twr45`, 'twr45-body', 'item_cycle') },
]

// ── ข้อความเลเวลบนฐานยืน — เป็น "รูป" ทั้งชุด ไม่ใช่ฟอนต์ ──
// เกมใช้ป้าย Lv. (24x18) แล้วต่อด้วยรูปตัวเลข (14x18 ต่อตัว) ชิดกันไปเรื่อยๆ
export const LEVEL_LV_IMG = img(`${IMG}/ml_intro_level02_en.png`)
// รูปชุดนี้มีขอบใสเผื่อไว้ในไฟล์ (เช่นเลข 1 มีเนื้อจริงแค่ 9 จาก 14px)
// ถ้าวาดเต็มกรอบแล้วเลื่อนไปเท่าความกว้างไฟล์ ตัวเลขจะดูห่างกันผิดจากในเกม
// → ตัวโหลดจะวัดขอบเนื้อจริงของรูปที่เข้าเงื่อนไขนี้ไว้ แล้ว paintLevel ค่อยตัดขอบใสทิ้งตอนวาด
export const LEVEL_GLYPH_RE = /(intro_myhome_lv_num_|ml_intro_level02_en)/
const LEVEL_NUM_PREFIX = `${IMG}/intro_myhome_lv_num_`
/** รูปตัวเลขของเลเวลหนึ่งๆ เรียงซ้ายไปขวา — ตัวที่ไม่ใช่ 0-9 ถูกข้าม */
export function levelNumUrls(text: string | undefined): string[] {
  return [...(text ?? '')]
    .filter(c => c >= '0' && c <= '9')
    .map(c => `img:${LEVEL_NUM_PREFIX}0${c}.png`)
}

// ยศหน้าเลเวล — ปิดได้ (ค่าว่าง)
export const RANK_OPTIONS: PartOption[] = [
  'supper', 'master', 'ultra', 'hyper', '9',
].map(k => ({ label: `T_${k}`, value: img(`${IMG}/T_${k}.png`) }))

// ธาตุ — ใช้ไอคอนชุดเดียวกับที่ RangerStatPanel ใช้อยู่
export const ELEMENT_OPTIONS: PartOption[] = [
  { label: 'Fire', value: img(`${IMG}/Fire.png`) },
  { label: 'Water', value: img(`${IMG}/Water.png`) },
  { label: 'Wood', value: img(`${IMG}/Tree.png`) },
  { label: 'Light', value: img(`${IMG}/Light.png`) },
  { label: 'Dark', value: img(`${IMG}/Dark.png`) },
]

// ── พรสวรรค์ ──
// ระดับ 1-3 เป็นรูปนิ่ง (~312x314) ส่วนระดับตัน (4) เป็นอนิเมชั่นในเครื่อง (สไปรต์ 88x88)
// ไอคอนสองชุดนี้ขนาดต่างกันมาก จึงมีตัวคูณชดเชยตอนวาด (ดู TALENT_MAX_SCALE ใน team.ts)
const TALENT_DIR = '/gacha/animation/Talent'
export const TALENT_OPTIONS: PartOption[] = [
  { label: 'tlt1', value: img(`${IMG}/tlt1.png`) },
  { label: 'tlt2', value: img(`${IMG}/tlt2.png`) },
  { label: 'tlt3', value: img(`${IMG}/tlt3.png`) },
  { label: 'talent_max', value: anim(TALENT_DIR, 'com_icon_talent_max', 'loop') },
]

// ── กลุ่มเมนู ──
// ป้ายเมนู 106x122 / ไอคอน 66-86px / ข้อความ 44-74x20-22 / แจ้งเตือน ~59x30
export const MENU_PLATE = img(`${IMG}/Menu.png`)
export const MENU_ICON_OPTIONS: PartOption[] = [
  '00', '01', '02', '04', '06', '07', '08',
].map(k => ({ label: `img${k}`, value: img(`${IMG}/intro_myhome_img${k}.png`) }))
export const MENU_TEXT_OPTIONS: PartOption[] = [
  'collect', 'friends', 'giftbox', 'mission', 'myteam', 'shop', 'upgrade',
].map(k => ({ label: k, value: img(`${IMG}/ml_intro_${k}_en.png`) }))
// ปุ่มตั้งค่า 66x60 — ชิ้นเดี่ยว ไม่ได้อยู่ในแถวเมนู 7 อัน แต่จัดไว้หมวดเดียวกัน
export const SETTING_OPTIONS: PartOption[] = [
  { label: 'setting', value: img(`${IMG}/setting.png`) },
]
export const MENU_BADGE_OPTIONS: PartOption[] = [
  { label: 'free', value: img(`${IMG}/ml_intro_myhome_free_en.png`) },
  { label: 'new', value: img(`${IMG}/ml_intro_myhome_new_en.png`) },
]

// ── แถบบอกจำนวนทรัพยากร (stage) ──
// พื้นแถบ 40x38 ยืดกลางได้ / ปุ่มบวก 38x40 / ขนนก 42x44 / ป้ายอีเวนต์ 68x26
export const STAGE_BAR = img(`${IMG}/stage_icon_bg00.png`)
export const STAGE_PLUS = img(`${IMG}/stage_plus_icon.png`)
export const STAGE_EVENT = img(`${IMG}/ml_stage_sub_event_en.png`)
// ไอคอนบอกชนิดทรัพยากร — ปนกันได้ทั้งอนิเมชั่นและรูปนิ่ง (ตัวโหลดแยกจากค่าที่เก็บอยู่แล้ว)
export const STAGE_ICON_OPTIONS: PartOption[] = [
  { label: 'ruby', value: anim(`${LERICO}/hd/common/balance`, 'fx25-ruby', 'start') },
  { label: 'coin', value: anim(`${LERICO}/hd/common/balance`, 'fx26-coin', 'start') },
  { label: 'feather', value: img(`${IMG}/stage_feather_icon.png`) },
]

// ── กลุ่มโปรไฟล์ ──
// กรอบ 164x82 / ธง 82x96-124 / เสาธง 106x22 / หลอด bg 24x16 bar 18x16 / เลข 18x30
// ข้อความระดับ 46-60x14-16 / ข้อความ level 46x16
export const PROFILE_FRAME = img(`${IMG}/intro_myhome_profile.png`)

// รูปโปรไฟล์จาก lerico (101 รูป) — โหลดผ่านด่าน Pro เดิมเหมือนไฟล์อนิเมชั่น
const PROFILE_DIR = `${LERICO}/user_profile_img`
export const PROFILE_IMG_OPTIONS: PartOption[] = [
  'profile_evt_2603_1', 'profile_evt_2603_2', 'profile_evt_2603_3', 'profile_evt_2603_4', 'profile_img_001', 'profile_img_002',
  'profile_img_003', 'profile_img_004', 'profile_img_005', 'profile_img_006', 'profile_img_007', 'profile_img_008',
  'profile_img_009', 'profile_img_010', 'profile_img_011', 'profile_img_012', 'profile_img_013', 'profile_img_014',
  'profile_img_015', 'profile_img_016', 'profile_img_017', 'profile_img_018', 'profile_img_019', 'profile_img_020',
  'profile_img_lv100', 'profile_img_lv199', 'profile_img_lv298', 'profile_img_lv397', 'profile_img_lv496', 'profile_laby_2403',
  'profile_laby_2403_2', 'profile_laby_2405', 'profile_laby_2405_2', 'profile_laby_2407', 'profile_laby_2407_2', 'profile_laby_2409',
  'profile_laby_2409_1', 'profile_laby_2409_2', 'profile_laby_2411', 'profile_laby_2411_1', 'profile_laby_2411_2', 'profile_laby_2501',
  'profile_laby_2501_1', 'profile_laby_2501_2', 'profile_laby_2503', 'profile_laby_2503_1', 'profile_laby_2503_2', 'profile_laby_2505',
  'profile_laby_2505_1', 'profile_laby_2505_2', 'profile_laby_2507', 'profile_laby_2507_1', 'profile_laby_2507_2', 'profile_laby_2509',
  'profile_laby_2509_1', 'profile_laby_2509_2', 'profile_laby_2511', 'profile_laby_2511_1', 'profile_laby_2511_2', 'profile_laby_2601',
  'profile_laby_2601_1', 'profile_laby_2601_2', 'profile_laby_2603', 'profile_laby_2603_1', 'profile_laby_2603_2', 'profile_laby_2605',
  'profile_laby_2605_1', 'profile_laby_2605_2', 'profile_laby_2607', 'profile_laby_2607_1', 'profile_laby_2607_2', 'profile_pkg_2412',
  'profile_pkg_2502', 'profile_pkg_2508', 'profile_pkg_2508_ak', 'profile_pkg_2508_de', 'profile_pkg_2508_de2', 'profile_pkg_2508_ko',
  'profile_pkg_2508_ma', 'profile_pkg_2508_po', 'profile_pkg_2508_sa', 'profile_pkg_2512_af', 'profile_pkg_2512_af2', 'profile_pkg_2512_af3',
  'profile_pkg_2512_af4', 'profile_pkg_2512_af5', 'profile_pkg_2512_af6', 'profile_pkg_2512_bf', 'profile_pkg_2512_bf2', 'profile_pkg_2512_lf',
  'profile_pkg_2512_yb', 'profile_pkg_2512_yf', 'profile_pkg_2608_ho', 'profile_pkg_2608_ka', 'profile_pkg_2608_ka2', 'profile_pkg_2608_ka3',
  'profile_pkg_2608_ka4', 'profile_pkg_2608_ki', 'profile_pkg_2608_mi', 'profile_pkg_2608_na', 'profile_pkg_2608_re',
].map(n => ({ label: n, value: img(`${PROFILE_DIR}/${n}.png`) }))

export const PROFILE_POLE_OPTIONS: PartOption[] = [
  { label: 'legend', value: img(`${IMG}/intro_myhome_profile_flag_legend_pole.png`) },
  { label: 'superlegend', value: img(`${IMG}/intro_myhome_profile_flag_superlegend_pole.png`) },
]
export const PROFILE_FLAG_OPTIONS: PartOption[] = [
  'normal', 'master', 'super', 'ultra', 'legend', 'superlegend',
].map(k => ({ label: k, value: img(`${IMG}/intro_myhome_profile_flag_${k}.png`) }))

// หลอด — ยึดซ้ายแล้วขยายไปทางขวา (ต่างจากแถบทรัพยากรที่ยืดออกสองข้างจากกึ่งกลาง)
export const GAUGE_BG_OPTIONS: PartOption[] = [
  { label: 'normal', value: img(`${IMG}/intro_myhome_gage_bg.png`) },
  { label: 'master', value: img(`${IMG}/intro_myhome_gauge_master_bg.png`) },
  { label: 'super', value: img(`${IMG}/intro_myhome_gauge_super_bg.png`) },
  { label: 'ultra', value: img(`${IMG}/intro_myhome_gauge_ultra_bg.png`) },
  { label: 'legend', value: img(`${IMG}/intro_myhome_gauge_legend_bg.png`) },
]
export const GAUGE_BAR_OPTIONS: PartOption[] = [
  { label: 'normal', value: img(`${IMG}/intro_myhome_gage_bar.png`) },
  { label: 'ultra', value: img(`${IMG}/intro_myhome_gauge_ultra_bar.png`) },
  { label: 'legend', value: img(`${IMG}/intro_myhome_gauge_legend_bar.png`) },
]

// ชุดตัวเลขเลเวล — เก็บเป็น "คำนำหน้าไฟล์" แล้วต่อ 00-09 ตอนวาด
// ตำนานกับซุปเปอร์ตำนานใช้ชุดเดียวกัน (legend)
export const NUM_SET_OPTIONS: PartOption[] = [
  { label: 'normal', value: `digits:${IMG}/intro_myhome_profile_num_` },
  { label: 'master', value: `digits:${IMG}/intro_myhome_profile_master_num_` },
  { label: 'super', value: `digits:${IMG}/intro_myhome_profile_super_num_` },
  { label: 'ultra', value: `digits:${IMG}/intro_myhome_profile_ultra_num_` },
  { label: 'legend', value: `digits:${IMG}/intro_myhome_profile_legend_num_` },
]

export const FLAG_TEXT_OPTIONS: PartOption[] = [
  'master', 'super', 'ultra', 'legend', 'superlegend',
].map(k => ({ label: k, value: img(`${IMG}/ml_intro_flag_${k}_en.png`) }))
export const LEVEL_TEXT_OPTIONS: PartOption[] = [
  { label: 'normal', value: img(`${IMG}/ml_intro_level01_en.png`) },
  { label: 'master', value: img(`${IMG}/ml_intro_level01_master_en.png`) },
  { label: 'super', value: img(`${IMG}/ml_intro_level01_super_en.png`) },
  { label: 'ultra', value: img(`${IMG}/ml_intro_level01_ultra_en.png`) },
  { label: 'legend', value: img(`${IMG}/ml_intro_level01_legend_en.png`) },
]

// ── ฟีดข่าว ──
// ไอคอน: อนิเมชั่น event (30f @24fps) / buff (50f @30fps) หรือรูปกล่องของขวัญ 58x82
// ข้อความ 40-64x18
export const NEWS_ICON_OPTIONS: PartOption[] = [
  { label: 'event', value: anim(`${LERICO}/home_anim_icon`, 'event') },
  { label: 'buff', value: anim(`${LERICO}/home_anim_icon`, 'intro_myhome_icon_buff') },
  { label: 'gift', value: img(`${IMG}/pop_gift_icon_08.png`) },
]
export const NEWS_TEXT_OPTIONS: PartOption[] = [
  { label: 'news', value: img(`${IMG}/ml_intro_myhome_news_en.png`) },
  { label: 'buff', value: img(`${IMG}/ml_intro_myhome_buff_en.png`) },
  { label: 'booster', value: img(`${IMG}/ml_intro_myhome_booster_en.png`) },
]

// ── โฆษณา ──
// ป้าย 244x88
export const ADS_OPTIONS: PartOption[] = [
  { label: 'ads01', value: img(`${IMG}/ads01.png`) },
]

// ── เมนูกาชา ──
// อนิเมชั่น ready / ready_event อย่างละ 90 เฟรม @30fps (3 วิ) / ป้าย 126x38
export const GACHA_ANIM_OPTIONS: PartOption[] = [
  { label: 'ready', value: anim(`${LERICO}/h_menu_gacha`, 'h_menu_gacha', 'ready') },
  { label: 'ready_event', value: anim(`${LERICO}/h_menu_gacha`, 'h_menu_gacha', 'ready_event') },
]
export const GACHA_SIGN_OPTIONS: PartOption[] = [
  { label: 'gacha_sign', value: img(`${IMG}/gacha_sign.png`) },
]

// ── ค่าไฟล์ที่ส่วนย่อยหนึ่งชิ้นต้องใช้จริง ──
// kind 'ranger' คิดจากโค้ดที่พิมพ์ (ไม่มี dropdown) ที่เหลืออ่านจาก option ที่เลือกไว้
// รวมไว้ที่เดียวเพื่อให้ "ตัวที่โหลด" กับ "ตัวที่วาด" ใช้ค่าเดียวกันเสมอ ไม่ต้องซิงก์สองที่
// ── ไฟล์ทั้งหมดที่ส่วนย่อยหนึ่งชิ้นต้องโหลด ──
// ปกติชิ้นละไฟล์เดียว ยกเว้น digits ที่ต้องโหลดรูปเลขทุกตัวที่ใช้จริงในจำนวนนั้น
export function partValues(p: ScenePart, mirrored = false): string[] {
  if (p.kind === 'digits') return digitUrls(p)
  // เลเวล = ไอคอนยศ (ถ้าเปิด) + ป้าย Lv. + รูปตัวเลขทุกหลักที่ใช้จริง
  if (p.kind === 'level') return [...(p.option ? [p.option] : []), LEVEL_LV_IMG, ...levelNumUrls(p.text)]
  const v = partValue(p, mirrored)
  return v ? [v] : []
}

// รูปเลขที่ต้องใช้สำหรับจำนวนหนึ่งๆ — เรียงตามลำดับที่จะวาด (ซ้ายไปขวา)
// ตัวที่ไม่ใช่ 0-9 ถูกข้าม เช่นเผลอพิมพ์จุลภาคมาก็ไม่พัง
export function digitUrls(p: ScenePart): string[] {
  if (!p.option.startsWith('digits:')) return []
  const prefix = p.option.slice(7)
  return [...(p.text ?? '')]
    .filter(c => c >= '0' && c <= '9')
    .map(c => `img:${prefix}0${c}.png`)
}

export function partValue(p: ScenePart, mirrored = false): string {
  if (p.kind === 'ranger') {
    const id = (p.text ?? '').trim()
    // ฝั่งกระจกขอไฟล์ตัวหันกลับด้าน (ถ้าเรนเจอร์ตัวนั้นไม่มี ตัวโหลดจะถอยไปใช้ไฟล์ปกติเอง)
    return id ? `ranger:${id}${mirrored ? '|e' : ''}` : ''
  }
  return p.option
}

// หาค่าตัวเลือกจากชื่อ label — ใช้เขียนค่าตั้งต้นให้อ่านรู้เรื่อง (ตรงกับชื่อในช่อง Pick ของตาราง)
// หาไม่เจอ = คืนค่าว่าง (ส่วนนั้นจะปิดไว้) จะเห็นได้ทันทีตอนเปิดหน้า
export const optionValue = (opts: PartOption[], label: string): string => opts.find(o => o.label === label)?.value ?? ''
const byLabel = optionValue

// ── ส่วนย่อยในกลุ่ม ──
// kind 'level' เป็นข้อความ (font LineBold) + ไอคอนยศหน้าข้อความ จัดกลางทั้งชุด
export interface ScenePart {
  id: string
  label: string
  // stretch = รูปที่ยืดกลางได้ (หัวท้ายคงขนาดเดิม) / text = ข้อความชิดขวา ปรับสีได้
  // digits = เอารูปตัวเลขมาต่อกันเป็นจำนวน (เช่น "15" = รูป 01 ต่อ 05 ชิดกัน)
  kind: 'image' | 'anim' | 'level' | 'ranger' | 'stretch' | 'text' | 'digits'
  options: PartOption[]
  option: string            // '' = ปิด/ยังไม่เลือก
  // kind 'level'  = ข้อความเลเวลที่จะแสดง
  // kind 'ranger' = โค้ดเรนเจอร์ (เช่น u1147e-benimaru) — ตัวไฟล์คิดจากค่านี้ตรงๆ
  // kind 'text'   = ข้อความที่จะแสดง
  text?: string
  // kind 'stretch': ความกว้างรวมที่ต้องการ (world unit ก่อนคูณ scale) — ยืดเฉพาะช่วงกลาง
  w?: number
  // kind 'stretch': ความกว้างหัว/ท้ายที่ห้ามยืด (พิกเซลของไฟล์ต้นฉบับ)
  cap?: number
  // kind 'text': สีตัวอักษร
  color?: string
  // จุดยึดของภาพ: center = กึ่งกลาง (ค่าปกติ) / left = ยึดขอบซ้าย ขยายไปทางขวา / top = กึ่งกลางแนวนอน ชิดขอบบน
  anchor?: 'center' | 'left' | 'top'
  // kind 'stretch': เปอร์เซ็นต์ของความกว้าง w ที่จะวาดจริง (100 = เต็ม) ใช้กับหลอดเลเวล
  pct?: number
  // kind 'stretch' แบบ 9 ช่อง (ใส่ h แล้วจะยืดทั้งแกน X และ Y): ความสูงรวม (หน่วยเดียวกับ w)
  // ยืดเฉพาะคอลัมน์ sliceX กับแถว sliceY ของไฟล์ (เส้นละ 1px) ส่วนอื่นคงขนาดเดิม
  // ใช้กับปุ่มที่จุดยืดไม่ได้อยู่กลางรูป (ปุ่มเขียว/ฟ้า ยืดที่ขวาล่างของกลาง เพื่อไม่ให้แสงเงาบนปุ่มถูกดึง)
  h?: number
  sliceX?: number
  sliceY?: number
  // หมุนภาพรอบจุดที่วางไว้ (องศา บวก = ตามเข็ม) — ใช้ได้ทั้งรูปนิ่งและอนิเมชั่น
  rot?: number
  dx: number                // ออฟเซ็ตจากจุดกลางของกลุ่ม (คูณ scale ของกลุ่มด้วย)
  dy: number
  scale: number             // คูณกับ scale ของกลุ่ม
  order: number             // ลำดับในกลุ่ม เลขมากอยู่หน้า
  visible: boolean
}

// ส่วนย่อยที่ "ขนาดไม่ตามกลุ่ม" — ย่อ/ขยายกลุ่มแล้วสามตัวนี้คงขนาดเท่าต้นฉบับในกลุ่มแม่
// (ตำแหน่งยังขยับตามกลุ่มปกติ ยกเว้นแค่ขนาด) เพราะข้อความเลเวล ไอคอนธาตุ และตัวเรนเจอร์
// ต้องอ่านออก/ดูเท่ากันทุกช่อง แม้ฐานยืนของแต่ละช่องจะย่อไม่เท่ากัน
export const SCALE_EXEMPT_PARTS = new Set(['idle', 'level', 'element', 'talent'])

// ส่วนย่อยที่ต้อง "สลับข้าง" ของระยะเยื้องแนวนอนเมื่ออยู่ฝั่งกระจก
// ไอคอนธาตุวางเยื้องออกข้างฐาน (dx +47) ฝั่งขวาจึงต้องเป็น -47 ไม่งั้นสองฝั่งจะเยื้องไปทางเดียวกัน
// เยื้องแนวตั้ง (dy) ไม่แตะ เพราะกระจกซ้าย-ขวาไม่เกี่ยวกับแกนตั้ง
export const MIRROR_FLIP_DX_PARTS = new Set(['element', 'talent'])

// ── ชิ้นในฉาก ──
// เดี่ยว     = มี src
// กลุ่มแม่   = มี parts (แก้ไส้ได้)
// สำเนา      = มี copyOf ชี้ไปที่กลุ่มแม่ (ใช้ไส้ชุดเดียวกัน แก้ได้แค่ XY / ขนาด / เลเยอร์)
// กลุ่มแถว   = มี rowGroup เป็นรายชื่อชิ้นที่จะเรียงเป็นแนวนอนจากจุดเดียวกัน
//              ลูกแต่ละตัวเลือกรูปของตัวเองได้ แต่ตำแหน่ง/ขนาด/เลเยอร์คิดจากแถว
//              gap = ระยะห่างระหว่างลูกแต่ละตัว (world unit ก่อนคูณ scale)
// กลุ่มกระจก = มี mirrorGroup เป็นรายชื่อฐานฝั่งซ้ายที่จะสะท้อนไปฝั่งขวา
//              ทั้งชุดเป็นแถวเดียวในตาราง → ขยับ x/y ครั้งเดียวเลื่อนฝั่งขวาพร้อมกันทั้งหมด
//              x/y คือ "ระยะขยับเพิ่ม" จากจุดกระจก (0,0 = กระจกเป๊ะ)
export interface SceneItem {
  id: string
  label: string
  x: number
  y: number
  scale: number
  layer: number
  visible: boolean
  src?: AssetRef
  parts?: ScenePart[]
  copyOf?: string
  mirrorGroup?: string[]
  rowGroup?: string[]
  gap?: number
  // หมวดในตารางคุม — ใช้จัดกลุ่มแถวให้พับได้ ไม่มีผลกับการวาดเลย
  section?: string
  // ขนาดตัวละครเฉพาะของฐานนี้ (ไม่ใส่ = ใช้ค่าของกลุ่มแม่)
  // ต้องมีช่องนี้เพราะสำเนาใช้ไส้ชุดเดียวกับกลุ่มแม่ จะแก้ scale ของ 'idle' ทีละช่องไม่ได้
  // ฝั่งกระจกยืมค่าจากฐานต้นทางเอง สองฝั่งจึงขนาดเท่ากันเสมอ
  idleScale?: number
  // ยืม "แกน Y ของไอคอนธาตุ" จากช่องอื่น — ไอคอนธาตุของสองช่องจะอยู่ระดับเดียวกันเป๊ะ
  // ต้องยืมเพราะแต่ละช่องมี y/scale ต่างกัน ระยะเยื้อง dy เดียวกันจึงตกไม่เท่ากัน
  // มีผลกับแกน Y ของไอคอนธาตุเท่านั้น ส่วนอื่นในช่องยังใช้ค่าของตัวเอง
  elementYFrom?: string
}

// ── หนึ่งชิ้นที่พร้อมวาด ──
// รวมกฎตำแหน่งทั้งหมดไว้ที่ expandScene() ที่เดียว ฝั่งที่วาดจึงไม่ต้องรู้เรื่อง copyOf / กระจก
export interface DrawUnit {
  key: string
  x: number
  y: number
  scale: number
  layer: number
  src?: AssetRef
  parts?: ScenePart[]
  // ขนาดของกลุ่มแม่ — ใช้เป็นตัวอ้างของส่วนย่อยที่ยกเว้นการย่อ (SCALE_EXEMPT_PARTS)
  masterScale: number
  // อยู่ฝั่งกระจกไหม — ใช้ตัดสินว่าจะสลับข้าง dx และขอไฟล์ตัวละครตัวหันกลับด้าน
  mirrored: boolean
  // ฐานอ้างอิงของแกน Y ไอคอนธาตุ (null = ใช้ y/scale ของตัวเอง)
  elemYRef: { y: number; scale: number } | null
}

// ── คลี่ฉากเป็นรายการที่พร้อมวาด เรียงตามเลเยอร์แล้ว ──
// กระจก: X พลิกรอบกลางผืนผ้า (x' = CANVAS_W - x) ส่วน Y / ขนาด / ไส้ ตามต้นทางฝั่งซ้าย
//        แล้วบวกระยะขยับของกลุ่มกระจกเข้าไปทั้ง X และ Y — ตัวรูปไม่พลิกด้าน พลิกแค่ตำแหน่ง
export function expandScene(all: SceneItem[]): DrawUnit[] {
  const byId = new Map(all.map(i => [i.id, i]))
  const owner = (it: SceneItem): SceneItem => (it.copyOf ? byId.get(it.copyOf) : it) ?? it
  const out: DrawUnit[] = []

  // ไส้ของช่องนั้นๆ — ปกติใช้ของกลุ่มแม่ตรงๆ ยกเว้นช่องที่ตั้งขนาดตัวละครของตัวเองไว้
  const partsOf = (it: SceneItem): ScenePart[] | undefined => {
    const base = owner(it).parts
    if (!base || it.idleScale === undefined) return base
    return base.map(p => (p.id === 'idle' ? { ...p, scale: it.idleScale as number } : p))
  }

  for (const it of all) {
    if (!it.visible) continue

    if (it.mirrorGroup) {
      // ไล่จากท้ายรายการมาหน้า → ตัวแรกในรายการ (ฐานหน้าสุด) ถูกวาดหลังสุดจึงทับตัวอื่น
      // ตรงกับลำดับเลเยอร์ของฝั่งซ้ายที่ไล่จากกลุ่มแม่ลงมา
      for (const srcId of [...it.mirrorGroup].reverse()) {
        const src = byId.get(srcId)
        if (!src || !src.visible) continue
        const ref = src.elementYFrom ? byId.get(src.elementYFrom) : undefined
        out.push({
          key: `${it.id}:${srcId}`,
          x: CANVAS_W - src.x + it.x,
          y: src.y + it.y,
          scale: src.scale,
          layer: it.layer,
          parts: partsOf(src),
          masterScale: owner(src).scale,
          mirrored: true,
          // ตัวที่ยืมแกน Y ต้องยืมค่าที่ "ขยับแล้ว" ด้วย ไม่งั้นขยับกลุ่มกระจกแล้วธาตุหลุดแนว
          elemYRef: ref ? { y: ref.y + it.y, scale: ref.scale } : null,
        })
      }
      continue
    }

    if (it.rowGroup) {
      // เรียงแนวนอนจากจุดเดียวกัน: ลูกตัวที่ i อยู่ห่างออกไป i * gap (คูณ scale ของแถว)
      // แกน Y เท่ากันทุกตัวโดยปริยาย เพราะใช้ y ของแถวตรงๆ
      const gap = it.gap ?? 0
      it.rowGroup.forEach((memberId, i) => {
        const mem = byId.get(memberId)
        if (!mem || !mem.visible) return
        out.push({
          key: `${it.id}:${memberId}`,
          x: it.x + i * gap * it.scale,
          y: it.y,
          scale: it.scale,
          layer: it.layer,
          parts: mem.parts,
          masterScale: it.scale,
          mirrored: false,
          elemYRef: null,
        })
      })
      continue
    }

    // ลูกของกลุ่มแถวถูกวาดผ่านแถวไปแล้ว ไม่ต้องวาดเป็นชิ้นเดี่ยวซ้ำ
    if (all.some(o => o.rowGroup?.includes(it.id))) continue

    const ref = it.elementYFrom ? byId.get(it.elementYFrom) : undefined
    out.push({
      key: it.id,
      x: it.x, y: it.y, scale: it.scale, layer: it.layer,
      src: it.src,
      parts: partsOf(it),
      masterScale: owner(it).scale,
      mirrored: false,
      elemYRef: ref ? { y: ref.y, scale: ref.scale } : null,
    })
  }
  // sort เสถียร → ชิ้นที่เลเยอร์เท่ากันคงลำดับที่ push ไว้
  return out.sort((a, b) => a.layer - b.layer)
}

// ── หมวดของตารางคุม ── เรียงตามลำดับที่อยากให้โผล่ในตาราง
export const SECTIONS = ['ฉาก', 'หอกลาง', 'ฐานยืนเรนเจอร์', 'แถบทรัพยากร', 'เมนู', 'เมนูกาชา', 'โปรไฟล์', 'ฟีดข่าว', 'โฆษณา'] as const

// เลเยอร์ของกลุ่มฐานยืน: กลุ่มแม่สูงสุด แล้วไล่ลดลงทีละขั้นตามลำดับในตาราง
// (กลุ่มแม่ → สำเนา 2-5 → กระจก 1-5) ตัวที่เลขสูงกว่าจะวาดทับตัวที่เลขต่ำกว่า
// เว้นเลข 0-2 ไว้ให้พื้นหลัง / ฉากกลาง / ฐานหอ
const BASE_LAYER_TOP = 12

// ค่าตั้งต้น — ตัวเลขชุดนี้มาจากแผงคุมของหน้า /lobby (วางทับได้เลย)
export const SCENE_DEFAULT: SceneItem[] = [
  {
    // พื้นหลังเป็นกลุ่มที่มีไส้ชิ้นเดียว เพื่อให้ได้ dropdown เลือกรูปในแผงคุม
    // (ชิ้นเดี่ยวที่มี src เฉยๆ จะเลือกรูปไม่ได้)
    id: 'bg', label: 'พื้นหลัง', section: 'ฉาก', layer: 0, visible: true,
    x: 518, y: 326, scale: 1,
    parts: [
      { id: 'bg', label: 'รูปพื้นหลัง', kind: 'image', options: BG_OPTIONS,
        option: byLabel(BG_OPTIONS, 'bg02'),
        dx: 0, dy: 0, scale: 1.007, order: 0, visible: true },
    ],
  },
  {
    // อยู่เลเยอร์เดียวกับ mainstage แต่วางไว้ก่อนในรายการ → ถูกวาดก่อน = อยู่ด้านหลัง
    // (expandScene ใช้ sort แบบเสถียร ของที่เลเยอร์เท่ากันจึงคงลำดับตามที่เขียนไว้)
    id: 'obj01', label: 'h_menu_obj_01 · idle', section: 'ฉาก', layer: 1, visible: true,
    src: { kind: 'anim', dir: `${LERICO}/h_menu_obj_01`, name: 'h_menu_obj_01', anim: 'idle' },
    x: 518, y: 147, scale: 1,
  },
  {
    id: 'mainstage', label: 'h_menu_mainstage · ready', section: 'ฉาก', layer: 1, visible: true,
    src: { kind: 'anim', dir: `${LERICO}/h_menu_mainstage`, name: 'h_menu_mainstage', anim: 'ready' },
    x: 518, y: 187, scale: 1,
  },
  {
    // กลุ่มหอกลางเวที — ฐานหอ + ตัวหอ (twr45) ย่อ/ย้ายกลุ่มแล้วทั้งสองชิ้นตามไปด้วย
    id: 'tower', label: 'Tower (group)', section: 'หอกลาง', layer: 2, visible: true,
    x: 505, y: 400, scale: 1,
    parts: [
      { id: 'towerplate', label: '1. ฐานหอ',  kind: 'image', options: [{ label: 'Base_Tower', value: img(`${IMG}/Base_Tower.png`) }], option: img(`${IMG}/Base_Tower.png`), dx: 0, dy: 0, scale: 1, order: 0, visible: true },
      // ยึดตำแหน่งจากเงาในไฟล์เหมือนตัวเรนเจอร์ → dx/dy คือระยะเยื้องของเงา
      { id: 'twr',        label: '2. ตัวหอ',   kind: 'anim',  options: TOWER_ANIM_OPTIONS, option: TOWER_ANIM_OPTIONS[0].value, dx: 0, dy: 3, scale: 0.45, order: 1, visible: true },
    ],
  },
  {
    // กลุ่มฐานยืนเรนเจอร์ — ย่อ/ขยาย/ย้ายกลุ่มแล้วทุกชิ้นข้างในตามไปด้วย
    // เลเยอร์สูงสุดของกลุ่มฐาน แล้วไล่ลดลงตามลำดับในตาราง (ดูหมายเหตุที่ BASE_LAYER_TOP)
    id: 'rangerbase', label: 'Ranger base (group)', section: 'ฐานยืนเรนเจอร์', layer: BASE_LAYER_TOP, visible: true,
    x: 321, y: 444, scale: 0.95,
    // ⚠️ หกชิ้นนี้ "แผงจัดทีม" เป็นคนเลือกให้ตอนวาด (ดู applyTeams ใน team.ts)
    //    ค่าที่ตั้งไว้ตรงนี้คือสภาพช่องว่าง — ที่ยังแก้ในตารางได้จริงคือตำแหน่ง/ขนาด/ลำดับ
    parts: [
      { id: 'base',    label: '1. ฐานยืน',        kind: 'image', options: BASE_OPTIONS,    option: byLabel(BASE_OPTIONS, 'Base_none'), dx: 0,  dy: 0,   scale: 1,    order: 0, visible: true },
      { id: 'maxfx',   label: '2. เอฟเฟค MAX',    kind: 'anim',  options: MAXFX_OPTIONS,   option: '',                                 dx: 0,  dy: -43, scale: 1,    order: 1, visible: true },
      // ยึดตำแหน่งจาก "จุดยืน" (เงา) ของตัวละคร ไม่ใช่กึ่งกลางภาพ — dx/dy จึงเป็นระยะเยื้องของเงา
      { id: 'idle',    label: '3. idle เรนเจอร์',  kind: 'ranger', options: [],             option: '', text: '',                       dx: 0,  dy: -17, scale: 0.6148, order: 2, visible: true },
      { id: 'star',    label: '4. ดาวระดับ',      kind: 'image', options: STAR_OPTIONS,    option: '',                                 dx: 0,  dy: 8,   scale: 0.15, order: 3, visible: true },
      // scale 1 = ขนาดต้นฉบับของรูป (ป้าย Lv. 24x18 / เลข 14x18) — เดิม 0.55 เป็นค่าของยุคที่ยังวาดด้วยฟอนต์
      { id: 'level',   label: '5. เลเวล + ยศ',    kind: 'level', options: RANK_OPTIONS,    option: '',                                 dx: 0,  dy: 31,  scale: 1,    order: 4, visible: true, text: '' },
      { id: 'element', label: '6. ธาตุ',          kind: 'image', options: ELEMENT_OPTIONS, option: '',                                 dx: 47, dy: -35, scale: 0.35, order: 5, visible: true },
      // วางทับตำแหน่งเดียวกับธาตุตั้งใจ — สองอันสลับกันโผล่แบบเฟดเข้าออก ไม่ได้โชว์พร้อมกัน
      // scale ต่างกันเพราะไฟล์ tlt ใหญ่ราว 312px ส่วนไอคอนธาตุ 77px (ขนาดที่วาดออกมาเท่ากัน)
      { id: 'talent',  label: '7. พรสวรรค์',      kind: 'image', options: TALENT_OPTIONS,  option: '',                                 dx: 47, dy: -35, scale: 0.086, order: 6, visible: true },
    ],
  },
  // ── ฝั่งซ้าย 4 ช่องที่เหลือ — ใช้ไส้ชุดเดียวกับกลุ่มแม่ แก้เฉพาะตำแหน่ง/ขนาด/เลเยอร์ ──
  ...[
    { id: 'rangerbase2', x: 147, y: 447, scale: 0.9, elementYFrom: 'rangerbase' },
    { id: 'rangerbase3', x: 369, y: 330, scale: 0.7 },
    { id: 'rangerbase4', x: 239, y: 328, scale: 0.7, elementYFrom: 'rangerbase3' },
    // ฐาน 5 ขนาดเดิมดีอยู่แล้ว ไม่ขยับตามอีก 9 ช่อง
    { id: 'rangerbase5', x: 57,  y: 384, scale: 0.7, idleScale: 0.58 },
  ].map(({ id, x, y, scale, elementYFrom, idleScale }, i): SceneItem => ({
    id, label: `Ranger base ${i + 2} (copy)`, section: 'ฐานยืนเรนเจอร์', copyOf: 'rangerbase',
    x, y, scale, layer: BASE_LAYER_TOP - (i + 1), visible: true,
    ...(elementYFrom ? { elementYFrom } : {}),
    ...(idleScale !== undefined ? { idleScale } : {}),
  })),
  // ── ฝั่งขวา 5 ช่อง — กระจกของฝั่งซ้ายทั้งชุด ──
  // ทุกค่าคิดจากตัวต้นทางสดๆ ตอนวาด จูนฝั่งซ้ายแล้วฝั่งขวาตามเอง ไม่ต้องแก้สองที่
  // (รูปไม่พลิกด้าน พลิกแค่ตำแหน่งรอบกลางผืนผ้า)
  // ── แถวเมนู 7 อัน — เรียงแนวนอนแกน Y เดียวกัน ปรับระยะห่างที่ช่อง Gap ของแถว ──
  {
    id: 'menurow', label: 'Menu row (7)', section: 'เมนู',
    rowGroup: ['menu1', 'menu2', 'menu3', 'menu4', 'menu5', 'menu6', 'menu7'],
    gap: 115,
    x: 170, y: 580, scale: 1, layer: 20, visible: true,
  },
  // ลูกของแถว — เลือกรูปของตัวเองได้ ส่วนตำแหน่ง/ขนาด/เลเยอร์คิดจากแถว
  // icon dx/dy ต่างกันรายตัว เพราะรูปไอคอนแต่ละอันสูงไม่เท่ากัน (66-86px) ต้องจัดให้ดูอยู่กลางป้าย
  // ── โปรไฟล์ ──
  // เรียงเลเยอร์ในกลุ่มจากล่างขึ้นบน: รูป -> กรอบ -> เสาธง -> ธง -> หลอด bg -> หลอด bar -> เลข -> ข้อความ
  {
    id: 'profile', label: 'Profile (group)', section: 'โปรไฟล์',
    x: 105, y: 55, scale: 1, layer: 22, visible: true,
    parts: [
      { id: 'pic',       label: '1. รูปโปรไฟล์',  kind: 'image',   options: PROFILE_IMG_OPTIONS,  option: byLabel(PROFILE_IMG_OPTIONS, 'profile_pkg_2508_ma'), dx: 41, dy: -2, scale: 0.5, order: 0, visible: true },
      { id: 'frame',     label: '2. กรอบ',        kind: 'image',   options: [{ label: 'profile', value: PROFILE_FRAME }], option: PROFILE_FRAME,               dx: 0,  dy: 0,   scale: 1, order: 1, visible: true },
      { id: 'pole',      label: '3. เสาธง',       kind: 'image',   options: PROFILE_POLE_OPTIONS, option: byLabel(PROFILE_POLE_OPTIONS, 'legend'),             dx: -34, dy: -31, scale: 1, order: 2, visible: true },
      // ธงจัดกึ่งกลางแนวนอน ชิดขอบบน -> dy คือขอบบนของธง ไม่ใช่กึ่งกลาง
      { id: 'flag',      label: '4. ธง',          kind: 'image',   options: PROFILE_FLAG_OPTIONS, option: byLabel(PROFILE_FLAG_OPTIONS, 'legend'), anchor: 'top', dx: -34, dy: -43, scale: 1, order: 3, visible: true },
      // หลอดยึดซ้าย ขยายไปทางขวา -> dx คือขอบซ้ายของหลอด
      { id: 'gaugebg',   label: '5. หลอดพื้นหลัง', kind: 'stretch', options: GAUGE_BG_OPTIONS,  option: byLabel(GAUGE_BG_OPTIONS, 'legend'),  anchor: 'left', w: 64, cap: 8, dx: -66, dy: -25, scale: 1, order: 4, visible: true },
      { id: 'gaugebar',  label: '6. หลอดเลเวล',   kind: 'stretch', options: GAUGE_BAR_OPTIONS, option: byLabel(GAUGE_BAR_OPTIONS, 'legend'), anchor: 'left', w: 62, cap: 6, pct: 100, dx: -65, dy: -25, scale: 1, order: 5, visible: true },
      { id: 'lvnum',     label: '7. เลขเลเวล',    kind: 'digits',  options: NUM_SET_OPTIONS,   option: byLabel(NUM_SET_OPTIONS, 'legend'), text: '33',            dx: -34, dy: 37, scale: 1, order: 6, visible: true },
      { id: 'flagtext',  label: '8. ข้อความระดับ', kind: 'image',  options: FLAG_TEXT_OPTIONS,  option: byLabel(FLAG_TEXT_OPTIONS, 'legend'),                    dx: -34, dy: -9, scale: 1, order: 7, visible: true },
      { id: 'leveltext', label: '9. ข้อความ level', kind: 'image', options: LEVEL_TEXT_OPTIONS, option: byLabel(LEVEL_TEXT_OPTIONS, 'legend'),                   dx: -32, dy: 14, scale: 1, order: 8, visible: true },
    ],
  },
  // ── ปุ่มตั้งค่า — อยู่หมวดเมนูเหมือนกัน แต่ไม่ได้อยู่ในแถว 7 อัน จัดตำแหน่งอิสระ ──
  {
    id: 'setting', label: 'Setting (group)', section: 'เมนู',
    x: 958, y: 607, scale: 1, layer: 20, visible: true,
    parts: [
      { id: 'setimg', label: '1. ปุ่มตั้งค่า', kind: 'image', options: SETTING_OPTIONS, option: byLabel(SETTING_OPTIONS, 'setting'), dx: 0, dy: 0, scale: 1, order: 0, visible: true },
    ],
  },
  // ── เมนูกาชา ──
  // เลเยอร์ 19 = ใต้แถบทรัพยากร (21) และใต้แถวเมนู (20) ตามที่สั่ง
  {
    id: 'gacha', label: 'Gacha menu (group)', section: 'เมนูกาชา',
    x: 728, y: 136, scale: 1, layer: 19, visible: true,
    parts: [
      { id: 'ganim', label: '1. อนิเมชั่น', kind: 'anim',  options: GACHA_ANIM_OPTIONS, option: byLabel(GACHA_ANIM_OPTIONS, 'ready'),      dx: 0, dy: 0,  scale: 1, order: 0, visible: true },
      { id: 'gsign', label: '2. ป้าย',      kind: 'image', options: GACHA_SIGN_OPTIONS, option: byLabel(GACHA_SIGN_OPTIONS, 'gacha_sign'), dx: 0, dy: 53, scale: 1, order: 1, visible: true },
    ],
  },
  // ── โฆษณา ──
  {
    id: 'ads', label: 'Ads (group)', section: 'โฆษณา',
    x: 911, y: 106, scale: 0.95, layer: 24, visible: true,
    parts: [
      { id: 'adimg', label: '1. ป้ายโฆษณา', kind: 'image', options: ADS_OPTIONS, option: byLabel(ADS_OPTIONS, 'ads01'), dx: 0, dy: 0, scale: 1, order: 0, visible: true },
    ],
  },
  // ── ฟีดข่าว 3 อัน — แต่ละอันเลือกไอคอน/ข้อความ/องศาเอียงของตัวเองได้ ──
  ...[
    { id: 'news1', x: 228, icon: { pick: 'event', dx: 0,  dy: 2,  scale: 1,    rot: 0 },   text: { pick: 'news',    dx: 0 } },
    { id: 'news2', x: 302, icon: { pick: 'buff',  dx: 0,  dy: -6, scale: 1,    rot: 0 },   text: { pick: 'buff',    dx: -8 } },
    { id: 'news3', x: 369, icon: { pick: 'gift',  dx: -2, dy: 6,  scale: 0.75, rot: -19 }, text: { pick: 'booster', dx: 0 } },
  ].map(({ id, x, icon, text }, i): SceneItem => ({
    id, label: `News ${i + 1} (${text.pick})`, section: 'ฟีดข่าว',
    x, y: 46, scale: 1, layer: 23, visible: true,
    parts: [
      { id: 'nicon', label: '1. ไอคอน',   kind: 'image', options: NEWS_ICON_OPTIONS, option: byLabel(NEWS_ICON_OPTIONS, icon.pick), rot: icon.rot, dx: icon.dx, dy: icon.dy, scale: icon.scale, order: 0, visible: true },
      { id: 'ntext', label: '2. ข้อความ', kind: 'image', options: NEWS_TEXT_OPTIONS, option: byLabel(NEWS_TEXT_OPTIONS, text.pick),                dx: text.dx, dy: 34,      scale: 1,          order: 1, visible: true },
    ],
  })),
  // ── แถบบอกจำนวนทรัพยากร 3 อัน — แต่ละอันเลือกไอคอน/ข้อความ/ความยาวแถบของตัวเองได้ ──
  // ข้อความทุกตัวชิดขวา: dx คือ "ขอบขวา" ของข้อความ ตัวเลขยาวขึ้นจึงงอกไปทางซ้าย
  ...[
    {
      id: 'stage1', label: 'ruby', x: 800, y: 39,
      bar: { w: 122, cap: 14, dx: -14, dy: 0, scale: 1 },
      plus: { dx: 28, dy: -2, scale: 1.1 },
      icon: { pick: 'ruby', dx: -82, dy: -9, scale: 1 },
      t1: { text: '9,999', color: '#ffffff', dx: 3, dy: -1, scale: 0.6, on: true },
      t2: { text: '', color: '#ffe066', dx: 55, dy: 18, scale: 0.5, on: false, left: false },
      t3: { text: '', color: '#7dff9b', dx: 55, dy: -18, scale: 0.5, on: false },
      ev: { dx: -78, dy: 19, on: true },
    },
    {
      id: 'stage2', label: 'coin', x: 917, y: 39,
      bar: { w: 159, cap: 14, dx: 18, dy: 0, scale: 1.1 },
      plus: { dx: 99, dy: -2, scale: 1.1 },
      icon: { pick: 'coin', dx: -54, dy: -12, scale: 1 },
      t1: { text: '905,834202', color: '#ffffff', dx: 72, dy: -2, scale: 0.5, on: true },
      t2: { text: '', color: '#ffe066', dx: 55, dy: 18, scale: 0.5, on: false, left: false },
      t3: { text: '', color: '#7dff9b', dx: 55, dy: -18, scale: 0.5, on: false },
      ev: { dx: 0, dy: -26, on: false },
    },
    {
      id: 'stage3', label: 'feather', x: 579, y: 39,
      bar: { w: 171, cap: 14, dx: 10, dy: 0, scale: 1.1 },
      plus: { dx: 101, dy: -2, scale: 1.1 },
      icon: { pick: 'feather', dx: -75, dy: -3, scale: 1 },
      t1: { text: 'max', color: '#727b88', dx: 78, dy: -4, scale: 0.6, on: true },
      // dx ตอนนี้คือ "ขอบซ้าย" แล้ว (ชิดซ้าย) — จำนวนขนนกชิดขวาจบที่ dx -6 จึงวาง / ถัดมาติดๆ
      t2: { text: '/93', color: '#6c7086', dx: -5, dy: -2, scale: 0.6, on: true, left: true },
      t3: { text: '1,199', color: '#e9ec32', dx: -6, dy: -2, scale: 0.6, on: true },
      ev: { dx: 0, dy: -26, on: false },
    },
  ].map(({ id, label, x, y, bar, plus, icon, t1, t2, t3, ev }, i): SceneItem => ({
    id, label: `Stage ${i + 1} (${label})`, section: 'แถบทรัพยากร',
    x, y, scale: 0.95, layer: 21, visible: true,
    parts: [
      { id: 'bar',    label: '1. พื้นแถบ',    kind: 'stretch', options: [{ label: 'stage_icon_bg00', value: STAGE_BAR }],  option: STAGE_BAR,  w: bar.w, cap: bar.cap, dx: bar.dx, dy: bar.dy, scale: bar.scale, order: 0, visible: true },
      { id: 'plus',   label: '2. ปุ่มบวก',    kind: 'image',   options: [{ label: 'stage_plus_icon', value: STAGE_PLUS }], option: STAGE_PLUS, dx: plus.dx, dy: plus.dy, scale: plus.scale, order: 1, visible: true },
      { id: 'sicon',  label: '3. ไอคอน',      kind: 'image',   options: STAGE_ICON_OPTIONS, option: byLabel(STAGE_ICON_OPTIONS, icon.pick), dx: icon.dx, dy: icon.dy, scale: icon.scale, order: 2, visible: true },
      { id: 'txt1',   label: '4a. ข้อความ 1', kind: 'text', options: [], option: '', text: t1.text, color: t1.color, dx: t1.dx, dy: t1.dy, scale: t1.scale, order: 3, visible: t1.on },
      // ช่องนี้ของแถบขนนกคือเพดาน "/93" — ชิดซ้ายเพื่อให้ "/" อยู่กับที่ เลขยาวขึ้นแล้วงอกไปทางขวา
      { id: 'txt2',   label: '4b. ข้อความ 2', kind: 'text', options: [], option: '', text: t2.text, color: t2.color, anchor: t2.left ? 'left' : 'center', dx: t2.dx, dy: t2.dy, scale: t2.scale, order: 4, visible: t2.on },
      { id: 'txt3',   label: '4c. ข้อความ 3', kind: 'text', options: [], option: '', text: t3.text, color: t3.color, dx: t3.dx, dy: t3.dy, scale: t3.scale, order: 5, visible: t3.on },
      { id: 'sevent', label: '5. ป้ายอีเวนต์', kind: 'image', options: [{ label: 'sub_event', value: STAGE_EVENT }], option: ev.on ? STAGE_EVENT : '', dx: ev.dx, dy: ev.dy, scale: 1, order: 6, visible: ev.on },
    ],
  })),
  ...[
    { id: 'menu1', icon: 'img00', idx: 0, idy: -12, text: 'upgrade', tdy: 25, badge: 'new' },
    { id: 'menu2', icon: 'img01', idx: 0, idy: -12, text: 'friends', tdy: 25, badge: 'new' },
    { id: 'menu3', icon: 'img02', idx: 0, idy: -6,  text: 'collect', tdy: 25, badge: '' },
    { id: 'menu4', icon: 'img07', idx: 0, idy: -8,  text: 'shop',    tdy: 23, badge: 'free' },
    { id: 'menu5', icon: 'img04', idx: 3, idy: -7,  text: 'friends', tdy: 25, badge: '' },
    { id: 'menu6', icon: 'img08', idx: 0, idy: -6,  text: 'mission', tdy: 25, badge: '' },
    { id: 'menu7', icon: 'img06', idx: 0, idy: -2,  text: 'giftbox', tdy: 25, badge: 'new' },
  ].map(({ id, icon, idx, idy, text, tdy, badge }, i): SceneItem => ({
    id, label: `Menu ${i + 1} (${text})`, section: 'เมนู',
    x: 0, y: 0, scale: 1, layer: 20, visible: true,
    parts: [
      { id: 'plate',  label: '1. ป้ายเมนู',   kind: 'image', options: [{ label: 'Menu', value: MENU_PLATE }], option: MENU_PLATE,                    dx: 0,   dy: 0,   scale: 1, order: 0, visible: true },
      { id: 'icon',   label: '2. รูปเมนู',    kind: 'image', options: MENU_ICON_OPTIONS,  option: byLabel(MENU_ICON_OPTIONS, icon), dx: idx, dy: idy, scale: 1, order: 1, visible: true },
      { id: 'mtext',  label: '3. ข้อความ',    kind: 'image', options: MENU_TEXT_OPTIONS,  option: byLabel(MENU_TEXT_OPTIONS, text), dx: 0,   dy: tdy, scale: 1, order: 2, visible: true },
      { id: 'badge',  label: '4. แจ้งเตือน',  kind: 'image', options: MENU_BADGE_OPTIONS, option: badge ? byLabel(MENU_BADGE_OPTIONS, badge) : '', dx: 32, dy: -45, scale: 1, order: 3, visible: true },
    ],
  })),
  {
    id: 'mirrorside', label: 'Ranger base R (mirror group)', section: 'ฐานยืนเรนเจอร์',
    mirrorGroup: ['rangerbase', 'rangerbase2', 'rangerbase3', 'rangerbase4', 'rangerbase5'],
    x: -26, y: 0, scale: 1, layer: BASE_LAYER_TOP - 5, visible: true,
  },
]

// ── โค้ดที่ได้จากการปรับแต่ง — ส่งข้อความนี้กลับมาได้เลย ──
export function sceneToCode(scene: SceneItem[]): string {
  const lines: string[] = [`// /lobby scene — ${scene.length} items`, '[']
  for (const it of scene) {
    if (it.rowGroup) {
      const rowIds = it.rowGroup.map(m => `'${m}'`).join(', ')
      lines.push(`  { id: '${it.id}', rowGroup: [${rowIds}], gap: ${Math.round(it.gap ?? 0)}, x: ${Math.round(it.x)}, y: ${Math.round(it.y)}, scale: ${+it.scale.toFixed(3)}, layer: ${it.layer}, visible: ${it.visible} },`)
      continue
    }
    if (it.mirrorGroup) {
      // x/y ของกลุ่มกระจกคือ "ระยะขยับเพิ่ม" จากจุดกระจก ไม่ใช่พิกัดจริง
      const ids = it.mirrorGroup.map(m => `'${m}'`).join(', ')
      lines.push(`  { id: '${it.id}', mirrorGroup: [${ids}], x: ${Math.round(it.x)}, y: ${Math.round(it.y)}, layer: ${it.layer}, visible: ${it.visible} },`)
      continue
    }
    const head = `  { id: '${it.id}'${it.copyOf ? `, copyOf: '${it.copyOf}'` : ''}${it.elementYFrom ? `, elementYFrom: '${it.elementYFrom}'` : ''}, x: ${Math.round(it.x)}, y: ${Math.round(it.y)}, scale: ${+it.scale.toFixed(3)}, layer: ${it.layer}, visible: ${it.visible}`
    if (!it.parts) { lines.push(`${head} },`); continue }
    lines.push(`${head}, parts: [`)
    for (const p of it.parts) {
      const opt = p.options.find(o => o.value === p.option)
      const pick = p.kind === 'ranger' ? ((p.text ?? '').trim() ? `'${(p.text ?? '').trim()}'` : 'null')
        : opt ? `'${opt.label}'` : 'null'
      const txt = p.kind === 'level' || p.kind === 'text' ? `, text: '${p.text ?? ''}'` : ''
      const extra = p.kind === 'stretch'
          ? `, w: ${Math.round(p.w ?? 0)}, cap: ${Math.round(p.cap ?? 0)}${p.pct === undefined ? '' : `, pct: ${Math.round(p.pct)}`}`
        : p.kind === 'text' ? `, color: '${p.color ?? ''}'`
        : p.kind === 'digits' ? `, num: '${p.text ?? ''}'` : ''
      const rotTxt = p.rot ? `, rot: ${Math.round(p.rot)}` : ''
      lines.push(`    { id: '${p.id}', pick: ${pick}${txt}${extra}${rotTxt}, dx: ${Math.round(p.dx)}, dy: ${Math.round(p.dy)}, scale: ${+p.scale.toFixed(3)}, order: ${p.order}, visible: ${p.visible} },`)
    }
    lines.push('  ] },')
  }
  lines.push(']')
  return lines.join('\n')
}
