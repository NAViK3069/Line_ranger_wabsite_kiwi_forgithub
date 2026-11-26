'use client'

// ====================================================
// ป้ายในสนามรบจากไฟล์เกมจริง (public/gameres/hd/battle — APK เวอร์ชันล่าสุด)
//   <MissPop>        ml_guild_raid_miss_<ภาษา>.png (ml_battle_ui_<ภาษา>.plist)
//                    แบบเกม (UnitNode 0x440): ยืดสูง ×1.8 แล้วหดเป็น 1 ใน 0.13 วิ → ค้าง 0.4 → จาง 0.3
//   <DoubleSkillPop> doubleskill.png (battle_ui.plist) — ใช้ทักษะอีกครั้ง (0xd01564)
//                    เหนือหัว · จางเข้า + ลอยขึ้น 15 pt ใน 0.2 วิ → ค้าง 0.2 → จางออก + ลอยขึ้นอีก 15 pt ใน 0.2 วิ
//   พิกัดในเกมเป็น pt (1 pt = 2 พิกเซลไฟล์ hd) · ป้ายเป็นลูกของโหนดยูนิต (โหนดยูนิตไม่ย่อ/ขยาย — scale ใส่ที่ตัว body)
//   โหนดยูนิต (0xd045e4): body = SuperAnimNode '%s-body.sam' วางที่ (0,0) ของยูนิต · setScale(unitScale / CSF)
//     contentSize ยูนิต = contentSize ของ body (กรอบเวทีไฟล์ .sam ÷ CSF — 0x1957da8) × unitScale
//     → กรอบยูนิตเป็นพิกเซลไฟล์ = canvas.w × canvas.h ของ .sam · จุดกำเนิดของโหนด = กลางกรอบเวที (getPosition — gameAnchorOffset)
//   ตำแหน่ง (ถอดจากโค้ดเกม — w × h = contentSize ยูนิต · เทียบกลางกรอบเวที):
//     MISS        (UnitNode 0x440): x = w/4 ไปทางหน้า (ฝั่งเรา +x · ศัตรู −x — flag 0x500) · y = h/2 − 15 pt (= ขอบบนกรอบ − 15 pt)
//     doubleskill (0xd01564):       x = 0 · y = H + 60 pt · H (0x7b8 → 0xd0a1b8) = ความสูงในข้อมูล × scale
//                                   ยูนิต .sam ไม่มีค่านี้ (0xd5c15c โหลดจากรูปเฉพาะยูนิตแบบภาพนิ่ง) → ใช้ contentSize.h
// ====================================================

import type { OverlayCtx } from '@/components/ScenePlayer'
import { assets } from '@/anme/engine/assets'
import { gameAnchorOffset } from '@/anme/engine/timeline'
import { prog } from './anim'
import { AtlasSprite, SamSprite } from './sam'

/** ภาษาของไฟล์ป้าย (มี en / ja / th / tw / vn) */
const uiLang = (lang: string) => (['th', 'ja', 'tw', 'vn'].includes(lang) ? lang : 'en')
export const battleUiAtlas = (lang: string) => `hd/battle/ml_battle_ui_${uiLang(lang)}`

export const MISS_DUR = 0.83
const PT = 2   // 1 pt = 2 พิกเซลไฟล์ hd (contentScaleFactor)

/** โหนดยูนิตแบบเกม: จุดกำเนิด (กลางกรอบเวที .sam · พิกัดโลก) · กรอบ w × h (พิกเซลไฟล์ × scale) · ทิศหน้า · ซูมกล้อง */
function unitFrame(c: OverlayCtx, actorId: string) {
  const a = c.scene.actors.find(x => x.id === actorId)
  const rt = a && assets.get(a.assetId)
  const feet = c.actorAt(actorId)
  if (!a || !feet || rt?.kind !== 'ranger' || !rt.sam.canvas.w) return null
  const front = a.flip ? -1 : 1
  const g = gameAnchorOffset(rt)
  const zoom = (c.project({ x: 100, y: 0 }).x - c.project({ x: 0, y: 0 }).x) / 100
  return {
    origin: { x: feet.x + g.x * a.scale * front, y: feet.y + g.y * a.scale },
    w: rt.sam.canvas.w * a.scale, h: rt.sam.canvas.h * a.scale, scale: a.scale, front, zoom,
  }
}
/** จุดป้าย MISS / CRITICAL: (±w/4, h/2 − 15 pt) จากกลางกรอบ */
const popPoint = (u: NonNullable<ReturnType<typeof unitFrame>>) =>
  ({ x: u.origin.x + u.front * u.w / 4, y: u.origin.y - (u.h / 2 - 15 * PT * u.scale) })

/** ป้าย MISS ของเป้า actorId — at = จังหวะที่พลาด */
export function MissPop({ c, actorId, at, lang }: { c: OverlayCtx; actorId: string; at: number; lang: string }) {
  const t = c.t
  if (t < at || t >= at + MISS_DUR) return null
  const u = unitFrame(c, actorId)
  if (!u) return null
  const k = prog(t, at, at + 0.13)
  const alpha = 1 - prog(t, at + 0.53, at + MISS_DUR)
  const p = c.project(popPoint(u))
  return (
    <AtlasSprite atlas={battleUiAtlas(lang)} name={`ml_guild_raid_miss_${uiLang(lang)}.png`} x={p.x} y={p.y} scale={u.scale * u.zoom} alpha={alpha}
      style={{ transform: `scale(1, ${1.8 - 0.8 * k})` }} />
  )
}

export const DOUBLE_SKILL_DUR = 0.6

