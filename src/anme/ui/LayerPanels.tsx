// ====================================================
// LayerPanels.tsx — เลเยอร์ใต้เรนเจอร์: "ระยะ" (แถบบอกระยะ) + "คำอธิบายสกิล" (การ์ดมุมซ้ายบน)
//   • ตั้งค่าเรนเจอร์รายตัว → เปิด/ปิดเลเยอร์ (เปิด = มีแถวย่อยใต้เรนเจอร์บนไทม์ไลน์ + บล็อกเริ่มต้น)
//   • แต่ละบล็อกบนแถวย่อยกำหนดว่าแสดงอะไร ช่วงเวลาไหน (ลากย้าย/ยืดได้เหมือนบล็อกอื่น)
// เนื้อหาการ์ดดึงจากข้อมูลเกมชุดเดียวกับ Ranger Book (ชื่อ/คำอธิบายแปลไทยด้วยตัวแปลของเว็บ) แล้วแก้ข้อความเองได้
// ====================================================
import { useCallback, useState } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'
import { apiFetch } from '@/lib/staticApi'
import { addLayerCue, patchCue, setActorLayer } from '@/anme/engine/actions'
import { assets, fetchRangerStats, type RangerRuntime } from '@/anme/engine/assets'
import { L } from '@/anme/engine/i18n'
import { cueColor } from '@/anme/engine/scene'
import { useStore } from '@/anme/engine/store'
import type { Actor, InfoCue, RangeCue, SkillCard } from '@/anme/engine/types'
import { Icon, Num, Row, Section, Seg, Slider, Text, Toggle } from './widgets'

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

/** ตัวสร้างเนื้อหาการ์ดของเรนเจอร์ตัวนี้ (ต้องใช้คำแปลของเว็บ จึงเป็น hook) */
export function useSkillCardMaker(rt: RangerRuntime | null) {
  const { tSkill, tSkillDesc } = useLanguage()
  return useCallback(async (slot: Slot): Promise<SkillCard> => {
    const id = rt?.rangerId
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
  }, [rt?.rangerId, tSkill, tSkillDesc])
}

/** ตั้งค่าเรนเจอร์รายตัว → เปิด/ปิดเลเยอร์ระยะ + คำอธิบายสกิล */
export function RangerLayers({ a, rt }: { a: Actor; rt: RangerRuntime }) {
  const make = useSkillCardMaker(rt)
  const [busy, setBusy] = useState(false)
  const hasData = !!rt.gamedata?.range || !!rt.gamedata?.skillRanges
  const toggle = async (lane: 'range' | 'info', on: boolean) => {
    setBusy(true)
    try { await setActorLayer(a.id, lane, on, make) } finally { setBusy(false) }
  }
  return (
    <Section title={L('เลเยอร์ใต้เรนเจอร์', 'Layers under this ranger')} accent="#22d3ee">
      <Toggle label={<><Icon name="ruler" size={13} /> {L('แสดงระยะ (โจมตี / สกิล)', 'Show ranges (attack / skills)')}</>} value={!!a.layers?.range}
        onChange={v => toggle('range', v)} />
      <Toggle label={<><Icon name="info" size={13} /> {L('คำอธิบายสกิล (มุมซ้ายบน)', 'Skill info card (top-left)')}</>} value={!!a.layers?.info}
        onChange={v => toggle('info', v)} />
      <div className="muted small">
        {busy ? L('กำลังดึงข้อมูลสกิล…', 'Loading skill data…')
          : !rt.rangerId || !hasData ? L('ตัวนี้ไม่มีข้อมูลระยะจากเกม (ไฟล์อัปโหลดเอง/ตัวใหม่) — การ์ดยังใส่ข้อความเองได้', 'No game range data for this one (uploaded/new) — you can still type the card text')
          : L('เปิดแล้วจะมีแถวย่อยใต้เรนเจอร์บนไทม์ไลน์ ลาก/ยืดบล็อกเพื่อกำหนดว่าโชว์ช่วงไหน · กด + ที่แถวเพื่อเพิ่มบล็อก', 'Each layer gets its own row under the ranger — drag/stretch blocks to choose when it shows · press + on the row to add a block')}
      </div>
      {a.layers?.range && <button className="btn small" onClick={() => addLayerCue(a.id, 'range')}><Icon name="plus" size={13} /> {L('เพิ่มช่วงแสดงระยะ', 'Add range block')}</button>}
      {a.layers?.info && <button className="btn small" onClick={() => addLayerCue(a.id, 'info', make)}><Icon name="plus" size={13} /> {L('เพิ่มการ์ดคำอธิบาย', 'Add info card')}</button>}
    </Section>
  )
}

