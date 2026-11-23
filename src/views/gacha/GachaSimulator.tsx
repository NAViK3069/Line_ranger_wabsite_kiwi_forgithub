'use client'

// ====================================================
// Gacha Simulator — หน้าเลือก Banner (Ranger / Gear ในหน้าเดียว)
// /gacha-ranger และ /gacha-gear ใช้ตัวนี้ทั้งคู่ (ต่างกันแค่แท็บเริ่มต้น)
//
// สลับแท็บ = เปลี่ยนเฉพาะส่วน banner (ไม่โหลดทั้งหน้า):
//   • ข้อมูลตู้ของแต่ละแท็บโหลดครั้งเดียวแล้วเก็บไว้ (โหลดแท็บที่เหลือล่วงหน้าหลังแท็บแรกเสร็จ)
//   • URL เปลี่ยนด้วย history.pushState → แชร์ลิงก์/กด Back ได้ตามปกติ
// ====================================================

import { apiFetch } from '@/lib/staticApi'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import { useLanguage } from '@/contexts/LanguageContext'

type Kind = 'ranger' | 'gear'

interface PoolCard {
  id: string
  name: string
  imageUrl: string | null
  isNew: boolean
  isEvent: boolean
  rangersCount?: number
  gearsCount?: number
}

const KINDS: Record<Kind, {
  path: string; api: string; label: string; icon: string; img: string; activeCls: string
  bg: string; emptyIcon: string; countIcon: string; unit: string; count: (p: PoolCard) => number
}> = {
  ranger: {
    path: '/gacha-ranger', api: '/api/gacha/pools', label: 'Gacha Ranger', icon: 'auto_awesome', img: '/home-icons/gacha.webp',
    activeCls: 'from-yellow-400 to-orange-500 text-black', bg: 'from-purple-900/60 to-pink-900/60',
    emptyIcon: 'casino', countIcon: 'people', unit: 'Ranger', count: p => p.rangersCount ?? 0,
  },
  gear: {
    path: '/gacha-gear', api: '/api/gacha/gear-pools', label: 'Gacha Gear', icon: 'settings', img: '/home-icons/gacha-gear.webp',
    activeCls: 'from-cyan-500 to-blue-600 text-white', bg: 'from-cyan-900/60 to-blue-900/60',
    emptyIcon: 'construction', countIcon: 'construction', unit: 'Gear', count: p => p.gearsCount ?? 0,
  },
}

/** ตู้ที่โหลดแล้ว — อยู่ระดับโมดูล กลับมาหน้านี้อีกก็ไม่ต้องโหลดใหม่ */
const poolCache: Partial<Record<Kind, PoolCard[]>> = {}
const poolRequests: Partial<Record<Kind, Promise<PoolCard[]>>> = {}
function loadPools(kind: Kind): Promise<PoolCard[]> {
  if (poolCache[kind]) return Promise.resolve(poolCache[kind]!)
  if (!poolRequests[kind]) {
    poolRequests[kind] = apiFetch(KINDS[kind].api)
      .then(r => r.json())
      .then((d: { pools?: PoolCard[] }) => (poolCache[kind] = d.pools ?? []))
      .catch(() => { delete poolRequests[kind]; return [] as PoolCard[] })
  }
  return poolRequests[kind]!
}

const kindFromPath = (p: string): Kind | null => (p.startsWith('/gacha-gear') ? 'gear' : p.startsWith('/gacha-ranger') ? 'ranger' : null)