/** ไอคอนใช้ทักษะอีกครั้งเหนือหัว actorId — at = จังหวะร่ายทักษะซ้ำ */
export function DoubleSkillPop({ c, actorId, at }: { c: OverlayCtx; actorId: string; at: number }) {
  const it = c.t - at
  if (it < 0 || it >= DOUBLE_SKILL_DUR) return null
  const u = unitFrame(c, actorId)
  if (!u) return null
  const alpha = it < 0.2 ? it / 0.2 : it < 0.4 ? 1 : 1 - (it - 0.4) / 0.2
  // ลอยขึ้น 15 pt ตอนจางเข้า + อีก 15 pt ตอนจางออก (EaseOut)
  const risePt = 15 * (it < 0.2 ? 1 - Math.pow(1 - it / 0.2, 2) : 1) + (it > 0.4 ? 15 * (1 - Math.pow(1 - (it - 0.4) / 0.2, 2)) : 0)
  const p = c.project({ x: u.origin.x, y: u.origin.y - (u.h + (60 + risePt) * PT * u.scale) })
  return <AtlasSprite atlas="hd/battle/battle_ui" name="doubleskill.png" x={p.x} y={p.y} scale={u.scale * u.zoom} alpha={Math.max(0, Math.min(1, alpha))} />
}

// ── เอฟเฟกต์ตอนตีปกติโดน (unit/effect/eff_hit_<ชนิด>) ──
//   เกมเลือกไฟล์ตามตัวคูณธาตุ (0xced418): < 1 = hit_weak · = 1 = hit_normal · > 1 = hit_strong (ชนะทาง)
//   แล้วโหลด unit/effect/eff_%s/eff_%s.sam (0xccc0cc) · ครั้งที่ 2 ของโจมตีต่อเนื่องส่งท่า "combo"
//   ตำแหน่ง (0xccc0cc): ลูกของโหนดเป้า · setScale(unitScale × 0.8 / CSF) → ขนาด 0.8 เท่า
//     วางที่ (0, h × 0.25) ด้วย 0x1958cb8 (setPosition ของ SuperAnim ที่ชดเชย anchor ให้กลางกรอบเวทีของเอฟเฟกต์ตกที่จุดนั้นพอดี)
//     → กลางกรอบเอฟเฟกต์อยู่เหนือจุดยืนเป้า h/4 (h = กรอบยูนิต) — ไม่ได้อยู่ที่จุดกระสุนชน
//   ครั้งปกติ: ท่ามาจากค่าของผู้ตี (UnitData 0x660 — ยังไม่ได้แกะว่าเป็นค่าอะไร) → ใช้ท่าแรก basic ไปก่อน (มี basic / medium / advance)
export type HitKind = 'weak' | 'normal' | 'strong'
/** จำนวนเฟรม (30 fps) ของแต่ละท่า — นับจากไฟล์ .sam */
const HIT_FRAMES: Record<HitKind, { basic: number; combo: number }> = {
  strong: { basic: 19, combo: 24 },
  normal: { basic: 16, combo: 21 },
  weak: { basic: 16, combo: 21 },
}
const HIT_FX_SCALE = 0.8
export const hitKindOf = (elemMul: number): HitKind => (elemMul > 1 ? 'strong' : elemMul < 1 ? 'weak' : 'normal')

/** เอฟเฟกต์โดนของคิวนี้ทุกครั้ง (จากไทม์ไลน์) · combo = ลำดับครั้งที่ใช้ท่า combo (เช่น ครั้งที่ 2 ของโจมตีต่อเนื่อง) */
export function HitFx({ c, cueId, kind, combo = [] }: { c: OverlayCtx; cueId: string; kind: HitKind; combo?: number[] }) {
  const t = c.t
  const hits = c.tl.hits.filter(h => h.cue.id === cueId).sort((a, b) => a.at - b.at)
  const zoom = (c.project({ x: 100, y: 0 }).x - c.project({ x: 0, y: 0 }).x) / 100
  return (
    <>
      {hits.map((h, i) => {
        const clip = combo.includes(i) ? 'combo' : 'basic'
        const f = Math.floor((t - h.at) * 30)
        if (f < 0 || f >= HIT_FRAMES[kind][clip]) return null
        const u = h.targetId ? unitFrame(c, h.targetId) : null
        const target = c.scene.actors.find(a => a.id === h.targetId)
        const p = c.project(u ? { x: u.origin.x, y: u.origin.y - u.h / 4 } : h.point)
        return (
          <SamSprite key={i} base={`hd/unit/effect/eff_hit_${kind}/eff_hit_${kind}`} clip={clip} frame={f} fitClip={clip} anchorStage
            x={p.x} y={p.y} scale={(target?.scale ?? 1) * HIT_FX_SCALE * zoom} />
        )
      })}
    </>
  )
}

/** ป้าย CRITICAL (ml_guild_raid_critical_<ภาษา>.png) — ใช้ตำแหน่ง/อนิเมชันแบบเดียวกับ MISS */
export function CritPop({ c, actorId, at, lang }: { c: OverlayCtx; actorId: string; at: number; lang: string }) {
  const t = c.t
  if (t < at || t >= at + MISS_DUR) return null
  const u = unitFrame(c, actorId)
  if (!u) return null
  const k = prog(t, at, at + 0.13)
  const alpha = 1 - prog(t, at + 0.53, at + MISS_DUR)
  const p = c.project(popPoint(u))
  return (
    <AtlasSprite atlas={battleUiAtlas(lang)} name={`ml_guild_raid_critical_${uiLang(lang)}.png`} x={p.x} y={p.y} scale={u.scale * u.zoom} alpha={alpha}
      style={{ transform: `scale(1, ${1.8 - 0.8 * k})` }} />
  )
}
