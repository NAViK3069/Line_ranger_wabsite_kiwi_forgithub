// ====================================================
// PartsPanel.tsx — เปิด/ปิดชิ้นส่วนตัวละครทีละชิ้น (แบบแผงเลเยอร์ของ Line Ranger Kiwi)
//   • แสดงชิ้นส่วนในเฟรมที่หัวอ่านอยู่ เรียงชิ้นบนสุดไว้บนสุด พร้อมรูปย่อ
//   • ชี้เมาส์ที่แถว = กรอบแดงรอบชิ้นนั้นบนเวที
//   • ชิ้นที่ปิดไว้แต่ไม่อยู่ในเฟรมนี้ ยังโชว์ท้ายรายการ (เปิดคืนได้ไม่ต้องไล่หาเฟรม)
//   • บันทึกลงฉาก และมีผลกับภาพนิ่ง/วิดีโอที่ส่งออกด้วย
// ====================================================
import { useEffect, useMemo, useRef, useState } from 'react'
import { patchActor } from '@/anme/engine/actions'
import type { RangerRuntime, SamSet } from '@/anme/engine/assets'
import { L } from '@/anme/engine/i18n'
import { actorFrameParts } from '@/anme/engine/render'
import { setState, useStore } from '@/anme/engine/store'
import type { Actor } from '@/anme/engine/types'
import { timelineOf } from './StageView'
import { Icon, Section } from './widgets'

/** ชื่อสไปรต์มักบอกแค่ขนาด (เช่น xxx_114x33.png) — ดึงขนาดมาโชว์ให้อ่านง่าย */
const sizeOf = (name: string) => name.match(/_(\d+x\d+)(?:_\d+)?\.png$/i)?.[1] ?? ''

function Thumb({ set, name }: { set: SamSet; name: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current
    const ctx = cv?.getContext('2d')
    const spr = set.sprites[name]
    if (!cv || !ctx) return
    ctx.clearRect(0, 0, cv.width, cv.height)
    if (!spr) return
    const k = Math.min(cv.width / spr.w, cv.height / spr.h, 1)
    const w = spr.w * k, h = spr.h * k
    ctx.drawImage(spr.bitmap, (cv.width - w) / 2, (cv.height - h) / 2, w, h)
  }, [set, name])
  return <canvas ref={ref} width={56} height={56} className="part-thumb" />
}

export function PartsPanel({ a, rt }: { a: Actor; rt: RangerRuntime }) {
  const scene = useStore(s => s.scene)
  // อัปเดตรายการ ~10 ครั้ง/วินาทีพอ (ไม่ต้องตามทุกเฟรม)
  const tick = useStore(s => Math.floor(s.time * 10))
  const hover = useStore(s => s.hoverPart)
  const [onlyHidden, setOnlyHidden] = useState(false)
  const hidden = useMemo(() => new Set(a.hiddenParts ?? []), [a.hiddenParts])

  const rows = useMemo(() => {
    const t = tick / 10
    const inFrame = actorFrameParts(scene, timelineOf(scene), a, rt, t)
    const names = new Set(inFrame.map(r => r.name))
    const extra = [...hidden].filter(n => !names.has(n)).map(name => ({ name, count: 0 }))
    return [...inFrame, ...extra]
  }, [scene, a, rt, tick, hidden])

  const toggle = (name: string) => {
    const next = hidden.has(name) ? [...hidden].filter(n => n !== name) : [...hidden, name]
    patchActor(a.id, { hiddenParts: next })
  }
  const setHover = (name: string | null) => setState({ hoverPart: name ? { actorId: a.id, name } : null })
  useEffect(() => () => setState({ hoverPart: null }), [])

  const list = onlyHidden ? rows.filter(r => hidden.has(r.name)) : rows
  return (
    <Section title={<>{L('ชิ้นส่วน (เลเยอร์)', 'Parts (layers)')}{hidden.size > 0 && <span className="count-badge">{hidden.size}</span>}</>} accent="#ff5fa8" defaultOpen={hidden.size > 0}
      right={hidden.size > 0 ? <button className="btn tiny" onClick={() => patchActor(a.id, { hiddenParts: [] })}>{L('แสดงทั้งหมด', 'Show all')}</button> : undefined}>
      <div className="muted small">{L('ชิ้นในเฟรมที่หัวอ่านอยู่ (บน = อยู่หน้า) · ชี้เมาส์ = กรอบแดงบนเวที · ชิ้นที่ปิดจะหายจากภาพ/วิดีโอที่ส่งออกด้วย', 'Pieces in the frame under the playhead (top = front) · hover = red outline on stage · hidden pieces are also removed from exports')}</div>
      {hidden.size > 0 && (
        <label className="parts-filter"><input type="checkbox" checked={onlyHidden} onChange={e => setOnlyHidden(e.target.checked)} /> {L('ดูเฉพาะชิ้นที่ปิดไว้', 'Only hidden pieces')}</label>
      )}
      <div className="parts-list" onMouseLeave={() => setHover(null)}>
        {list.map(r => {
          const off = hidden.has(r.name)
          return (
            <div key={r.name} className={'part-row' + (off ? ' off' : '') + (r.count === 0 ? ' gone' : '') + (hover?.actorId === a.id && hover.name === r.name ? ' hot' : '')}
              onMouseEnter={() => setHover(r.name)} title={r.name}>
              <button className={'ibtn tiny' + (off ? ' warn' : '')} onClick={() => toggle(r.name)} title={off ? L('แสดงชิ้นนี้', 'Show piece') : L('ซ่อนชิ้นนี้', 'Hide piece')}>
                <Icon name={off ? 'eyeOff' : 'eye'} size={14} />
              </button>
              <Thumb set={rt} name={r.name} />
              <div className="part-meta">
                <span className="part-size">{sizeOf(r.name) || r.name}{r.count > 1 && <b> ×{r.count}</b>}</span>
                {r.count === 0 && <span className="part-note">{L('ปิดไว้ · ไม่อยู่ในเฟรมนี้', 'hidden · not in this frame')}</span>}
              </div>
            </div>
          )
        })}
        {!list.length && <div className="muted small pad">{L('ไม่มีชิ้นส่วนในเฟรมนี้', 'No pieces in this frame')}</div>}
      </div>
    </Section>
  )
}
