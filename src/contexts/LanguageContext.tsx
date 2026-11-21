'use client'
// ====================================================
// LanguageContext — เก็บ lang ปัจจุบัน + translation maps
// • Default: 'en' (ใช้ค่าจาก DB ตรงๆ ไม่ต้อง fetch อะไรเพิ่ม)
// • เปลี่ยนภาษา → fetch /api/translations/<lang> → cache
// • Persist ใน localStorage
// ====================================================

import { apiFetch } from '@/lib/staticApi'
import { createContext, useContext, useEffect, useState, useCallback, useMemo, type ReactNode } from 'react'

export type Lang = 'en' | 'th'

export const LANG_LABELS: Record<Lang, string> = {
  en: 'English',
  th: 'ไทย',
}

// ── Stat labels translation (hardcoded — ไม่อยู่ใน API) ──
// เพิ่ม label ใหม่ได้ที่นี่ ถ้า lang = 'th' จะคืนค่าตาม map ถ้าไม่ → fallback EN
const STAT_LABELS_TH: Record<string, string> = {
  'ATK per sec':                    'พลังโจมตีต่อวินาที',
  'ATK':                            'พลังโจมตี',
  'Physical ATK':                   'พลังโจมตีกาย',
  'Magical ATK':                    'พลังเวทโจมตี',
  'HP':                             'พลังชีวิต',
  'DEF':                            'พลังป้องกัน',
  'Physical DEF':                   'พลังป้องกันกาย',
  'Magical DEF':                    'พลังเวทป้องกัน',
  'ATK Speed':                      'ความเร็วในการโจมตี',
  'ATK speed':                      'ความเร็วในการโจมตี',
  'Move Speed':                     'ความเร็วการเคลื่อนที่',
  'Move speed':                     'ความเร็วการเคลื่อนที่',
  'ATK Range':                      'ระยะโจมตี',
  'Splash Radius':                  'ระยะสแปลช',
  'Critical Rate':                  'อัตราคริทิคอล',
  'Critical Damage':                'แรงโจมตีคริทิคอล',
  'Evade Rate':                     'อัตราการหลบหลีก',
  'Hit Rate':                       'อัตราความแม่นยำ',
  'Skill Use Rate 1':               'อัตราการใช้สกิล 1',
  'Skill Cooldown 1':               'เวลารอทักษะ 1',
  'Skill Use Rate 2':               'อัตราการใช้สกิล 2',
  'Skill Cooldown 2':               'เวลารอทักษะ 2',
  'Skill Evade Rate':               'อัตราการหลบสกิล',
  'Skill Hit Rate':                 'อัตราความแม่นยำของทักษะ',
  'Skill Resistance':               'ต้านสกิล',
  // ── stat เพิ่มเติม (ใช้ร่วมกับ Spec+ / talent) ──
  'Skill Use Rate':                 'อัตราการใช้สกิล',
  'Skill Re-activation Rate':       'อัตราการใช้สกิลซ้ำ',
  // 昏迷抗性/暈眩抗性/電暈抗性 ทุกแบบแปลเป็น "ชะงัก" เหมือนกันหมด (เกมไทยไม่มีคำว่า "สลบ") → map ได้ตรงๆ
  'Stun Resistance':                'ต้านชะงัก',
  'Physical Reflect Rate':          'อัตราสะท้อนกายภาพ',
  'Magic Reflect Rate':             'อัตราสะท้อนเวท',
  'Total ATK':                      'พลังโจมตีรวม',
  'Combo Rate':                     'อัตราคอมโบ',
  'Damage Reduction':               'ลดความเสียหาย',
  'Ranger Regeneration Time (sec)': 'ระยะเวลาที่สร้าง\nเรนเจอร์ใหม่ (วิ)',
  'Ranger Mineral Cost':            'ค่าแร่ธาตุเรนเจอร์',
  // ── Elements ──
  'Fire':                           'ไฟ',
  'Water':                          'น้ำ',
  'Wood':                           'ไม้',
  'Light':                          'แสง',
  'Dark':                           'มืด',
  'None':                           'ไร้ธาตุ',
  // ── Speed labels ──
  'Very Slow':                      'ช้ามาก',
  'Slow':                           'ช้า',
  'Normal':                         'ปกติ',
  'Fast':                           'เร็ว',
  'Very Fast':                      'เร็วมาก',
  'Super Fast':                     'เร็วสุดๆ',
  // ── Category (STR / AGI / INT) ──
  'Strength':                       'พลัง',
  'Agility':                        'ความว่องไว',
  'Intelligence':                   'ไหวพริบ',
  // ── Section labels ──
  'Skill':                          'ทักษะ',
  'Ability':                        'ความสามารถ',
  'In use':                         'ใช้แล้ว',
  // ── Skill timing / area labels ──
  'Area Skill':                     'ระยะสกิล',
  'Cast Time':                      'ระยะเวลาร่ายสกิล',
  'Recovery':                       'ระยะเวลากลับตำแหน่ง',
  'Total':                          'รวม',
  // ── Trigger Basis (觸發基準 จาก warmycat) — เป้าหมายที่สกิลเล็ง ──
  'Self':                           'ตัวเอง',
  'Front Enemy':                    'ศัตรูแนวหน้า',
  'Rear Enemy':                     'ศัตรูแนวหลัง',
  'Multiplier':                     'ตัวคูณ',
  '×':                              ' เท่า',   // leading space: "1.5 เท่า" (EN คงเป็น "1.5×" ไม่มีช่องว่าง)
  // ── Skill tooltip stat line ──
  'Use':                            'อัตราการใช้สกิล',
  'CD':                             'เวลารอทักษะ',
  // ── Units ──
  // 'pt' / 'sec' → ใช้ leading space (450 จุด / +3.5 วินาที)
  // 's' → ใช้ตัวสั้น "วิ" ติดเลข เพราะปรากฏหลายที่ในแถวเดียวกัน (4.0วิ / 6วิ)
  'pt':                             ' จุด',
  's':                              'วิ',
  'sec':                            ' วินาที',
  // ── Gear slot names ──
  'Weapon':                         'อาวุธ',
  'Armor':                          'อุปกรณ์ป้องกัน',
  'Accessory':                      'เครื่องแต่งกาย',
  // ── Gacha ──
  'Roll Now!':                      'สุ่มเลย!',
  // ── Gear popup ──
  'Gear value at level':            'ค่าเกียร์ที่ระดับ',
  'Initial':                        'เริ่มต้น',
  // ── Ranger Book filters ──
  'Filter':                         'ฟิลเตอร์',
  'STR':                            'พลัง',
  'AGI':                            'ว่องไว',
  'INT':                            'ไหวพริบ',
  'FIRE':                           'ไฟ',
  'WATER':                          'น้ำ',
  'TREE':                           'ไม้',
  'LIGHT':                          'แสง',
  'DARK':                           'มืด',
  'Grade':                          'ระดับ',
  'Switchable':                     'ออฟชั่น',
  'Evolution':                      'วิวัฒน์',
  'Type':                           'ชนิด',
  'Element':                        'ธาตุ',
  'Elem':                           'ธาตุ',
  'Role':                           'บทบาท',
  'Normal Ranger':                  'เรนเจอร์ธรรมดา',
  'Ultra Ranger':                   'ขั้นสุด',
  'Hyper Ranger':                   'ไฮเปอร์',
  'Ultra':                          'ขั้นสุด',
  'Hyper':                          'ไฮเปอร์',
  // ── Table headers ──
  'Name / ID':                      'ชื่อ / ไอดี',
  'Img':                            'รูป',
  // ── Role badges (Attack/Splash/HP/Speed/Balance/Support/Special) ──
  'Attack':                         'โจมตี',
  'Splash':                         'สแปลช',
  'Balance':                        'สมดุล',
  'Support':                        'สนับสนุน',
  'Speed':                          'รวดเร็ว',
  'Special':                        'พิเศษ',
  // หมายเหตุ: 'HP' role ใช้คำเดียวกับ stat label คือ 'พลังชีวิต' (มีใน dict อยู่แล้ว)
  // ── Common UI strings ──
  'Clear all':                      'ล้างทั้งหมด',
  'Back':                           'กลับหน้าหลัก',
  'Back to Custom':                 'กลับไปหน้า Custom',
  'Search ranger name or ID...':    'ค้นหาชื่อหรือ ID เรนเจอร์...',
  'Search gear name...':            'ค้นหาชื่อเกียร์...',
  'Search gear name or ID...':      'ค้นหาชื่อเกียร์ หรือ ID…',
  'Select Gear':                    'เลือกเกียร์',
  'Gacha Ranger':                   'Gacha Ranger',
  'Gacha Gear':                     'Gacha Gear',
  'Meta Ranger':                    'Meta Ranger',
  'Ranger Book':                    'Ranger Book',
  'Gear Book':                      'Gear Book',
  'All rangers':                    'เรนเจอร์ทั้งหมด',
  'All gears':                      'เกียร์ทั้งหมด',
  'rangers':                        'ตัว',
  'gears':                          'ชิ้น',
  'Page':                           'หน้า',
  'of':                             'จาก',
  'filtered':                       'กรอง',
  'Loading...':                     'กำลังโหลด...',
  'Loading data...':                'กำลังโหลดข้อมูล...',
  'Loading gacha pool...':          'กำลังโหลดตู้กาชา...',
  'Loading Ranger data...':         'กำลังโหลดข้อมูล Ranger…',
  'Fetching data...':               'กำลังดึงข้อมูล...',
  'Fetching Gear data...':          'กำลังดึงข้อมูล Gear...',
  'No ranger data':                 'ยังไม่มีข้อมูลเรนเจอร์',
  'No gear data':                   'ยังไม่มีข้อมูลเกียร์',
  'No history':                     'ยังไม่มีประวัติ',
  // ── Gear Book table headers ──
  'Gear name':                      'ชื่อเกียร์',
  'Slot':                           'ช่อง',
  'Item Code':                      'รหัสไอเทม',
  // ── Gacha pages ──
  'Select banner to roll':          'เลือก Banner ที่ต้องการสุ่ม',
  'Select banner':                  'เลือก Banner',
  'Press "Roll" to start':          'กด "สุ่ม" เพื่อเริ่มต้น',
  'Time':                           'ครั้ง',
  'Times':                          'ครั้ง',
  // ── Meta page ──
  'Top ranking Ranger & Gear in each League from PVP Tracker': 'อันดับ Ranger & Gear ยอดนิยมในแต่ละ League จาก PVP Tracker',
  'Select League':                  'เลือก League',
  'Rank':                           'อันดับ',
  'Name':                           'ชื่อ',
  'Rangers':                        'เรนเจอร์',
  'Users':                          'ผู้ใช้',
  'Usage %':                        '% ใช้งาน',
  'Count':                          'จำนวน',
  '% of Slot':                      '% ของ Slot',
  'users':                          'คน',
  'TOP 5 Popular Sets':             'TOP 5 เซ็ตยอดนิยม',
  'Previous':                       'ก่อนหน้า',
  'Next':                           'ถัดไป',
  'Fetching players':               'ดึงข้อมูลผู้เล่น',
  'Players:':                       'ผู้เล่น:',
  'Data from:':                     'ข้อมูลจาก:',
  'Used:':                          'ใช้:',
  'Gear Ranking per Slot':          'อันดับ Gear แต่ละช่อง',
  'items':                          'รายการ',
  // ── League names ──
  'Legend':                         'ตำนาน',
  'Master I':                       'มาสเตอร์ I',
  'Master II':                      'มาสเตอร์ II',
  'Master III':                     'มาสเตอร์ III',
  'Diamond I':                      'เพชร I',
  'Diamond II':                     'เพชร II',
  'Diamond III':                    'เพชร III',
  'Gold I':                         'ทอง I',
  'Gold II':                        'ทอง II',
  'Gold III':                       'ทอง III',
  'Silver I':                       'เงิน I',
  'Silver II':                      'เงิน II',
  'Silver III':                     'เงิน III',
  'Bronze':                         'ทองแดง',
  // Unicode roman numeral variants (จาก pvpScraper API)
  'Master Ⅰ':                       'มาสเตอร์ Ⅰ',
  'Master Ⅱ':                       'มาสเตอร์ Ⅱ',
  'Master Ⅲ':                       'มาสเตอร์ Ⅲ',
  'Diamond Ⅰ':                      'เพชร Ⅰ',
  'Diamond Ⅱ':                      'เพชร Ⅱ',
  'Diamond Ⅲ':                      'เพชร Ⅲ',
  'Gold Ⅰ':                         'ทอง Ⅰ',
  'Gold Ⅱ':                         'ทอง Ⅱ',
  'Gold Ⅲ':                         'ทอง Ⅲ',
  'Silver Ⅰ':                       'เงิน Ⅰ',
  'Silver Ⅱ':                       'เงิน Ⅱ',
  'Silver Ⅲ':                       'เงิน Ⅲ',
  // ── Gear picker tier badges ──
  'Recommended':                    'แนะนำ',
  // ── Gacha modal buttons ──
  'Collapse':                       'ย่อ',
  'Expand':                         'ขยาย',
  'You got!':                       'คุณได้รับ!',
  'Close':                          'ปิด',
  'Select':                         'เลือก',
  'Reset':                          'รีเซ็ต',
  'Go':                             'เปิด',
  'Info':                           'ข้อมูล',
  'History':                        'ประวัติ',
  'Chest':                          'กล่อง',
  'Rangers Random Chest':           'กล่องสุ่มเรนเจอร์',
  'Rangers Select Chest':           'กล่องเลือกเรนเจอร์',
  'Gear Random Chest':              'กล่องสุ่มเกียร์',
  'Gear Select Chest':              'กล่องเลือกเกียร์',
  'When achieving':                 'เมื่อสุ่มครบ',
  'time':                           'ครั้ง',
  'More':                           'เพิ่มเติม',
  '+ More':                         '+ เพิ่มเติม',
  '− More':                         '− เพิ่มเติม',
  'Basic':                          'พื้นฐาน',
  'Element Match':                  'ธาตุตรง',
  'Category Match':                 'สายตรง',
  // ── Gear popup action buttons ──
  'Install this gear':              'ติดตั้งเกียร์นี้',
  'Remove gear':                    'ถอดเกียร์',
  'Replace gear':                   'เปลี่ยนเกียร์',
  // ── Ability tooltip detail (Activate / Condition / Probability) ──
  'Activate On':                    'เปิดใช้งานเมื่อ',
  'Condition':                      'เงื่อนไข',
  'Basic Effects':                  'เอฟเฟกต์พื้นฐาน',
  'Skill Effect':                   'ความสามารถสกิล',
  'Attack Skill Effect':            'ความสามารถสกิลโจมตี',
  'Buff Skill Effect':              'ความสามารถสกิลบัฟ',
  'Switchable Effects':             'เอฟเฟกต์สลับได้',
  'Display Condition':              'เงื่อนไขแสดงผล',
  'Match any (OR)':                 'มีอย่างน้อยหนึ่งค่า',
  'Match all (AND)':                'ต้องมีครบทุกค่า',
  'Probability':                    'โอกาส',
  '(None)':                         '(ไม่มี)',
  // activeWhenType (formatted English → Thai)
  'During Battle':                  'ระหว่างการต่อสู้',
  'On Hit':                         'เมื่อโจมตี',
  'On Stage':                       'อยู่ในเวที',
  'On Deploy':                      'เมื่อลงสนาม',
  'Before Battle':                  'ก่อนการต่อสู้',
  // activeOnType
  'Any Game Type':                  'ทุกโหมดเกม',
  'PVP Only':                       'PVP เท่านั้น',
  'PVE Only':                       'PVE เท่านั้น',
  // condition types
  'Category':                       'ประเภท',
  // ── Talent section ──
  'Talents':                        'พรสวรรค์',
  'Major Talent':                   'พรสวรรค์หลัก',
  'Enhanced Talents':               'พรสวรรค์เสริม',
  'Buff Effect':                    'เอฟเฟ็กต์เสริม',
  // หมายเหตุ: Skill Resistance, Skill Use Rate, Skill Cooldown, Skill Hit Rate, Skill Evade Rate
  // มีอยู่แล้วใน stat labels section ข้างบน → ไม่ต้องซ้ำที่นี่
  'All Skills Cooldown':            'เวลารอสกิลทั้งหมด',
  // Talent description phrases
  'When deployed in battle, gain the following effects:': 'เมื่อลงสนามในการต่อสู้ จะได้รับผลดังนี้:',
  'When hit by enemy skill in battle, gain the following effects with a chance:': 'เมื่อโดนสกิลศัตรูในการต่อสู้ มีโอกาสได้รับผลดังนี้:',
  'increase':                       'เพิ่ม',
  'decrease':                       'ลด',
  // ── Animation Popup ──
  'Under development':              'กำลังอยู่ในช่วงพัฒนา',
  'Full screen':                    'เต็มจอ',
  'Exit full screen':               'ออกจากเต็มจอ',
  // ปุ่มปิดพื้นหลัง — ใช้คีย์แยกจาก 'None' ที่แปลว่า "ไร้ธาตุ" (คีย์นั้นใช้กับ badge ธาตุในหน้ากาชา)
  'Off':                            'ปิด',
  'Grid':                           'ตาราง',
  'Clear':                          'ล้าง',
  'Format':                         'นามสกุล',
  'Background':                     'พื้นหลัง',
  'Transparent':                    'โปร่งใส',
  'Full window':                    'เต็มหน้าต่าง',
  'Selected area':                  'ที่เลือก',
  'Cancel':                         'ยกเลิก',
  'Area':                           'พื้นที่',
  'Selected color':                 'สีที่เลือก',
  'Export Video':                   'ส่งออกวิดีโอ',
  'Exporting':                      'กำลัง Export',
  'Frame':                          'เฟรม',
  'Download image?':                'ดาวน์โหลดรูปภาพ?',
  'Export video?':                  'ส่งออกวิดีโอ?',
  'Save current frame as PNG file': 'บันทึกเฟรมปัจจุบันเป็นไฟล์ PNG',
  'Choose format and settings before exporting': 'เลือกรูปแบบและตั้งค่าก่อนส่งออก',
  'Confirm':                        'ตกลง',
  'Animation Sequence':             'ลำดับอนิเมชั่น',
  'Add':                            'เพิ่ม',
  'No animations added — will export current animation': 'ยังไม่ได้เพิ่มอนิเมชั่น — จะ export อนิเมชั่นปัจจุบัน',
  'Maximum 10 animations reached': 'เพิ่มได้สูงสุด 10 อนิเมชั่น',
  'Edit frame range':                'แก้ไขช่วงเฟรม',
  'Editing frame range':             'กำลังแก้ไขช่วงเฟรม',
  'Full':                            'ทั้งหมด',
  'This browser does not support creating WebP — use Chrome or Edge instead': 'เบราว์เซอร์นี้ไม่รองรับการสร้าง WebP — ใช้ Chrome หรือ Edge แทน',
  'Failed to parse WebP frame':      'parse WebP frame ล้มเหลว',
  'Encoding frame':                  'encode เฟรม',
  'Building animated WebP...':       'กำลัง build animated WebP...',
  'Analyzing color':                 'วิเคราะห์สี เฟรม',
  'MP4 requires Chrome 94+ or Edge 94+ — this browser is not supported': 'MP4 ต้องใช้ Chrome 94+ หรือ Edge 94+ — เบราว์เซอร์นี้ไม่รองรับ',
  'Finalizing MP4...':               'กำลัง finalize MP4...',
  'Mixing audio...':                 'กำลังมิกซ์เสียง...',
  'Starting...':                     'กำลังเริ่มต้น...',
  'Export failed':                   'Export ล้มเหลว',
  'Chrome / Edge / Firefox — small file, supports transparency': 'Chrome / Edge / Firefox — ไฟล์เล็ก รองรับโปร่งใส',
  'All browsers — supports transparent background': 'ทุกเบราว์เซอร์ — รองรับพื้นหลังโปร่งใส',
  'H.264 — requires Chrome 94+ / Edge 94+ (WebCodecs)': 'H.264 — ต้องใช้ Chrome 94+ / Edge 94+ (WebCodecs)',
  'Custom color':                    'สีกำหนดเอง',
  // ── Awakening/Talent usage ranking (Ranger Meta detail) ──
  'Awakening Ability Usage':         'สถิติการใช้ความสามารถปลุกพลัง',
  'Talent Release Status':           'สถานะการปลดล็อคพรสวรรค์',
  'Not Unlocked':                    'ยังไม่ปลดล็อค',
  'Talent level':                    'ระดับพรสวรรค์',
  'Max':                             'สูงสุด',
  'Unit':                            'ตัว',
  'Talent Stage 1':                  'พรสวรรค์ระดับ 1',
  'Talent Stage 2':                  'พรสวรรค์ระดับ 2',
  'Talent Stage 3':                  'พรสวรรค์ระดับ 3',
  'Talent Stage 4':                  'พรสวรรค์ระดับ 4',
  // ── /beta page ──
  'Unlock Beta test system':        'ปลดล็อคระบบ Beta test',
  'Welcome to Beta!':                'ยินดีต้อนรับ Beta!',
  'You can now use the Beta test system': 'คุณสามารถใช้งานระบบ Beta test ได้แล้ว',
  'Back to Home':                    'กลับหน้าหลัก',
  'Exit Beta':                       'ออกจาก Beta',
  'Enter Beta Key Code':             'ใส่ Beta Key Code',
  'Get a code from the site owner to unlock': 'รับโค้ดจากเจ้าของเว็บเพื่อปลดล็อค',
  'Show code':                       'แสดงโค้ด',
  'Hide code':                       'ซ่อนโค้ด',
  'Please enter a code':             'กรุณาใส่โค้ด',
  'Invalid code':                    'โค้ดไม่ถูกต้อง',
  'Checking...':                     'กำลังตรวจสอบ...',
  'Unlock Beta':                     'ปลดล็อค Beta',
  'Try again in 15 minutes':         'ลองใหม่อีกครั้งใน 15 นาที',
  'This code has expired':           'โค้ดหมดอายุแล้ว',
  'This code has been suspended':    'โค้ดนี้ถูกระงับ',
  // ── Gear meta popup (rangers-usage) ──
  'Most-used by Rangers':           'เรนเจอร์ที่ใส่มากสุด',
  'Sorted by most-installed — % is based on every detected instance of each Ranger': 'เรียงตามจำนวนที่ใส่มากสุด — % คิดจากทุก instance ที่ตรวจพบของ Ranger แต่ละตัว',
  'Rangers using this gear:':       'Ranger ที่ใส่เกียร์นี้:',
  'No Ranger uses this gear in this League': 'ไม่พบ Ranger ที่ใส่เกียร์นี้ใน League นี้',
  'No Gear data':                   'ไม่พบข้อมูล Gear',
  'units':                          'ตัว',

  // ── หน้า /lobby ──
  'Pro / Beta only':                'เฉพาะ Pro / Beta',
  'This page needs an active Pro or Beta code.': 'หน้านี้ต้องใช้โค้ด Pro หรือ Beta ที่ยังไม่หมดอายุ',
  'Enter code':                     'ใส่โค้ด',
  'Save image':                     'บันทึกรูป',
  'Watermark':                      'ลายน้ำ',

  // ── หน้า /res (ไล่ดูไฟล์) ──
  'Filter in this':                 'กรองในนี้',
  'Advanced':                       'ขั้นสูง',
  'Show all folders (incl. ranger folders)': 'แสดงโฟลเดอร์ทั้งหมด (รวมโฟลเดอร์เรนเจอร์)',
  'Up one folder':                  'ย้อนขึ้นหนึ่งโฟลเดอร์',
  'Play animation':                 'เล่นอนิเมชั่น',
  'Modified':                       'แก้ไขเมื่อ',
  'Size':                           'ขนาด',
  'folders':                        'โฟลเดอร์',
  'files':                          'ไฟล์',
  'showing':                        'แสดง',
  'Open':                           'เปิด',
  'Save this image?':               'บันทึกรูปนี้ไหม?',
  'Save':                           'บันทึก',
  'Cannot save the image — a file blocked reading the canvas': 'บันทึกรูปไม่ได้ — มีไฟล์ที่ทำให้อ่านผืนผ้าไม่ได้',
  'Pause':                          'หยุด',
  'Play':                           'เล่น',
  'Edit profile':                   'แก้ไขโปรไฟล์',
  'Choose profile image':           'เลือกรูปโปรไฟล์',
  'Choose fortress':                'เลือกป้อมปราการ',
  'Level':                          'เลเวล',
  'Gauge':                          'หลอด',
  'Ranger teams':                   'ปรับแต่งทีมเรนเจอร์',
  'Pick a ranger':                  'เลือกเรนเจอร์',
  'Team':                           'ทีม',
  'slot':                           'ช่องที่',
  'No results':                     'ไม่พบรายการที่ค้นหา',
  'Search':                         'ค้นหา',
  'Choose ability':                 'เลือกความสามารถ',
  'Awakening':                      'ปลุกพลัง',
  'Copy':                           'คัดลอก',
  'Copied':                         'คัดลอกแล้ว',
  'Object list':                    'รายการวัตถุ',
  'Layout setup':                   'ตั้งค่าตำแหน่ง',
  'Pick a file':                    'เลือกไฟล์',
  'Open in new tab':                'เปิดในแท็บใหม่',
  'Pieces':                         'ชิ้นส่วน',
  'Show pieces (from .plist)':      'ดูชิ้นส่วนที่แยกจาก .plist',
  'Download':                       'ดาวน์โหลด',
  'M point must end in 0 and be at least': 'คะแนน M ต้องลงท้ายด้วย 0 และไม่ต่ำกว่า',
  'Resources':                      'ทรัพยากร',
  'Admin layout panel':             'แผงจัดวางของแอดมิน',
  'Master':                         'มาสเตอร์',
  'Super Master':                   'ซุปเปอร์มาสเตอร์',
  'Super Legend':                   'ซุปเปอร์ตำนาน',
}

