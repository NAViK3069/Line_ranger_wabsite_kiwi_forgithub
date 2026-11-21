'use client'

// ====================================================
// LobbyStudio — ตัวพื้นที่ถ่ายรูปทั้งก้อน ใช้ร่วมกันสองหน้า
//   /admin/lobby  (admin = true)  เห็นตารางจัดวางวัตถุ + เลือกเรนเจอร์ได้ทุกตัว
//   /lobby        (admin = false) ใช้ฉากชุดเดียวกันแต่ไม่มีตารางจัดวาง (เลือกเรนเจอร์ได้ทุกตัวเหมือนกัน + ตัวใหม่)
// ทั้งสองหน้าต้องปลดล็อค Beta/Pro เหมือนกัน (ด่านอยู่ในนี้ที่เดียว)
// วาดทุกอย่างลง Canvas โดยตรงเหมือนหน้า Top40 Legend ในแอดมิน
// (ไม่ใช้ html2canvas — วาดแล้วได้ภาพจริงเลย ไม่ต้องแปลงอีกชั้น)
//
// ขนาดผืนผ้า = ขนาดจริงของ Home_bg.png (1036x652) พิกัดในแผงคุมจึงตรงกับภาพต้นฉบับ 1:1
//
// เข้าได้เฉพาะคนที่มี Pro / Beta — ไฟล์ .sam โหลดผ่านด่านเดิม (/api/lerico-proxy/file)
// จึงไม่ต้องเปิดช่องทางสาธารณะใหม่ และกฎการเล่นอนิเมชั่นเดิมไม่ถูกกระทบเลย
//
// รองรับอนิเมชั่น: render loop เดินเวลาเป็น "ติ๊ก" คงที่ LOOP_FPS ซึ่งเท่ากับ animRate ของไฟล์
// .sam ที่ใช้ (30 ทั้งหมด) เฟรมจึงเดิน 1:1 ไม่ต้องแปลงอัตรา
//
// นิยามฉาก + ตัวเลือกของแต่ละชิ้นอยู่ใน ./scene.ts
// ====================================================

import { proxyFile, fetchSamList, corsImage } from '@/lib/staticApi'
import { apiFetch } from '@/lib/staticApi'
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useLanguage } from '@/contexts/LanguageContext'
import { usePro } from '@/contexts/ProContext'
import { SAMParser } from '@/lib/animation/samParser'
import {
  loadSprites, renderSAMFrame, disposeSprites, animBBox, animStandPoint, placementStandPoint, animBodyBBox, anchorFromRatio,
} from '@/lib/animation/samRenderer'
import type { SpriteMap } from '@/lib/animation/samRenderer'
import {
  CANVAS_W, CANVAS_H, SCENE_DEFAULT, SECTIONS, SCALE_EXEMPT_PARTS, MIRROR_FLIP_DX_PARTS,
  sceneToCode, refToValue, valueToRef, expandScene, partValue, partValues, digitUrls,
  LEVEL_LV_IMG, levelNumUrls, LEVEL_GLYPH_RE,
} from './scene'
import type { AssetRef, SceneItem, ScenePart } from './scene'
import { applyTeams, emptyTeam, fetchRangerFacts } from './team'
import type { RangerFacts, TeamSide, TeamSlot } from './team'
import { applyProfile, featherCap, PROFILE_DEFAULT } from './profile'
import type { ProfileState } from './profile'
import ProfilePanel from './ProfilePanel'
import FortressButton from './FortressButton'
import { applyFortress, FORTRESS_DEFAULT } from './fortress'
import { G_RANGER_SCALE, UPCOMING_RANGERS, upcomingSizeRatio } from '@/lib/upcomingRangers'
import { applyRookieRow, isRookie, ROOKIE_ROW } from './rookie'
import TeamPanel from './TeamPanel'
import RangerPicker, { PICKER_VIEW_DEFAULT } from './RangerPicker'
import type { RangerRow, PickerView } from './RangerPicker'

// ความกว้างสูงสุดที่ "แสดง" บนจอ — เท่าขนาดผืนผ้าจริง คือแสดง 100% ไม่ย่อ
// จอที่แคบกว่านี้ยังหดตามได้เอง เพราะกรอบใช้ min(100%, ค่านี้)
const DISPLAY_MAX_W = CANVAS_W
const LOOP_FPS = 30
// ขนาดตัวอักษรของข้อความแถบทรัพยากร (kind 'text') ที่ scale = 1 — ยังเป็นฟอนต์อยู่
// (เลเวลบนฐานยืนเลิกใช้ฟอนต์แล้ว เปลี่ยนไปต่อรูปแทน ดู paintLevel)
const LEVEL_FONT_PX = 30
// ระยะห่างไอคอนยศกับป้าย Lv. ที่ scale = 1 (หน่วยเป็นพิกเซลของไฟล์ต้นฉบับ)
const LEVEL_ICON_GAP = 4
// ระยะห่างป้าย Lv. กับรูปตัวเลข ที่ scale = 1
// แยกจาก LEVEL_NUM_TRACK เพราะรอยต่อนี้ต้องการช่องไฟ ส่วนระหว่างตัวเลขต้องชิด
const LEVEL_NUM_GAP = 1
// ระยะระหว่างตัวเลขแต่ละหลัก ที่ scale = 1 — ติดลบ = ดึงเข้าหากัน
// วัดไฟล์แล้ว "เนื้อ" ของเลขส่วนใหญ่กว้างเต็ม 14px อยู่แล้ว (ยกเว้นเลข 1 ที่ได้ 9)
// แต่ 1px นอกสุดสองข้างเป็นขอบดำแบบ anti-alias จางๆ ซึ่งในเกมตัวที่ติดกันใช้ขอบร่วมกัน
// → ตัดขอบใสอย่างเดียวยังไม่พอ ต้องดึงเข้าให้ขอบดำมาทับกันพอดี (ไล่มา -1 → -2 → -3)
// (ไม่ยกระดับ alpha ที่ใช้วัดเนื้อแทน เพราะนั่นจะกินขอบดำจริงหายไปด้วย)
const LEVEL_NUM_TRACK = -3
// ยกป้าย Lv. กับตัวเลขขึ้นจากแนวกึ่งกลาง ที่ scale = 1 (ติดลบ = ขึ้น) — ไล่มา -1 → -2
// มีผลเฉพาะตัวอักษร ไอคอนยศยังอยู่กึ่งกลางเดิม
const LEVEL_TEXT_DY = -2
// ช่องไฟรอบเลข 1 ที่ scale = 1 — หน้าและหลังแยกกัน
// เลข 1 เป็นตัวเดียวที่เนื้อแคบจริง (9 จาก 14px ส่วนตัวอื่น 12-14) พอตัดขอบใสทิ้ง
// มันเลยไม่มีช่องไฟข้างตัวเหมือนตัวอื่น แถมยังโดน LEVEL_NUM_TRACK ดึงเข้าเท่ากันอีก
// → ต้องคืนช่องไฟให้เองทั้งสองข้าง ไม่ใช่แค่ดันไปทางขวา (ดันอย่างเดียวเปิดได้แค่ฝั่งซ้าย)
// ไล่มา: ดันขวา 1 → 2 แล้วพบว่าห่าง Lv. เกินแต่ยังโดนตัวถัดไปเบียด → แยกเป็นสองค่า
const LEVEL_ONE_LEAD = 1
const LEVEL_ONE_TRAIL = 2
// ย่อไอคอนยศเทียบกับรูปข้อความ (1 = ขนาดต้นฉบับ)
// ไอคอนยศต้นฉบับสูง ~36px ส่วนป้าย Lv. กับตัวเลขสูง 18px — ปล่อยเต็มแล้วยศใหญ่เกิน
// 0.5 คืนขนาดยศเท่าที่เคยเห็นตอนยังวาดด้วยฟอนต์พอดี (0.95 x 0.55 x 0.92 x 34 = 0.95 x 1 x 0.5 x 34)
// แล้วขยับขึ้นทีละนิดตามที่สั่ง: 0.5 → 0.53
const LEVEL_ICON_SCALE = 0.53
// ความหนาเส้นขอบตัวอักษรเลเวล คิดเป็นสัดส่วนของขนาดฟอนต์
// canvas วาด strokeText แบบ "กลางเส้น" อยู่แล้ว (ครึ่งในครึ่งนอก) → ที่เห็นด้านนอกจะเป็นครึ่งเดียวของค่านี้
// ไล่มา: 0.14 → 0.08 บางไป → 0.12 → 0.16 → 0.20 → 0.26 (ลอง 0.32 แล้วหนาเกิน ถอยกลับ)
// (ที่ scale 0.6 = ฟอนต์ 18px ได้ขอบนอกราว 2.3px และกินเข้าในตัวอักษรอีก 2.3px)
// หมายเหตุ: เส้นขอบวาดกลางเส้น ครึ่งหนึ่งจึงกินเข้าไปในตัวอักษร → ยิ่งหนา "ตัวขาว" ยิ่งผอมลง
// นี่คือเหตุผลที่เพิ่มค่านี้แล้วฟอนต์ดูไม่อ้วน (ส่วนเงาดำโดยรวมจะหนาขึ้นแทน)
// ถ้าอยากให้ทั้งตัวแคบลงจริงๆ ต้องลด LEVEL_SQUEEZE ไม่ใช่เพิ่มค่านี้
// ปรับที่นี่ที่เดียว
const LEVEL_STROKE_RATIO = 0.26
// บีบตัวอักษรตามแกน X (1 = ไม่บีบ) — ฟอนต์ LineBold ตัวอ้วน บีบแล้วดูเพรียวขึ้น
// ความกว้างที่วัดได้ต้องคูณค่านี้ด้วย ไม่งั้นการจัดกลางกับไอคอนยศจะเพี้ยน
const LEVEL_SQUEEZE = 0.9
// Drop shadow ดำ เล็กและคม อยู่ตรงกลางไม่เยื้องไปทางไหน (จึงไม่มีค่า offset)
// เบลอเป็นสัดส่วนของขนาดฟอนต์ จะได้สเกลตามตอนย่อ/ขยายกลุ่ม
// พอเอา offset ออกแล้วเงาดูเล็กลง เพราะเดิมส่วนที่โผล่ให้เห็นมาจากการเยื้องเป็นหลัก
// ไม่ใช่จากตัวเบลอ → ต้องเพิ่มเบลอชดเชย: 0.05 → 0.09
const LEVEL_SHADOW_BLUR = 0.09

/** ความสูงที่ "ชั้นล่างสุด" ของเฟรมแรกวาดออกมาจริง — ใช้เป็นขนาดอ้างอิงของไอคอนพรสวรรค์
 *  ไฟล์พรสวรรค์ตันซ้อนกันสี่ชั้น (ล่างขึ้นบน): ฐานรอง 88 / ออร่า 115x116 สองใบ / ตัวไอคอน 98
 *  ออร่าใหญ่กว่าชั้นอื่นและโผล่แค่บางเฟรม วัดจากกรอบรวมหรือกรอบมัธยฐานจึงโดนมันดึงให้ใหญ่เกิน
 *  แล้วไอคอนถูกย่อจนเล็กกว่ารูป tlt ระดับอื่น → เทียบ "ฐานรอง" กับความสูงของรูป tlt ตรงๆ แทน */
