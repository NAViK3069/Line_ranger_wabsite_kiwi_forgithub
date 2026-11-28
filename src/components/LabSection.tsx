'use client'

// ====================================================
// LabSection — [Lab] ของที่ได้จากการแปรรูป + วัสดุอัพเกรด ของเรนเจอร์ (วางก่อน Evolution ใน popup)
//   ของที่ได้จากการแปรรูป = unit.extractionCrystal1–3Gain / extractionLeonardSoulGain (ค่าพื้นฐานในตาราง)
//   วัสดุอัพเกรด = unit_evln_mtrl ตามแบบ (EVOLUTION / TRANSCEND / HYPER / ELEMENT / SWITCH_*)
//   เหรียญ = game_factor EVOLUTION_NEED_COIN_GRADE<เกรด>[_TRANSCENDENT|_HYPER]
// ข้อมูลมากับไฟล์ ranger-stats (apiFetch จำไฟล์ไว้ → ไม่โหลดซ้ำ)
// ====================================================

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/staticApi'
import { useLanguage } from '@/contexts/LanguageContext'
import type { RangerLab } from '@/lib/buildRangerStats'

// ── ไอคอนจากชีต common_popup_ui ของเกม (ไม่หมุน) ──
const SHEET = '/gameres/hd/common/popup/common_popup_ui.png'
const SHEET_W = 1021, SHEET_H = 2022
const SPRITE: Record<string, [number, number, number, number]> = {
  crystal1: [734, 306, 38, 36],
  crystal2: [922, 908, 38, 36],
  crystal3: [922, 952, 38, 36],
  leonardSoul: [838, 832, 72, 74],
  coin: [606, 932, 130, 110],
}
function SheetIcon({ id, size }: { id: keyof typeof SPRITE; size: number }) {
  const [x, y, w, h] = SPRITE[id]
  const k = size / Math.max(w, h)
  return (
    <span aria-hidden className="inline-flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <span style={{
        width: w * k, height: h * k,
        backgroundImage: `url(${SHEET})`,
        backgroundSize: `${SHEET_W * k}px ${SHEET_H * k}px`,
        backgroundPosition: `-${x * k}px -${y * k}px`,
        backgroundRepeat: 'no-repeat',
      }} />
    </span>
  )
}

const LERICO = 'https://rangers.lerico.net/res'
const materialIcon = (code: string, unit: boolean) =>
  unit ? `${LERICO}/${code}/${code}-thum.png` : `${LERICO}/evolve_icon/evolve_material_${code}.png`
const FALLBACK = '/gacha/images/No_image_SkillorAbility.png'

const KIND: Record<string, { th: string; en: string }> = {
  EVOLUTION: { th: 'อัพเกรด', en: 'Evolution' },
  TRANSCEND: { th: 'อัพเกรดอัลตร้า', en: 'Ultra Evolution' },
  HYPER: { th: 'อัพเกรดไฮเปอร์', en: 'Hyper Evolution' },
  ELEMENT: { th: 'ปลดล็อกธาตุ', en: 'Element Unlock' },
  SWITCH_TRANSCEND: { th: 'สลับเป็นอัลตร้า', en: 'Switch to Ultra' },
  SWITCH_HYPER: { th: 'สลับเป็นไฮเปอร์', en: 'Switch to Hyper' },
}

function Divider({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3 mb-2.5">
      <div className="flex-1 h-px bg-yellow-500/30" />
      <span className="text-yellow-300 font-bold text-xs tracking-wider">{title}</span>
      <div className="flex-1 h-px bg-yellow-500/30" />
    </div>
  )
}

