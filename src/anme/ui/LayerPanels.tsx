// ====================================================
// LayerPanels.tsx — เลเยอร์ใต้เรนเจอร์: "ระยะ" (แถบบอกระยะ) + "คำอธิบายสกิล" (การ์ดมุมซ้ายบน)
//   • ตั้งค่าเรนเจอร์รายตัว → เปิด/ปิดเลเยอร์ (เปิด = มีแถวย่อยใต้เรนเจอร์บนไทม์ไลน์ + บล็อกเริ่มต้น)
//   • แต่ละบล็อกบนแถวย่อยกำหนดว่าแสดงอะไร ช่วงเวลาไหน (ลากย้าย/ยืดได้เหมือนบล็อกอื่น)
// เนื้อหาการ์ดดึงจากข้อมูลเกมชุดเดียวกับ Ranger Book (ชื่อ/คำอธิบายแปลไทยด้วยตัวแปลของเว็บ) แล้วแก้ข้อความเองได้
// ====================================================
import { useCallback, useEffect, useState } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'
import { addLayerCue, patchCue, setActorLayer } from '@/anme/engine/actions'
import { assets, type RangerRuntime } from '@/anme/engine/assets'
import { L } from '@/anme/engine/i18n'
import { buildSkillCard } from '@/anme/engine/skillCard'
import { cueColor } from '@/anme/engine/scene'
import { getState, updateScene, useStore } from '@/anme/engine/store'
import type { Actor, InfoCue, RangeCue, SkillCard } from '@/anme/engine/types'
import { Icon, Num, Row, Section, Seg, Slider, Text, Toggle } from './widgets'

type Slot = InfoCue['slot']

/** ตัวสร้างเนื้อหาการ์ดของเรนเจอร์ตัวนี้ (ต้องใช้คำแปลของเว็บ จึงเป็น hook) */
export function useSkillCardMaker(rt: RangerRuntime | null) {
  const { tSkill, tSkillDesc } = useLanguage()
  return useCallback((slot: Slot) => buildSkillCard(rt?.rangerId, slot, tSkill, tSkillDesc), [rt?.rangerId, tSkill, tSkillDesc])
}

/**
 * เปลี่ยนภาษา → แปลการ์ดคำอธิบายสกิลทุกใบในฉากเป็นภาษานั้น (ทั้งที่สร้างไว้แล้วและฉากที่เปิดเข้ามา)
 * ยกเว้นการ์ดที่ผู้ใช้แก้ข้อความเอง (card.edited) · คงตำแหน่ง/ขนาด/ช่วงเวลาเดิม · ไม่นับเป็นประวัติ undo
 */
export function useCardLanguage() {
  const { tSkill, tSkillDesc } = useLanguage()
  const lang = useStore(s => s.lang)
  // รายการการ์ดที่ต้องแปล (เปลี่ยนเมื่อมีการ์ดใหม่/ลบ/เปลี่ยนช่องสกิล)
  const key = useStore(s => s.scene.cues.filter(c => c.type === 'info' && !c.card.edited).map(c => `${c.id}:${(c as InfoCue).slot}`).join(','))
  useEffect(() => {
    if (!key) return
    let alive = true
    ;(async () => {
      const sc = getState().scene
      const todo = sc.cues.filter((c): c is InfoCue => c.type === 'info' && !c.card.edited)
      const next = new Map<string, SkillCard>()
      for (const c of todo) {
        const a = sc.actors.find(x => x.id === c.actorId)
        const def = a && sc.assets.find(d => d.id === a.assetId)
        const id = def?.type === 'ranger' && def.source === 'lerico' ? def.rangerId : null
        if (!id) continue
        const card = await buildSkillCard(id, c.slot, tSkill, tSkillDesc)
        if (card.name && JSON.stringify(card) !== JSON.stringify(c.card)) next.set(c.id, card)
      }
      if (!alive || !next.size) return
      updateScene(d => { for (const c of d.cues) if (c.type === 'info' && next.has(c.id) && !c.card.edited) c.card = next.get(c.id)! }, false)
    })()
    return () => { alive = false }
  }, [lang, key, tSkill, tSkillDesc])
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
        {/* แก้ข้อความเอง = การ์ดใบนี้จะไม่แปลตามภาษาอัตโนมัติอีก (กด "ดึงข้อความจากเกมใหม่" เพื่อกลับเป็นอัตโนมัติ) */}
        <Text label={L('ชื่อสกิล', 'Skill name')} value={c.card.name} onChange={v => p(k => { k.card.name = v; k.card.edited = true })} />
        <Text label={L('อัตราใช้ / คูลดาวน์', 'Use rate / cooldown')} value={c.card.stat} onChange={v => p(k => { k.card.stat = v; k.card.edited = true })} />
        <EffectsBox value={c.card.effects} onChange={v => p(k => { k.card.effects = v; k.card.edited = true })} />
        <Text label={L('เป้าหมาย / ระยะ', 'Target / area')} value={c.card.target} onChange={v => p(k => { k.card.target = v; k.card.edited = true })} />
        <Text label={L('เวลาร่าย / กลับตำแหน่ง', 'Cast / recovery')} value={c.card.timing} onChange={v => p(k => { k.card.timing = v; k.card.edited = true })} />
        <div className="muted small">{c.card.edited
          ? L('แก้ข้อความเองแล้ว — การ์ดนี้จะไม่เปลี่ยนภาษาตามอัตโนมัติ', 'Edited by hand — this card no longer follows the language switch')
          : L('ข้อความเปลี่ยนตามภาษาที่เลือกอัตโนมัติ', 'Text follows the selected language automatically')}</div>
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
