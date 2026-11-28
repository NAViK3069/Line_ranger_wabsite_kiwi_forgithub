'use client'

// ====================================================
// SkillDetailSheet — รายละเอียดสกิล / ความสามารถ จากตารางเกม (skill / ability)
// มือถือ = แผ่นเลื่อนขึ้นจากล่าง (การ์ดต่อผล) · จอใหญ่ = กล่องกลางจอ (ตาราง)
// ค่าทุกช่องคำนวณจากตาราง (skillDetail.ts) — ไม่ได้อ่านจากข้อความคำอธิบาย
// ====================================================

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useLanguage } from '@/contexts/LanguageContext'
import type { AbilityGame, SkillGame } from '@/lib/rangerGameCalc'
import { abilityRows, skillEffectRows, targetLabel } from '@/lib/skillDetail'

export interface DetailSkill {
  slot: string
  code: string
  name: string
  description?: string
  iconUrl: string
  game?: SkillGame
  /** เวลาเตรียมใช้ทักษะ (วินาที) จากไฟล์แอนิเมชัน — null = ไม่มีข้อมูล */
  castSec?: number | null
}
export interface DetailAbility {
  code: string
  name: string
  description?: string
  iconUrl: string
  game?: AbilityGame
  /** ความสามารถปลุกพลัง (9★) */
  awaken?: boolean
}

const FALLBACK_ICON = '/gacha/images/No_image_SkillorAbility.png'

/** ข้อความทางการ: "\n" ตามตัวอักษร → ขึ้นบรรทัด · หัวข้อ "*" แต่ละข้อขึ้นบรรทัดใหม่ */
const descLines = (d: string) =>
  d.replace(/\\n/g, '\n').replace(/\s*\*\s*/g, '\n• ').replace(/\n{2,}/g, '\n').trim()

function Icon({ src }: { src: string }) {
  return (
    // ขนาดตายตัว — ไม่กระพริบขนาดตอนรูปโหลด
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" width={40} height={40} className="w-10 h-10 object-contain shrink-0 rounded-md bg-white/5"
      onError={e => { const i = e.target as HTMLImageElement; i.onerror = null; i.src = FALLBACK_ICON }} />
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/[0.04] ring-1 ring-white/10 px-2.5 py-2 min-w-0">
      <div className="text-[11px] text-gray-400 leading-tight">{label}</div>
      <div className="text-[14px] font-bold text-white tabular-nums mt-0.5 break-words">{value}</div>
    </div>
  )
}