function baseLayerHeight(sam: SAMParser, sprites: SpriteMap, animName: string): number {
  const frame = sam.animations[animName]?.[0]
  if (!frame) return 0
  for (let i = 0; i < frame.length; i++) {
    const [, resNum, m, color] = frame[i]
    if (color[3] === 0 || resNum >= sam.images.length) continue
    const spr = sprites[sam.images[resNum].name]
    if (!spr) continue
    const [m00, m01, m10, m11] = m
    const [i00, i01, i10, i11] = sam.images[resNum].m
    // สเกลแนวตั้งของเมทริกซ์รวม (เฟรม x ภาพ)
    const f01 = m00 * i01 + m01 * i11
    const f11 = m10 * i01 + m11 * i11
    return spr.h * Math.hypot(f01, f11)
  }
  return 0
}

// ── ลายน้ำ ──
// วาดลงผืนผ้าเป็นชั้นบนสุดตอน paint ทุกเฟรม → ติดไปกับไฟล์ที่เซฟด้วย
// ไม่ได้เป็น element ใน DOM และไม่ได้เป็นชั้นแยก จึงลบด้วย DevTools / CSS ไม่ได้
//
// ปูสองชั้นเอียงคนละทาง (+30 / -30) ให้ "เส้น" ตัดกันเป็นตัว X เต็มผืน
// แต่ "ข้อความ" ห้ามทับกันเอง — ชั้นที่สองจะข้ามตำแหน่งที่ชนกับข้อความของชั้นแรก
// แล้วปล่อยให้เส้นลากผ่านตรงนั้นแทน อ่านง่ายและยังปูเต็มทั้งภาพ
const WM_TEXT = 'Line Ranger Kiwi'
const WM_ANGLE = 30 * Math.PI / 180
const WM_FONT_PX = 21
// สองค่านี้เลือกจากการไล่ลองจริงบนผืน 1036x652 — วัดว่าแต่ละชั้นวางข้อความได้กี่ตัวในกรอบภาพ
// 130/280 ได้ 13 ต่อ 12 ซึ่งเป็นชุดที่ทั้งถี่และสองชั้นยังสมดุลกันที่สุด
const WM_ROW_GAP = 130         // ระยะระหว่างบรรทัด (พิกัดที่หมุนแล้ว)
const WM_COL_GAP = 280         // ระยะระหว่างข้อความในบรรทัดเดียวกัน
const WM_LINE_PAD = 16         // ช่องไฟระหว่างเส้นกับข้อความ
const WM_CLEAR = 6             // ระยะเผื่อรอบข้อความตอนเช็คว่าชนกันไหม
// ไล่มา 0.115 -> 0.16 -> 0.22 (ขอชัดขึ้นอีกนิด)
const WM_ALPHA = 'rgba(255,255,255,0.22)'
// ขอบมืดบางๆ ใต้ตัวอักษร — ยังอ่านออกบนพื้นสว่าง และกันการลบด้วยการปรับ level ทีเดียวจบ
const WM_EDGE = 'rgba(0,0,0,0.14)'

interface WmBox { x0: number; y0: number; x1: number; y1: number }
interface WmRow { y: number; xs: number[] }
interface WmLayer { angle: number; rows: WmRow[] }

const wmHit = (a: WmBox, b: WmBox) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1

/** กรอบของข้อความในพิกัดผืนผ้าจริง — หมุนสี่มุมแล้วครอบด้วยกรอบตรง */
function wmBoxAt(lx: number, ly: number, tw: number, th: number, angle: number, w: number, h: number): WmBox {
  const c = Math.cos(angle), s = Math.sin(angle)
  const hw = tw / 2 + WM_CLEAR, hh = th / 2 + WM_CLEAR
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const sx of [-hw, hw]) {
    for (const sy of [-hh, hh]) {
      const px = w / 2 + (lx + sx) * c - (ly + sy) * s
      const py = h / 2 + (lx + sx) * s + (ly + sy) * c
      x0 = Math.min(x0, px); x1 = Math.max(x1, px)
      y0 = Math.min(y0, py); y1 = Math.max(y1, py)
    }
  }
  return { x0, y0, x1, y1 }
}

function paintWatermark(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.save()
  ctx.font = `bold ${WM_FONT_PX}px LineBold, Inter, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const tw = ctx.measureText(WM_TEXT).width
  const inner = tw / 2 + WM_LINE_PAD
  // หมุนแล้วมุมภาพยื่นออกไปได้ไกลสุดเท่าครึ่งเส้นทแยงมุม — ปูให้เกินไว้กันขอบโล่ง
  const reach = Math.hypot(w, h) / 2 + WM_COL_GAP

  // ── วางตำแหน่งก่อน แล้วค่อยวาด — ต้องรู้ว่าข้อความไปนั่งตรงไหนบ้างก่อน ถึงจะเว้นช่องบนเส้นถูก ──
  // ไล่ทีละแถวโดยสลับชั้นไปมา ไม่ใช่วางชั้นแรกให้จบก่อน — พอข้อความถี่ขนาดนี้
  // ถ้าวางทีละชั้น ชั้นแรกจะจองที่หมดจนชั้นสองไม่เหลือที่เลย (เคยเจอมาแล้วตอน 108/470)
  const taken: WmBox[] = []
  const layers: WmLayer[] = [{ angle: -WM_ANGLE, rows: [] }, { angle: WM_ANGLE, rows: [] }]
  // ชั้นสองเยื้องครึ่งช่องทั้งสองแกน ข้อความจะได้ไปลงช่องว่างของอีกชั้นเป็นส่วนใหญ่
  const phaseOf = [0, 0.5]
  const rowCount = Math.ceil((reach * 2) / WM_ROW_GAP) + 2
  for (let row = 0; row < rowCount; row++) {
    for (let li = 0; li < layers.length; li++) {
      const phase = phaseOf[li]
      const y = -reach + phase * WM_ROW_GAP + row * WM_ROW_GAP
      if (y > reach) continue
      // เหลื่อมแถวเว้นแถว ไม่ให้เรียงเป็นตารางตรงๆ
      const shift = (row % 2) * (WM_COL_GAP / 2) + phase * (WM_COL_GAP / 2)
      const xs: number[] = []
      for (let x = -reach; x <= reach; x += WM_COL_GAP) {
        const lx = x + shift
        const box = wmBoxAt(lx, y, tw, WM_FONT_PX, layers[li].angle, w, h)
        if (taken.some(t => wmHit(t, box))) continue   // ชนข้อความที่วางไปแล้ว → ข้าม ปล่อยให้เส้นลากผ่าน
        taken.push(box)
        xs.push(lx)
      }
      layers[li].rows.push({ y, xs })
    }
  }

  // ── วาดเส้นทั้งสองชั้นก่อน ให้ไขว้กันเป็น X แล้วค่อยทับด้วยข้อความ ──
  for (const { angle, rows } of layers) {
    ctx.save()
    ctx.translate(w / 2, h / 2)
    ctx.rotate(angle)
    ctx.beginPath()
    for (const { y, xs } of rows) {
      // เส้นลากยาวตลอดแถว เว้นช่องเฉพาะตรงที่มีข้อความจริงๆ
      let cursor = -reach
      for (const cx of xs) {
        ctx.moveTo(cursor, y); ctx.lineTo(cx - inner, y)
        cursor = cx + inner
      }
      ctx.moveTo(cursor, y); ctx.lineTo(reach, y)
    }
    ctx.lineWidth = 3.5
    ctx.strokeStyle = WM_EDGE
    ctx.stroke()
    ctx.lineWidth = 2
    ctx.strokeStyle = WM_ALPHA
    ctx.stroke()
    ctx.restore()
  }

  for (const { angle, rows } of layers) {
    ctx.save()
    ctx.translate(w / 2, h / 2)
    ctx.rotate(angle)
    ctx.font = `bold ${WM_FONT_PX}px LineBold, Inter, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 3
    ctx.strokeStyle = WM_EDGE
    ctx.fillStyle = WM_ALPHA
    for (const { y, xs } of rows) {
      for (const cx of xs) {
        ctx.strokeText(WM_TEXT, cx, y)
        ctx.fillText(WM_TEXT, cx, y)
      }
    }
    ctx.restore()
  }

  ctx.restore()
}

// ── สลับธาตุกับพรสวรรค์ ──
// ทั้งสองอันวางทับตำแหน่งเดียวกัน จึงผลัดกันโผล่แทนที่จะซ้อนกัน
// ความยาวของช่วงยึดจากอนิเมชั่นพรสวรรค์ระดับตัน (com_icon_talent_max: 61 เฟรม @30fps)
// → พรสวรรค์เล่นจบพอดีหนึ่งรอบต่อการโผล่หนึ่งครั้ง
// (ตัวเลขนี้ยังเท่ากับจำนวนเฟรมพอดี ตัวนับเฟรมของอนิเมชั่นจึงตรงกับช่วงเองโดยไม่ต้องชดเชย)
const SWAP_PHASE = 61
// เฟดเข้า/ออกกี่เฟรม — สั้นพอให้ยังเห็นอนิเมชั่นเต็มๆ ตรงกลางช่วง
const SWAP_FADE = 8
// ความสูงอ้างอิงของไอคอนพรสวรรค์ = ความสูงไฟล์ tlt1-3 ทุกระดับถูกย่อ/ขยายมาเทียบกับค่านี้
const TALENT_REF_H = 314

/** ความทึบของธาตุกับพรสวรรค์ ณ เฟรมนี้ (0-1) — รวมกันไม่เกิน 1 เสมอ ไม่มีจังหวะซ้อนกัน */
function swapAlpha(tick: number): { element: number; talent: number } {
  const c = ((tick % (SWAP_PHASE * 2)) + SWAP_PHASE * 2) % (SWAP_PHASE * 2)
  const ramp = (t: number) => Math.max(0, Math.min(1, Math.min(t, SWAP_PHASE - t) / SWAP_FADE))
  return c < SWAP_PHASE
    ? { element: ramp(c), talent: 0 }
    : { element: 0, talent: ramp(c - SWAP_PHASE) }
}

// ไฟล์อนิเมชั่นของ lerico ดึงผ่าน Cloudflare Worker (ต้นทางไม่มี CORS)
// ชื่อ anim ท่ายืน — ชุดเดียวกับที่ตัวเล่นอนิเมชั่นใช้
const IDLE_ANIM_NAMES = ['idle', 'wait', 'stand']

