// ====================================================
// talentTranslate.ts — แปลข้อมูล talent จาก Chinese (Traditional)
// ของ warmycat → English / Thai โดยตรง (ไม่ผ่าน lerico)
//
// 🏗 โครงสร้าง 3 ชั้น (ลำดับความสำคัญสูง→ต่ำ):
//   1) PATTERN-BASED — จับ structure ประโยคด้วย regex แล้ว reconstruct ตามไวยกรณ์ TH/EN
//      เช่น "技能命中沉默的敵人上" → "เมื่อทักษะโดนศัตรูที่ตกอยู่ในสถานะใบ้"
//      (ไม่ใช่ "ทักษะโดน ใบ้ ศัตรู บน" แบบ token-by-token)
//   2) STAT_ZH dict — ชื่อ stat (longest-first) สำหรับ enhanced[] และ buff
//   3) PHRASE_ZH dict — token fallback สุดท้าย
//
// ทำไมต้องมี Pattern layer:
//   Chinese word order: [verb][modifier][noun]
//   Thai word order:    [verb][noun][modifier]
//   ถ้าใช้ dict ล้วน → ได้ "ทักษะโดน ใบ้ ศัตรู" ซึ่งผิดไวยกรณ์ไทย
// ====================================================

export type TalentLang = 'en' | 'th'

interface Bilingual { en: string; th: string }

// ── Status names (สถานะติดลบ) — ตรงตามคำในเกมเวอร์ชันไทย ──
const STATUS_TH: Record<string, string> = {
  '沉默': 'ใบ้',         '沈默': 'ใบ้',
  '昏迷': 'ชะงัก',
  '暈眩': 'ชะงัก',       '電暈': 'ชะงัก',
  '誘惑': 'หลงเสน่ห์',   '魅惑': 'หลงเสน่ห์',
  '冰凍': 'แช่แข็ง',
  '中毒': 'พิษ',
  '燃燒': 'ไหม้',
  '靜止': 'หยุดนิ่ง',
  '禁錮': 'กักขัง',
  '恐懼': 'หวาดกลัว',
  '黑暗': 'มืดบอด',
  '減速': 'เชื่องช้า',
}
const STATUS_EN: Record<string, string> = {
  '沉默': 'silence',   '沈默': 'silence',
  '昏迷': 'faint',
  '暈眩': 'stun',      '電暈': 'stun',
  '誘惑': 'charm',     '魅惑': 'charm',
  '冰凍': 'freeze',
  '中毒': 'poison',
  '燃燒': 'burn',
  '靜止': 'still',
  '禁錮': 'imprison',
  '恐懼': 'fear',
  '黑暗': 'blind',
  '減速': 'slow',
}
// คำขยายในวงเล็บ (ตามที่เกมเวอร์ชันไทยใช้)
const STATUS_DESC_TH: Record<string, string> = {
  '沉默': '(ห้ามใช้ทักษะ)', '沈默': '(ห้ามใช้ทักษะ)',
  '昏迷': '(เวียนหัว)',
  '暈眩': '(เวียนหัว)',     '電暈': '(เวียนหัว)',
  '誘惑': '(หลงเสน่ห์)',    '魅惑': '(หลงเสน่ห์)',
  '冰凍': '(เคลื่อนที่ไม่ได้)',
  '中毒': '(พิษเรื้อรัง)',
  '燃燒': '(ไหม้)',
  '靜止': '(หยุดนิ่ง)',
}

// ── Element names ──
const ELEM_TH: Record<string, string> = { '闇': 'มืด', '光': 'แสง', '火': 'ไฟ', '水': 'น้ำ', '木': 'ไม้' }
const ELEM_EN: Record<string, string> = { '闇': 'dark', '光': 'light', '火': 'fire', '水': 'water', '木': 'wood' }

// ── Stat names (used in patterns) ──
const STAT_NAME_TH: Record<string, string> = {
  '物理攻擊力': 'พลังโจมตีกายภาพ', '魔法攻擊力': 'พลังโจมตีเวทย์',
  '物理防禦力': 'ป้องกันกายภาพ',  '魔法防禦力': 'ป้องกันเวทย์',
  '物理防禦':   'ป้องกันกายภาพ',  '魔法防禦':   'ป้องกันเวทย์',
  '攻擊速度':   'ความเร็วโจมตี',  '移動速度':   'ความเร็วเคลื่อนที่',
  '爆擊機率':   'อัตราคริติคอล',  '爆擊傷害':   'ความเสียหายคริติคอล',
  '命中率':     'อัตราเข้า',      '閃避機率':   'อัตราหลบ',
  '技能抗性':   'ต้านทักษะ',       '技能發動率': 'อัตราใช้ทักษะ',
  '體力':       'พลังชีวิต',      '攻擊範圍':   'ระยะโจมตี',
}
const STAT_NAME_EN: Record<string, string> = {
  '物理攻擊力': 'Physical ATK', '魔法攻擊力': 'Magical ATK',
  '物理防禦力': 'Physical DEF', '魔法防禦力': 'Magical DEF',
  '物理防禦':   'Physical DEF', '魔法防禦':   'Magical DEF',
  '攻擊速度':   'ATK Speed',    '移動速度':   'Move Speed',
  '爆擊機率':   'Crit Rate',    '爆擊傷害':   'Crit Damage',
  '命中率':     'Hit Rate',     '閃避機率':   'Evade Rate',
  '技能抗性':   'Skill Resist', '技能發動率': 'Skill Use Rate',
  '體力':       'HP',           '攻擊範圍':   'ATK Range',
}

// Helper: list ของชื่อ stat ที่เรียงตามความยาวมากไปน้อย (สำหรับใช้ใน regex)
const STAT_NAMES_RE_GROUP = Object.keys(STAT_NAME_TH).sort((a, b) => b.length - a.length).join('|')

// ── Pattern-based translation ──────────────────────────
// รัน BEFORE dict — จับโครงสร้างประโยคแล้ว reconstruct ตามไวยกรณ์เป้าหมาย
interface TalentPattern {
  re: RegExp
  en: (...groups: string[]) => string
  th: (...groups: string[]) => string
}

// ── Ranger category (สาย) ──
const CATEGORY_TH: Record<string, string> = {
  '智慧型': 'สายไหวพริบ',
  '力量型': 'สายพลัง',
  '敏捷型': 'สายว่องไว',
}
const CATEGORY_EN: Record<string, string> = {
  '智慧型': 'Intelligence',
  '力量型': 'Strength',
  '敏捷型': 'Agility',
}

