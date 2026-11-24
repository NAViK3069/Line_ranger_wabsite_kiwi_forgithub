// ====================================================
// Redis ถูกถอดออกแล้ว (เว็บเป็น static site บน GitHub Pages)
// คง redis = null ไว้ให้โค้ดเดิมที่เขียน "if (redis) {...}" ข้ามส่วนแคชไปเอง
// key/TTL ด้านล่างเก็บไว้เพื่อไม่ต้องแก้ไฟล์ที่ import อยู่
// ====================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface RedisLike {
  get<T = unknown>(key: string): Promise<T | null>
  mget<T = unknown[]>(...keys: string[]): Promise<T>
  set(key: string, value: unknown, opts?: { ex?: number; nx?: boolean }): Promise<unknown>
  del(...keys: string[]): Promise<number>
  incr(key: string): Promise<number>
  expire(key: string, sec: number): Promise<unknown>
  pipeline(): any
}

export const redis = null as RedisLike | null

// TTL สำหรับ cache แต่ละประเภท (วินาที)
// หมายเหตุ: ตั้ง TTL สูงสุดเท่าที่จะทำได้ เพื่อลด DB fallback → ประหยัด Neon
// ทุก write ของ admin จะ invalidate Redis อยู่แล้ว → ไม่ต้องกลัวข้อมูลค้าง
//
// ⚠ ทำไม TTL ยิ่งยาวยิ่งสำคัญ: Neon หลับหลังไม่มีคำสั่งใดๆ 5 นาที แปลว่า cache miss
// หนึ่งครั้ง (ไม่ว่าจะ query เล็กแค่ไหน) = จ่ายค่า compute อย่างน้อย 5 นาที
// คีย์ที่มีคนล้างให้แน่นอน (admin write / cron sync) ไม่มีเหตุผลต้องหมดอายุเองเลย
// ส่วนคีย์ที่ TTL ถูกใช้เป็น "ความสด" ด้วย (leagueRanking, rangerGear) ห้ามยืดพร่ำเพรื่อ
// เพราะถ้า cron พัง ข้อมูลจะค้างเงียบๆ นานเท่า TTL ที่ตั้งไว้
export const REDIS_TTL = {
  leagueRanking: 60 * 60 * 24 * 7,    // 7 วัน (GitHub Actions cron refresh รายวัน)
  rangerGear:    60 * 60 * 24 * 7,    // 7 วัน (GitHub Actions cron refresh รายวัน)
  gearIndex:     60 * 60 * 24 * 7,    // 7 วัน
  translations:  60 * 60 * 24 * 7,    // 7 วัน (เปลี่ยนแค่ตอน game update)
  gachaPool:     60 * 60 * 24 * 30,   // 30 วัน (admin invalidate ทันทีเมื่อแก้)
  gachaPoolList: 60 * 60 * 24 * 30,   // 30 วัน (admin invalidate ทันที — ดูหมายเหตุ TTL ด้านล่าง)
  top40:         60 * 60 * 24 * 30,   // 30 วัน (admin invalidate ทันที)
  rangerStats:   60 * 60 * 24 * 7,    // 7 วัน (เปลี่ยนแค่ตอน game update)
  gearEffects:   60 * 60 * 24 * 7,    // 7 วัน (เปลี่ยนแค่ตอน game update)
  gearDetail:    60 * 60 * 24 * 7,    // 7 วัน
  itemSlot:      60 * 60 * 24 * 30,   // 30 วัน (slot ไม่เปลี่ยน)
  rangerBookAll:  60 * 60 * 24 * 30,  // 30 วัน (sync เขียนทับให้ทุกครั้ง ไม่ต้องรอ TTL หมด)
  rangerAbilities: 60 * 60 * 24 * 7,  // 7 วัน (ability ต่อเรนเจอร์ เปลี่ยนแค่ตอนเกมอัปเดต)
  gearBookAll:    60 * 60 * 24 * 30,  // 30 วัน (sync เขียนทับให้ทุกครั้ง ไม่ต้องรอ TTL หมด)
  rangerCastTime: 60 * 60 * 24 * 30,  // 30 วัน (game data แทบไม่เปลี่ยน)
  // 7 วัน — เท่ากับ TTL อื่นๆ ในระบบ (เดิม 6 ชม. ซึ่งปลอดภัยกว่าที่จำเป็นมาก)
  // ตรวจนี้ยิงจากทุกหน้าที่มี ProProvider mount (ทุก page load ของทุกคนที่มีโค้ด pro)
  // ถี่กว่า cache อื่นในระบบทั้งหมด → ยิ่งต้องยืด TTL ให้ยาวสุดเพื่อลด Neon wake-up
  // ปลอดภัยเพราะ: (1) admin แก้/suspend/ลบ → invalidateProCode() ลบ cache ทันที
  //              (2) โค้ดมีกำหนดเวลา (expiresAt/suspendedUntil) → cap TTL ตอนเขียนอยู่แล้ว (ดู pro/check)
  proCode:        60 * 60 * 24 * 7,
  usageRanking:   60 * 60 * 24 * 7,   // 7 วัน (Awakening/Talent usage rate ต่อลีค จาก warmycat)
}

