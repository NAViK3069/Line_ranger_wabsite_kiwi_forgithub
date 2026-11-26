'use client'

// ====================================================
// ป้ายในสนามรบจากไฟล์เกมจริง (public/gameres/hd/battle — APK เวอร์ชันล่าสุด)
//   <MissPop>        ml_guild_raid_miss_<ภาษา>.png (ml_battle_ui_<ภาษา>.plist)
//                    แบบเกม (UnitNode 0x440): ยืดสูง ×1.8 แล้วหดเป็น 1 ใน 0.13 วิ → ค้าง 0.4 → จาง 0.3
//   <DoubleSkillPop> doubleskill.png (battle_ui.plist) — ใช้ทักษะอีกครั้ง (0xd01564)
//                    เหนือหัว · จางเข้า + ลอยขึ้น 15 pt ใน 0.2 วิ → ค้าง 0.2 → จางออก + ลอยขึ้นอีก 15 pt ใน 0.2 วิ
//   พิกัดในเกมเป็น pt (1 pt = 2 พิกเซลไฟล์ hd) · ชั้นซ้อน 1280×720 = จอเกม hd → ลอยขึ้น 15 pt = 30 พิกเซล
// ====================================================

import type { OverlayCtx } from '@/components/ScenePlayer'
import { prog } from './anim'
import { AtlasSprite, SamSprite } from './sam'

/** ภาษาของไฟล์ป้าย (มี en / ja / th / tw / vn) */
const uiLang = (lang: string) => (['th', 'ja', 'tw', 'vn'].includes(lang) ? lang : 'en')
export const battleUiAtlas = (lang: string) => `hd/battle/ml_battle_ui_${uiLang(lang)}`

export const MISS_DUR = 0.83

/** ป้าย MISS — at = จังหวะที่พลาด · x, y = กึ่งกลางป้าย */
export function MissPop({ t, at, x, y, lang, scale = 1.8 }: { t: number; at: number; x: number; y: number; lang: string; scale?: number }) {
  if (t < at || t >= at + MISS_DUR) return null
  const k = prog(t, at, at + 0.13)
  const alpha = 1 - prog(t, at + 0.53, at + MISS_DUR)
  return (
    <AtlasSprite atlas={battleUiAtlas(lang)} name={`ml_guild_raid_miss_${uiLang(lang)}.png`} x={x} y={y} scale={scale} alpha={alpha}
      style={{ transform: `scale(1, ${1.8 - 0.8 * k})` }} />
  )
}

export const DOUBLE_SKILL_DUR = 0.6

/** ไอคอนใช้ทักษะอีกครั้ง — at = จังหวะร่ายทักษะซ้ำ · x, y = จุดเหนือหัว (ก่อนลอยขึ้น) */
export function DoubleSkillPop({ t, at, x, y, scale = 1 }: { t: number; at: number; x: number; y: number; scale?: number }) {
  const it = t - at
  if (it < 0 || it >= DOUBLE_SKILL_DUR) return null
  const alpha = it < 0.2 ? it / 0.2 : it < 0.4 ? 1 : 1 - (it - 0.4) / 0.2
  const rise = 30 * (it < 0.2 ? 1 - Math.pow(1 - it / 0.2, 2) : 1) + (it > 0.4 ? 30 * (1 - Math.pow(1 - (it - 0.4) / 0.2, 2)) : 0)
  return <AtlasSprite atlas="hd/battle/battle_ui" name="doubleskill.png" x={x} y={y - rise} scale={scale} alpha={Math.max(0, Math.min(1, alpha))} />
}

// ── เอฟเฟกต์ตอนตีปกติโดน (unit/effect/eff_hit_<ชนิด>) ──
//   เกมเลือกไฟล์ตามตัวคูณธาตุ (0xced418): < 1 = hit_weak · = 1 = hit_normal · > 1 = hit_strong (ชนะทาง)
//   แล้วโหลด unit/effect/eff_%s/eff_%s.sam (0xccc0cc) · ครั้งที่ 2 ของโจมตีต่อเนื่องส่งท่า "combo"
//   ครั้งปกติ: ท่ามาจากค่าของผู้ตี (UnitData 0x660 — ยังไม่ได้แกะว่าเป็นค่าอะไร) → ใช้ท่าแรก basic ไปก่อน (มี basic / medium / advance)
export type HitKind = 'weak' | 'normal' | 'strong'
/** จำนวนเฟรม (30 fps) ของแต่ละท่า — นับจากไฟล์ .sam */
const HIT_FRAMES: Record<HitKind, { basic: number; combo: number }> = {
  strong: { basic: 19, combo: 24 },
  normal: { basic: 16, combo: 21 },
  weak: { basic: 16, combo: 21 },
}
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
        const target = c.scene.actors.find(a => a.id === h.targetId)
        const p = c.project(h.point)
        return (
          <SamSprite key={i} base={`hd/unit/effect/eff_hit_${kind}/eff_hit_${kind}`} clip={clip} frame={f} fitClip={clip}
            x={p.x} y={p.y} scale={(target?.scale ?? 1) * zoom} />
        )
      })}
    </>
  )
}