function YesNo({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${ok ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/5 text-gray-500'}`}>
      <span className="material-icons-round text-[13px]">{ok ? 'check' : 'close'}</span>{label}
    </span>
  )
}

export default function SkillDetailSheet({ kind, skills = [], abilities = [], focusCode, grade, level, onClose }: {
  kind: 'skill' | 'ability'
  skills?: DetailSkill[]
  abilities?: DetailAbility[]
  focusCode: string | null
  grade: number
  level: number
  onClose: () => void
}) {
  const { tSkill, tSkillDesc, tAbility, tAbilityDesc, lang } = useLanguage()
  const th = lang === 'th'
  const T = (a: string, b: string) => (th ? a : b)
  const bodyRef = useRef<HTMLDivElement>(null)

  // Esc ปิดแค่แผ่นนี้ (ไม่ให้ไปปิด popup เรนเจอร์ด้านหลัง)
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose() } }
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  }, [onClose])

  // เลื่อนไปที่รายการที่กดเปิดมา (ทันที ไม่มีแอนิเมชัน)
  useEffect(() => {
    if (!focusCode) return
    const el = bodyRef.current?.querySelector<HTMLElement>(`[data-code="${CSS.escape(focusCode)}"]`)
    if (el && bodyRef.current) bodyRef.current.scrollTop = el.offsetTop - 8
  }, [focusCode])

  if (typeof document === 'undefined') return null

  const sec = (v: number) => (th ? `${+v.toFixed(2)} วินาที` : `${+v.toFixed(2)}s`)
  const pct = (v: number) => `${+(v * 100).toFixed(1)}%`

  return createPortal(
    <div data-icon-tooltip className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm sm:p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="lr-detail-zone w-full sm:max-w-3xl max-h-[88vh] flex flex-col rounded-t-2xl sm:rounded-2xl bg-slate-950 ring-1 ring-white/10 shadow-2xl">
        {/* หัว */}
        <div className="relative flex items-center justify-between gap-2 px-4 pt-3.5 pb-2.5 border-b border-white/10 shrink-0">
          <div className="sm:hidden absolute left-1/2 -translate-x-1/2 top-1.5 h-1 w-10 rounded-full bg-white/20" aria-hidden />
          <h3 className="text-[15px] sm:text-lg font-black text-yellow-300">
            {kind === 'skill' ? T('รายละเอียดทักษะ', 'Skill details') : T('รายละเอียดความสามารถ', 'Ability details')}
          </h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-white p-1 -mr-1">
            <span className="material-icons-round">close</span>
          </button>
        </div>

        <div ref={bodyRef} className="relative overflow-y-auto overscroll-contain px-3 sm:px-4 py-3 space-y-3">
          {kind === 'skill' && skills.map((sk, i) => {
            const g = sk.game
            const name = tSkill(sk.code, sk.name)
            const desc = sk.description ? tSkillDesc(sk.code, sk.description) : ''
            const title = sk.slot === 'passive' ? T('ทักษะติดตัว', 'Passive') : `${T('ทักษะ', 'Skill')} ${i + 1}`
            const rows = g ? skillEffectRows(g, grade, level, lang) : []
            return (
              <section key={sk.code} data-code={sk.code}
                className={`rounded-xl p-3 ring-1 ${sk.code === focusCode ? 'bg-yellow-400/[0.06] ring-yellow-400/40' : 'bg-white/[0.03] ring-white/10'}`}>
                <div className="flex gap-2.5">
                  <Icon src={sk.iconUrl} />
                  <div className="min-w-0">
                    <div className="text-[14px] font-bold text-white leading-tight">
                      {title}{name && name !== sk.code ? <> : <span className="text-yellow-200">{name}</span></> : null}
                    </div>
                    {desc && <p className="lr-tt-desc text-[12px] text-gray-400 mt-1 whitespace-pre-line leading-snug">{descLines(desc)}</p>}
                  </div>
                </div>

                {g && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mt-2.5">
                    <Stat label={T('อัตราการใช้สกิล', 'Use rate')} value={pct(g.probability)} />
                    <Stat label={T('เวลารอทักษะ', 'Cooldown')} value={sec(g.delay)} />
                    <Stat label={T('เงื่อนไขแสดงผล', 'Target')} value={targetLabel(g, lang)} />
                    <Stat label={T('เวลาเตรียมใช้ทักษะ', 'Cast time')} value={sk.castSec != null ? sec(sk.castSec) : '—'} />
                  </div>
                )}

                {rows.length > 0 && (
                  <>
                    {/* มือถือ: การ์ดต่อผล */}
                    <div className="sm:hidden mt-2 space-y-1.5">
                      {rows.map(r => (
                        <div key={r.code} className="rounded-lg bg-black/25 ring-1 ring-white/5 px-2.5 py-2">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-[13px] font-bold text-cyan-200 min-w-0">{r.label}</span>
                            {r.value && <span className="text-[13px] font-bold text-white tabular-nums shrink-0 text-right">{r.value}</span>}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-400">
                            <span>{T('ระยะเวลา', 'Duration')} <b className="text-gray-200">{r.duration != null ? sec(r.duration) : '—'}</b></span>
                            <span>{T('ระยะ', 'Range')} <b className="text-gray-200">{r.range}</b></span>
                          </div>
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            <YesNo ok={r.eventStage} label={T('สเตจอีเวนต์', 'Event stage')} />
                            <YesNo ok={r.guardian} label={T('ผู้พิทักษ์', 'Guardian')} />
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* จอใหญ่: ตาราง */}
                    <div className="hidden sm:block mt-2.5 overflow-hidden rounded-lg ring-1 ring-white/10">
                      <table className="w-full text-[13px]">
                        <thead className="bg-white/[0.06] text-gray-300 text-[12px]">
                          <tr>
                            <th className="text-left font-semibold px-3 py-2">{T('เอฟเฟกต์ทักษะ', 'Effect')}</th>
                            <th className="text-left font-semibold px-3 py-2">{T('ค่าสัมประสิทธิ์', 'Value')}</th>
                            <th className="text-left font-semibold px-3 py-2">{T('ระยะเวลา', 'Duration')}</th>
                            <th className="text-left font-semibold px-3 py-2">{T('ระยะ', 'Range')}</th>
                            <th className="text-center font-semibold px-2 py-2">{T('สเตจอีเวนต์', 'Event stage')}</th>
                            <th className="text-center font-semibold px-2 py-2">{T('ผู้พิทักษ์', 'Guardian')}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {rows.map(r => (
                            <tr key={r.code}>
                              <td className="px-3 py-2 text-cyan-200 font-semibold">{r.label}</td>
                              <td className="px-3 py-2 text-white tabular-nums">{r.value || '—'}</td>
                              <td className="px-3 py-2 text-gray-200 tabular-nums">{r.duration != null ? sec(r.duration) : '—'}</td>
                              <td className="px-3 py-2 text-gray-200 tabular-nums">{r.range}</td>
                              <td className="px-2 py-2 text-center"><YesNo ok={r.eventStage} label={r.eventStage ? T('ใช่', 'Yes') : T('ไม่', 'No')} /></td>
                              <td className="px-2 py-2 text-center"><YesNo ok={r.guardian} label={r.guardian ? T('ใช่', 'Yes') : T('ไม่', 'No')} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </section>
            )
          })}

          {kind === 'ability' && abilities.map(ab => {
            const name = tAbility(ab.code, ab.name)
            const desc = ab.description ? tAbilityDesc(ab.code, ab.description) : ''
            const rows = ab.game ? abilityRows(ab.game, lang) : []
            return (
              <section key={ab.code} data-code={ab.code}
                className={`rounded-xl p-3 ring-1 ${ab.code === focusCode ? 'bg-cyan-400/[0.06] ring-cyan-400/40' : 'bg-white/[0.03] ring-white/10'}`}>
                <div className="flex gap-2.5">
                  <Icon src={ab.iconUrl} />
                  <div className="min-w-0">
                    <div className="text-[14px] font-bold text-cyan-200 leading-tight">
                      {ab.awaken && (
                        <span className="mr-1.5 align-middle inline-block rounded bg-yellow-400/15 px-1.5 py-px text-[10px] font-bold text-yellow-300 ring-1 ring-yellow-400/30">
                          {T('ปลุกพลัง', 'Awakening')}
                        </span>
                      )}
                      {name && name !== ab.code ? name : ab.code}
                    </div>
                    {desc && <p className="lr-tt-desc text-[12px] text-gray-400 mt-1 whitespace-pre-line leading-snug">{descLines(desc)}</p>}
                  </div>
                </div>
                {rows.length > 0 && (
                  <>
                    <div className="sm:hidden mt-2 space-y-1.5">
                      {rows.map((r, j) => (
                        <div key={j} className="rounded-lg bg-black/25 ring-1 ring-white/5 px-2.5 py-2">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-[13px] font-bold text-white min-w-0">{r.effect}</span>
                            <span className="text-[13px] font-bold text-yellow-300 tabular-nums shrink-0">{r.chance}</span>
                          </div>
                          <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px]">
                            <span className="text-gray-500">{T('จังหวะ', 'When')}</span><span className="text-gray-200">{r.when}</span>
                            <span className="text-gray-500">{T('โหมด', 'Mode')}</span><span className="text-gray-200">{r.mode}</span>
                            <span className="text-gray-500">{T('เงื่อนไข', 'Condition')}</span><span className="text-gray-200">{r.condition}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="hidden sm:block mt-2.5 overflow-hidden rounded-lg ring-1 ring-white/10">
                      <table className="w-full text-[13px]">
                        <thead className="bg-white/[0.06] text-gray-300 text-[12px]">
                          <tr>
                            <th className="text-left font-semibold px-3 py-2">{T('โอกาส', 'Chance')}</th>
                            <th className="text-left font-semibold px-3 py-2">{T('จังหวะ', 'When')}</th>
                            <th className="text-left font-semibold px-3 py-2">{T('โหมด', 'Mode')}</th>
                            <th className="text-left font-semibold px-3 py-2">{T('เงื่อนไข', 'Condition')}</th>
                            <th className="text-left font-semibold px-3 py-2">{T('เอฟเฟกต์', 'Effect')}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {rows.map((r, j) => (
                            <tr key={j}>
                              <td className="px-3 py-2 text-yellow-300 font-semibold tabular-nums">{r.chance}</td>
                              <td className="px-3 py-2 text-gray-200">{r.when}</td>
                              <td className="px-3 py-2 text-gray-200">{r.mode}</td>
                              <td className="px-3 py-2 text-gray-200">{r.condition}</td>
                              <td className="px-3 py-2 text-white">{r.effect}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </section>
            )
          })}
        </div>
      </div>
    </div>,
    document.body,
  )
}