const TALENT_PATTERNS: TalentPattern[] = [
  // ════════════════════════════════════════════════════
  //  CONDITION patterns
  // ════════════════════════════════════════════════════

  // 類型為[CATEGORY] → "เมื่อศัตรูเป็นสาย..." (เงื่อนไข 2 ของบาง ranger เช่น u1603e-sh)
  {
    re: /類型為(智慧型|力量型|敏捷型)/g,
    en: (c) => `Enemy type: ${CATEGORY_EN[c] ?? c}`,
    th: (c) => `ศัตรูเป็น${CATEGORY_TH[c] ?? c}`,
  },

  // 屬性為[ELEMENT] → "ศัตรูเป็นธาตุ..." (เงื่อนไข 2 เช่น u1590e-kk: 屬性為暗)
  //   warmycat บางครั้งใช้ 暗 (อักษรอื่น) แทน 闇 — รองรับทั้ง 2
  {
    re: /屬性為(闇|暗|光|火|水|木)/g,
    en: (e) => `Enemy element: ${ELEM_EN[e] ?? (e === '暗' ? 'dark' : e)}`,
    th: (e) => `ศัตรูเป็นธาตุ${ELEM_TH[e] ?? (e === '暗' ? 'มืด' : e)}`,
  },

  // [當]技能命中[在][STATUS](X)的敵人[上/身上][時] → status-locked enemy
  // หมายเหตุ: warmycat ครอบ `當...時` บางครั้ง และใช้ fullwidth （） บางครั้ง
  {
    re: /當?技能命中(?:在)?(沉默|沈默|昏迷|暈眩|電暈|誘惑|魅惑|冰凍|中毒|燃燒|靜止|禁錮|恐懼|黑暗|減速)(?:[（(][^)）]*[)）])?的?敵人(?:身上|上)?時?/g,
    en: (s) => `When skill hits enemy in ${STATUS_EN[s] ?? s} state`,
    th: (s) => `เมื่อทักษะโดนศัตรูที่ตกอยู่ในสถานะ${STATUS_TH[s] ?? s}${STATUS_DESC_TH[s] ?? ''}`,
  },

  // 技能命中[在](HP|體力)[尚有/還有]N%以上[的]敵人
  // warmycat อาจใช้ "體力" (HP stat ชื่อจีน) หรือ "HP" literal ก็ได้
  {
    re: /技能命中(?:在)?(?:HP|體力)(?:尚有|還有)([\d.]+)%以上(?:的)?敵人(?:身上|上)?/g,
    en: (n) => `When skill hits enemy with HP ${n}% or above`,
    th: (n) => `ทักษะโดนศัตรูที่มีพลังชีวิตเหลือ ${n}% ขึ้นไป`,
  },

  // 技能命中[在](HP|體力)低於N%[的]敵人
  {
    re: /技能命中(?:在)?(?:HP|體力)低於([\d.]+)%(?:的)?敵人(?:身上|上)?/g,
    en: (n) => `When skill hits enemy with HP below ${n}%`,
    th: (n) => `ทักษะโดนศัตรูที่มีพลังชีวิตต่ำกว่า ${n}%`,
  },

  // 受到距離自身站位N%以外的技能攻擊[時]
  {
    re: /受到距離自身站位([\d.]+)%以外的?技能攻擊時?/g,
    en: (n) => `When receiving skill attack from beyond ${n}% distance from self`,
    th: (n) => `ได้รับการโจมตีทักษะจากระยะห่างจุดยืนตัวเองตั้งแต่ ${n}% ขึ้นไป`,
  },

  // 受到距離自身站位N%以內的技能攻擊[時]
  {
    re: /受到距離自身站位([\d.]+)%以內的?技能攻擊時?/g,
    en: (n) => `When receiving skill attack within ${n}% distance from self`,
    th: (n) => `ได้รับการโจมตีทักษะจากระยะห่างจุดยืนตัวเองไม่เกิน ${n}%`,
  },

  // 使用N次普通/一般攻擊[時] → "ใช้โจมตีปกติ N ครั้ง"
  {
    re: /使用(\d+)次(?:普通|一般)攻擊時?/g,
    en: (n) => `After ${n} normal attacks`,
    th: (n) => `ใช้โจมตีปกติ ${n} ครั้ง`,
  },
  // (普通|一般)攻擊N次 — โครงสร้างกลับด้าน
  {
    re: /(?:普通|一般)攻擊(\d+)次/g,
    en: (n) => `${n} normal attacks`,
    th: (n) => `โจมตีปกติ ${n} ครั้ง`,
  },
  // 使用N次技能[攻擊][時] → "ใช้ทักษะ N ครั้ง"
  {
    re: /使用(\d+)次技能(?:攻擊)?時?/g,
    en: (n) => `After using skill ${n} times`,
    th: (n) => `ใช้ทักษะ ${n} ครั้ง`,
  },
  // 技能命中N次
  {
    re: /技能命中(\d+)次/g,
    en: (n) => `${n} skill hits`,
    th: (n) => `ทักษะโดน ${n} ครั้ง`,
  },

  // [當][以|用]技能攻擊打倒敵人[時] → "เมื่อใช้ทักษะเอาชนะศัตรู"
  {
    re: /當?(?:以|用)?技能攻擊打倒敵人時?/g,
    en: () => `When defeating enemy with skill`,
    th: () => `เมื่อเอาชนะศัตรูด้วยทักษะ`,
  },
  // [當][以|用]普通/一般攻擊打倒敵人[時]
  {
    re: /當?(?:以|用)?(?:普通|一般)攻擊打倒敵人時?/g,
    en: () => `When defeating enemy with normal attack`,
    th: () => `เมื่อเอาชนะศัตรูด้วยการโจมตีปกติ`,
  },
  // 對召喚獸或變身者進行(普通|一般)攻擊時 — โจมตีสิ่งเรียก/แปลงร่าง
  {
    re: /對召喚獸或變身者進行(?:普通|一般)攻擊時?/g,
    en: () => `When attacking summons or transformed enemies`,
    th: () => `เมื่อโจมตีปกติใส่สิ่งเรียกหรือศัตรูที่แปลงร่าง`,
  },

  // 受到[元素]屬性敵人的技能攻擊時
  {
    re: /受到([闇光火水木])屬性敵人的技能攻擊時/g,
    en: (el) => `When hit by ${ELEM_EN[el]} element enemy skill`,
    th: (el) => `เมื่อโดนทักษะจากศัตรูธาตุ${ELEM_TH[el]}`,
  },

  // [當]一般/普通攻擊發生爆擊時
  {
    re: /當?(?:一般|普通)攻擊發生爆擊時/g,
    en: () => `When normal attack triggers critical hit`,
    th: () => `เมื่อโจมตีปกติเข้าคริติคอล`,
  },

  // 戰鬥中出動時
  {
    re: /戰鬥中出動時/g,
    en: () => `When deployed in battle`,
    th: () => `เมื่อออกศึก`,
  },

  // ════════════════════════════════════════════════════
  //  BUFF EFFECT patterns
  // ════════════════════════════════════════════════════

  // 範圍傷害額外增加N%
  {
    re: /範圍傷害額外增加([\d.]+)%/g,
    en: (n) => `Area damage +${n}% extra`,
    th: (n) => `เพิ่มความเสียหายในพื้นที่ของทักษะ +${n}%`,
  },

  // [僅限該技能，]額外增加[STAT]N% — for skill damage boost
  {
    re: /(?:僅限該技能[，,])?額外增加範圍傷害([\d.]+)%/g,
    en: (n) => `(This skill only) Area damage +${n}% extra`,
    th: (n) => `(เฉพาะทักษะนี้) เพิ่มความเสียหายในพื้นที่ของทักษะ +${n}%`,
  },

  // 無視[STAT](Nsec) — ignore stat
  {
    re: /無視物理防禦力(?:[（(]([^)）]+)[)）])?/g,
    en: (dur) => dur ? `Ignore Physical DEF (${dur})` : 'Ignore Physical DEF',
    th: (dur) => dur ? `เพิกเฉยป้องกันกายภาพ (${dur})` : 'เพิกเฉยป้องกันกายภาพ',
  },
  {
    re: /無視魔法防禦力(?:[（(]([^)）]+)[)）])?/g,
    en: (dur) => dur ? `Ignore Magical DEF (${dur})` : 'Ignore Magical DEF',
    th: (dur) => dur ? `เพิกเฉยป้องกันเวทย์ (${dur})` : 'เพิกเฉยป้องกันเวทย์',
  },

  // 所有技能冷卻減少N秒
  {
    re: /所有技能冷卻減少([\d.]+)秒/g,
    en: (n) => `All Skills CD -${n} sec`,
    th: (n) => `คูลดาวน์ทักษะทั้งหมด -${n} วินาที`,
  },
  // 技能冷卻減少N秒
  {
    re: /技能冷卻減少([\d.]+)秒/g,
    en: (n) => `Skill CD -${n} sec`,
    th: (n) => `คูลดาวน์ทักษะ -${n} วินาที`,
  },

  // 回復自身血量N%
  {
    re: /回復自身血量([\d.]+)%/g,
    en: (n) => `Recover own HP ${n}%`,
    th: (n) => `ฟื้นฟู HP ตัวเอง ${n}%`,
  },
  // 回復血量N%
  {
    re: /回復血量([\d.]+)%/g,
    en: (n) => `Recover HP ${n}%`,
    th: (n) => `ฟื้นฟู HP ${n}%`,
  },

  // ── STAT changes — รองรับทั้ง 4 รูปแบบ ─────────────────
  // Format A: 增加/提升 [STAT] N% (Nsec)  — VERB ก่อน STAT
  // Format B: [STAT] 增加/提升 N% (Nsec)  — STAT ก่อน VERB (warmycat ใช้บ่อยกว่า)
  // Format C: [STAT][+-N]% (Nsec)          — already-prefixed
  // Format D: 減少/降低 [STAT] N% (Nsec)   — VERB ก่อน STAT (decrease)
  // Format E: [STAT] 減少/降低 N% (Nsec)   — STAT ก่อน VERB (decrease)
  // หมายเหตุ: fullwidth （） เป็นที่ใช้บ่อยที่สุดใน warmycat — ครอบทั้ง 2 แบบ

  // Format A: VERB-STAT-INCREASE
  {
    re: new RegExp(`(?:增加|提升)(${STAT_NAMES_RE_GROUP})([\\d.]+)%(?:[（(]([^)）]+)[)）])?`, 'g'),
    en: (stat, n, dur) => {
      const s = STAT_NAME_EN[stat] ?? stat
      return dur ? `${s} +${n}% (${dur})` : `${s} +${n}%`
    },
    th: (stat, n, dur) => {
      const s = STAT_NAME_TH[stat] ?? stat
      return dur ? `${s} +${n}% (${dur})` : `${s} +${n}%`
    },
  },

  // Format B: STAT-VERB-INCREASE (warmycat ใช้บ่อย เช่น 移動速度增加300%(5秒))
  {
    re: new RegExp(`(${STAT_NAMES_RE_GROUP})(?:增加|提升)([\\d.]+)%(?:[（(]([^)）]+)[)）])?`, 'g'),
    en: (stat, n, dur) => {
      const s = STAT_NAME_EN[stat] ?? stat
      return dur ? `${s} +${n}% (${dur})` : `${s} +${n}%`
    },
    th: (stat, n, dur) => {
      const s = STAT_NAME_TH[stat] ?? stat
      return dur ? `${s} +${n}% (${dur})` : `${s} +${n}%`
    },
  },

  // Format C: STAT[+-N]% — already-prefixed (เช่น 物理攻擊力+300%)
  {
    re: new RegExp(`(${STAT_NAMES_RE_GROUP})([+\\-][\\d.]+)%(?:[（(]([^)）]+)[)）])?`, 'g'),
    en: (stat, delta, dur) => {
      const s = STAT_NAME_EN[stat] ?? stat
      return dur ? `${s} ${delta}% (${dur})` : `${s} ${delta}%`
    },
    th: (stat, delta, dur) => {
      const s = STAT_NAME_TH[stat] ?? stat
      return dur ? `${s} ${delta}% (${dur})` : `${s} ${delta}%`
    },
  },

  // Format D: VERB-STAT-DECREASE
  {
    re: new RegExp(`(?:減少|降低)(${STAT_NAMES_RE_GROUP})([\\d.]+)%(?:[（(]([^)）]+)[)）])?`, 'g'),
    en: (stat, n, dur) => {
      const s = STAT_NAME_EN[stat] ?? stat
      return dur ? `${s} -${n}% (${dur})` : `${s} -${n}%`
    },
    th: (stat, n, dur) => {
      const s = STAT_NAME_TH[stat] ?? stat
      return dur ? `${s} -${n}% (${dur})` : `${s} -${n}%`
    },
  },

  // Format E: STAT-VERB-DECREASE
  {
    re: new RegExp(`(${STAT_NAMES_RE_GROUP})(?:減少|降低)([\\d.]+)%(?:[（(]([^)）]+)[)）])?`, 'g'),
    en: (stat, n, dur) => {
      const s = STAT_NAME_EN[stat] ?? stat
      return dur ? `${s} -${n}% (${dur})` : `${s} -${n}%`
    },
    th: (stat, n, dur) => {
      const s = STAT_NAME_TH[stat] ?? stat
      return dur ? `${s} -${n}% (${dur})` : `${s} -${n}%`
    },
  },

  // ── Buff: 無視受到的技能攻擊 — ignore received skill attack ──
  {
    re: /無視受到的技能攻擊/g,
    en: () => `Ignore incoming skill attack`,
    th: () => `เพิกเฉยการโจมตีทักษะที่ได้รับ`,
  },

  // (普通|一般)攻擊增加N% — boost normal attack damage
  {
    re: /(?:普通|一般)攻擊(?:增加|提升)([\d.]+)%(?:[（(]([^)）]+)[)）])?/g,
    en: (n, dur) => dur ? `Normal ATK +${n}% (${dur})` : `Normal ATK +${n}%`,
    th: (n, dur) => dur ? `พลังโจมตีปกติ +${n}% (${dur})` : `พลังโจมตีปกติ +${n}%`,
  },
  // 攻擊力增加N% — boost overall ATK
  {
    re: /攻擊力(?:增加|提升)([\d.]+)%(?:[（(]([^)）]+)[)）])?/g,
    en: (n, dur) => dur ? `ATK +${n}% (${dur})` : `ATK +${n}%`,
    th: (n, dur) => dur ? `พลังโจมตี +${n}% (${dur})` : `พลังโจมตี +${n}%`,
  },

  // 召喚時間增加N秒 — summon duration
  {
    re: /召喚時間(?:增加|提升|額外增加)([\d.]+)秒/g,
    en: (n) => `Summon duration +${n} sec`,
    th: (n) => `ระยะเวลาเรียก +${n} วินาที`,
  },

  // [STATUS]時間額外增加N秒 — extend status duration
  {
    re: /(沉默|沈默|昏迷|暈眩|電暈|誘惑|魅惑|冰凍|中毒|燃燒|靜止|禁錮|恐懼|黑暗|減速)時間(?:額外)?(?:增加|延長)([\d.]+)秒/g,
    en: (s, n) => `${STATUS_EN[s] ?? s} duration +${n} sec`,
    th: (s, n) => `ระยะเวลา${STATUS_TH[s] ?? s} +${n} วินาที`,
  },

  // 負面效果時間額外增加N秒 — extend all negative effect duration
  {
    re: /負面效果時間(?:額外)?(?:增加|延長)([\d.]+)秒/g,
    en: (n) => `Negative effect duration +${n} sec`,
    th: (n) => `ระยะเวลาผลลัพธ์ด้านลบ +${n} วินาที`,
  },

  // [STATUS]數量額外增加N隻 — increase number of affected enemies
  {
    re: /(沉默|沈默|昏迷|暈眩|電暈|誘惑|魅惑|冰凍|中毒|燃燒|靜止|禁錮|恐懼|黑暗|減速)數量(?:額外)?(?:增加|提升)([\d.]+)隻/g,
    en: (s, n) => `${STATUS_EN[s] ?? s} target +${n}`,
    th: (s, n) => `จำนวน${STATUS_TH[s] ?? s} +${n} ตัว`,
  },

  // 透過強行突破、移動到前方、移動到後方、聚集、將夥伴送往前方、互換位置使自身移動時
  // เคสพิเศษ — ข้อความยาวมาก ครอบทั้งสตริง
  {
    re: /透過強行突破、移動到前方、移動到後方、聚集、將夥伴送往前方、互換位置使自身移動時?/g,
    en: () => `When self moves via dash, advance, retreat, gather, send teammate forward, or position swap`,
    th: () => `เมื่อตัวเองเคลื่อนที่ผ่านการทะลุ ไปข้างหน้า ไปข้างหลัง รวมตัว ส่งเพื่อนไปข้างหน้า หรือสลับตำแหน่ง`,
  },
]