export default function GachaSimulator({ initial }: { initial: Kind }) {
  const { tStat } = useLanguage()
  const [kind, setKind] = useState<Kind>(initial)
  const [pools, setPools] = useState<PoolCard[] | null>(poolCache[initial] ?? null)

  // โหลดตู้ของแท็บที่เลือก (มี cache = แสดงทันที) แล้วแอบโหลดอีกแท็บไว้ล่วงหน้า
  useEffect(() => {
    let alive = true
    setPools(poolCache[kind] ?? null)
    loadPools(kind).then(p => {
      if (!alive) return
      setPools(p)
      loadPools(kind === 'ranger' ? 'gear' : 'ranger')
    })
    return () => { alive = false }
  }, [kind])

  // ปุ่ม Back/Forward ของเบราว์เซอร์ → เปลี่ยนแท็บตาม URL
  useEffect(() => {
    const onPop = () => { const k = kindFromPath(location.pathname); if (k) setKind(k) }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const switchTo = useCallback((k: Kind) => {
    if (k === kind) return
    setKind(k)
    window.history.pushState(null, '', KINDS[k].path)
  }, [kind])

  const cfg = KINDS[kind]
  const loading = pools === null

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <Link href="/" className="text-gray-400 hover:text-white transition-colors flex items-center gap-1 text-sm">
            <span className="material-icons-round text-sm">arrow_back</span>
            {tStat('Back')}
          </Link>
          <LanguageSwitcher />
        </div>

        <div className="text-center mb-8 sm:mb-10">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black mb-5">
            <span className="text-gradient-gold">Gacha Simulator</span>
          </h1>
          {/* แท็บแคปซูล — เต็มความกว้างบนมือถือ ตรงกลางบนจอกว้าง */}
          <div role="tablist" aria-label="Gacha type" className="mx-auto grid grid-cols-2 gap-1 p-1 w-full max-w-md rounded-2xl bg-white/5 border border-white/10">
            {(Object.keys(KINDS) as Kind[]).map(k => {
              const on = k === kind
              return (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => switchTo(k)}
                  className={`h-11 sm:h-12 rounded-xl flex items-center justify-center gap-2 font-bold text-base sm:text-lg transition-all active:scale-[0.98] ${
                    on ? `bg-gradient-to-r ${KINDS[k].activeCls} shadow-lg` : 'text-gray-300 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img loading="lazy" decoding="async" src={KINDS[k].img} alt="" width={28} height={28} className="w-7 h-7 object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)]" />
                  {KINDS[k].label}
                </button>
              )
            })}
          </div>
          <p className="text-gray-400 text-sm mt-4">{tStat('Select banner to roll')}</p>
        </div>

        {/* Loading */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card-glass rounded-2xl overflow-hidden animate-pulse">
                <div className="h-44 bg-white/5" />
                <div className="p-4">
                  <div className="h-4 bg-white/10 rounded w-3/4 mb-2" />
                  <div className="h-3 bg-white/5 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty */}
        {!loading && pools.length === 0 && (
          <div className="card-glass p-12 text-center rounded-2xl">
            <span className="material-icons-round text-6xl text-gray-700 mb-4 block">{cfg.emptyIcon}</span>
            <p className="text-gray-400 text-lg font-semibold">ยังไม่มีตู้กาชาที่เปิดอยู่</p>
            <p className="text-gray-600 text-sm mt-1">ติดตามได้เร็วๆ นี้!</p>
          </div>
        )}

        {/* Banner Grid — key ตามแท็บ ให้เล่นแอนิเมชันจางเข้าตอนสลับ */}
        {!loading && pools.length > 0 && (
          <div key={kind} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5 animate-[fadeIn_.2s_ease-out]">
            {pools.map((pool) => (
              <Link
                key={pool.id}
                href={`${cfg.path}/${pool.id}`}
                className="group card-glass rounded-2xl overflow-hidden hover:scale-[1.02] hover:border-yellow-500/40 transition-all duration-200 border border-white/5 cursor-pointer"
              >
                {/* Banner Image */}
                <div className={`relative h-44 bg-gradient-to-br ${cfg.bg} overflow-hidden flex items-center justify-center`}>
                  {pool.imageUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img loading="lazy" decoding="async"
                      src={pool.imageUrl}
                      alt={pool.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <span className="material-icons-round text-7xl text-white/10">{cfg.emptyIcon}</span>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                  {(pool.isNew || pool.isEvent) && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img loading="lazy" decoding="async"
                      src={pool.isEvent ? '/gacha/images/gacha_event.png' : '/gacha/images/gacha_new.png'}
                      alt={pool.isEvent ? 'EVENT' : 'NEW'}
                      className="absolute object-contain pointer-events-none"
                      style={{ top: '-6px', left: '-2px', width: '6rem', height: '6rem' }}
                    />
                  )}
                  <div className="absolute bottom-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="px-3 py-1 bg-yellow-500/90 text-black text-xs font-bold rounded-full flex items-center gap-1">
                      <span className="material-icons-round text-sm">auto_awesome</span>
                      {tStat('Roll Now!')}
                    </span>
                  </div>
                </div>

                {/* Info */}
                <div className="p-4">
                  <h3 className="text-white font-bold text-sm leading-tight mb-1 line-clamp-2">
                    {pool.name}
                  </h3>
                  <p className="text-gray-500 text-xs flex items-center gap-1">
                    <span className="material-icons-round text-xs">{cfg.countIcon}</span>
                    {cfg.count(pool).toLocaleString()} {cfg.unit}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}

      </div>
    </main>
  )
}