// รายชื่อไฟล์ .sam ของแต่ละเรนเจอร์ — แคชระดับโมดูล ถามครั้งเดียวต่อตัว
// (ใช้ทั้งตอนหาไฟล์ body ปกติและตอนเช็คว่ามีไฟล์ -e-body ไหม จึงไม่ยิงซ้ำ)
const samListCache = new Map<string, string[]>()
async function samList(id: string): Promise<string[]> {
  const hit = samListCache.get(id)
  if (hit) return hit
  const d = await fetchSamList(id).then(x => x.json()) as { samFiles?: string[] }
  const files = d.samFiles ?? []
  samListCache.set(id, files)
  return files
}

// เลือกไฟล์ body ของเรนเจอร์ — alt = อยากได้ตัวหันกลับด้าน (-e-body) ถ้ามี
// คืน null เมื่อหาไฟล์ body ไม่ได้เลย
function pickBodyUrl(files: string[], alt: boolean): string | null {
  const low = files.map(u => ({ u, l: u.toLowerCase() }))
  const eBody = low.find(f => f.l.endsWith('-e-body.sam'))?.u
  const body = low.find(f => f.l.endsWith('-body.sam') && !f.l.endsWith('-e-body.sam'))?.u
  // alt แล้วไม่มีไฟล์ -e- → ถอยไปใช้ไฟล์ปกติ (จะถูกมิเรอร์ตรงๆ ตามที่ต้องการ)
  return (alt ? eBody ?? body : body) ?? files[0] ?? null
}

// ── ของที่โหลดแล้ว — เก็บกึ่งกลางภาพไว้ด้วย เพื่อวางตำแหน่งจากกึ่งกลางได้ ──
// ink = ขอบซ้าย/ขวาของ "เนื้อจริง" ในรูป (วัดเฉพาะรูปตัวอักษรเลเวล) ใช้ตัดขอบใสตอนวาดต่อกัน
// h = ความสูงที่ของชิ้นนี้วาดออกมาจริงที่ zoom 1 (รูป = ความสูงไฟล์ / อนิเมชั่น = ความสูงกรอบ)
// ใช้ปรับไอคอนพรสวรรค์ให้ออกมาเท่ากันทั้งที่ไฟล์ tlt ใหญ่ 312px ส่วนสไปรต์อนิเมชั่นเล็กกว่ามาก
interface LoadedImage { kind: 'image'; img: HTMLImageElement; cx: number; cy: number; h: number; ink?: { x0: number; x1: number } }
interface LoadedAnim {
  kind: 'anim'; sam: SAMParser; sprites: SpriteMap; anim: string; frames: number; cx: number; cy: number; h: number
  /** ตัวคูณขนาดตอนวาด (ไม่ใส่ = 1) — ใช้กับเรนเจอร์ชั่วคราวที่ไฟล์วาดใหญ่กว่าปกติ (upcomingRangers.ts) */
  k?: number
}
type Loaded = LoadedImage | LoadedAnim

// ขอบซ้าย/ขวาของเนื้อจริงในรูป — คอลัมน์ที่มี alpha > 0 อย่างน้อยหนึ่งพิกเซล
// วัดครั้งเดียวตอนโหลด (ไม่ใช่ทุกเฟรม) เพราะ getImageData ช้าเกินกว่าจะเรียกใน render loop
function measureInk(im: HTMLImageElement): { x0: number; x1: number } | undefined {
  const w = im.naturalWidth, h = im.naturalHeight
  if (!w || !h) return undefined
  try {
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    const cx = c.getContext('2d', { willReadFrequently: true })
    if (!cx) return undefined
    cx.drawImage(im, 0, 0)
    const d = cx.getImageData(0, 0, w, h).data
    let x0 = w, x1 = 0
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        if (d[(y * w + x) * 4 + 3] > 0) { if (x < x0) x0 = x; if (x + 1 > x1) x1 = x + 1; break }
      }
    }
    return x1 > x0 ? { x0, x1 } : undefined
  } catch {
    return undefined   // canvas ถูก taint (รูปข้ามโดเมน) — ถอยไปใช้ความกว้างเต็มไฟล์
  }
}

function loadImg(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const el = new Image()
    corsImage(el, src) // รูปผ่าน Worker ต้องโหลดแบบ CORS ไม่งั้นเซฟรูป/ตัดสไปรต์ไม่ได้ (canvas tainted)
    el.onload = () => resolve(el)
    el.onerror = () => resolve(null)
    el.src = src
  })
}

// ── โหลดตัวละครจากโค้ดเรนเจอร์ ──
// ต่างจาก anim ทั่วไปสองเรื่อง: ต้องถามรายชื่อไฟล์ก่อนว่าไฟล์ body ชื่ออะไร
// และจุดอ้างอิงคือ "จุดยืน" (เงาที่วาดไว้ในไฟล์) ไม่ใช่กึ่งกลางภาพ
async function loadRanger(id: string, alt = false): Promise<LoadedAnim> {
  const files = await samList(id)
  if (!files.length) throw new Error('no sam files')
  const samUrl = pickBodyUrl(files, alt)
  if (!samUrl) throw new Error('no body file')
  const prefix = samUrl.replace(/\.sam$/i, '')
  const [samBuf, plistBuf, pngBlob, centers] = await Promise.all([
    fetch(proxyFile(samUrl)).then(x => { if (!x.ok) throw new Error('SAM'); return x.arrayBuffer() }),
    fetch(proxyFile(`${prefix}.plist`)).then(x => { if (!x.ok) throw new Error('PLIST'); return x.arrayBuffer() }),
    fetch(proxyFile(`${prefix}.png`)).then(x => { if (!x.ok) throw new Error('PNG'); return x.blob() }),
    apiFetch(`/api/ranger/projectile/${encodeURIComponent(id)}`)
      .then(x => x.json())
      .then((d: { unit?: { render?: { shadowCenter?: { x: number; y: number } } } }) => d.unit?.render?.shadowCenter ?? null)
      .catch(() => null),
  ])
  const sam = new SAMParser(samBuf)
  const sprites = await loadSprites(plistBuf, pngBlob)
  const anim = IDLE_ANIM_NAMES.find(n => sam.animations[n]?.length)
    ?? sam.animNames.find(n => n !== '_all' && sam.animations[n]?.length)
  if (!anim) { disposeSprites(sprites); throw new Error('no idle anim') }
  // จุดยืนอ่านจากเงาที่วาดไว้ในไฟล์ (แม่นกว่าการคิดจากสัดส่วนกรอบ) ไม่เจอเงาจึงถอยไปใช้สัดส่วน
  const box = animBodyBBox(sam, sprites, anim)
  // เงาหลายชิ้น (เช่น u1629e-boss สองตัวยืนคู่) → ใช้กึ่งกลางของทุกเงา ดู placementStandPoint
  const stand = placementStandPoint(sam, sprites, anim, centers)
    ?? (box && centers ? anchorFromRatio(box, centers) : null)
    ?? (box ? { x: (box.x0 + box.x1) / 2, y: box.y1 } : { x: 0, y: 0 })
  // รหัส g = เรนเจอร์บอสกิล ไฟล์วาดใหญ่กว่าร่าง u ของตัวเดียวกัน 2.67 เท่า → ย่อกลับให้เท่าเรนเจอร์ปกติ
  // ตัวชั่วคราวที่ยังไม่เข้าเกม (ชุด al) ไฟล์ใหญ่ขนาดเดียวกับ g → ใช้ค่าใน upcomingRangers.ts
  const k = /^g\d/i.test(id) ? G_RANGER_SCALE : upcomingSizeRatio(id)
  return { kind: 'anim', sam, sprites, anim, frames: sam.animations[anim].length, cx: stand.x, cy: stand.y, h: box ? (box.y1 - box.y0) * k : 0, ...(k !== 1 ? { k } : {}) }
}

async function loadRef(r: AssetRef): Promise<Loaded> {
  if (r.kind === 'image') {
    // รูปข้ามโดเมน (lerico ไม่ส่งหัว CORS มา) ถ้าวาดลงผืนผ้าตรงๆ จะทำให้ผืนผ้าถูก taint
    // แล้วเซฟรูปไม่ได้เลย → ดึงผ่านพร็อกซีของเราให้กลายเป็นโดเมนเดียวกันก่อน
    const el = await loadImg(r.url.startsWith('/') ? r.url : proxyFile(r.url))
    if (!el) throw new Error('image')
    const ink = LEVEL_GLYPH_RE.test(r.url) ? measureInk(el) : undefined
    return { kind: 'image', img: el, cx: el.naturalWidth / 2, cy: el.naturalHeight / 2, h: el.naturalHeight, ...(ink ? { ink } : {}) }
  }
  if (r.kind === 'sprite') {
    // ตัดกรอบที่ต้องการออกจากไฟล์ใหญ่ แล้วแปลงกลับเป็น <img> ก่อนส่งต่อ
    // ทำแบบนี้เพื่อให้โค้ดวาดทุกที่ใช้เส้นทางเดียวกับรูปธรรมดา ไม่ต้องรู้เรื่อง spritesheet เลย
    const sheet = await loadImg(r.sheet.startsWith('/') ? r.sheet : proxyFile(r.sheet))
    if (!sheet) throw new Error('sheet')
    const cv = document.createElement('canvas')
    cv.width = r.w
    cv.height = r.h
    const cx2 = cv.getContext('2d')
    if (!cx2) throw new Error('2d')
    cx2.drawImage(sheet, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h)
    // ไฟล์มาผ่านพร็อกซีของเราแล้ว ผืนผ้าจึงไม่ถูก taint — toDataURL ทำงานได้
    const el = await loadImg(cv.toDataURL('image/png'))
    if (!el) throw new Error('crop')
    return { kind: 'image', img: el, cx: r.w / 2, cy: r.h / 2, h: r.h }
  }
  if (r.kind === 'ranger') return loadRanger(r.id, r.alt === true)
  // ไฟล์ที่อยู่ใน public ของเราเอง (ขึ้นต้นด้วย /) เรียกตรงได้เลย ไม่ต้องผ่านพร็อกซีของ lerico
  const at = (u: string) => (u.startsWith('/') ? u : proxyFile(u))
  const [samBuf, plistBuf, pngBlob] = await Promise.all([
    fetch(at(`${r.dir}/${r.name}.sam`)).then(x => { if (!x.ok) throw new Error('SAM'); return x.arrayBuffer() }),
    fetch(at(`${r.dir}/${r.name}.plist`)).then(x => { if (!x.ok) throw new Error('PLIST'); return x.arrayBuffer() }),
    fetch(at(`${r.dir}/${r.name}.png`)).then(x => { if (!x.ok) throw new Error('PNG'); return x.blob() }),
  ])
  const sam = new SAMParser(samBuf)
  const sprites = await loadSprites(plistBuf, pngBlob)
  const frames = sam.animations[r.anim]?.length ?? 0
  if (!frames) { disposeSprites(sprites); throw new Error(`anim "${r.anim}" not found`) }
  const box = animBBox(sam, sprites, r.anim)
  // byShadow: ของที่ยืนบนพื้น ยึดเงาที่วาดไว้ในไฟล์ (ไม่เจอเงาจึงถอยไปขอบล่าง+กึ่งกลางแนวนอน)
  const anchor = r.byShadow
    ? animStandPoint(sam, sprites, r.anim, null)
      ?? (box ? { x: (box.x0 + box.x1) / 2, y: box.y1 } : { x: 0, y: 0 })
    : box ? { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 } : { x: 0, y: 0 }
  // ขนาดอ้างอิงวัดจากชั้นฐานรอง ไม่ใช่กรอบรวม — ดู baseLayerHeight
  const base = baseLayerHeight(sam, sprites, r.anim)
  return {
    kind: 'anim', sam, sprites, anim: r.anim, frames, cx: anchor.x, cy: anchor.y,
    h: base || (box ? box.y1 - box.y0 : 0),
  }
}