/** ใช้ pattern matching ก่อน — reconstruct ประโยคในไวยกรณ์เป้าหมาย */
function applyPatterns(text: string, lang: TalentLang): string {
  let out = text
  for (const p of TALENT_PATTERNS) {
    out = out.replace(p.re, (...args: unknown[]): string => {
      // args = [match, ...groups, offset, input, (namedGroups?)]
      const groups: string[] = []
      for (let i = 1; i < args.length; i++) {
        if (typeof args[i] === 'number') break
        groups.push(args[i] != null ? String(args[i]) : '')
      }
      return lang === 'th' ? p.th(...groups) : p.en(...groups)
    })
  }
  return out
}

/** Optional dict ที่ดึงมาจาก lerico (zh→en เท่านั้น) — ใช้เป็น EN fallback */
export interface ExtraDict {
  stats?: Record<string, string>
  phrases?: Record<string, string>
  /** แม่แบบประโยคทางการของ warmycat (custom.json) — zh มีตัวแทนค่า %d/%n/%s/%N1… ตรงกันทุกภาษา */
  templates?: { zh: string; en: string; th: string }[]
}

// ── ชั้นแม่แบบทางการ (รันก่อนทุกอย่าง) ──
// ประโยคจีนของ warmycat ถูกสร้างจากแม่แบบชุดนี้ ถ้าทั้งประโยคตรงกับแม่แบบไหน
// เอาตัวเลขที่จับได้ไปเติมลงแม่แบบไทย/อังกฤษได้เลย = ได้คำแปลทางการ ไม่ต้องประกอบไวยากรณ์เอง
interface CompiledTemplate { re: RegExp; en: string; th: string }
const compiledCache = new WeakMap<object, CompiledTemplate[]>()
const TPL_PLACEHOLDER = /%[dnsN]\d*/g

/** ส่วนข้อความคงที่ของแม่แบบ → regex — วงเล็บ/ทวิภาค/จุลภาค ยอมทั้งแบบเต็มและครึ่งความกว้าง
 *  (ข้อมูล legacy ใช้ปนกัน) และยอมช่องว่างต่างกันได้ */
function templateLiteral(x: string): string {
  let out = ''
  for (const ch of x) {
    if (ch === '（' || ch === '(') out += '[（(]'
    else if (ch === '）' || ch === ')') out += '[）)]'
    else if (ch === '：' || ch === ':') out += '[：:]'
    else if (ch === '，' || ch === ',') out += '[，,]'
    else if (/\s/.test(ch)) out += '\\s*'
    else if (/[.*+?^${}|[\]\\]/.test(ch)) out += '\\' + ch
    else out += ch
  }
  return out
}

function compileTemplates(list: NonNullable<ExtraDict['templates']>): CompiledTemplate[] {
  const hit = compiledCache.get(list)
  if (hit) return hit
  const out: CompiledTemplate[] = []
  for (const t of list) {
    const zh = t.zh.trim()
    const parts = zh.split(TPL_PLACEHOLDER)
    const marks = zh.match(TPL_PLACEHOLDER) ?? []
    let src = '^'
    parts.forEach((part, i) => {
      src += templateLiteral(part)
      if (i < marks.length) src += marks[i] === '%s' ? '(.+?)' : '([-+]?\\d+(?:\\.\\d+)?)'
    })
    src += '$'
    try { out.push({ re: new RegExp(src), en: t.en, th: t.th }) } catch { /* แม่แบบแปลกๆ ข้ามไป */ }
  }
  compiledCache.set(list, out)
  return out
}

/** ตัวเลขแบบที่เกมใช้ — "130.0" → "130" (ข้อมูล legacy ใส่ .0 เกินมา ส่วนข้อความทางการไม่มี) */
const tidyNumber = (n: string) => (/^[-+]?\d+\.0+$/.test(n) ? n.replace(/\.0+$/, '') : n)

function applyOfficialTemplate(zhText: string, lang: TalentLang, extra?: ExtraDict): string | null {
  if (!extra?.templates?.length) return null
  const text = zhText.trim()
  if (!text) return null
  for (const t of compileTemplates(extra.templates)) {
    const m = t.re.exec(text)
    if (!m) continue
    const target = lang === 'th' ? t.th : t.en
    if (!target) return null
    let i = 1
    return target.replace(TPL_PLACEHOLDER, () => tidyNumber(m[i++] ?? '')).trim()
  }
  return null
}

