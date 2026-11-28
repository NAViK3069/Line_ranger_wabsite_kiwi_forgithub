'use client'
// ====================================================
// Gacha Gear Test — หน้าเลือก Banner (Test)
// ====================================================

import { apiFetch } from '@/lib/staticApi'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import SiteHeader from '@/components/SiteHeader'

interface PoolCard {
  id: string
  name: string
  imageUrl: string | null
  isNew: boolean
  isEvent: boolean
  gearsCount: number
}

export default function GachaGearTestPage() {
  const [pools, setPools] = useState<PoolCard[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch('/api/gacha/gear-pools?test=true')
      .then((r) => r.json())
      .then((d) => setPools(d.pools ?? []))
      .finally(() => setLoading(false))
  }, [])

  return (
    <>
    <SiteHeader icon="/home-icons/mission-gacha.webp" title="Gacha Gear Test" heading={false} />
    <main className="min-h-screen px-4 py-6 sm:py-8">
      <div className="max-w-5xl mx-auto">

        <div className="text-center mb-10">
          <h1 className="text-4xl md:text-5xl font-black mb-2">
            <span className="text-gradient-gold">Gacha Gear Test</span>
          </h1>
          <p className="text-gray-400">เลือก Banner ที่ต้องการสุ่ม</p>
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
            <span className="material-icons-round text-6xl text-gray-700 mb-4 block">construction</span>
            <p className="text-gray-400 text-lg font-semibold">ยังไม่มีตู้กาชาที่เปิดอยู่</p>
            <p className="text-gray-600 text-sm mt-1">ติดตามได้เร็วๆ นี้!</p>
          </div>
        )}

        {/* Banner Grid */}
        {!loading && pools.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
            {pools.map((pool) => (
              <Link
                key={pool.id}
                href={`/gacha-gear-test/${pool.id}`}
                className="group card-glass rounded-2xl overflow-hidden hover:scale-[1.02] hover:border-yellow-500/40 transition-all duration-200 border border-white/5 cursor-pointer"
              >
                {/* Banner Image */}
                <div className="relative h-44 bg-gradient-to-br from-cyan-900/60 to-blue-900/60 overflow-hidden flex items-center justify-center">
                  {pool.imageUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={pool.imageUrl}
                      alt={pool.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <span className="material-icons-round text-7xl text-white/10">construction</span>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                  {(pool.isNew || pool.isEvent) && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={pool.isEvent ? '/gacha/images/gacha_event.png' : '/gacha/images/gacha_new.png'}
                      alt={pool.isEvent ? 'EVENT' : 'NEW'}
                      className="absolute object-contain pointer-events-none"
                      style={{ top: '-6px', left: '-2px', width: '6rem', height: '6rem' }}
                    />
                  )}
                  <div className="absolute bottom-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="px-3 py-1 bg-yellow-500/90 text-black text-xs font-bold rounded-full flex items-center gap-1">
                      <span className="material-icons-round text-sm">auto_awesome</span>
                      สุ่มเลย!
                    </span>
                  </div>
                </div>

                {/* Info */}
                <div className="p-4">
                  <h3 className="text-white font-bold text-sm leading-tight mb-1 line-clamp-2">
                    {pool.name}
                  </h3>
                  <p className="text-gray-500 text-xs flex items-center gap-1">
                    <span className="material-icons-round text-xs">construction</span>
                    {pool.gearsCount.toLocaleString()} Gear
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}

      </div>
    </main>
    </>
  )
}