// ── แผงตั้งค่าบล็อก ──
export function RangeFields({ c }: { c: RangeCue }) {
  const scene = useStore(s => s.scene)
  const actor = scene.actors.find(a => a.id === c.actorId)
  const rt = actor && assets.get(actor.assetId)
  const gd = rt?.kind === 'ranger' ? rt.gamedata : null
  const p = (fn: (k: RangeCue) => void, h = true) => patchCue<RangeCue>(c.id, fn, h)
  const kind = (slot: Slot) => {
    const sr = gd?.skillRanges?.[slot]
    if (!sr) return L('— ไม่มีข้อมูล', '— no data')
    return `${sr.area * 2}pt · ${sr.basis === 'self' ? L('บัฟ (รอบตัวเอง)', 'buff (around self)') : sr.basis === 'rear' ? L('แนวหลัง', 'rear') : L('รอบเป้าหมาย', 'around target')}`
  }
  return (
    <Section title={L('แสดงระยะ', 'Show ranges')} accent={cueColor.range}>
      <Toggle label={`${L('ระยะโจมตี', 'Attack range')}${gd?.range ? ` · ${gd.range}pt` : ''}`} value={c.atk} onChange={v => p(k => { k.atk = v })} />
      <Toggle label={`${L('สกิล 1', 'Skill 1')} · ${kind('skill1')}`} value={c.skill1} onChange={v => p(k => { k.skill1 = v })} />
      <Toggle label={`${L('สกิล 2', 'Skill 2')} · ${kind('skill2')}`} value={c.skill2} onChange={v => p(k => { k.skill2 = v })} />
      <Row>
        <Num label={L('ATK แกน Y', 'ATK Y')} value={c.atkY ?? 0} onChange={(v, h) => p(k => { k.atkY = v }, h)} />
        <Num label={L('S1/S2 แกน Y', 'S1/S2 Y')} value={c.skillY ?? 0} onChange={(v, h) => p(k => { k.skillY = v }, h)} />
      </Row>
      <Num label={L('ระยะเวลา', 'Duration')} unit={L('วิ', 's')} step={0.05} min={0.05} value={c.duration} onChange={(v, h) => p(k => { k.duration = v }, h)} />
      <div className="muted small">{L('แกน Y: ติดลบ = ขึ้น · บวก = ลง (ลากชื่อช่องเพื่อปรับได้) · ขาว = ระยะโจมตี · เขียว = สกิลบัฟ · ส้ม = สกิลโจมตี · ระยะโจมตีเป็นค่าพื้นฐาน (ไม่รวมทาเลนต์)', 'White = attack · green = buff skill · orange = attack skill · base attack range (no talent bonus)')}</div>
    </Section>
  )
}

export function InfoFields({ c }: { c: InfoCue }) {
  const scene = useStore(s => s.scene)
  const actor = scene.actors.find(a => a.id === c.actorId)
  const rt = actor && assets.get(actor.assetId)
  const make = useSkillCardMaker(rt?.kind === 'ranger' ? rt : null)
  const [busy, setBusy] = useState(false)
  const p = (fn: (k: InfoCue) => void, h = true) => patchCue<InfoCue>(c.id, fn, h)
  const reload = async (slot: Slot) => {
    setBusy(true)
    try { const card = await make(slot); p(k => { k.slot = slot; k.card = card }) } finally { setBusy(false) }
  }
  return (
    <>
      <Section title={L('คำอธิบายสกิล', 'Skill info')} accent={cueColor.info}>
        <Seg<Slot> value={c.slot} onChange={v => reload(v)} options={[{ value: 'skill1', label: L('สกิล 1', 'Skill 1') }, { value: 'skill2', label: L('สกิล 2', 'Skill 2') }]} />
        <button className="btn small" disabled={busy} onClick={() => reload(c.slot)}>
          <Icon name="reset" size={13} /> {busy ? L('กำลังดึงข้อมูล…', 'Loading…') : L('ดึงข้อความจากเกมใหม่', 'Reload text from game data')}
        </button>
        <Num label={L('ระยะเวลา', 'Duration')} unit={L('วิ', 's')} step={0.05} min={0.2} value={c.duration} onChange={(v, h) => p(k => { k.duration = v }, h)} />
      </Section>
      <Section title={L('ข้อความบนการ์ด', 'Card text')} accent={cueColor.info}>
        <Text label={L('ชื่อสกิล', 'Skill name')} value={c.card.name} onChange={v => p(k => { k.card.name = v })} />
        <Text label={L('อัตราใช้ / คูลดาวน์', 'Use rate / cooldown')} value={c.card.stat} onChange={v => p(k => { k.card.stat = v })} />
        <EffectsBox value={c.card.effects} onChange={v => p(k => { k.card.effects = v })} />
        <Text label={L('เป้าหมาย / ระยะ', 'Target / area')} value={c.card.target} onChange={v => p(k => { k.card.target = v })} />
        <Text label={L('เวลาร่าย / กลับตำแหน่ง', 'Cast / recovery')} value={c.card.timing} onChange={v => p(k => { k.card.timing = v })} />
      </Section>
      <Section title={L('ตำแหน่ง', 'Position')} accent={cueColor.info} defaultOpen={false}>
        <Row>
          <Num label={L('เลื่อน X', 'Offset X')} value={c.offsetX} onChange={(v, h) => p(k => { k.offsetX = v }, h)} />
          <Num label={L('เลื่อน Y', 'Offset Y')} value={c.offsetY} onChange={(v, h) => p(k => { k.offsetY = v }, h)} />
        </Row>
        <Slider label={L('ขนาด', 'Scale')} value={c.scale} min={0.5} max={2} step={0.01} onChange={(v, h) => p(k => { k.scale = v }, h)} fmt={v => '×' + v.toFixed(2)} />
        <div className="muted small">{L('การ์ดอยู่มุมซ้ายบนของจอเสมอ (ไม่ขยับตามกล้อง) · หลายใบพร้อมกันจะเรียงลงมา', 'Cards sit at the top-left of the screen (camera does not move them) · several at once stack downwards')}</div>
      </Section>
    </>
  )
}

/** ผลของสกิล — บรรทัดละ 1 ข้อ */
function EffectsBox({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const joined = value.join('\n')
  const [t, setT] = useState(joined)
  const [last, setLast] = useState(joined)
  if (joined !== last) { setLast(joined); setT(joined) }
  return (
    <label className="txt">
      <span className="sel-label">{L('ผลของสกิล (บรรทัดละข้อ)', 'Effects (one per line)')}</span>
      <textarea rows={Math.max(3, value.length + 1)} value={t} onChange={e => setT(e.target.value)}
        onBlur={() => { const next = t.split('\n').map(s => s.trim()).filter(Boolean); if (next.join('\n') !== joined) onChange(next) }} />
    </label>
  )
}