// ── Stat name dict ──
const STAT_ZH: Record<string, Bilingual> = {
  '所有技能冷卻時間': { en: 'All Skills Cooldown',  th: 'คูลดาวน์ทักษะทั้งหมด' },
  '所有技能冷卻':     { en: 'All Skills Cooldown',  th: 'คูลดาวน์ทักษะทั้งหมด' },
  '技能冷卻時間':     { en: 'Skill Cooldown',       th: 'คูลดาวน์ทักษะ' },
  '技能冷卻':         { en: 'Skill Cooldown',       th: 'คูลดาวน์ทักษะ' },
  '技能抗性':         { en: 'Skill Resistance',     th: 'ต้านทักษะ' },
  '技能發動率':       { en: 'Skill Use Rate',       th: 'อัตราใช้ทักษะ' },
  '技能再次發動率':   { en: 'Skill Re-activation Rate', th: 'อัตราใช้ทักษะซ้ำ' },
  '技能命中率':       { en: 'Skill Hit Rate',       th: 'อัตราเข้าทักษะ' },
  '連擊機率':         { en: 'Combo Rate',           th: 'อัตราคอมโบ' },
  '物理攻擊反彈率':   { en: 'Physical Reflect Rate', th: 'อัตราสะท้อนกายภาพ' },
  '魔法攻擊反彈率':   { en: 'Magic Reflect Rate',   th: 'อัตราสะท้อนเวทย์' },
  '技能閃避機率':     { en: 'Skill Evade Rate',     th: 'อัตราหลบทักษะ' },
  '技能閃避':         { en: 'Skill Evade',          th: 'หลบทักษะ' },
  '物理攻擊力':       { en: 'Physical ATK',         th: 'พลังโจมตีกายภาพ' },
  '魔法攻擊力':       { en: 'Magical ATK',          th: 'พลังโจมตีเวทย์' },
  '物理防禦力':       { en: 'Physical DEF',         th: 'ป้องกันกายภาพ' },
  '魔法防禦力':       { en: 'Magical DEF',          th: 'ป้องกันเวทย์' },
  '物理防禦':         { en: 'Physical DEF',         th: 'ป้องกันกายภาพ' },
  '魔法防禦':         { en: 'Magical DEF',          th: 'ป้องกันเวทย์' },
  '攻擊速度':         { en: 'ATK Speed',            th: 'ความเร็วโจมตี' },
  '移動速度':         { en: 'Move Speed',           th: 'ความเร็วเคลื่อนที่' },
  '爆擊機率':         { en: 'Critical Rate',        th: 'อัตราคริติคอล' },
  '爆擊傷害':         { en: 'Critical Damage',      th: 'ความเสียหายคริติคอล' },
  '降低傷害':         { en: 'Damage Reduction',     th: 'ลดความเสียหาย' },
  '總攻擊力':         { en: 'Total ATK',            th: 'พลังโจมตีรวม' },
  '命中率':           { en: 'Hit Rate',             th: 'อัตราเข้า' },
  '閃避機率':         { en: 'Evade Rate',           th: 'อัตราหลบ' },
  '濺射範圍':         { en: 'Splash Radius',        th: 'รัศมีสแปลช' },
  '攻擊範圍':         { en: 'ATK Range',            th: 'ระยะโจมตี' },
  '體力':             { en: 'HP',                   th: 'พลังชีวิต' },
  // lerico's extra.stats มี '屬性' → 'Element' อยู่แล้ว (stage เดียวกัน, ยาวกว่าชนะ) — ต้องใส่ '無屬性' ไว้ที่นี่ด้วย
  // ไม่ใช่แค่ใน PHRASE_ZH เพราะ stat dict stage รันก่อน phrase dict stage เสมอ ถ้าไม่มีตรงนี้ '屬性' จะโดนแทนที่
  // ไปก่อนแล้ว เหลือ '無' ลอยเดี่ยวๆ ไม่มี rule ไหนจับ (บั๊ก "enemy become 無 Element")
  '無屬性':           { en: 'attributeless',        th: 'ไร้ธาตุ' },

  // ── CC resistance stats (พบใน enhanced[] เช่น 昏迷抗性+40.0%) ──
  // ใช้คำตามเกมเวอร์ชันไทย (ใบ้ ไม่ใช่ ปิดปาก)
  '昏迷抗性':         { en: 'Stun Resistance',      th: 'ต้านชะงัก' },
  '沈默抗性':         { en: 'Silence Resistance',   th: 'ต้านใบ้' },
  '沉默抗性':         { en: 'Silence Resistance',   th: 'ต้านใบ้' },
  '冰凍抗性':         { en: 'Freeze Resistance',    th: 'ต้านแช่แข็ง' },
  '中毒抗性':         { en: 'Poison Resistance',    th: 'ต้านพิษ' },
  '燃燒抗性':         { en: 'Burn Resistance',      th: 'ต้านไหม้' },
  '暈眩抗性':         { en: 'Stun Resistance',      th: 'ต้านชะงัก' },
  '電暈抗性':         { en: 'Stun Resistance',      th: 'ต้านชะงัก' },
  '誘惑抗性':         { en: 'Charm Resistance',     th: 'ต้านหลงเสน่ห์' },
  '魅惑抗性':         { en: 'Charm Resistance',     th: 'ต้านหลงเสน่ห์' },
  '恐懼抗性':         { en: 'Fear Resistance',      th: 'ต้านหวาดกลัว' },
  '禁錮抗性':         { en: 'Imprison Resistance',  th: 'ต้านกักขัง' },
  '靜止抗性':         { en: 'Still Resistance',     th: 'ต้านหยุดนิ่ง' },
  '負面狀態抗性':     { en: 'Negative Status Resistance', th: 'ต้านสถานะด้านลบ' },
}

