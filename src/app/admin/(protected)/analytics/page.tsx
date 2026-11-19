'use client'

// ====================================================
// /admin/analytics — สถิติคนเข้าเว็บ (Cloudflare Web Analytics)
// ข้อมูลมาจาก Worker /api/admin/analytics?days= (Worker เรียก GraphQL Analytics API ด้วย token ของแอดมิน)
// • ช่อง: คนเข้า (visits) · เปิดหน้า (page views) · เฉลี่ยต่อวัน · หน้าต่อการเข้า
// • กราฟเส้นรายวัน 2 เส้น (หน่วยเดียวกัน = ครั้ง → แกนเดียว) + เส้นเล็งตามเมาส์/นิ้ว
// • อันดับ: หน้า / มาจากไหน / ประเทศ / อุปกรณ์ (แท่งแนวนอน สีเดียว)
// สี: palette มาตรฐาน dark mode ช่อง 1 (ฟ้า) + 2 (ส้ม) — ผ่านการตรวจตาบอดสีแล้ว
// ====================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AdminPageHeader from '@/components/AdminPageHeader'
import { getSession } from '@/lib/adminApi'
import { WORKER_URL } from '@/lib/staticApi'

interface Point { date: string; views: number; visits: number }
interface Top { name: string; views: number; visits: number }
interface Stats {
  days: number; generatedAt: string; series: Point[]
  totals: { views: number; visits: number }
  pages: Top[]; referrers: Top[]; countries: Top[]; devices: Top[]
}

const C_VISITS = '#3987e5'
const C_VIEWS = '#d95926'
const nf = new Intl.NumberFormat('th-TH')
const fmtDay = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const DEVICE_TH: Record<string, string> = { desktop: 'คอมพิวเตอร์', mobile: 'มือถือ', tablet: 'แท็บเล็ต' }

/** ดึงผ่าน Worker โดยตรงด้วย token ของแอดมิน */
async function fetchStats(days: number): Promise<Response> {
  return fetch(`${WORKER_URL}/api/admin/analytics?days=${days}`, { headers: { Authorization: `Bearer ${getSession()?.token ?? ''}` } })
}

// ── กราฟเส้นรายวัน ───────────────────────────────────

function DailyChart({ series }: { series: Point[] }) {
  const wrap = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(720)
  const [hover, setHover] = useState<number | null>(null)
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el); setW(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const H = 240, padL = 40, padR = 12, padT = 12, padB = 26
  const max = Math.max(1, ...series.map(p => Math.max(p.views, p.visits)))
  // ขั้นแกน y สวยๆ (1/2/5 × 10^n)
  const step = (() => { const raw = max / 4; const m = 10 ** Math.floor(Math.log10(raw)); return [1, 2, 5, 10].map(k => k * m).find(s => s >= raw) ?? raw })()
  const top = Math.ceil(max / step) * step
  const x = (i: number) => padL + (series.length <= 1 ? 0 : (i / (series.length - 1)) * (w - padL - padR))
  const y = (v: number) => padT + (1 - v / top) * (H - padT - padB)
  const line = (k: 'views' | 'visits') => series.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join('')
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step)
  const labelEvery = Math.max(1, Math.ceil(series.length / Math.max(2, Math.floor((w - padL) / 70))))

  const onMove = (clientX: number) => {
    const r = wrap.current!.getBoundingClientRect()
    const rel = (clientX - r.left - padL) / (w - padL - padR)
    setHover(Math.max(0, Math.min(series.length - 1, Math.round(rel * (series.length - 1)))))
  }
  const hp = hover != null ? series[hover] : null
  const last = series.length - 1

  return (
    <div ref={wrap} className="relative select-none" onMouseLeave={() => setHover(null)}>
      <svg width={w} height={H} role="img" aria-label="กราฟคนเข้าและการเปิดหน้ารายวัน" className="block"
        onMouseMove={e => onMove(e.clientX)} onTouchStart={e => onMove(e.touches[0].clientX)} onTouchMove={e => onMove(e.touches[0].clientX)}>
        {ticks.map(t => (
          <g key={t}>
            <line x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,0.07)" />
            <text x={padL - 6} y={y(t) + 4} textAnchor="end" fontSize="10.5" fill="#9ca3af">{nf.format(t)}</text>
          </g>
        ))}
        {series.map((p, i) => (i % labelEvery === 0 || i === last) && (
          <text key={p.date} x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === last ? 'end' : 'middle'} fontSize="10.5" fill="#9ca3af">{fmtDay(p.date)}</text>
        ))}
        <path d={line('views')} fill="none" stroke={C_VIEWS} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <path d={line('visits')} fill="none" stroke={C_VISITS} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {hp && hover != null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={padT} y2={H - padB} stroke="rgba(255,255,255,0.35)" strokeDasharray="3 3" />
            {(['views', 'visits'] as const).map(k => (
              <circle key={k} cx={x(hover)} cy={y(hp[k])} r={4.5} fill={k === 'views' ? C_VIEWS : C_VISITS} stroke="#17131f" strokeWidth={2} />
            ))}
          </g>
        )}
      </svg>
      {hp && hover != null && (
        <div className="pointer-events-none absolute top-1 z-10 rounded-lg border border-white/15 bg-[#17131f]/95 px-3 py-2 text-xs shadow-xl"
          style={{ left: Math.min(Math.max(x(hover) - 70, 0), w - 150) }}>
          <p className="font-bold text-white mb-1">{new Date(hp.date + 'T00:00:00Z').toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}</p>
          <p className="flex items-center gap-2 text-gray-300"><span className="w-2.5 h-0.5 rounded" style={{ background: C_VISITS }} />คนเข้า <b className="ml-auto text-white">{nf.format(hp.visits)}</b></p>
          <p className="flex items-center gap-2 text-gray-300"><span className="w-2.5 h-0.5 rounded" style={{ background: C_VIEWS }} />เปิดหน้า <b className="ml-auto text-white">{nf.format(hp.views)}</b></p>
        </div>
      )}
    </div>
  )
}