type TranslateType = 'unit' | 'equip' | 'skill' | 'ability' | 'property' | 'custom'

interface TranslationBundle {
  units:      Record<string, string>
  equips:     Record<string, string>
  skills:     Record<string, string>
  abilities:  Record<string, string>
  properties: Record<string, string>
  custom:     Record<string, string>
}

interface LanguageContextValue {
  lang: Lang
  setLang: (l: Lang) => void
  loading: boolean
  /**
   * แปล key เป็นภาษาปัจจุบัน
   * - ถ้า lang = 'en' → return fallback (ค่าจาก DB คือ en อยู่แล้ว)
   * - ถ้าไม่เจอใน map → return fallback
   */
  t: (type: TranslateType, key: string, fallback: string) => string
  /** ลองหาในทุก map (กรณีไม่รู้ type) */
  tAny: (key: string, fallback: string) => string
  // ── Shortcuts ──────────────────────────────────
  /** แปลชื่อ ranger จาก unitCode (e.g. 'u1556e-af') */
  tRanger:  (id: string, fallback: string) => string
  /** แปลชื่อ gear จาก iconUrl หรือ itemCode */
  tGear:    (iconUrlOrCode: string, fallback: string) => string
  /** แปลชื่อ skill จาก skillCode */
  tSkill:   (code: string, fallback: string) => string
  /** แปลคำอธิบาย skill */
  tSkillDesc: (code: string, fallback: string) => string
  /** แปลชื่อ ability จาก abilityCode */
  tAbility: (code: string, fallback: string) => string
  /** แปลคำอธิบาย ability */
  tAbilityDesc: (code: string, fallback: string) => string
  /** แปล stat label (จาก dictionary hardcoded) เช่น 'ATK', 'HP', 'ATK per sec' */
  tStat: (label: string) => string
  /** แปลหน่วยที่ฝังอยู่ในสตริงค่า เช่น "+3.5sec" → "+3.5 วินาที", "450pt" → "450 จุด" */
  tUnit: (value: string) => string
}