// ── Misc phrases ──
const PHRASE_ZH: Record<string, Bilingual> = {
  // ── conditions (full sentences) ──
  '無特定條件':                       { en: '(None)',                                   th: '(ไม่มี)' },
  '當一般攻擊發生爆擊時':              { en: 'When normal attack triggers critical hit', th: 'เมื่อโจมตีปกติเข้าคริติคอล' },
  '當普通攻擊發生爆擊時':              { en: 'When normal attack triggers critical hit', th: 'เมื่อโจมตีปกติเข้าคริติคอล' },
  '當受到敵人技能攻擊時':              { en: 'When hit by enemy skill',                  th: 'เมื่อโดนทักษะจากศัตรู' },
  '當受到敵人攻擊時':                  { en: 'When hit by enemy',                        th: 'เมื่อโดนศัตรูโจมตี' },
  '當進行普通攻擊時':                  { en: 'When performing normal attack',            th: 'เมื่อโจมตีปกติ' },
  '當進行一般攻擊時':                  { en: 'When performing normal attack',            th: 'เมื่อโจมตีปกติ' },
  '當使用技能時':                      { en: 'When using skill',                         th: 'เมื่อใช้ทักษะ' },
  '當技能命中敵人時':                  { en: 'When skill hits enemy',                    th: 'เมื่อทักษะโดนศัตรู' },
  '技能命中在HP還有80.0%以上敵人':      { en: 'When skill hits enemy with HP remaining 80.0% or above', th: 'เมื่อทักษะโดนศัตรูที่ HP เหลือ 80.0% ขึ้นไป' },
  '技能命中在HP還有50.0%以上敵人':      { en: 'When skill hits enemy with HP remaining 50.0% or above', th: 'เมื่อทักษะโดนศัตรูที่ HP เหลือ 50.0% ขึ้นไป' },
  '技能命中在HP還有30.0%以上敵人':      { en: 'When skill hits enemy with HP remaining 30.0% or above', th: 'เมื่อทักษะโดนศัตรูที่ HP เหลือ 30.0% ขึ้นไป' },
  '技能命中在HP低於50.0%敵人':          { en: 'When skill hits enemy with HP below 50.0%',              th: 'เมื่อทักษะโดนศัตรูที่ HP ต่ำกว่า 50.0%' },
  '技能命中在HP低於30.0%敵人':          { en: 'When skill hits enemy with HP below 30.0%',              th: 'เมื่อทักษะโดนศัตรูที่ HP ต่ำกว่า 30.0%' },

  // ── trigger headers (full) ──
  '戰鬥中出動時，將獲得以下效果。':                                { en: 'When deployed in battle, gain the following effects:',                                th: 'เมื่อออกศึก จะได้รับผลต่อไปนี้:' },
  '戰鬥中爆擊時，將以高機率獲得以下效果。':                         { en: 'When critical hit in battle, gain the following effects with high probability:',      th: 'เมื่อคริติคอลในการต่อสู้ มีโอกาสสูงได้รับผลต่อไปนี้:' },
  '戰鬥中爆擊時，將以一定機率獲得以下效果。':                       { en: 'When critical hit in battle, gain the following effects with a chance:',              th: 'เมื่อคริติคอลในการต่อสู้ มีโอกาสได้รับผลต่อไปนี้:' },
  '戰鬥中受到敵人的技能攻擊時，能以一定機率獲得以下效果。':         { en: 'When hit by enemy skill in battle, gain the following effects with a chance:',        th: 'เมื่อโดนทักษะศัตรูในการต่อสู้ มีโอกาสได้รับผลต่อไปนี้:' },
  '戰鬥中受到敵人攻擊時，能以一定機率獲得以下效果。':               { en: 'When hit by enemy in battle, gain the following effects with a chance:',              th: 'เมื่อโดนศัตรูในการต่อสู้ มีโอกาสได้รับผลต่อไปนี้:' },
  '戰鬥中進行普通攻擊時，將以一定機率獲得以下效果。':               { en: 'When performing normal attack in battle, gain the following effects with a chance:',  th: 'เมื่อโจมตีปกติในการต่อสู้ มีโอกาสได้รับผลต่อไปนี้:' },
  '戰鬥中使用技能時，將以一定機率獲得以下效果。':                   { en: 'When using skill in battle, gain the following effects with a chance:',               th: 'เมื่อใช้ทักษะในการต่อสู้ มีโอกาสได้รับผลต่อไปนี้:' },
  '戰鬥中技能命中敵人時，將以一定機率獲得以下效果。':               { en: 'When skill hits enemy in battle, gain the following effects with a chance:',          th: 'เมื่อทักษะโดนศัตรูในการต่อสู้ มีโอกาสได้รับผลต่อไปนี้:' },
  '戰鬥中技能命中HP尚有80%以上敵人時，將獲得以下效果。':            { en: 'When skill hits enemy with HP remaining 80% or above in battle, gain the following effects:', th: 'เมื่อทักษะโดนศัตรูที่ HP เหลือ 80% ขึ้นไป จะได้รับผลต่อไปนี้:' },
  '戰鬥中技能命中HP尚有50%以上敵人時，將獲得以下效果。':            { en: 'When skill hits enemy with HP remaining 50% or above in battle, gain the following effects:', th: 'เมื่อทักษะโดนศัตรูที่ HP เหลือ 50% ขึ้นไป จะได้รับผลต่อไปนี้:' },
  '戰鬥中技能命中HP尚有30%以上敵人時，將獲得以下效果。':            { en: 'When skill hits enemy with HP remaining 30% or above in battle, gain the following effects:', th: 'เมื่อทักษะโดนศัตรูที่ HP เหลือ 30% ขึ้นไป จะได้รับผลต่อไปนี้:' },
  '戰鬥中技能命中HP低於50%敵人時，將獲得以下效果。':                { en: 'When skill hits enemy with HP below 50% in battle, gain the following effects:',      th: 'เมื่อทักษะโดนศัตรูที่ HP ต่ำกว่า 50% จะได้รับผลต่อไปนี้:' },
  '戰鬥中技能命中HP低於30%敵人時，將獲得以下效果。':                { en: 'When skill hits enemy with HP below 30% in battle, gain the following effects:',      th: 'เมื่อทักษะโดนศัตรูที่ HP ต่ำกว่า 30% จะได้รับผลต่อไปนี้:' },

  // ── element + attribute (สำคัญ: ใส่ก่อน 屬性 เพื่อ longest-first) ──
  // ── ประเภทเรนเจอร์ + ความเสียหาย/ธาตุ (Spec+ ใช้บ่อย) ──
  '物理傷害':         { en: 'physical damage', th: 'ความเสียหายกายภาพ' },
  '魔法傷害':         { en: 'magic damage',    th: 'ความเสียหายเวทย์' },
  '無屬性':           { en: 'attributeless',   th: 'ไร้ธาตุ' },
  '敏捷型':           { en: 'Agility-type',    th: 'สายว่องไว' },
  '力量型':           { en: 'Strength-type',   th: 'สายพลัง' },
  '智慧型':           { en: 'Intelligence-type', th: 'สายปัญญา' },
  '變為':             { en: ' become ',        th: ' กลายเป็น ' },
  '物理':             { en: 'physical ',       th: 'กายภาพ ' },
  '魔法':             { en: 'magic ',          th: 'เวทย์ ' },
  '為':               { en: ' as ',            th: ' เป็น ' },

  '闇屬性敵人':       { en: 'dark element enemy',  th: 'ศัตรูธาตุมืด' },
  '光屬性敵人':       { en: 'light element enemy', th: 'ศัตรูธาตุแสง' },
  '火屬性敵人':       { en: 'fire element enemy',  th: 'ศัตรูธาตุไฟ' },
  '水屬性敵人':       { en: 'water element enemy', th: 'ศัตรูธาตุน้ำ' },
  '木屬性敵人':       { en: 'wood element enemy',  th: 'ศัตรูธาตุไม้' },
  '闇屬性':           { en: 'Dark',  th: 'มืด' },
  '光屬性':           { en: 'Light', th: 'แสง' },
  '火屬性':           { en: 'Fire',  th: 'ไฟ' },
  '水屬性':           { en: 'Water', th: 'น้ำ' },
  '木屬性':           { en: 'Wood',  th: 'ไม้' },
  '屬性':             { en: 'element', th: 'ธาตุ' },

  // ── trigger headers ที่มี element ──
  '戰鬥中，受到闇屬性敵人的技能攻擊時，將以低機率獲得以下效果。':   { en: 'When hit by dark element enemy skill in battle, gain the following effects with low probability:',  th: 'เมื่อโดนทักษะศัตรูธาตุมืดในการต่อสู้ มีโอกาสต่ำได้รับผลต่อไปนี้:' },
  '戰鬥中，受到光屬性敵人的技能攻擊時，將以低機率獲得以下效果。':   { en: 'When hit by light element enemy skill in battle, gain the following effects with low probability:', th: 'เมื่อโดนทักษะศัตรูธาตุแสงในการต่อสู้ มีโอกาสต่ำได้รับผลต่อไปนี้:' },
  '戰鬥中，受到火屬性敵人的技能攻擊時，將以低機率獲得以下效果。':   { en: 'When hit by fire element enemy skill in battle, gain the following effects with low probability:',  th: 'เมื่อโดนทักษะศัตรูธาตุไฟในการต่อสู้ มีโอกาสต่ำได้รับผลต่อไปนี้:' },
  '戰鬥中，受到水屬性敵人的技能攻擊時，將以低機率獲得以下效果。':   { en: 'When hit by water element enemy skill in battle, gain the following effects with low probability:', th: 'เมื่อโดนทักษะศัตรูธาตุน้ำในการต่อสู้ มีโอกาสต่ำได้รับผลต่อไปนี้:' },
  '戰鬥中，受到木屬性敵人的技能攻擊時，將以低機率獲得以下效果。':   { en: 'When hit by wood element enemy skill in battle, gain the following effects with low probability:',  th: 'เมื่อโดนทักษะศัตรูธาตุไม้ในการต่อสู้ มีโอกาสต่ำได้รับผลต่อไปนี้:' },

  // ── conditions: distance / position ──
  '受到距離自身站位1.0%以外的技能攻擊':  { en: 'When hit by skill attack from beyond 1.0% distance from self position', th: 'เมื่อโดนทักษะโจมตีจากนอกระยะ 1.0% ของจุดยืนตัวเอง' },
  '距離自身站位':     { en: 'distance from self position', th: 'ระยะห่างจุดยืนตัวเอง' },
  '自身站位':         { en: 'self position',  th: 'จุดยืนตัวเอง' },
  '距離':             { en: 'distance ',      th: 'ระยะ ' },
  '自身':             { en: 'self ',          th: 'ตัวเอง ' },
  '站位':             { en: 'position',       th: 'จุดยืน' },
  '以外':             { en: 'or beyond',      th: 'ขึ้นไป' },
  '以內':             { en: 'or within',      th: 'หรือใกล้กว่า' },

  // ── probability variants ──
  '低機率':           { en: 'low probability', th: 'โอกาสต่ำ' },
  '中機率':           { en: 'medium probability', th: 'โอกาสปานกลาง' },

  // ── attack types ──
  '技能攻擊':         { en: 'skill attack',   th: 'การโจมตีทักษะ' },
  '物理攻擊':         { en: 'physical attack', th: 'การโจมตีกายภาพ' },
  '魔法攻擊':         { en: 'magical attack',  th: 'การโจมตีเวทย์' },

  // ── HP / heal / damage (top frequency: 回復 88, 造成 48, 血量 44) ──
  '回復自身血量':     { en: 'recover own HP',    th: 'ฟื้นฟู HP ตัวเอง' },
  '回復血量':         { en: 'recover HP',        th: 'ฟื้นฟู HP' },
  '血量回復':         { en: 'HP recovery',       th: 'ฟื้นฟู HP' },
  '造成傷害':         { en: 'deal damage',       th: 'สร้างความเสียหาย' },
  '造成':             { en: 'deal ',             th: 'สร้าง ' },
  '傷害量':           { en: 'damage amount',     th: 'ปริมาณความเสียหาย' },
  '回復量':           { en: 'recovery amount',   th: 'ปริมาณฟื้นฟู' },
  '回復':             { en: 'recover ',          th: 'ฟื้นฟู ' },
  '血量':             { en: 'HP',                th: 'พลังชีวิต' },
  '傷害':             { en: 'damage',            th: 'ความเสียหาย' },
  '量':               { en: ' amount',           th: ' ปริมาณ' },

  // ── counters / frequency (次 82, 每 43) ──
  '每次':             { en: 'each time',         th: 'ทุกครั้ง' },
  '次數':             { en: 'count',             th: 'จำนวนครั้ง' },
  '次':               { en: ' times',            th: ' ครั้ง' },
  '每':               { en: 'each ',             th: 'ทุก ' },

  // ── action / target (對於 52, 對象 12, 使用 50, 發動 43) ──
  '對於敵人':         { en: 'against enemy',     th: 'ต่อศัตรู' },
  '對象':             { en: 'target',            th: 'เป้าหมาย' },
  '對於':             { en: 'against ',          th: 'ต่อ ' },
  '對':               { en: ' to ',              th: ' ต่อ ' },
  '使用':             { en: 'use ',              th: 'ใช้ ' },
  '發動技能':         { en: 'activate skill',    th: 'ใช้ทักษะ' },
  '發動':             { en: 'activate ',         th: 'ใช้ ' },

  // ── self / own (自己 16) ──
  '自己':             { en: 'self',              th: 'ตัวเอง' },
  '所有':             { en: 'all ',              th: 'ทั้งหมด ' },

  // ── negative effects (負面 30, 沉默 默 16, 暈 14, 電暈 14) ──
  '負面狀態':         { en: 'negative status',   th: 'สถานะด้านลบ' },
  '負面效果':         { en: 'negative effect',   th: 'ผลลัพธ์ด้านลบ' },
  '負面':             { en: 'negative ',         th: 'ด้านลบ ' },
  '沉默':             { en: 'silence',           th: 'ใบ้' },
  '電暈':             { en: 'stun',              th: 'ชะงัก' },
  '暈眩':             { en: 'stun',              th: 'ชะงัก' },
  '暈':               { en: 'stun',              th: 'ชะงัก' },
  '冰凍':             { en: 'freeze',            th: 'แช่แข็ง' },
  '中毒':             { en: 'poison',            th: 'พิษ' },
  '燃燒':             { en: 'burn',              th: 'ไฟไหม้' },

  // ── unable / cannot (無法) ──
  '無法使用技能':     { en: 'unable to use skill',     th: 'ใช้ทักษะไม่ได้' },
  '無法移動':         { en: 'unable to move',          th: 'เคลื่อนที่ไม่ได้' },
  '無法行動':         { en: 'unable to act',           th: 'ทำอะไรไม่ได้' },
  '無法':             { en: 'unable to ',              th: 'ไม่สามารถ ' },

  // ── defeat / kill (打倒 16) ──
  '打倒敵人':         { en: 'defeat enemy',      th: 'เอาชนะศัตรู' },
  '打倒':             { en: 'defeat ',           th: 'เอาชนะ ' },

  // ── summon (召喚 14) ──
  '召喚物':           { en: 'summon',            th: 'สิ่งเรียก' },
  '召喚':             { en: 'summon ',           th: 'เรียก ' },

  // ── direction / area (後方 前 8) ──
  '前方':             { en: 'front',             th: 'ด้านหน้า' },
  '後方':             { en: 'rear',              th: 'ด้านหลัง' },
  '前':               { en: 'front ',            th: 'หน้า ' },
  '後':               { en: 'rear ',             th: 'หลัง ' },

  // ── exceed / through / break (超出 12, 透過 8, 突破 8) ──
  '超出':             { en: 'exceed ',           th: 'เกิน ' },
  '透過':             { en: 'through ',          th: 'ผ่าน ' },
  '突破':             { en: 'break through ',    th: 'ทะลุ ' },
  '聚集':             { en: 'gather ',           th: 'รวมกัน ' },
  '移動':             { en: 'movement',          th: 'เคลื่อนที่' },
  '行動':             { en: 'action',            th: 'การกระทำ' },

  // ── modifiers (強 可 只 8-12) ──
  '強化':             { en: 'enhance ',          th: 'เสริม ' },
  '可以':             { en: 'can ',              th: 'สามารถ ' },
  '可':               { en: 'can ',              th: 'สามารถ ' },
  '只能':             { en: 'can only ',         th: 'ทำได้แค่ ' },
  '只':               { en: 'only ',             th: 'แค่ ' },

  // ── misc punctuation / particles ──
  '、':               { en: ', ',                th: ', ' },
  '：':               { en: ': ',                th: ': ' },
  '所':               { en: '',                  th: '' },

  // ── status / transform (狀態 變身 8) ──
  '變身狀態':         { en: 'transformed state',     th: 'สถานะแปลงร่าง' },
  '變身':             { en: 'transform',             th: 'แปลงร่าง' },
  '狀態':             { en: 'status',                th: 'สถานะ' },
  '異常狀態':         { en: 'abnormal status',       th: 'สถานะผิดปกติ' },
  '異常':             { en: 'abnormal',              th: 'ผิดปกติ' },

  // ── crowd control variants (default to silence/charm/freeze) ──
  '沈默':             { en: 'silence',               th: 'ใบ้' },
  '靜止':             { en: 'still',                 th: 'หยุดนิ่ง' },
  '昏迷':             { en: 'faint',                 th: 'ชะงัก' },
  '誘惑':             { en: 'charm',                 th: 'เสน่ห์' },
  '魅惑':             { en: 'charm',                 th: 'เสน่ห์' },
  '恐懼':             { en: 'fear',                  th: 'หวาดกลัว' },
  '禁錮':             { en: 'imprison',              th: 'กักขัง' },

  // ── invalid / no effect (無效 12) ──
  '無效化':           { en: 'nullify',               th: 'ทำให้เป็นโมฆะ' },
  '無效':             { en: 'invalid',               th: 'ไม่มีผล' },

  // ── teammate / companion (夥伴 8) ──
  '夥伴':             { en: 'teammate',              th: 'เพื่อนร่วมทีม' },
  '隊友':             { en: 'ally',                  th: 'พันธมิตร' },
  '隊伍':             { en: 'team',                  th: 'ทีม' },

  // ── swap / position (互換位置 8) ──
  '互換位置':         { en: 'swap position',         th: 'สลับตำแหน่ง' },
  '互換':             { en: 'swap',                  th: 'สลับ' },
  '位置':             { en: 'position',              th: 'ตำแหน่ง' },

  // ── send / transport (送往 8) ──
  '送往':             { en: 'send to ',              th: 'ส่งไปที่ ' },
  '送':               { en: 'send ',                 th: 'ส่ง ' },

  // ── beast / unit count (獸 隻 8) ──
  '魔獸':             { en: 'beast',                 th: 'อสูร' },
  '獸':               { en: 'beast',                 th: 'อสูร' },
  '隻':               { en: ' (counter)',            th: ' ตัว' },

  // ── conjunctions / particles (或 8, 於 8, 者 8) ──
  '或者':             { en: 'or',                    th: 'หรือ' },
  '或':               { en: ' or ',                  th: ' หรือ ' },
  '於':               { en: ' at ',                  th: ' ที่ ' },
  '者':               { en: '',                      th: '' },

  // ── core verbs / nouns (技能 72 standalone, 速度 22, 時間 28, 抗性 8, 攻擊力 6) ──
  '技能':             { en: 'Skill',                 th: 'ทักษะ' },
  '速度':             { en: 'Speed',                 th: 'ความเร็ว' },
  '時間':             { en: 'time',                  th: 'เวลา' },
  '抗性':             { en: 'Resistance',            th: 'ความต้านทาน' },
  '攻擊力':           { en: 'ATK',                   th: 'พลังโจมตี' },
  '攻擊':             { en: 'attack',                th: 'โจมตี' },
  '受到':             { en: 'receive ',              th: 'ได้รับ ' },
  '到':               { en: ' to ',                  th: ' ถึง ' },
  '間':               { en: ' time ',                th: ' เวลา ' },

  // ── direction modifier (上 8) ──
  '以上的':           { en: 'or above ',             th: 'ขึ้นไปของ ' },
  '上':               { en: ' up ',                  th: ' บน ' },
  '下':               { en: ' down ',                th: ' ล่าง ' },

  // ── make / cause / apply (讓 4, 適用 4, 數 4) ──
  '讓':               { en: 'make ',                 th: 'ทำให้ ' },
  '適用':             { en: 'applicable ',           th: 'ใช้ได้กับ ' },
  '數量':             { en: 'amount',                th: 'จำนวน' },
  '數':               { en: ' count',                th: ' จำนวน' },

  // ── travel / direction (往 8) ──
  '往':               { en: ' toward ',              th: ' ไปยัง ' },

  // ── cooldown standalone (冷卻 32) ──
  '冷卻時間':         { en: 'cooldown time',         th: 'เวลาคูลดาวน์' },
  '冷卻':             { en: 'cooldown',              th: 'คูลดาวน์' },

  // ── range / area (範圍 12) ──
  '攻擊範圍內':       { en: 'within ATK range',      th: 'ในระยะโจมตี' },
  '範圍內':           { en: 'within range',          th: 'ในระยะ' },
  '範圍':             { en: 'range',                 th: 'ระยะ' },

  // ── hit (命中 4) ──
  '命中':             { en: 'hit',                   th: 'โดน' },

  // ── place / position (處 4) ──
  '處於':             { en: 'in state of ',          th: 'อยู่ในสถานะ ' },
  '處':               { en: ' place',                th: ' ที่' },

  // ── body / HP (體 3) ──
  '體':               { en: ' body',                 th: ' กาย' },

  // ── maintain / inside (維持 3, 內 3) ──
  '維持':             { en: 'maintain ',             th: 'คง ' },
  '持續':             { en: 'last ',                 th: 'คงอยู่ ' },
  '內':               { en: ' within',               th: ' ภายใน' },

  // ── exceed (超 12 — กรณีที่ 超出 ไม่ match) ──
  '超過':             { en: 'exceed ',               th: 'เกิน ' },
  '超':               { en: ' exceed',               th: ' เกิน' },

  // ── single-char fallback (ต้องอยู่ท้ายสุด เพราะ length=1 จะแมตช์หลัง compound) ──
  '力':               { en: ' power',                th: ' พลัง' },
  '能':               { en: ' can',                  th: ' สามารถ' },

  // ── action standalone (動 行 8 — context already covered ใน 動作/行動) ──
  '動':               { en: ' move',                 th: ' เคลื่อน' },
  '行':               { en: ' act',                  th: ' กระทำ' },
  '身':               { en: ' body',                 th: ' กาย' },
  '強':               { en: ' strong',               th: ' แข็งแกร่ง' },
  '效':               { en: ' effect',               th: ' ผล' },
  '出':               { en: ' out',                  th: ' ออก' },

  // ── action verbs (long → short) ──
  '進行普通攻擊時，將無視敵人的':   { en: 'When performing normal attack, ignore enemy ',  th: 'เมื่อโจมตีปกติ จะเพิกเฉย ' },
  '進行一般攻擊時，將無視敵人的':   { en: 'When performing normal attack, ignore enemy ',  th: 'เมื่อโจมตีปกติ จะเพิกเฉย ' },
  '使技能冷卻時間縮短':              { en: 'Reduce Skill Cooldown by ',                     th: 'ลดคูลดาวน์ทักษะ ' },
  '所有技能冷卻時間縮短':            { en: 'All Skills Cooldown reduced by ',               th: 'คูลดาวน์ทักษะทั้งหมดลด ' },
  '技能冷卻時間縮短':                { en: 'Skill Cooldown reduced by ',                    th: 'คูลดาวน์ทักษะลด ' },
  '僅限該技能':                      { en: 'Only this skill',                               th: 'เฉพาะทักษะนี้' },
  '額外增加':                        { en: 'additionally increase ',                        th: 'เพิ่มเติม +' },
  '額外減少':                        { en: 'additionally decrease ',                        th: 'ลดเพิ่มเติม ' },
  '時間縮短':                        { en: 'reduced by ',                                   th: 'ลดลง ' },
  '將無視敵人的':                    { en: 'ignore enemy ',                                 th: 'เพิกเฉย ' },
  '將獲得以下效果':                  { en: 'gain the following effects',                    th: 'จะได้รับผลต่อไปนี้' },
  '獲得以下效果':                    { en: 'gain the following effects',                    th: 'ได้รับผลต่อไปนี้' },
  '以下效果':                        { en: 'the following effects',                         th: 'ผลต่อไปนี้' },
  '一定機率':                        { en: 'a chance',                                      th: 'โอกาส' },
  '高機率':                          { en: 'high probability',                              th: 'โอกาสสูง' },
  '進行普通攻擊':                    { en: 'performing normal attack',                      th: 'โจมตีปกติ' },
  '進行一般攻擊':                    { en: 'performing normal attack',                      th: 'โจมตีปกติ' },
  '技能命中敵人':                    { en: 'skill hits enemy',                              th: 'ทักษะโดนศัตรู' },
  '技能命中':                        { en: 'Skill hits',                                    th: 'ทักษะโดน' },
  '範圍傷害':                        { en: 'Area damage',                                   th: 'ความเสียหายในพื้นที่ของทักษะ' },
  '普通攻擊':                        { en: 'normal attack',                                 th: 'โจมตีปกติ' },
  '一般攻擊':                        { en: 'normal attack',                                 th: 'โจมตีปกติ' },
  '受到敵人':                        { en: 'hit by enemy',                                  th: 'โดนศัตรู' },
  '敵人的':                          { en: 'enemy ',                                        th: 'ศัตรู ' },
  '敵人':                            { en: 'enemy',                                         th: 'ศัตรู' },
  '戰鬥中':                          { en: 'In battle, ',                                   th: 'ในการต่อสู้, ' },
  '爆擊時':                          { en: 'on critical hit',                               th: 'เมื่อคริติคอล' },
  '爆擊':                            { en: 'critical hit',                                  th: 'คริติคอล' },
  '出動時':                          { en: 'when deployed',                                 th: 'เมื่อออกศึก' },
  '使用技能':                        { en: 'using skill',                                   th: 'ใช้ทักษะ' },
  '命中敵人':                        { en: 'hit enemy',                                     th: 'โดนศัตรู' },
  '發生':                            { en: 'occurs',                                        th: 'เกิดขึ้น' },
  '無視':                            { en: 'Ignore ',                                       th: 'เพิกเฉย ' },
  '以上':                            { en: 'or above',                                      th: 'ขึ้นไป' },
  '低於':                            { en: 'below ',                                        th: 'ต่ำกว่า ' },
  '尚有':                            { en: 'remaining ',                                    th: 'เหลือ ' },
  '還有':                            { en: 'remaining ',                                    th: 'เหลือ ' },
  '額外':                            { en: 'extra ',                                        th: 'เพิ่มเติม ' },
  '僅限':                            { en: 'only ',                                         th: 'เฉพาะ ' },
  '該技能':                          { en: 'this skill',                                    th: 'ทักษะนี้' },
  '在':                              { en: ' ',                                             th: ' ' },

  // ── short words ──
  '增加':   { en: ' increase ', th: ' เพิ่ม ' },
  '減少':   { en: ' decrease ', th: ' ลด ' },
  '提升':   { en: ' increase ', th: ' เพิ่ม ' },
  '提高':   { en: ' increase ', th: ' เพิ่ม ' },
  '降低':   { en: ' decrease ', th: ' ลด ' },
  // ── buff / spec+ terms ──
  '技能傷害': { en: 'skill damage', th: 'ความเสียหายทักษะ' },
  '攻擊對象': { en: 'attack target', th: 'เป้าหมายโจมตี' },
  '恢復':   { en: ' recover ', th: ' ฟื้นฟู ' },
  '進行':   { en: ' ',         th: ' ' },
  '每隔':   { en: 'every ',    th: 'ทุก ' },
  '單次':   { en: 'once',      th: 'ครั้งเดียว' },
  '增益技能': { en: 'buff skill', th: 'ทักษะบัฟ' },
  '增益':   { en: 'buff',      th: 'บัฟ' },
  '反射':   { en: ' reflect ', th: ' สะท้อน ' },
  '超高':   { en: 'very high', th: 'สูงมาก' },
  '且':     { en: ' and ',     th: ' และ ' },
  '被':     { en: ' get ',     th: ' โดน ' },
  '高':     { en: 'high',      th: 'สูง' },
  '縮短':   { en: ' reduce ',   th: ' ลด ' },
  '延長':   { en: ' extend ',   th: ' ยืด ' },
  '秒':     { en: 'sec',         th: 'วินาที' },
  '主要才能': { en: 'Major Talent',     th: 'พรสวรรค์หลัก' },
  '強化才能': { en: 'Enhanced Talents', th: 'พรสวรรค์เสริม' },
  '機率':   { en: 'Probability', th: 'ความน่าจะเป็น' },
  '條件':   { en: 'Condition',   th: 'เงื่อนไข' },
  '增益效果': { en: 'Buff Effects', th: 'บัฟ' },
  '效果':   { en: 'Effect',      th: 'ผล' },
  '將':     { en: '',  th: '' },
  '使':     { en: '',  th: '' },
  '能以':   { en: 'with ', th: 'ด้วย ' },
  '以':     { en: 'with ', th: 'ด้วย ' },
  '當':     { en: 'When ', th: 'เมื่อ ' },
  '時':     { en: '', th: '' },
  '的':     { en: ' ', th: ' ' },

  // ── คำที่ยังตกหล่น — ไล่มาจากการสแกนคลังข้อมูล warmycat ทั้งก้อน (เกียร์ + พรสวรรค์) ──
  // ต้นเหตุที่เจอตอนแรกคือ 技能閃避機率下降 ออกมาเป็น "Skill Evade Rate down 降"
  // เพราะมี '下' เดี่ยวอยู่ในตาราง แต่ไม่มี '下降' ตัวเต็ม (ตารางจับคำยาวก่อน จึงต้องใส่ตัวเต็ม)
  '下降':             { en: ' down ',                th: ' ลดลง ' },
  '持續傷害':         { en: 'Damage over Time',      th: 'ความเสียหายต่อเนื่อง' },
  '清除':             { en: 'Clear ',                th: 'ล้าง ' },
  '抵抗':             { en: 'Resist ',               th: 'ต้านทาน ' },
  '無敵':             { en: 'Invincible',            th: 'อมตะ' },
  '毅力':             { en: 'Endurance',             th: 'ความอึด' },
  '復活':             { en: 'Revive',                th: 'ฟื้นคืนชีพ' },
  '吸血':             { en: 'Lifesteal',             th: 'ดูดเลือด' },
  '擊退':             { en: 'Knockback',             th: 'ผลักถอย' },
  '擊暈':             { en: 'Stun',                  th: 'ทำให้มึน' },
  '複製分身':         { en: 'Clone',                 th: 'ร่างโคลน' },
  '礦物回收':         { en: 'Mineral Recovery',      th: 'คืนแร่' },
  '變身抗性':         { en: 'Transform Resistance',  th: 'ต้านการแปลงร่าง' },
  '出動飛彈':         { en: 'Launch Missile',        th: 'ยิงมิสไซล์' },
  '召喚支持':         { en: 'Summon Support',        th: 'เรียกกำลังเสริม' },
  '最後的攻擊':       { en: 'Final Strike',          th: 'การโจมตีสุดท้าย' },
  '完全保護罩':       { en: 'Full Shield',           th: 'โล่สมบูรณ์' },
  '技能防護罩':       { en: 'Skill Shield',          th: 'โล่ทักษะ' },
  '同歸於盡':         { en: 'Mutual Destruction',    th: 'ตายด้วยกัน' },
  '大雷雨':           { en: 'Thunderstorm',          th: 'พายุฝนฟ้าคะนอง' },
  '暴風雪':           { en: 'Blizzard',              th: 'พายุหิมะ' },
  '發射冰':           { en: 'Ice Shot',              th: 'ยิงน้ำแข็ง' },
  '妨礙礦物生產':     { en: 'Disrupt Mineral Production', th: 'ขัดขวางการผลิตแร่' },
  '增加敵方礦物成本': { en: 'Raise Enemy Mineral Cost',   th: 'เพิ่มค่าแร่ของศัตรู' },
  '礦物成本':         { en: 'Mineral Cost',          th: 'ค่าแร่' },
  '敵方暫停出動':     { en: 'Enemy Deploy Halt',     th: 'ศัตรูหยุดส่งตัว' },
  '禁止敵軍':         { en: 'Block enemy ',          th: 'ห้ามศัตรู ' },
  '重置部分我方':     { en: 'Reset some ally ',      th: 'รีเซ็ตบางส่วนของฝ่ายเรา ' },
  '轉化':             { en: 'Convert ',              th: 'เปลี่ยน ' },
  '轉換':             { en: 'Convert ',              th: 'เปลี่ยน ' },
  '我方':             { en: 'ally ',                 th: 'ฝ่ายเรา ' },
  '敵軍':             { en: 'enemy ',                th: 'ศัตรู ' },
  '射程':             { en: 'Range',                 th: 'ระยะยิง' },
  '擴大':             { en: ' expand',               th: ' ขยาย' },
  '縮小':             { en: ' shrink',               th: ' ย่อ' },
  '縮放':             { en: 'scale',                 th: 'ปรับขนาด' },
  '變形':             { en: 'morph',                 th: 'แปลงร่าง' },
  '陷入':             { en: ' inflict ',             th: ' ทำให้ติด ' },
  '防止':             { en: 'Prevent ',              th: 'ป้องกัน ' },
  '解除':             { en: ' removed',              th: ' ถูกล้าง' },
  '用泡泡':           { en: 'with a bubble ',        th: 'ด้วยฟองสบู่ ' },
  '飄浮':             { en: ' float',                th: ' ลอย' },
  '單擊':             { en: 'single hit',            th: 'โจมตีเดี่ยว' },
  '暫時':             { en: 'temporary',             th: 'ชั่วคราว' },
  // อักษรธาตุเดี่ยว — โผล่ท้ายประโยคแบบ "技能抗性無效：光"
  '光':               { en: 'Light',                 th: 'แสง' },
  '木':               { en: 'Wood',                  th: 'ไม้' },
  '闇':               { en: 'Dark',                  th: 'มืด' },
  '火':               { en: 'Fire',                  th: 'ไฟ' },
  '水':               { en: 'Water',                 th: 'น้ำ' },
  '此':               { en: 'this ',                 th: 'นี้ ' },
  '該':               { en: 'that ',                 th: 'นั้น ' },
  '與':               { en: 'with ',                 th: 'กับ ' },
  '，':     { en: ', ', th: ', ' },
  '。':     { en: '. ', th: '. ' },
  '（':     { en: ' (', th: ' (' },
  '）':     { en: ')',  th: ')' },
}

