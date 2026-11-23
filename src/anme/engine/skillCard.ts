// ====================================================
// skillCard.ts — เนื้อหา "การ์ดคำอธิบายสกิล" (เลเยอร์ info) จากข้อมูลเกม
// ใช้ทั้งในสตูดิโอ (LayerPanels) และตัวเล่นวิดีโอแบบอ่านอย่างเดียว (src/components/ScenePlayer.tsx — หน้า /gear-options)
// แยกออกมาจาก LayerPanels เพื่อไม่ให้ตัวเล่นต้อง import store ของสตูดิโอ
// ====================================================
import { apiFetch } from '@/lib/staticApi'
import { fetchRangerStats } from './assets'
import { L } from './i18n'
import type { InfoCue, SkillCard } from './types'

type Slot = InfoCue['slot']

/** ไอคอนบน lerico → เส้นทางในแอพ (/api/res/… วิ่งผ่าน Worker ได้ CORS → วาดลง canvas แล้วส่งออกวิดีโอได้) */
const resPath = (url: string) => url.replace(/^https:\/\/rangers\.lerico\.net\/res\//, '/api/res/')

/**
 * ผลของสกิล = บรรทัดที่ขึ้นต้นด้วย * ในคำอธิบาย (ตัดคำบรรยายเนื้อเรื่องข้างหน้าทิ้ง) แล้วย่อให้สั้น:
 *   (5 sec) → (5s) · per sec → /s · " x 800%" → " ×800%" · 5 วินาที → 5 วิ
 * ไม่มี * เลย (บางสกิล EN ใช้ " - ") → แยกด้วยขีดแทน · ไม่มีทั้งคู่ = ใช้ทั้งข้อความ
 */
function effectLines(desc: string): string[] {
  const norm = desc.replace(/\\n/g, '\n')
  let parts = norm.split(/(?=\*)/g).map(s => s.trim()).filter(Boolean)
  let bullets = parts.filter(p => p.startsWith('*'))
  if (!bullets.length) {
    parts = norm.split(/\s+-\s+(?=[A-Za-z฀-๿])/g).map(s => s.trim()).filter(Boolean)
    bullets = parts.length > 1 ? parts.slice(1) : parts
  }
  return bullets.map(b => b
    .replace(/^\*\s*/, '')
    .replace(/\(\s*(\d+(?:\.\d+)?)\s*sec\s*\)/gi, '($1s)')
    .replace(/\s*per sec\b/gi, '/s')
    .replace(/\s+x\s+(?=\d)/g, ' ×')
    .replace(/(\d)\s*วินาที/g, '$1 วิ')
    .replace(/\s{2,}/g, ' ')
    .trim())
    .filter(Boolean)
}

const castCache = new Map<string, Promise<Record<string, { seconds: number } | null> | null>>()
function castTimes(id: string) {
  if (!castCache.has(id)) {
    castCache.set(id, apiFetch(`/api/ranger-cast-time/${encodeURIComponent(id)}`).then(r => (r.ok ? r.json() : null)).catch(() => null))
  }
  return castCache.get(id)!
}

export type Tr = (code: string, fallback: string) => string

/** เนื้อหาการ์ดจากข้อมูลเกม — ข้อความตายตัวใช้ภาษาของสตูดิโอ (L) · ชื่อ/คำอธิบายสกิลใช้ตัวแปลของเว็บ */
export async function buildSkillCard(id: string | null | undefined, slot: Slot, tSkill: Tr, tSkillDesc: Tr): Promise<SkillCard> {
    const [st, ct] = id ? await Promise.all([fetchRangerStats(id), castTimes(id)]) : [null, null]
    // สกิลที่ใช้งานได้ตัวที่ 1/2 ตามลำดับ (ข้าม passive) — ตรงกับท่า s_attack / s2_attack
    const active = ((st?.skills ?? []) as any[]).filter(sk => sk?.slot !== 'passive')
    const sk = active[slot === 'skill1' ? 0 : 1]
    if (!sk) return { icon: null, name: slot === 'skill1' ? 'Skill 1' : 'Skill 2', stat: '', effects: [], target: '', timing: '' }
    const s = L(' วิ', 's')
    const stat = [
      typeof sk.probability === 'number' ? `${L('ใช้', 'Use')} ${Math.round(sk.probability * 100)}%` : '',
      typeof sk.cooldown === 'number' ? `CD ${sk.cooldown}${s}` : '',
    ].filter(Boolean).join(' · ')
    const tb = sk.triggerBasis
    const who = tb?.type === 'self' ? L('ตัวเอง', 'Self')
      : tb?.type === 'front' ? L('ศัตรูแนวหน้า', 'Front Enemy')
      : tb?.type === 'rear' ? `${L('ศัตรูแนวหลัง', 'Rear Enemy')}${tb.multiplier ? ` ×${tb.multiplier}` : ''}`
      : ''
    const area = typeof sk.area === 'number' && sk.area > 0 ? `${L('ระยะสกิล', 'Area')} ${sk.area}pt` : ''
    const cast = slot === 'skill1' ? ct?.skill1 : (ct?.[sk.slot] ?? ct?.skill2)
    const rec = slot === 'skill1' ? ct?.recovery1 : ct?.recovery2
    const timing = [
      cast ? `${L('ร่าย', 'Cast')} ${cast.seconds}${s}` : '',
      rec ? `${L('กลับตำแหน่ง', 'Recovery')} ${rec.seconds}${s}` : '',
    ].filter(Boolean).join(' · ')
    return {
      icon: sk.iconUrl ? resPath(sk.iconUrl) : null,
      name: tSkill(sk.code, sk.name),
      stat,
      effects: effectLines(tSkillDesc(sk.code, sk.description ?? '')),
      target: [who, area].filter(Boolean).join(' · '),
      timing,
    }
}