const STORAGE_KEY = 'lr:lang'
const DEFAULT_LANG: Lang = 'en'

const Context = createContext<LanguageContextValue>({
  lang: DEFAULT_LANG,
  setLang: () => {},
  loading: false,
  t: (_t, _k, fb) => fb,
  tAny: (_k, fb) => fb,
  tRanger:      (_id, fb) => fb,
  tGear:        (_u, fb) => fb,
  tSkill:       (_c, fb) => fb,
  tSkillDesc:   (_c, fb) => fb,
  tAbility:     (_c, fb) => fb,
  tAbilityDesc: (_c, fb) => fb,
  tStat:        (label) => label,
  tUnit:        (value) => value,
})

const EMPTY_BUNDLE: TranslationBundle = {
  units: {}, equips: {}, skills: {}, abilities: {}, properties: {}, custom: {},
}

// In-memory cache ระหว่างเปลี่ยนภาษาไปมา (ไม่ต้อง fetch ซ้ำใน session เดียวกัน)
const bundleCache = new Map<Lang, TranslationBundle>()

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG)
  const [bundle, setBundle] = useState<TranslationBundle>(EMPTY_BUNDLE)
  const [loading, setLoading] = useState(false)

  // Hydrate ภาษาจาก localStorage หลัง mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored && ['en', 'th'].includes(stored)) {
        setLangState(stored as Lang)
      }
    } catch { /* SSR or no localStorage */ }
  }, [])

  // เซ็ต <html data-lang="..."> ให้ CSS ใช้ขยาย font-size ของภาษาไทย
  useEffect(() => {
    document.documentElement.dataset.lang = lang
  }, [lang])

  // Fetch translation bundle เมื่อภาษาเปลี่ยน
  useEffect(() => {
    if (lang === 'en') {
      setBundle(EMPTY_BUNDLE)
      return
    }
    const cached = bundleCache.get(lang)
    if (cached) {
      setBundle(cached)
      return
    }
    let cancelled = false
    setLoading(true)
    apiFetch(`/api/translations/${lang}`)
      .then(r => r.json() as Promise<TranslationBundle>)
      .then((data) => {
        if (cancelled) return
        bundleCache.set(lang, data)
        setBundle(data)
      })
      .catch(() => {
        if (!cancelled) setBundle(EMPTY_BUNDLE)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [lang])

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    try { localStorage.setItem(STORAGE_KEY, l) } catch { /* ignore */ }
  }, [])

  const t = useCallback((type: TranslateType, key: string, fallback: string): string => {
    if (lang === 'en') return fallback
    const map = type === 'unit'      ? bundle.units
             : type === 'equip'     ? bundle.equips
             : type === 'skill'     ? bundle.skills
             : type === 'ability'   ? bundle.abilities
             : type === 'property'  ? bundle.properties
             :                        bundle.custom
    return map[key] ?? fallback
  }, [lang, bundle])

  const tAny = useCallback((key: string, fallback: string): string => {
    if (lang === 'en') return fallback
    return bundle.units[key]
        ?? bundle.equips[key]
        ?? bundle.skills[key]
        ?? bundle.abilities[key]
        ?? bundle.properties[key]
        ?? bundle.custom[key]
        ?? fallback
  }, [lang, bundle])

  // ── Shortcuts ──────────────────────────────────
  const tRanger = useCallback((id: string, fallback: string): string => {
    if (lang === 'en') return fallback
    return bundle.units[`${id}_nm`] ?? fallback
  }, [lang, bundle])

  const tGear = useCallback((iconUrlOrCode: string, fallback: string): string => {
    if (lang === 'en') return fallback
    // ถ้าเป็น iconUrl → extract itemCode
    const m = iconUrlOrCode.match(/\/gear_icon\/(.+)_icon\.png$/)
    const code = m ? m[1] : iconUrlOrCode
    return bundle.equips[`${code}_nm`] ?? fallback
  }, [lang, bundle])

  const tSkill = useCallback((code: string, fallback: string): string => {
    if (lang === 'en') return fallback
    return bundle.skills[`${code}_nm`] ?? fallback
  }, [lang, bundle])

  const tSkillDesc = useCallback((code: string, fallback: string): string => {
    if (lang === 'en') return fallback
    return bundle.skills[`${code}_desc`] ?? fallback
  }, [lang, bundle])

  const tAbility = useCallback((code: string, fallback: string): string => {
    if (lang === 'en') return fallback
    return bundle.abilities[`${code}_nm`] ?? fallback
  }, [lang, bundle])

  const tAbilityDesc = useCallback((code: string, fallback: string): string => {
    if (lang === 'en') return fallback
    return bundle.abilities[`${code}_desc`] ?? fallback
  }, [lang, bundle])

  // Stat labels — ดึงจาก dictionary hardcoded (ไม่ใช้ API)
  const tStat = useCallback((label: string): string => {
    if (lang === 'th') return STAT_LABELS_TH[label] ?? label
    return label
  }, [lang])

  // tUnit — แทนหน่วยภายในสตริง เช่น "+3.5sec" → "+3.5 วินาที"
  const tUnit = useCallback((value: string): string => {
    if (lang !== 'th') return value
    return value
      .replace(/sec\b/g, ' วินาที')
      .replace(/(\d)pt\b/g, '$1 จุด')
  }, [lang])

  const value = useMemo(() => ({
    lang, setLang, loading, t, tAny,
    tRanger, tGear, tSkill, tSkillDesc, tAbility, tAbilityDesc, tStat, tUnit,
  }), [lang, setLang, loading, t, tAny, tRanger, tGear, tSkill, tSkillDesc, tAbility, tAbilityDesc, tStat, tUnit])

  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useLanguage() {
  return useContext(Context)
}
