// ====================================================
// skillVisuals.ts — ภาพประกอบสกิลแบบเกม (ชุดเดียวกับตัวเล่นอนิเมชั่นเรนเจอร์)
//
//   เอฟเฟกต์สีตอนร่าย : unit.skillEffectColor1/2 → res/skill_effect_color/skill_effect_<สี>.sam
//                        เกม (0xceff74 → 0xcf06cc): ตอนเริ่ม s_attack_ready / s2_attack_ready ใส่เป็นลูกของยูนิต
//                        ที่ตำแหน่งยูนิต (+ shadowCenter pt ≈ 0) · z −20 (หลังตัว) · เล่น "normal" ครั้งเดียว
//   ไอคอนเหนือหัว     : skill.attackedEffect + skillEffectIconType (ดู @/lib/animation/skillEffectIcon)
//                        ศัตรูที่โดนได้ไอคอนฝั่ง enemy · ผลที่ targetType = SELF ขึ้นบนผู้ร่าย · ยูนิตละ 1 ไอคอน
//
// โหลดแบบขี้เกียจตอนวาดครั้งแรก แล้วเรียก onReady ให้สตูดิโอวาดใหม่
// ====================================================
import { loadSkillIconSheet, loadUnitIconHeight, skillIconSetOf, type IconSheet, type SkillIconSet } from '@/lib/animation/skillEffectIcon'
import { fetchRangerStats, loadSamSet, type SamSet } from './assets'

export interface SkillVisual { color: string | null; icons: SkillIconSet | null }
export interface RangerVisual { skill1: SkillVisual; skill2: SkillVisual; iconH: number }

type Slot<T> = T | null | 'loading'
const visuals = new Map<string, Slot<RangerVisual>>()
const auras = new Map<string, Slot<SamSet>>()
let sheet: Slot<IconSheet> = null
let sheetTried = false
let notify: () => void = () => {}

/** ตั้งตัวเรียกวาดใหม่เมื่อไฟล์โหลดเสร็จ (assets.refresh) */
export function onSkillVisualReady(fn: () => void) { notify = fn }

interface StatNode { attackedEffect?: string; effectIconType?: string; targetType: string; subs?: StatNode[] }
function iconSetOf(g: StatNode | undefined): SkillIconSet | null {
  if (!g) return null
  const nodes: StatNode[] = []
  const walk = (n: StatNode) => { nodes.push(n); for (const c of n.subs ?? []) walk(c) }
  walk(g)
  const set = skillIconSetOf(nodes)
  return set.enemy || set.self ? set : null
}

/** ข้อมูลภาพประกอบสกิลของเรนเจอร์ · ยังไม่โหลด/ไม่มีข้อมูล = null */
export function rangerVisual(rangerId: string | null | undefined): RangerVisual | null {
  if (!rangerId) return null
  const v = visuals.get(rangerId)
  if (v === undefined) {
    visuals.set(rangerId, 'loading')
    Promise.all([fetchRangerStats(rangerId), loadUnitIconHeight(rangerId)]).then(([st, iconH]) => {
      // สกิลที่ใช้งานได้ตัวที่ 1/2 ตามลำดับ (ข้าม passive) — ตรงกับท่า s_attack / s2_attack
      const active = ((st?.skills ?? []) as { slot?: string; game?: StatNode }[]).filter(sk => sk?.slot !== 'passive')
      const colors = (st?.skillEffectColors ?? {}) as { skill1?: string | null; skill2?: string | null }
      visuals.set(rangerId, {
        skill1: { color: colors.skill1 ?? null, icons: iconSetOf(active[0]?.game) },
        skill2: { color: colors.skill2 ?? null, icons: iconSetOf(active[1]?.game) },
        iconH,
      })
      notify()
    }).catch(() => visuals.set(rangerId, null))
    return null
  }
  return v === 'loading' ? null : v
}

/** ไฟล์เอฟเฟกต์สีตอนร่าย (ใช้ร่วมทุกเรนเจอร์) */
export function auraSet(color: string): SamSet | null {
  const a = auras.get(color)
  if (a === undefined) {
    auras.set(color, 'loading')
    const base = `/api/res/skill_effect_color/skill_effect_${encodeURIComponent(color)}`
    loadSamSet({ sam: `${base}.sam`, plist: `${base}.plist`, png: `${base}.png` })
      .then(s => { auras.set(color, s); notify() })
      .catch(() => auras.set(color, null))
    return null
  }
  return a === 'loading' ? null : a
}

/** ชีตไอคอนผลสกิล (โหลดครั้งเดียว) */
export function iconSheet(): IconSheet | null {
  if (!sheetTried) {
    sheetTried = true
    sheet = 'loading'
    loadSkillIconSheet().then(s => { sheet = s; notify() })
  }
  return sheet === 'loading' ? null : sheet
}