/** Cleanup: ลบ space ซ้อน, แก้ปัญหา zh↔แปล token ติดกัน, แก้วรรคตอน
 *
 *  ตัวกันชั้นสุดท้าย: ตัดอักษรจีนที่หลงเหลือทิ้ง เว็บนี้มีแค่ไทยกับอังกฤษ
 *  ถ้าเกมออกคำใหม่ที่พจนานุกรมยังไม่รู้จัก ผู้ใช้จะเห็นข้อความขาดไปนิดหน่อย
 *  ซึ่งดีกว่าเห็นภาษาที่สามโผล่มา (ตอนนี้คลังข้อมูลทั้งก้อนแปลได้ครบ ไม่มีอะไรโดนตัด) */
function cleanup(s: string): string {
  return s
    .replace(/[一-鿿㐀-䶿豈-﫿]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.)])/g, '$1')
    .replace(/\(\s+/g, '(')
    .replace(/\s+%/g, '%')
    .replace(/([a-zA-Zก-๛])(\d)/g, '$1 $2')   // ตัวอักษร EN/TH ↔ ตัวเลข
    .replace(/(\d)([a-zA-Zก-๛])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
}

/** เลือก output ตาม lang */
function pick(b: Bilingual, lang: TalentLang): string {
  return lang === 'th' ? b.th : b.en
}

// ── Helpers สำหรับ merge manual + extra dict (EN เท่านั้น) ──
// Manual dict ชนะเสมอ (เพราะ tuned wording และมี TH)
// Extra dict (จาก lerico) ใช้เป็น fallback เฉพาะ EN กรณี manual ไม่มี

function buildPhraseEntries(lang: TalentLang, extra?: ExtraDict): Array<[string, string]> {
  const map = new Map<string, string>()
  if (lang === 'en' && extra?.phrases) {
    // ข้าม key ตัวอักษรเดี่ยว (length < 2) — lerico dict มี entry สั้นๆ เช่น "次"→"times"
    // ที่ถูกต้องเฉพาะบริบทของ lerico เอง แต่ระบบเรา substring-replace ทั้งข้อความ
    // ถ้าปล่อยผ่านจะไปแทนที่ "次" ทุกจุดก่อน (stat-loop รันก่อน phrase-loop เสมอ)
    // ทำให้คำผสมของเราเอง เช่น "單次" ถูกแยกครึ่งก่อนจะจับคู่ทั้งคำได้ (เช่น "HP recover (單 times)")
    for (const [zh, en] of Object.entries(extra.phrases)) {
      if (zh.length >= 2) map.set(zh, en)
    }
  }
  // manual ชนะ (override extra)
  for (const [zh, bi] of Object.entries(PHRASE_ZH)) map.set(zh, pick(bi, lang))
  // longest-first
  return [...map.entries()].sort((a, b) => b[0].length - a[0].length)
}

function buildStatEntries(lang: TalentLang, extra?: ExtraDict): Array<[string, string]> {
  const map = new Map<string, string>()
  if (lang === 'en' && extra?.stats) {
    // ข้าม key ตัวอักษรเดี่ยว — เหตุผลเดียวกับ buildPhraseEntries ด้านบน
    for (const [zh, en] of Object.entries(extra.stats)) {
      if (zh.length >= 2) map.set(zh, en)
    }
  }
  for (const [zh, bi] of Object.entries(STAT_ZH)) map.set(zh, pick(bi, lang))
  return [...map.entries()].sort((a, b) => b[0].length - a[0].length)
}

/** Stat line: "技能抗性+20.0%" → "Skill Resistance +20.0%" / "ต้านทักษะ +20.0%" */
export function translateStatLine(zhText: string, lang: TalentLang = 'en', extra?: ExtraDict): string {
  const official = applyOfficialTemplate(zhText, lang, extra)
  if (official) return official
  const stats = buildStatEntries(lang, extra)
  for (const [zh, val] of stats) {
    if (zhText.startsWith(zh)) {
      const rest = zhText.slice(zh.length)
      // ส่วนที่เหลือหลังชื่อ stat อาจมีคำจีนต่อท้าย (เช่น 技能閃避機率下降) — แปลต่อให้ด้วย
      return cleanup(`${val} ${translateDescription(rest, lang, extra)}`)
    }
  }
  // ไม่ตรงกับชื่อ stat ตัวไหนเลย — เดิมคืนภาษาจีนดิบออกไปตรงๆ ซึ่งเป็นทางหลุดหลักของอักษรจีน
  // ตอนนี้ส่งเข้าไปแปลแบบประโยคแทน (พจนานุกรมชุดเดียวกัน แค่คนละวิธีจับคู่)
  return translateDescription(zhText, lang, extra)
}

/** Condition string */
export function translateCondition(zhText: string, lang: TalentLang = 'en', extra?: ExtraDict): string {
  // 0) แม่แบบทางการของ warmycat
  const official = applyOfficialTemplate(zhText, lang, extra)
  if (official) return official
  // 1) Exact phrase match (เร็วสุด)
  if (PHRASE_ZH[zhText]) return pick(PHRASE_ZH[zhText], lang)
  if (lang === 'en' && extra?.phrases?.[zhText]) return extra.phrases[zhText]
  // 2-3) Pattern + dict fallback
  return translateDescription(zhText, lang, extra)
}

/** Description / Condition / Buff — ใช้ pipeline เดียวกัน
 *   1) Pattern-based reconstruction (ไวยกรณ์ถูก) — รัน FIRST
 *   2) Stat dict (longest-first)
 *   3) Phrase dict + extra dict
 *   4) Cleanup */
export function translateDescription(zhText: string, lang: TalentLang = 'en', extra?: ExtraDict): string {
  // 0) ทั้งประโยคตรงกับแม่แบบทางการของ warmycat → ใช้คำแปลทางการ
  const official = applyOfficialTemplate(zhText, lang, extra)
  if (official) return official
  // 1) Pattern layer — จับโครงสร้างประโยคแล้ว reconstruct ใหม่
  let out = applyPatterns(zhText, lang)
  // ถ้า pattern คลุมหมด (ไม่มีอักษรจีนเหลือ) → return ตรงๆ
  if (!/[一-鿿]/.test(out)) return cleanup(out)
  // 2) Stat dict (compound stat 物理攻擊力 ยาวกว่า 攻擊力 — ต้อง stat ก่อน phrase)
  for (const [zh, val] of buildStatEntries(lang, extra)) {
    out = out.split(zh).join(` ${val} `)
  }
  // 3) Phrase dict + lerico extra
  for (const [zh, val] of buildPhraseEntries(lang, extra)) {
    out = out.split(zh).join(val)
  }
  return cleanup(out)
}

/** Buff effect — pipeline เดียวกับ description */
export function translateBuffEffect(zhText: string, lang: TalentLang = 'en', extra?: ExtraDict): string {
  return translateDescription(zhText, lang, extra)
}