interface Props {
  /** true = หน้าแอดมิน: เห็นตารางจัดวางวัตถุ และเลือกเรนเจอร์ได้ทุกตัวไม่จำกัด */
  admin?: boolean
}

export default function LobbyStudio({ admin = false }: Props) {
  const { tStat } = useLanguage()
  const { isPro, loading: proLoading } = usePro()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // cache ของที่โหลดแล้ว คีย์ = ค่าของตัวเลือก (โหลดตอนถูกเลือกจริงเท่านั้น ไม่โหลดล่วงหน้าทั้งชุด)
  const assetsRef = useRef<Map<string, Loaded>>(new Map())
  const tickRef = useRef(0)
  const [scene, setScene] = useState<SceneItem[]>(SCENE_DEFAULT)
  // ── ทีมของผู้ใช้ — ทับค่าไส้ของกลุ่มฐานยืนตอนคลี่ฉาก (ตำแหน่ง/ขนาดยังมาจากฉากเหมือนเดิม) ──
  const [teams, setTeams] = useState<Record<TeamSide, TeamSlot[]>>({ A: emptyTeam(), B: emptyTeam() })
  const [facts, setFacts] = useState<Map<string, RangerFacts>>(new Map())
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [busySlot, setBusySlot] = useState<string | null>(null)
  // ── โปรไฟล์ผู้เล่น — ทับค่าไส้ของกลุ่มโปรไฟล์ตอนคลี่ฉาก (ตำแหน่ง/ขนาดยังมาจากฉากเหมือนเดิม) ──
  const [profile, setProfile] = useState<ProfileState>(PROFILE_DEFAULT)
  // ── ป้อมปราการกลางเวที (twr01–twr78) — ทับตัวหอในกลุ่ม tower (ดู fortress.ts) ──
  const [fortress, setFortress] = useState<string>(FORTRESS_DEFAULT)
  // ช่วงผู้เล่นใหม่ (Normal Lv.1-20) จัดฐานคนละแบบ
  const rookieOn = isRookie(profile.tier, profile.level)
  const [picking, setPicking] = useState<{ side: TeamSide; index: number } | null>(null)
  // คำค้น / ฟิลเตอร์ / หน้าของตารางเลือกเรนเจอร์ — เก็บไว้ที่นี่ ป๊อปอัพจึงกลับมาที่เดิม
  // ตอนเปิดใหม่ และล้างเองเมื่อออกจากหน้านี้
  const [pickerView, setPickerView] = useState<PickerView>(PICKER_VIEW_DEFAULT)
  // แผงแอดมิน (ลิสต์ Object) — พับไว้ตั้งต้น ตำแหน่งของทุกชิ้นจัดเสร็จแล้ว ไม่ต้องแก้บ่อย
  const [adminOpen, setAdminOpen] = useState(false)
  // ถามยืนยันก่อนเซฟรูป
  const [confirmSave, setConfirmSave] = useState(false)
  // ลายน้ำ — แอดมินเปิด/ปิดได้เอง ส่วนหน้าสาธารณะ (/lobby) ปิดตลอด (ไม่มีสวิตช์ให้)
  const [wmAdmin, setWmAdmin] = useState(true)
  const watermarkOn = admin ? wmAdmin : false

  // รายการที่พร้อมวาดจริง = ฉาก + ทีมทับไส้ของช่องฐานยืน + โปรไฟล์ทับไส้ของกลุ่มโปรไฟล์
  const drawUnits = useMemo(() => {
    const base = applyFortress(applyProfile(applyTeams(expandScene(scene), teams, facts), profile), fortress)
    // ช่วงผู้เล่นใหม่จัดฐาน 5 ช่องเป็นแถวเดียว ขนาดเท่ากัน และตัดฝั่งกระจกกับหอกลางทิ้ง
    return rookieOn ? applyRookieRow(base, ROOKIE_ROW) : base
  }, [scene, teams, facts, profile, fortress, rookieOn])
  // สำเนาให้ loop อ่าน — ไม่ต้อง restart loop ทุกครั้งที่พิมพ์ตัวเลข
  const unitsRef = useRef(drawUnits)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [playing, setPlaying] = useState(true)
  const [copied, setCopied] = useState(false)
  const [assetTick, setAssetTick] = useState(0)   // บังคับวาดใหม่เมื่อโหลดของเสร็จ
  // กลุ่มที่คลี่ไส้ออกมาแก้ — ตั้งต้นพับไว้ทั้งหมด ตารางจะได้ไม่ยาวจนหาอะไรไม่เจอ
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())
  // หมวดที่เปิดอยู่ — ทีละหมวดเดียว (null = พับหมด) ของเยอะแล้วตารางจะได้ไม่ยาวเป็นหางว่าว
  const [openSection, setOpenSection] = useState<string | null>(null)

  const code = useMemo(() => sceneToCode(scene), [scene])
  // ขั้นต่ำของขนนก = เพดาน "/N" ซึ่งคิดจากระดับกับเลเวลของโปรไฟล์
  const fMin = useMemo(() => featherCap(profile.tier, profile.level), [profile.tier, profile.level])

  // ── วาดชิ้นเดียว ที่ตำแหน่งกึ่งกลาง (cx, cy) และขนาด s ──
  const paintOne = useCallback((
    ctx: CanvasRenderingContext2D, value: string, cx: number, cy: number, s: number, flip = false,
    anchor: 'center' | 'left' | 'top' = 'center', alpha = 1,
  ) => {
    const l = assetsRef.current.get(value)
    if (!l) return
    if (l.kind === 'image') {
      const w = l.img.naturalWidth * s, h = l.img.naturalHeight * s
      // left = (cx,cy) คือขอบซ้าย-กึ่งกลางแนวตั้ง / top = กึ่งกลางแนวนอน-ขอบบน
      const x = anchor === 'left' ? cx : cx - w / 2
      const y = anchor === 'top' ? cy : cy - h / 2
      ctx.drawImage(l.img, x, y, w, h)
    } else {
      const frame = l.sam.animations[l.anim][tickRef.current % l.frames]
      if (!frame) return
      // renderSAMFrame คูณพิกัดท้องถิ่นด้วย zoom → วาง origin ที่ (จุดที่อยากได้ - จุดอ้างอิง x zoom)
      // มิเรอร์: renderSAMFrame สะท้อนรอบ flipPivotX ในพิกัดท้องถิ่น ส่งจุดอ้างอิงเดิม (l.cx) ไป
      // → จุดนั้นอยู่ที่เดิมเป๊ะ ตัวละครกลับด้านโดยเท้าไม่เลื่อน (ไม่ต้องชดเชย ox เพิ่ม)
      // ความทึบต้องส่งเข้าไปเป็นพารามิเตอร์ — renderSAMFrame ตั้ง globalAlpha ของแต่ละชิ้นเอง
      // ค่าที่ตั้งไว้ข้างนอกจึงถูกทับทิ้ง (นี่คือเหตุที่อนิเมชั่นเคยกระพริบแทนที่จะค่อยๆ เฟด)
      const z = s * (l.k ?? 1)
      renderSAMFrame(ctx, frame, l.sam.images, l.sprites, cx - l.cx * z, cy - l.cy * z, z, undefined, flip, l.cx, 0, alpha)
    }
  }, [])

  // ── วาดแถวเลเวล: ไอคอนยศ + ป้าย "Lv." + รูปตัวเลข ต่อกัน จัดกลางทั้งชุด ──
  // ทุกชิ้นเป็นรูปจากเกม (ไม่ใช่ฟอนต์) → ขอบดำ/เงาติดมากับไฟล์อยู่แล้ว ไม่ต้องวาดเอง
  // ชิ้นไหนไม่มีก็ไม่เผื่อที่ให้ (ไม่มีไอคอนยศ = ป้าย Lv. ขยับมาอยู่กลางเอง)
  const paintLevel = useCallback((
    ctx: CanvasRenderingContext2D, p: ScenePart, cx: number, cy: number, s: number,
  ) => {
    const get = (v: string) => {
      const l = assetsRef.current.get(v)
      return l?.kind === 'image' ? l : null
    }
    const icon = p.option ? get(p.option) : null
    const lv = get(LEVEL_LV_IMG)
    // เก็บตัวอักษรคู่กับรูปไว้ด้วย — เลข 1 ต้องมีช่องไฟนำหน้าเป็นของตัวเอง
    const numChars = [...(p.text ?? '')].filter(c => c >= '0' && c <= '9')
    const nums = levelNumUrls(p.text)
      .map((u, i) => ({ l: get(u), ch: numChars[i] }))
      .filter((n): n is { l: LoadedImage; ch: string } => n.l !== null)

    // ตัวอักษรเลเวลวาดเฉพาะช่วง "เนื้อจริง" แล้วเลื่อนไปเท่านั้น → ต่อกันชิดเหมือนในเกม
    // (รูปยศไม่ตัด ใช้เต็มไฟล์ เพราะเป็นไอคอนไม่ใช่ตัวอักษร)
    const inkX0 = (l: LoadedImage) => l.ink?.x0 ?? 0
    const inkW = (l: LoadedImage) => (l.ink ? l.ink.x1 - l.ink.x0 : l.img.naturalWidth)

    const is = s * LEVEL_ICON_SCALE
    const iw = icon ? icon.img.naturalWidth * is : 0
    const lw = lv ? inkW(lv) * s : 0
    // ตัวเลขต่อกันชิด แล้วดึงเข้าหากันอีก LEVEL_NUM_TRACK ต่อรอยต่อ (ไม่นับหลังตัวสุดท้าย)
    const track = LEVEL_NUM_TRACK * s
    const lead = (ch: string) => (ch === '1' ? LEVEL_ONE_LEAD * s : 0)
    const trail = (ch: string) => (ch === '1' ? LEVEL_ONE_TRAIL * s : 0)
    const nw = nums.reduce((sum, n) => sum + inkW(n.l) * s + lead(n.ch) + trail(n.ch), 0)
      + Math.max(0, nums.length - 1) * track

    // เว้นช่องว่างเฉพาะรอยต่อที่มีของอยู่ทั้งสองข้างจริงๆ
    const gapIcon = iw && (lw || nw) ? LEVEL_ICON_GAP * s : 0
    const gapNum = lw && nw ? LEVEL_NUM_GAP * s : 0

    let x = cx - (iw + gapIcon + lw + gapNum + nw) / 2
    // วาดจากช่วง sx..sx+sw ของไฟล์ (ตัดขอบใสซ้าย/ขวาทิ้ง) ความสูงใช้เต็มไฟล์เสมอ
    // → ทุกตัวยังนั่งบนเส้นฐานเดียวกัน ไม่เด้งขึ้นลงตามรูปร่างของแต่ละตัว
    const textY = cy + LEVEL_TEXT_DY * s
    const put = (l: LoadedImage, scale: number, crop: boolean) => {
      const sx = crop ? inkX0(l) : 0
      const sw = crop ? inkW(l) : l.img.naturalWidth
      const sh = l.img.naturalHeight
      const w = sw * scale, h = sh * scale
      // crop = true คือชิ้นที่เป็นตัวอักษร → ยกขึ้นตาม LEVEL_TEXT_DY / ไอคอนยศอยู่กึ่งกลางเดิม
      const y = (crop ? textY : cy) - h / 2
      ctx.drawImage(l.img, sx, 0, sw, sh, x, y, w, h)
      x += w
    }
    if (icon) { put(icon, is, false); x += gapIcon }
    if (lv) { put(lv, s, true); x += gapNum }
    nums.forEach((n, i) => {
      if (i > 0) x += track
      x += lead(n.ch)
      put(n.l, s, true)
      x += trail(n.ch)
    })
  }, [])

  // ── วาดรูปแบบ "ยืดกลาง" — หัวท้ายคงขนาดเดิม ยืดเฉพาะช่วงกลาง ──
  // วาดสามท่อน: หัว | กลาง(ยืด) | ท้าย  เพื่อไม่ให้ขอบมนของกรอบถูกดึงจนเบี้ยว
  // ถ้าความกว้างที่ขอน้อยกว่าหัว+ท้าย จะไม่มีช่วงกลางเหลือ — บีบหัวท้ายลงตามสัดส่วนแทน
  const paintStretch = useCallback((
    ctx: CanvasRenderingContext2D, value: string, cx: number, cy: number, s: number, w: number, cap: number,
    anchor: 'center' | 'left' | 'top' = 'center', pct = 100,
  ) => {
    const l = assetsRef.current.get(value)
    if (!l || l.kind !== 'image') return
    const src = l.img
    const sw = src.naturalWidth, sh = src.naturalHeight
    const capSrc = Math.max(0, Math.min(cap, Math.floor(sw / 2)))
    // pct ใช้กับหลอด: หดจากขวาเข้าหาซ้าย ขอบซ้ายจึงอยู่กับที่เหมือนหลอดในเกม
    const drawW = Math.max(1, w * Math.max(0, Math.min(100, pct)) / 100) * s
    const drawH = sh * s
    const x0 = anchor === 'left' ? cx : cx - drawW / 2
    const y0 = cy - drawH / 2
    const capDst = Math.min(capSrc * s, drawW / 2)
    const midSrc = sw - capSrc * 2
    const midDst = drawW - capDst * 2
    if (capDst > 0) ctx.drawImage(src, 0, 0, capSrc, sh, x0, y0, capDst, drawH)
    if (midDst > 0 && midSrc > 0) ctx.drawImage(src, capSrc, 0, midSrc, sh, x0 + capDst, y0, midDst, drawH)
    if (capDst > 0) ctx.drawImage(src, sw - capSrc, 0, capSrc, sh, x0 + drawW - capDst, y0, capDst, drawH)
  }, [])

  // ── ข้อความ — (cx, cy) คือขอบขวาของข้อความ (ค่าปกติ) หรือขอบซ้ายเมื่อ anchor = 'left' ──
  // ชิดขวา = ตัวเลขยาวขึ้นแล้วงอกไปทางซ้าย (ใช้กับจำนวนทรัพยากรที่ต้องชิดปุ่มบวก)
  // ชิดซ้าย = จุดเริ่มอยู่กับที่ ยาวขึ้นแล้วงอกไปทางขวา (ใช้กับ "/93" ที่ต้องการให้ / ไม่ขยับ)
  const paintText = useCallback((
    ctx: CanvasRenderingContext2D, text: string, color: string, cx: number, cy: number, s: number,
    anchor: 'center' | 'left' | 'top' = 'center',
  ) => {
    if (!text) return
    const fontPx = LEVEL_FONT_PX * s
    ctx.save()
    ctx.font = `${fontPx}px LineBold, Inter, sans-serif`
    ctx.textAlign = anchor === 'left' ? 'left' : 'right'
    ctx.textBaseline = 'middle'
    // ไม่มีเส้นขอบ — ข้อความแถบทรัพยากรเป็นตัวเพรียวๆ (ต่างจากข้อความเลเวลที่มีขอบดำหนา)
    // เส้นขอบจะกินเข้าไปในตัวอักษรจนตัวเลขเล็กๆ อ่านยาก และทำสีอ่อนๆ อย่าง #727b88 ขุ่น
    // เหลือเงาบางๆ ไว้ให้อ่านออกบนพื้นสว่าง
    ctx.shadowColor = 'rgba(0,0,0,0.45)'
    ctx.shadowBlur = fontPx * LEVEL_SHADOW_BLUR
    ctx.fillStyle = color || '#ffffff'
    ctx.fillText(text, cx, cy)
    ctx.restore()
  }, [])

  // ── วาดจำนวนด้วยรูปตัวเลข ต่อกันชิดๆ จัดกึ่งกลางทั้งชุด ──
  // วัดความกว้างรวมก่อนแล้วค่อยวาด เพื่อให้เลขหลายหลักยังอยู่กึ่งกลางจุดเดิม
  const paintDigits = useCallback((
    ctx: CanvasRenderingContext2D, urls: string[], cx: number, cy: number, s: number,
  ) => {
    const imgs = urls
      .map(u => assetsRef.current.get(u))
      .filter((l): l is LoadedImage => l !== undefined && l.kind === 'image')
    if (!imgs.length) return
    const total = imgs.reduce((sum, l) => sum + l.img.naturalWidth * s, 0)
    let x = cx - total / 2
    for (const l of imgs) {
      const w = l.img.naturalWidth * s, h = l.img.naturalHeight * s
      ctx.drawImage(l.img, x, cy - h / 2, w, h)
      x += w
    }
  }, [])

  // ── วาดหนึ่งเฟรมทั้งฉาก ──
  const paint = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    // กฎตำแหน่งทั้งหมด (สำเนา / กลุ่มกระจก / การยืมแกน Y) คลี่ไว้ใน expandScene แล้ว
    // ส่วนไส้ของช่องฐานยืนถูก applyTeams ทับมาก่อนถึงตรงนี้
    for (const r of unitsRef.current) {
      if (r.src) { paintOne(ctx, refToValue(r.src), r.x, r.y, r.scale); continue }
      if (!r.parts) continue
      // ช่องนี้มีพรสวรรค์เปิดอยู่ไหม — ถ้าไม่มีก็ให้ธาตุโชว์ค้างไว้เฉยๆ ไม่ต้องเฟด
      const hasTalent = r.parts.some(p => p.id === 'talent' && p.visible && p.option)
      const fade = hasTalent ? swapAlpha(tickRef.current) : null

      for (const p of [...r.parts].sort((a, b) => a.order - b.order)) {
        if (!p.visible) continue
        // ธาตุกับพรสวรรค์ผลัดกันโผล่ที่จุดเดียวกัน — จางสนิทแล้วข้ามไปเลย ไม่ต้องวาด
        const alpha = fade ? (p.id === 'element' ? fade.element : p.id === 'talent' ? fade.talent : 1) : 1
        if (alpha <= 0) continue
        // ตำแหน่ง: ออฟเซ็ตคูณ scale ของกลุ่มตัวเอง → ย้าย/ย่อกลุ่มแล้วทุกชิ้นตามไปด้วย
        // ฝั่งกระจก: สลับข้าง dx ของส่วนที่อยู่ใน MIRROR_FLIP_DX_PARTS (ไอคอนธาตุ)
        const dx = r.mirrored && MIRROR_FLIP_DX_PARTS.has(p.id) ? -p.dx : p.dx
        const cx = r.x + dx * r.scale
        // ไอคอนธาตุอาจยืมแกน Y จากช่องอื่น เพื่อให้สองช่องอยู่ระดับเดียวกันแม้ y/scale ต่างกัน
        // พรสวรรค์วางจุดเดียวกับธาตุ จึงต้องยืมด้วย ไม่งั้นสองอันจะไม่ตรงกันตอนสลับ
        const yr = p.id === 'element' || p.id === 'talent' ? r.elemYRef : null
        const cy = yr ? yr.y + p.dy * yr.scale : r.y + p.dy * r.scale
        // ขนาด: ส่วนที่อยู่ใน SCALE_EXEMPT_PARTS ยึด scale ของกลุ่มแม่ ไม่ตามกลุ่มตัวเอง
        // → ย่อช่องไหนก็ตาม ข้อความเลเวล / ธาตุ / ตัวเรนเจอร์ ยังขนาดเท่าต้นฉบับ
        let s = (SCALE_EXEMPT_PARTS.has(p.id) ? r.masterScale : r.scale) * p.scale
        // ไอคอนพรสวรรค์มาจากไฟล์คนละขนาด (tlt ~312px / สไปรต์อนิเมชั่นเล็กกว่ามาก)
        // ปรับให้สูงเท่ากันเสมอโดยอิงไฟล์ tlt เป็นตัวตั้ง — ช่อง Size ในตารางยังคุมได้ตัวเดียว
        if (p.id === 'talent') {
          const l = assetsRef.current.get(p.option)
          if (l && l.h > 0) s *= TALENT_REF_H / l.h
        }
        if (alpha < 1) ctx.globalAlpha = alpha
        if (p.kind === 'level') paintLevel(ctx, p, cx, cy, s)
        else if (p.kind === 'text') paintText(ctx, p.text ?? '', p.color ?? '#ffffff', cx, cy, s, p.anchor)
        else if (p.kind === 'digits') paintDigits(ctx, digitUrls(p), cx, cy, s)
        else if (p.kind === 'stretch') paintStretch(ctx, p.option, cx, cy, s, p.w ?? 0, p.cap ?? 0, p.anchor, p.pct)
        else {
          // ฐานฝั่งขวา: ตัวละครต้องหันกลับมา → ขอไฟล์ตัวหันกลับด้านแล้วมิเรอร์
          // ส่วนอื่น (ฐาน/เอฟเฟกต์/ดาว) เป็นภาพสมมาตร ไม่ต้องกลับด้าน
          const flip = p.kind === 'ranger' && r.mirrored
          const v = partValue(p, flip)
          if (!v) continue
          // หมุนรอบจุดที่วางไว้ — หมุน context เอาเองแทนการใช้ rotation ของ renderSAMFrame
          // เพราะตัวนั้นหมุนรอบ origin ของไฟล์ ไม่ใช่จุดที่เราวาง ภาพจะเหวี่ยงหลุดตำแหน่ง
          if (p.rot) {
            ctx.save()
            ctx.translate(cx, cy)
            ctx.rotate(p.rot * Math.PI / 180)
            ctx.translate(-cx, -cy)
          }
          paintOne(ctx, v, cx, cy, s, flip, p.anchor, alpha)
          if (p.rot) ctx.restore()
        }
        if (alpha < 1) ctx.globalAlpha = 1
      }
    }

    // ลายน้ำอยู่บนสุดเสมอ วาดหลังทุกอย่าง → ติดไปกับภาพที่เซฟด้วย
    if (watermarkOn) paintWatermark(ctx, canvas.width, canvas.height)
  }, [paintOne, paintLevel, paintText, paintStretch, paintDigits, watermarkOn])

  useEffect(() => { unitsRef.current = drawUnits }, [drawUnits])
  useEffect(() => { paint() }, [drawUnits, assetTick, paint])

  // ── โหลดของที่ถูกเลือกอยู่ (และของที่เพิ่งเลือกใหม่) ──
  useEffect(() => {
    if (proLoading || !isPro) return
    let cancelled = false

    // ไล่จากรายการที่พร้อมวาดจริง → ได้ทั้งของฝั่งกระจก (ตัวหันกลับด้าน) และของที่ทีมเพิ่งเลือก
    // โดยไม่ต้องเดาเองว่าชิ้นไหนถูกใช้บ้าง
    const wanted = new Set<string>()
    for (const u of drawUnits) {
      if (u.src) wanted.add(refToValue(u.src))
      for (const p of u.parts ?? []) for (const v of partValues(p, u.mirrored && p.kind === 'ranger')) wanted.add(v)
    }

    const run = async () => {
      // font ของเลเวลต้องพร้อมก่อนวัดความกว้างข้อความ ไม่งั้นการจัดกลางจะเพี้ยนรอบแรก
      try { await document.fonts.load(`${LEVEL_FONT_PX}px LineBold`) } catch { /* ไม่มีก็ใช้ fallback */ }
      const missing = [...wanted].filter(v => !assetsRef.current.has(v))
      const failed: string[] = []
      await Promise.all(missing.map(async (v) => {
        const r = valueToRef(v)
        if (!r) return
        try {
          const l = await loadRef(r)
          if (cancelled) { if (l.kind === 'anim') disposeSprites(l.sprites); return }
          assetsRef.current.set(v, l)
        } catch (e) {
          const what = r.kind === 'image' ? r.url.split('/').pop()
            : r.kind === 'ranger' ? r.id
            : r.kind === 'sprite' ? r.sheet.split('/').pop()
            : r.name
          failed.push(`${what} (${e instanceof Error ? e.message : 'err'})`)
        }
      }))
      if (cancelled) return
      // ขนาดผืนผ้าตรึงไว้ ไม่ผูกกับไฟล์พื้นหลังที่เลือกอยู่
      // เดิมยึดจากไฟล์ ซึ่งใช้ได้ตอนพื้นหลังมีแบบเดียว แต่พอสลับได้แล้วเวทีจะเปลี่ยนขนาดตาม
      // แล้วของทุกชิ้นที่จัดตำแหน่งไว้จะเลื่อนหมด
      const canvas = canvasRef.current
      if (canvas) {
        canvas.width = CANVAS_W
        canvas.height = CANVAS_H
      }
      setError(failed.length ? `Failed to load: ${failed.join(', ')}` : '')
      setReady(true)
      setAssetTick(t => t + 1)
    }
    run()
    return () => { cancelled = true }
  }, [drawUnits, scene, isPro, proLoading])

  // คืน GPU memory ของสไปรต์ตอนออกจากหน้า (ImageBitmap ไม่ถูกเก็บโดย GC เอง)
  useEffect(() => {
    const cache = assetsRef.current
    return () => {
      for (const l of cache.values()) if (l.kind === 'anim') disposeSprites(l.sprites)
      cache.clear()
    }
  }, [])

  // ── render loop — เดินติ๊กคงที่ LOOP_FPS ไม่ผูกกับ refresh rate ของจอ ──
  useEffect(() => {
    if (!playing || !isPro) return
    let raf = 0
    let last = 0
    let acc = 0
    const spf = 1000 / LOOP_FPS
    const step = (now: number) => {
      acc += now - (last || now)
      last = now
      let stepped = false
      // กันกระโดดยาวตอนสลับแท็บกลับมา — ทดไม่เกิน 5 เฟรมต่อรอบ
      let guard = 5
      while (acc >= spf && guard-- > 0) { acc -= spf; tickRef.current++; stepped = true }
      if (acc > spf) acc = 0
      if (stepped) paint()
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [playing, paint, isPro])

  // ── แก้ค่าในตาราง ──
  const patchItem = (id: string, next: Partial<SceneItem>) =>
    setScene(s => s.map(o => (o.id === id ? { ...o, ...next } : o)))
  const patchPart = (itemId: string, partId: string, next: Partial<ScenePart>) =>
    setScene(s => s.map(o => o.id !== itemId ? o : {
      ...o,
      parts: (o.parts ?? []).map(p => (p.id === partId ? { ...p, ...next } : p)),
    }))

  // เลเยอร์สูงสุดของหมวดหนึ่ง — ใช้เรียงหมวดในตาราง
  const sectionTopLayer = (sec: string) =>
    Math.max(...scene.filter(o => (o.section ?? 'อื่นๆ') === sec).map(o => o.layer), -Infinity)

  // ชื่อแถวที่ชิ้นนี้เป็นลูกอยู่ (null = ไม่ได้อยู่ในแถวไหน)
  const rowParent = (id: string) => scene.find(o => o.rowGroup?.includes(id))?.id ?? null

  const num = (v: string, fallback: number) => {
    const n = Number(v)
    return Number.isFinite(n) ? n : fallback
  }

  // ── จัดการทีม ──
  const setSlot = (side: TeamSide, index: number, next: Partial<TeamSlot>) =>
    setTeams(t => ({ ...t, [side]: t[side].map((s0, i) => (i === index ? { ...s0, ...next } : s0)) }))

  const pickRanger = async (r: RangerRow) => {
    const target = picking
    if (!target) return
    setPicking(null)
    setNames(m => new Map(m).set(r.id, r.name))
    // วางลงช่องทันทีที่เลเวล 1 แล้วค่อยไปเอาข้อมูล (ฐาน/ดาว/ยศ) ตามมา — ไม่ต้องรอโหลดถึงจะเห็นตัวละคร
    setSlot(target.side, target.index, { rangerId: r.id, level: 1, talent: 0 })
    const key = `${target.side}:${target.index}`
    setBusySlot(key)
    const f = await fetchRangerFacts(r.id)
    if (f) setFacts(m => new Map(m).set(r.id, f))
    setBusySlot(b => (b === key ? null : b))
  }

  // ── เซฟผืนผ้าเป็นไฟล์ PNG ──
  const savePng = () => {
    setConfirmSave(false)
    const canvas = canvasRef.current
    if (!canvas) return
    try {
      canvas.toBlob(blob => {
        if (!blob) return
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'lobby.png'
        a.click()
        URL.revokeObjectURL(url)
      }, 'image/png')
    } catch {
      // toBlob โยน SecurityError ถ้ามีรูปข้ามโดเมนหลุดมาวาดบนผืนผ้า
      setError(tStat('Cannot save the image — a file blocked reading the canvas'))
    }
  }

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard ไม่รองรับ — ผู้ใช้ยังเลือกข้อความในกล่องเองได้ */ }
  }

  const cell = 'w-16 h-7 px-1.5 rounded bg-slate-900 border border-slate-700 text-gray-100 text-xs text-right focus:outline-none focus:border-cyan-500'
  const sel = 'h-7 px-1.5 rounded bg-slate-900 border border-slate-700 text-gray-100 text-xs max-w-[190px] focus:outline-none focus:border-cyan-500'

  return (
    <>
        {/* ── ด่าน Pro/Beta ── ไม่มีสิทธิ์ = ไม่วาดพื้นที่งานเลย และไม่ยิงโหลดไฟล์ด้วย ── */}
        {proLoading ? (
          <div className="text-gray-400 text-sm flex items-center gap-2">
            <span className="material-icons-round text-sm animate-spin">autorenew</span>
            Loading...
          </div>
        ) : !isPro ? (
          <div className="max-w-md mx-auto rounded-xl border border-white/10 bg-white/5 px-6 py-10 text-center">
            <span className="material-icons-round text-4xl text-yellow-300">lock</span>
            <p className="text-white font-bold mt-3">{tStat('Pro / Beta only')}</p>
            <p className="text-gray-400 text-sm mt-1">{tStat('This page needs an active Pro or Beta code.')}</p>
            <Link
              href="/beta"
              className="inline-flex items-center gap-1.5 mt-5 h-9 px-4 rounded-lg bg-yellow-400/20 border border-yellow-400 text-yellow-200 text-sm font-bold hover:bg-yellow-400/30 transition-colors"
            >
              <span className="material-icons-round text-base">vpn_key</span>
              {tStat('Enter code')}
            </Link>
          </div>
        ) : (
        <>
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="material-icons-round text-2xl text-cyan-400">photo_camera</span>
          <h1 className="text-xl font-bold text-white">Lobby</h1>
          <button
            type="button"
            onClick={() => setPlaying(p => !p)}
            className="ml-auto h-7 px-2 rounded border border-slate-700 bg-slate-800 text-gray-200 text-xs inline-flex items-center gap-1 hover:bg-slate-700 transition-colors"
          >
            <span className="material-icons-round text-[14px]">{playing ? 'pause' : 'play_arrow'}</span>
            {playing ? tStat('Pause') : tStat('Play')}
          </button>
          {admin && (
            <label className="h-7 px-2 rounded border border-slate-700 bg-slate-800 text-gray-200 text-xs inline-flex items-center gap-1.5 cursor-pointer hover:bg-slate-700 transition-colors">
              <input
                type="checkbox" checked={wmAdmin}
                onChange={e => setWmAdmin(e.target.checked)}
                className="accent-cyan-500 w-3.5 h-3.5"
              />
              {tStat('Watermark')}
            </label>
          )}
          <button
            type="button"
            onClick={() => setConfirmSave(true)}
            className="h-7 px-2 rounded border border-cyan-600 bg-cyan-600/20 text-cyan-100 text-xs inline-flex items-center gap-1 hover:bg-cyan-600/30 transition-colors"
          >
            <span className="material-icons-round text-[14px]">download</span>
            {tStat('Save image')}
          </button>
          <button
            type="button"
            onClick={() => {
              // คืนค่าทั้งหน้า ไม่ใช่แค่ตารางวัตถุ — ทีมกับโปรไฟล์กลับไปค่าตั้งต้นด้วย
              setScene(SCENE_DEFAULT)
              setTeams({ A: emptyTeam(), B: emptyTeam() })
              setProfile(PROFILE_DEFAULT)
            }}
            className="h-7 px-2 rounded border border-slate-700 bg-slate-800 text-gray-200 text-xs inline-flex items-center gap-1 hover:bg-slate-700 transition-colors"
          >
            <span className="material-icons-round text-[14px]">restart_alt</span>
            {tStat('Reset')}
          </button>
        </div>

        {!ready && (
          <div className="text-gray-400 text-sm mb-2 flex items-center gap-2">
            <span className="material-icons-round text-sm animate-spin">autorenew</span>
            Loading...
          </div>
        )}
        {error && <p className="text-red-400 text-sm mb-2">{error}</p>}

        {/* canvas เป็นทั้ง preview และตัวส่งออก — กรอบกว้างเท่าผืนผ้าพอดี ไม่งั้นจะเหลือขอบโผล่ข้างภาพ */}
        <div
          className="rounded-xl border border-white/10 overflow-hidden mx-auto"
          style={{ width: `min(100%, ${DISPLAY_MAX_W}px)` }}
        >
          <canvas
            ref={canvasRef}
            width={CANVAS_W}
            height={CANVAS_H}
            style={{ display: 'block', width: '100%', height: 'auto' }}
          />
        </div>

        {/* ── แผงแอดมิน: ลิสต์ Object + โค้ด — วางไว้บนสุดของแผงควบคุม จะได้ไม่ต้องเลื่อนลงไปไกลตอนจัดฉาก ──
            หน้าสาธารณะไม่เห็นส่วนนี้เลย (ไม่ได้แค่ซ่อน — ไม่ถูก render ออกมาตั้งแต่แรก) ── */}
        {admin && (
        <>
        <button
          type="button"
          onClick={() => setAdminOpen(o => !o)}
          className="mt-8 w-full flex items-center gap-2 px-3 py-2 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] transition-colors text-left"
        >
          <span className="material-icons-round text-[18px] text-gray-400">{adminOpen ? 'expand_more' : 'chevron_right'}</span>
          <span className="material-icons-round text-base text-gray-500">tune</span>
          <span className="text-sm font-bold text-gray-300">{tStat('Object list')}</span>
          <span className="text-[10px] text-gray-600">{tStat('Admin layout panel')} · {scene.length} {tStat('items')}</span>
        </button>

        {adminOpen && (
        <>
        {/* ── ตารางคุมวัตถุ ── */}
        <div className="mt-4 rounded-xl border border-white/10 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-white/5 text-gray-400">
              <tr>
                <th className="text-left font-bold px-3 py-2">Object</th>
                <th className="text-left font-bold px-2 py-2">Pick</th>
                <th className="font-bold px-2 py-2">X</th>
                <th className="font-bold px-2 py-2">Y</th>
                <th className="font-bold px-2 py-2">Size</th>
                <th className="font-bold px-2 py-2">Layer</th>
                <th className="font-bold px-2 py-2">Show</th>
              </tr>
            </thead>
            <tbody>
              {/* เรียงหมวดตามเลเยอร์สูงสุดในหมวด จากมากไปน้อย — ของที่อยู่บนสุดในภาพจะอยู่บนสุดในลิสต์
                  ของที่เพิ่มใหม่มักให้เลเยอร์สูงกว่า จึงลอยขึ้นมาบนสุดเองโดยไม่ต้องมาจัดลำดับเอง */}
              {[...SECTIONS]
                .filter(sec => scene.some(o => (o.section ?? 'อื่นๆ') === sec))
                .sort((a, b) => sectionTopLayer(b) - sectionTopLayer(a))
                .map(sec => {
                // ภายในหมวดก็เรียงเลเยอร์มากไปน้อยเหมือนกัน (sort เสถียร → เลเยอร์เท่ากันคงลำดับเดิม)
                const rows = scene.filter(o => (o.section ?? 'อื่นๆ') === sec)
                  .slice()
                  .sort((a, b) => b.layer - a.layer)
                if (!rows.length) return null
                const open = openSection === sec
                return (
                <Fragment key={sec}>
                  {/* หัวหมวด — กดสลับเปิดได้ทีละหมวด ตารางจะได้ไม่ยาวเวลาของเยอะ */}
                  <tr className="border-t border-white/10 bg-white/[0.06] cursor-pointer hover:bg-white/[0.09]"
                      onClick={() => setOpenSection(s => (s === sec ? null : sec))}>
                    <td colSpan={7} className="px-3 py-2">
                      <span className="inline-flex items-center gap-1.5 text-gray-100 font-bold">
                        <span className="material-icons-round text-[16px] text-gray-400">
                          {open ? 'expand_more' : 'chevron_right'}
                        </span>
                        {sec}
                        <span className="text-[10px] text-gray-500 font-normal">{rows.length} รายการ</span>
                      </span>
                    </td>
                  </tr>
                  {open && rows.map(it => (
                <Fragment key={it.id}>
                  <tr className="border-t border-white/10 bg-white/[0.03]">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        {it.parts ? (
                          <button
                            type="button"
                            onClick={() => setOpenGroups(g => {
                              const n = new Set(g)
                              if (n.has(it.id)) n.delete(it.id); else n.add(it.id)
                              return n
                            })}
                            className="h-5 w-5 rounded hover:bg-white/10 text-gray-400 inline-flex items-center justify-center"
                            aria-label="fold"
                          >
                            <span className="material-icons-round text-[16px]">
                              {openGroups.has(it.id) ? 'expand_more' : 'chevron_right'}
                            </span>
                          </button>
                        ) : <span className="w-5" />}
                        <span className="text-gray-100 font-bold">{it.label}</span>
                      </div>
                      <div className="text-[10px] text-gray-500 pl-6">
                        {it.id} · {it.rowGroup ? `row of ${it.rowGroup.length}`
                          : rowParent(it.id) ? `in ${rowParent(it.id)}`
                          : it.parts ? `group of ${it.parts.length}`
                          : it.copyOf ? `copy of ${it.copyOf}`
                          : it.mirrorGroup ? `mirrors ${it.mirrorGroup.length} bases`
                          : it.src?.kind}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-gray-600 text-[10px]">
                      {it.rowGroup ? (
                        // ระยะห่างของแถว — ปรับตัวเดียวขยับทุกตัวในแถวพร้อมกัน
                        <span className="inline-flex items-center gap-1">
                          Gap
                          <input type="number" step={1} className={cell} value={it.gap ?? 0}
                            onChange={e => patchItem(it.id, { gap: num(e.target.value, it.gap ?? 0) })} />
                        </span>
                      ) : it.parts ? 'กดลูกศรเพื่อแก้ไส้'
                        : it.mirrorGroup ? 'X/Y = ขยับฝั่งขวาพร้อมกันทั้งชุด'
                        : it.copyOf ? 'ไส้ตามกลุ่มแม่' : '—'}
                    </td>
                    {rowParent(it.id) ? (
                      // ลูกของแถว: ตำแหน่ง/ขนาด/เลเยอร์คิดจากแถว แก้ได้แค่รูปกับสวิตช์
                      <>
                        <td className="px-2 py-2 text-center text-gray-600" colSpan={4}>
                          ตามแถว {rowParent(it.id)}
                        </td>
                      </>
                    ) : it.mirrorGroup ? (
                      // กลุ่มกระจก: X/Y เป็น "ระยะขยับเพิ่ม" ของฝั่งขวาทั้งชุด (0,0 = กระจกเป๊ะ)
                      // ขนาดยึดฐานต้นทางฝั่งซ้ายรายตัว จะได้ไม่หลุดคู่กัน จึงไม่มีช่อง Size
                      <>
                        <td className="px-2 py-2 text-center">
                          <input type="number" className={cell} value={it.x}
                            onChange={e => patchItem(it.id, { x: num(e.target.value, it.x) })} />
                        </td>
                        <td className="px-2 py-2 text-center">
                          <input type="number" className={cell} value={it.y}
                            onChange={e => patchItem(it.id, { y: num(e.target.value, it.y) })} />
                        </td>
                        <td className="px-2 py-2 text-center text-gray-600">—</td>
                        <td className="px-2 py-2 text-center">
                          <input type="number" step={1} className={cell} value={it.layer}
                            onChange={e => patchItem(it.id, { layer: num(e.target.value, it.layer) })} />
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-2 py-2 text-center">
                          <input type="number" className={cell} value={it.x}
                            onChange={e => patchItem(it.id, { x: num(e.target.value, it.x) })} />
                        </td>
                        <td className="px-2 py-2 text-center">
                          <input type="number" className={cell} value={it.y}
                            onChange={e => patchItem(it.id, { y: num(e.target.value, it.y) })} />
                        </td>
                        <td className="px-2 py-2 text-center">
                          <input type="number" step={0.05} min={0.05} className={cell} value={it.scale}
                            onChange={e => patchItem(it.id, { scale: num(e.target.value, it.scale) })} />
                        </td>
                        <td className="px-2 py-2 text-center">
                          <input type="number" step={1} className={cell} value={it.layer}
                            onChange={e => patchItem(it.id, { layer: num(e.target.value, it.layer) })} />
                        </td>
                      </>
                    )}
                    <td className="px-2 py-2 text-center">
                      <input type="checkbox" className="accent-cyan-500 w-4 h-4" checked={it.visible}
                        onChange={e => patchItem(it.id, { visible: e.target.checked })} />
                    </td>
                  </tr>
                  {(openGroups.has(it.id) ? it.parts ?? [] : []).map(p => (
                    <tr key={`${it.id}.${p.id}`} className="border-t border-white/5">
                      <td className="px-3 py-2 pl-10">
                        <div className="text-gray-300">{p.label}</div>
                        <div className="text-[10px] text-gray-600">
                          {p.id} · {p.kind}
                          {SCALE_EXEMPT_PARTS.has(p.id) && (
                            <span className="text-amber-500/80"> · ขนาดไม่ตามกลุ่ม</span>
                          )}
                          {MIRROR_FLIP_DX_PARTS.has(p.id) && (
                            <span className="text-sky-400/80"> · ฝั่งขวาสลับข้าง X</span>
                          )}
                          {p.kind === 'ranger' && (
                            <span className="text-emerald-400/80"> · ยึดตำแหน่งจากเงา</span>
                          )}
                          {p.kind === 'text' && p.anchor !== 'left' && (
                            <span className="text-sky-400/80"> · X = ขอบขวาของข้อความ</span>
                          )}
                          {p.kind === 'stretch' && (
                            <span className="text-amber-500/80"> · ยืดเฉพาะช่วงกลาง</span>
                          )}
                          {p.anchor === 'left' && (
                            <span className="text-sky-400/80"> · X = ขอบซ้าย ขยายไปขวา</span>
                          )}
                          {p.anchor === 'top' && (
                            <span className="text-sky-400/80"> · Y = ขอบบน จัดกึ่งกลางแนวนอน</span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        {p.kind === 'digits' ? (
                          // จำนวนที่จะแสดง + ชุดตัวเลขที่ใช้
                          <div className="flex items-center gap-1">
                            <input
                              type="text" value={p.text ?? ''} placeholder="15"
                              className="w-14 h-7 px-1.5 rounded bg-slate-900 border border-slate-700 text-gray-100 text-xs focus:outline-none focus:border-cyan-500"
                              onChange={e => patchPart(it.id, p.id, { text: e.target.value })}
                            />
                            <select className={sel} value={p.option}
                              onChange={e => patchPart(it.id, p.id, { option: e.target.value })}>
                              {p.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                          </div>
                        ) : p.kind === 'stretch' ? (
                          // ความกว้างที่ยืด + ขนาดหัวท้ายที่ห้ามยืด (+ % สำหรับหลอด)
                          <span className="inline-flex items-center gap-1 text-[10px] text-gray-500">
                            W
                            <input type="number" className={cell} value={p.w ?? 0}
                              onChange={e => patchPart(it.id, p.id, { w: num(e.target.value, p.w ?? 0) })} />
                            Cap
                            <input type="number" className={cell} value={p.cap ?? 0}
                              onChange={e => patchPart(it.id, p.id, { cap: num(e.target.value, p.cap ?? 0) })} />
                            {p.pct !== undefined && (
                              <>
                                %
                                <input type="number" min={0} max={100} className={cell} value={p.pct}
                                  onChange={e => patchPart(it.id, p.id, { pct: num(e.target.value, p.pct ?? 100) })} />
                              </>
                            )}
                          </span>
                        ) : p.kind === 'text' ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="text" value={p.text ?? ''} placeholder="ข้อความ"
                              className="w-24 h-7 px-1.5 rounded bg-slate-900 border border-slate-700 text-gray-100 text-xs focus:outline-none focus:border-cyan-500"
                              onChange={e => patchPart(it.id, p.id, { text: e.target.value })}
                            />
                            <input
                              type="color" value={p.color ?? '#ffffff'}
                              className="w-7 h-7 rounded bg-slate-900 border border-slate-700 cursor-pointer"
                              onChange={e => patchPart(it.id, p.id, { color: e.target.value })}
                            />
                          </div>
                        ) : p.kind === 'ranger' ? (
                          <input
                            type="text" value={p.text ?? ''} placeholder="u1147e-benimaru"
                            className="w-44 h-7 px-1.5 rounded bg-slate-900 border border-slate-700 text-gray-100 text-xs focus:outline-none focus:border-cyan-500"
                            onChange={e => patchPart(it.id, p.id, { text: e.target.value })}
                          />
                        ) : p.kind === 'level' ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="text" value={p.text ?? ''} placeholder="240"
                              className="w-20 h-7 px-1.5 rounded bg-slate-900 border border-slate-700 text-gray-100 text-xs focus:outline-none focus:border-cyan-500"
                              onChange={e => patchPart(it.id, p.id, { text: e.target.value })}
                            />
                            <select className={sel} value={p.option}
                              onChange={e => patchPart(it.id, p.id, { option: e.target.value })}>
                              <option value="">(no rank icon)</option>
                              {p.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                          </div>
                        ) : p.options.length === 0 ? (
                          <span className="text-[10px] text-gray-600">ยังไม่มีตัวเลือก</span>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <select className={sel} value={p.option}
                              onChange={e => patchPart(it.id, p.id, { option: e.target.value })}>
                              <option value="">(off)</option>
                              {p.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                            {p.rot !== undefined && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-gray-500">
                                องศา
                                <input type="number" step={1} className={cell} value={p.rot}
                                  onChange={e => patchPart(it.id, p.id, { rot: num(e.target.value, p.rot ?? 0) })} />
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-center">
                        <input type="number" className={cell} value={p.dx}
                          onChange={e => patchPart(it.id, p.id, { dx: num(e.target.value, p.dx) })} />
                      </td>
                      <td className="px-2 py-2 text-center">
                        <input type="number" className={cell} value={p.dy}
                          onChange={e => patchPart(it.id, p.id, { dy: num(e.target.value, p.dy) })} />
                      </td>
                      <td className="px-2 py-2 text-center">
                        <input type="number" step={0.05} min={0.05} className={cell} value={p.scale}
                          onChange={e => patchPart(it.id, p.id, { scale: num(e.target.value, p.scale) })} />
                      </td>
                      <td className="px-2 py-2 text-center">
                        <input type="number" step={1} className={cell} value={p.order}
                          onChange={e => patchPart(it.id, p.id, { order: num(e.target.value, p.order) })} />
                      </td>
                      <td className="px-2 py-2 text-center">
                        <input type="checkbox" className="accent-cyan-500 w-4 h-4" checked={p.visible}
                          onChange={e => patchPart(it.id, p.id, { visible: e.target.checked })} />
                      </td>
                    </tr>
                  ))}
                </Fragment>
                  ))}
                </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-gray-500 mt-2">
          ลิสต์เรียงจากเลเยอร์บนสุดลงล่างสุด (ตรงกับที่เห็นในภาพ) ·
          แถวหลัก: X / Y = ตำแหน่งกึ่งกลางในพิกัดผืนผ้า {CANVAS_W}×{CANVAS_H} (0,0 = มุมซ้ายบน) ·
          แถวย่อยในกลุ่ม: X / Y = ระยะเยื้องจากจุดกลางกลุ่ม (คูณขนาดกลุ่มด้วย) ·
          Size 1 = ขนาดต้นฉบับ · Layer เลขมากอยู่หน้า
          <br />
          ไส้แก้ได้ที่กลุ่มแม่ที่เดียว สำเนาทุกตัวใช้ไส้ชุดเดียวกัน (แก้แล้วเปลี่ยนทุกช่องพร้อมกัน) ·
          แถว (mirror group) คือฝั่งขวาทั้งชุด คิดตำแหน่งกระจกจากฝั่งซ้ายให้เอง (รูปไม่พลิกด้าน)
          X/Y ของแถวนี้เป็น <b>ระยะขยับเพิ่มของทั้งชุด</b> (0,0 = กระจกเป๊ะ) ·
          แถว (row) เรียงลูกเป็นแนวนอนแกน Y เดียวกัน ระยะห่างปรับที่ช่อง <b>Gap</b> ·
          <span className="text-amber-500/80"> ส่วนที่ติดป้าย &quot;ขนาดไม่ตามกลุ่ม&quot; จะคงขนาดตามกลุ่มแม่เสมอ ย่อช่องไหนก็ไม่เล็กลง</span>
        </p>

        {/* ── โค้ดที่ได้จากการปรับแต่ง ── */}
        <div className="mt-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="material-icons-round text-base text-gray-400">code</span>
            <span className="text-sm font-bold text-white">Tuned values</span>
            <button
              type="button"
              onClick={copyCode}
              className="ml-auto h-7 px-2 rounded border border-slate-700 bg-slate-800 text-gray-200 text-xs inline-flex items-center gap-1 hover:bg-slate-700 transition-colors"
            >
              <span className="material-icons-round text-[14px]">{copied ? 'check' : 'content_copy'}</span>
              {copied ? tStat('Copied') : tStat('Copy')}
            </button>
          </div>
          <textarea
            readOnly
            value={code}
            rows={Math.min(24, code.split('\n').length + 1)}
            className="w-full rounded-xl border border-white/10 bg-slate-900 text-gray-200 text-xs font-mono p-3 focus:outline-none"
          />
        </div>
        </>
        )}
        </>
        )}

        {/* ── แผงแก้ไขโปรไฟล์ — อยู่เหนือแผงจัดทีมตามที่สั่ง · ปุ่มเลือกป้อมอยู่ข้างรูปโปรไฟล์ ── */}
        <ProfilePanel
          profile={profile}
          featherMin={fMin}
          onChange={next => setProfile(pf => ({ ...pf, ...next }))}
          beside={<FortressButton value={fortress} onChange={setFortress} />}
        />

        {/* ── แผงจัดทีม — ส่วนที่คนทั่วไปใช้ ── */}
        <TeamPanel
          teams={teams}
          facts={facts}
          names={names}
          busy={busySlot}
          onAdd={(side, index) => setPicking({ side, index })}
          onClear={(side, index) => setSlot(side, index, { rangerId: null, level: 1, talent: 0 })}
          onLevel={(side, index, level) => setSlot(side, index, { level: Math.max(1, level) })}
          onTalent={(side, index, talent) => setSlot(side, index, { talent })}
          onSwap={(from, to) => setTeams(t => {
            // สลับทั้งเรนเจอร์และเลเวลไปด้วยกัน ข้ามทีมก็ได้ (ต้องก๊อปทั้งสองฝั่งก่อนค่อยเขียน)
            const next = { A: [...t.A], B: [...t.B] }
            const a = next[from.side][from.index]
            next[from.side][from.index] = next[to.side][to.index]
            next[to.side][to.index] = a
            return next
          })}
        />


        {/* ยืนยันก่อนเซฟรูป */}
        {confirmSave && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={e => { if (e.target === e.currentTarget) setConfirmSave(false) }}
          >
            <div className="card-glass rounded-2xl p-5 w-full" style={{ maxWidth: '22rem' }}>
              <div className="flex items-center gap-2 mb-3">
                <span className="material-icons-round text-cyan-400">download</span>
                <h3 className="text-white font-bold text-sm">{tStat('Save this image?')}</h3>
              </div>
              <p className="text-xs text-gray-400 mb-4">lobby.png · {CANVAS_W} × {CANVAS_H}</p>
              <div className="flex justify-end gap-2">
                <button
                  type="button" onClick={() => setConfirmSave(false)}
                  className="h-8 px-3 rounded-lg border border-slate-700 bg-slate-800 text-gray-300 text-xs hover:bg-slate-700 transition-colors"
                >
                  {tStat('Cancel')}
                </button>
                <button
                  type="button" onClick={savePng} autoFocus
                  className="h-8 px-3 rounded-lg border border-cyan-600 bg-cyan-600/20 text-cyan-100 text-xs font-bold hover:bg-cyan-600/30 transition-colors inline-flex items-center gap-1"
                >
                  <span className="material-icons-round text-[14px]">download</span>
                  {tStat('Save')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ป๊อปอัพเลือกเรนเจอร์ — ฟิลเตอร์ชุดเดียวกับ Ranger Book */}
        {picking && (
          <RangerPicker
            title={`${tStat('Pick a ranger')} · ${tStat('Team')} ${picking.side} ${tStat('slot')} ${picking.index + 1}`}
            allowAll
            extraRows={UPCOMING_RANGERS}
            view={pickerView}
            onViewChange={next => setPickerView(v => ({ ...v, ...next }))}
            onPick={pickRanger}
            onClose={() => setPicking(null)}
          />
        )}
        </>
        )}
    </>
  )
}