export default function LabSection({ rangerId }: { rangerId: string }) {
  const { lang } = useLanguage()
  const th = lang === 'th'
  const [lab, setLab] = useState<RangerLab | null>(null)

  useEffect(() => {
    let cancelled = false
    apiFetch(`/api/meta/ranger-stats?id=${encodeURIComponent(rangerId)}`)
      .then(r => r.json())
      .then(j => { if (!cancelled) setLab(j?.lab ?? null) })
      .catch(() => { if (!cancelled) setLab(null) })
    return () => { cancelled = true }
  }, [rangerId])

  if (!lab) return null
  const ex = lab.extraction
  const outputs = ([
    ['crystal1', ex.crystal1, th ? 'คริสตัลระดับล่าง' : 'Low-level Crystal'],
    ['crystal2', ex.crystal2, th ? 'คริสตัลระดับกลาง' : 'Mid-level Crystal'],
    ['crystal3', ex.crystal3, th ? 'คริสตัลระดับสูง' : 'High-level Crystal'],
    ['leonardSoul', ex.leonardSoul, th ? 'ลีโอนาร์ดโซล' : 'Leonard Soul'],
  ] as const).filter(([, v]) => v > 0)
  const nm = (n: { en: string; th: string }) => (th ? n.th || n.en : n.en)

  return (
    <div className="space-y-5 mt-3">
      {outputs.length > 0 && (
        <section className="lr-detail-zone px-1 sm:px-2">
          <Divider title={th ? '[แล็บ] ของที่ได้จากการแปรรูป' : '[Lab] Extraction Output'} />
          <div className={`grid gap-1.5 ${outputs.length === 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>
            {outputs.map(([id, v, label]) => (
              <div key={id} className="bg-white/5 rounded-lg px-2 py-2 flex items-center gap-1.5 sm:gap-2 min-w-0">
                <SheetIcon id={id} size={26} />
                <span className="min-w-0">
                  <span className="block text-[10px] sm:text-[11px] leading-tight text-gray-400 line-clamp-2">{label}</span>
                  <span className="block text-[14px] font-bold text-white tabular-nums">×{v.toLocaleString('en-US')}</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {lab.evolution.length > 0 && (
        <section className="lr-detail-zone px-1 sm:px-2">
          <Divider title={th ? 'วัสดุในการอัพเกรด' : 'Evolution Materials'} />
          <div className="space-y-2">
            {lab.evolution.map(step => (
              <div key={step.kind} className="bg-white/5 rounded-xl p-2.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-2 min-w-0">
                  <span className="text-[13px] font-bold text-yellow-200 shrink-0">{(KIND[step.kind] ?? { th: step.kind, en: step.kind })[th ? 'th' : 'en']}</span>
                  {step.target && step.targetName && (
                    <span className="flex items-center gap-1 min-w-0 text-[12px] text-gray-300">
                      <span className="text-gray-500">→</span>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={materialIcon(step.target, true)} alt="" width={20} height={20} className="w-5 h-5 object-contain shrink-0"
                        onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden' }} />
                      <span className="leading-tight">{nm(step.targetName)}</span>
                    </span>
                  )}
                  {step.coin != null && (
                    <span className="ml-auto flex items-center gap-1 shrink-0 text-[12px] font-bold text-yellow-300 tabular-nums">
                      <SheetIcon id="coin" size={18} />{step.coin.toLocaleString('en-US')}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                  {step.materials.map(m => (
                    <div key={m.code} className="bg-black/25 rounded-lg p-1.5 flex flex-col items-center text-center min-w-0">
                      <div className="relative w-11 h-11">
                        {/* ขนาดตายตัว — รูปโหลดช้าก็ไม่ดันเลย์เอาต์ */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={materialIcon(m.code, m.unit)} alt="" width={44} height={44} loading="lazy" decoding="async"
                          className="w-11 h-11 object-contain"
                          onError={e => { const i = e.target as HTMLImageElement; i.onerror = null; i.src = FALLBACK }} />
                        <span className="absolute -bottom-0.5 -right-1 rounded bg-black/80 px-1 text-[11px] font-bold text-white tabular-nums leading-4">×{m.count}</span>
                      </div>
                      <span className="mt-1 text-[10px] leading-tight text-gray-300 line-clamp-2">{nm(m.name)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