// ── อันดับ (แท่งแนวนอน) ───────────────────────────────

function TopList({ title, icon, rows, label }: { title: string; icon: string; rows: Top[]; label?: (n: string) => string }) {
  const max = Math.max(1, ...rows.map(r => r.views))
  return (
    <section className="card-glass rounded-2xl p-4 sm:p-5">
      <h3 className="flex items-center gap-2 font-bold text-white mb-3">
        <span className="material-icons-round text-lg text-gray-300">{icon}</span>{title}
        <span className="ml-auto text-[11px] font-normal text-gray-500">เปิดหน้า</span>
      </h3>
      {rows.length === 0 ? <p className="text-sm text-gray-500 py-2">ยังไม่มีข้อมูล</p> : (
        <ul className="space-y-2">
          {rows.map(r => (
            <li key={r.name} className="text-sm" title={`${r.name || '—'} · เปิดหน้า ${nf.format(r.views)} · คนเข้า ${nf.format(r.visits)}`}>
              <div className="flex items-baseline gap-2">
                <span className="truncate text-gray-200">{label ? label(r.name) : (r.name || '—')}</span>
                <span className="ml-auto tabular-nums text-gray-400">{nf.format(r.views)}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${(r.views / max) * 100}%`, background: C_VISITS }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// ── หน้า ─────────────────────────────────────────────

export default function AdminAnalyticsPage() {
  const [days, setDays] = useState(30)
  const [stats, setStats] = useState<Stats | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'not_configured' | 'error'>('loading')
  const [error, setError] = useState('')
  const [showTable, setShowTable] = useState(false)

  const load = useCallback(async (d: number) => {
    setState('loading')
    try {
      const r = await fetchStats(d)
      const j = await r.json() as Stats & { error?: string }
      if (r.status === 503 && j.error === 'not_configured') { setState('not_configured'); return }
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      setStats(j); setState('ok')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดไม่สำเร็จ'); setState('error')
    }
  }, [])
  useEffect(() => { load(days) }, [days, load])

  const tiles = useMemo(() => {
    if (!stats) return []
    const { visits, views } = stats.totals
    return [
      { label: 'คนเข้า', value: nf.format(visits), hint: `ใน ${stats.days} วัน`, icon: 'group', color: C_VISITS },
      { label: 'เปิดหน้า', value: nf.format(views), hint: `ใน ${stats.days} วัน`, icon: 'visibility', color: C_VIEWS },
      { label: 'คนเข้าเฉลี่ยต่อวัน', value: nf.format(Math.round(visits / Math.max(1, stats.series.length))), hint: 'ครั้ง/วัน', icon: 'calendar_today' },
      { label: 'หน้าต่อการเข้า', value: visits ? (views / visits).toFixed(1) : '–', hint: 'หน้า/ครั้ง', icon: 'layers' },
    ]
  }, [stats])

  return (
    <div>
      <AdminPageHeader icon="insights" tone="text-sky-300" title="สถิติคนเข้าเว็บ"
        description="จำนวนคนเข้า หน้าที่เปิดบ่อย และคนมาจากไหน — จาก Cloudflare Web Analytics (ไม่ใช้คุกกี้ อัปเดตทุก 10 นาที)" />

      {/* ช่วงเวลา */}
      <div className="flex items-center gap-2 mb-5" role="radiogroup" aria-label="ช่วงเวลา">
        {[7, 30, 90].map(d => (
          <button key={d} role="radio" aria-checked={days === d} onClick={() => setDays(d)}
            className={`h-9 px-4 rounded-lg text-sm font-semibold border transition-colors ${days === d ? 'bg-sky-500/20 border-sky-400/50 text-sky-200' : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'}`}>
            {d} วัน
          </button>
        ))}
        <button onClick={() => load(days)} className="ml-auto h-9 px-3 rounded-lg text-sm text-gray-300 bg-white/5 border border-white/10 hover:bg-white/10 flex items-center gap-1" title="โหลดใหม่">
          <span className={`material-icons-round text-base ${state === 'loading' ? 'animate-spin' : ''}`}>refresh</span>
        </button>
      </div>

      {state === 'not_configured' && (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-5 text-sm text-gray-300 space-y-2">
          <p className="font-bold text-amber-200 flex items-center gap-2"><span className="material-icons-round">settings</span>ยังไม่ได้เชื่อม Cloudflare Web Analytics</p>
          <p>Worker ยังไม่มี API token สำหรับอ่านสถิติ — ตั้ง secret <code className="text-amber-200">CF_API_TOKEN</code> (สิทธิ์ Account Analytics: Read) แล้ว deploy Worker ใหม่</p>
        </div>
      )}
      {state === 'error' && (
        <div className="rounded-2xl border border-red-400/30 bg-red-400/5 p-5 text-sm text-red-200 flex items-start gap-2">
          <span className="material-icons-round">error</span>
          <div><p className="font-bold">โหลดสถิติไม่สำเร็จ</p><p className="text-red-200/80 break-all">{error}</p></div>
        </div>
      )}
      {state === 'loading' && !stats && <p className="text-gray-400 flex items-center gap-2"><span className="material-icons-round animate-spin">autorenew</span>กำลังโหลด...</p>}

      {stats && state !== 'not_configured' && state !== 'error' && (
        <div className={`space-y-5 transition-opacity ${state === 'loading' ? 'opacity-60' : ''}`}>
          {/* ตัวเลขรวม */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {tiles.map(t => (
              <div key={t.label} className="card-glass rounded-2xl p-4">
                <p className="text-xs text-gray-400 flex items-center gap-1.5">
                  {t.color ? <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.color }} /> : <span className="material-icons-round text-sm">{t.icon}</span>}
                  {t.label}
                </p>
                <p className="text-2xl sm:text-3xl font-black text-white mt-1 tabular-nums">{t.value}</p>
                <p className="text-[11px] text-gray-500">{t.hint}</p>
              </div>
            ))}
          </div>

          {/* กราฟรายวัน */}
          <section className="card-glass rounded-2xl p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3">
              <h3 className="font-bold text-white">รายวัน</h3>
              <span className="flex items-center gap-1.5 text-xs text-gray-300"><span className="w-4 h-0.5 rounded" style={{ background: C_VISITS }} />คนเข้า</span>
              <span className="flex items-center gap-1.5 text-xs text-gray-300"><span className="w-4 h-0.5 rounded" style={{ background: C_VIEWS }} />เปิดหน้า</span>
              <button onClick={() => setShowTable(v => !v)} className="ml-auto text-xs text-gray-400 hover:text-white flex items-center gap-1">
                <span className="material-icons-round text-base">{showTable ? 'show_chart' : 'table_rows'}</span>{showTable ? 'ดูกราฟ' : 'ดูเป็นตาราง'}
              </button>
            </div>
            {showTable ? (
              <div className="max-h-72 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="text-gray-400 text-xs sticky top-0 bg-[#1b1428]"><tr><th className="text-left py-1.5">วันที่</th><th className="text-right">คนเข้า</th><th className="text-right">เปิดหน้า</th></tr></thead>
                  <tbody>{[...stats.series].reverse().map(p => (
                    <tr key={p.date} className="border-t border-white/5"><td className="py-1.5 text-gray-300">{fmtDay(p.date)}</td><td className="text-right tabular-nums text-white">{nf.format(p.visits)}</td><td className="text-right tabular-nums text-white">{nf.format(p.views)}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            ) : <DailyChart series={stats.series} />}
          </section>

          {/* อันดับ */}
          <div className="grid gap-4 md:grid-cols-2">
            <TopList title="หน้าที่เปิดบ่อย" icon="description" rows={stats.pages} />
            <TopList title="มาจากไหน" icon="travel_explore" rows={stats.referrers} label={n => n || 'เข้าตรง / ไม่ทราบ'} />
            <TopList title="ประเทศ" icon="public" rows={stats.countries} />
            <TopList title="อุปกรณ์" icon="devices" rows={stats.devices} label={n => DEVICE_TH[n] ?? (n || '—')} />
          </div>
          <p className="text-[11px] text-gray-500">อัปเดตล่าสุด {new Date(stats.generatedAt).toLocaleString('th-TH')} · ตัวเลขเป็นค่าประมาณจากการสุ่มตัวอย่างของ Cloudflare</p>
        </div>
      )}
    </div>
  )
}