// key helpers — ป้องกัน typo และ prefix collision
export const redisKey = {
  league:        (id: number)                       => `lr:league:${id}`,
  gear:          (rangerId: string, league: number) => `lr:gear:${rangerId}:${league}`,
  gearIndex:     ()                                 => `lr:gear:index`,
  translations:  ()                                 => `lr:translations`,
  gachaPool:     (id: string)                       => `lr:gacha:pool:${id}`,
  gachaGearPool: (id: string)                       => `lr:gacha:gear:${id}`,
  gachaPoolList: (test: boolean)                    => `lr:gacha:pools:${test ? 'test' : 'live'}`,
  gachaGearList: (test: boolean)                    => `lr:gacha:gear:list:${test ? 'test' : 'live'}`,
  top40:         ()                                 => `lr:top40`,
  // level: undefined = max unlimit (default), number = level override
  // v4: เพิ่ม growth (raw stat delta ต่อเลเวล) + แก้สูตร Ranger Regeneration Time เป็น step-tier ตาม limit break
  //     → bump version ทิ้ง cache เก่าที่ยังไม่มี field นี้ / ค่า regen ผิด
  rangerStats:   (id: string, level?: number)       => level != null ? `lr:ranger:stats:v4:${id}:lv${level}` : `lr:ranger:stats:v4:${id}`,
  // v4: เพิ่ม basicGrowth/switchableGrowth/skillPlusGrowth (raw params ให้ client คำนวณ level อื่นๆ เอง)
  //     → bump version ทิ้ง cache เก่าที่ยังไม่มี field นี้
  gearEffects:   (itemCode: string)                 => `lr:gear:fx:v4:${itemCode}`,
  itemSlot:      (itemCode: string)                 => `lr:item:slot:${itemCode}`,
  rangerBookAll:  ()                                 => `lr:ranger:book:all`,
  rangerAbilities: ()                                => `lr:ranger:abilities:v5`,
  gearBookAll:    ()                                 => `lr:gear:book:all`,
  rangerCastTime: (id: string)                       => `lr:ranger:cast:v2:${id}`,
  // แคชเกียร์ต่อ ranger ทั้งลีค (ใช้โดย loadGearFromDB) — shape: { [rangerId]: {data,topSets,sampled,fetchedAt} }
  gearBatch:      (league: number)                   => `lr:gear:batch:${league}`,
  // สรุปอันดับเกียร์รวมของลีค (หน้า /api/meta/gear-ranking) — shape: { gears, totalSampled }
  // ต้องแยก key จาก gearBatch เด็ดขาด! เดิมใช้ key เดียวกันทั้งที่ข้อมูลคนละชนิด
  // → เปิดหน้า gear-ranking ทีเดียวทับแคชเกียร์ทั้งลีคพัง ทำให้ ranger detail ตก DB ทุกครั้ง
  gearRanking:    (league: number)                   => `lr:gear:ranking:v1:${league}`,
  gearDetail:     (itemCode: string, league: number) => `lr:gear:detail:v3:${itemCode}:${league}`,
  // เวลาที่ refresh ลีคนี้ล่าสุด (เลขเดียว) — gear-detail ใช้เทียบว่าแคชของตัวเองยังเป็นรอบล่าสุดไหม
  leagueStamp:    (league: number)                   => `lr:league:stamp:${league}`,
  // ชื่อเรนเจอร์ที่ติดอันดับในลีค { [id]: name } — เล็กกว่าคีย์ league เต็ม (~535KB) มาก
  leagueNames:    (league: number)                   => `lr:league:names:${league}`,
  proCode:        (code: string)                      => `lr:pro:${code}`,
  // ทั้งลีค 1 key (ไม่แยกต่อ ranger) — usage*.json ของ warmycat เป็นไฟล์เดียวรวมทุก ranger ในลีคนั้นอยู่แล้ว
  usageRanking:       (league: number)                  => `lr:usage:${league}:v1`,
}
