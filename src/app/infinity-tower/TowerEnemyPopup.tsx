'use client'

// ====================================================
// TowerEnemyPopup — รายละเอียดศัตรูในหอคอยอนันต์
// โคลนจาก GachaRangerDetailPopup (หน้าตา/ขนาด/เสียง/ปิดด้วย Esc เหมือนกัน) แต่:
//   • RangerStatPanel mode='tower' — ค่าพลังล็อกตามชั้นนี้ (endless_product_line) ปรับไม่ได้
//     ไม่มีเกียร์ / เลเวล / พรสวรรค์ / แร่ / ลีโอนาร์ด (ศัตรูไม่มี)
//   • ไม่มี Talent / Evolution (สลับร่างแล้วจะไม่ใช่ค่าของหอคอยแล้ว)
//   • หัวป๊อปอัปบอกการเกิดของศัตรูในชั้นนี้ (ออกครั้งแรก / เกิดใหม่ทุก / จำนวนสูงสุด)
// ====================================================

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import RangerStatPanel, { type TowerUnitStats } from '@/components/RangerStatPanel'
import { useSound } from '@/contexts/SoundContext'
import type { TEnemy } from '@/lib/infinityTower'

interface Props {
  enemy: TEnemy
  /** ชื่อ (ภาษาที่เลือกแล้ว) */
  name: string
  bossLabel: string
  T: (th: string, en: string) => string
  onClose: () => void
}

export default function TowerEnemyPopup({ enemy: e, name, bossLabel, T, onClose }: Props) {
  const { play } = useSound()
  const handleClose = () => { play('click_collect_cancel.ogg'); onClose() }
  const imageUrl = `https://rangers.lerico.net/res/${e.unitCode}/${e.unitCode}-thum.png`

  const tower: TowerUnitStats = useMemo(() => ({
    level: e.level, hp: e.hp, attack: e.attack, specialAttack: e.specialAttack, defence: e.defence, specialDefence: e.specialDefence,
    range: e.range, splash: e.splash, critRate: e.critRate, critRatio: e.critRatio, avoid: e.avoid, skillAvoid: e.skillAvoid,
    skillResist: e.skillResist, antiAvoid: e.antiAvoid, antiSkillAvoid: e.antiSkillAvoid,
  }), [e])

  // เสียงเปิด popup (ครั้งเดียวตอน mount; ref guard กัน StrictMode เล่นซ้ำ)
  const openedRef = useRef(false)
  useEffect(() => {
    if (openedRef.current) return
    openedRef.current = true
    play('click_collect.ogg')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ปิดด้วย Escape
  useEffect(() => {
    const handler = (ev: KeyboardEvent) => { if (ev.key === 'Escape') handleClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose])

  // ล็อก body scroll ขณะ popup เปิด
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // ความสูงของ body = เนื้อหาหลัก (grow-only — เหมือน GachaRangerDetailPopup)
  const mainContentRef = useRef<HTMLDivElement>(null)
  const maxBodyHeightRef = useRef(0)
  const [bodyMaxHeight, setBodyMaxHeight] = useState<string | undefined>(undefined)
  useLayoutEffect(() => {
    if (!mainContentRef.current) return
    maxBodyHeightRef.current = 0
    const bodyEl = mainContentRef.current.parentElement
    const update = () => {
      if (mainContentRef.current && bodyEl) {
        const style = window.getComputedStyle(bodyEl)
        const h = mainContentRef.current.offsetHeight + (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0)
        if (h > maxBodyHeightRef.current) { maxBodyHeightRef.current = h; setBodyMaxHeight(`${h}px`) }
      }
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(mainContentRef.current)
    return () => ro.disconnect()
  }, [])

  const respawn = e.minSec === e.maxSec ? `${e.minSec}` : `${e.minSec}–${e.maxSec}`
  const sec = T(' วิ', 's')

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(ev) => { if (ev.target === ev.currentTarget) handleClose() }}
    >
      <div className="lr-detail-zone card-glass w-full max-h-[90vh] flex flex-col rounded-2xl relative overflow-hidden" style={{ maxWidth: '58rem' }}>
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors z-10"
          aria-label={T('ปิด', 'Close')}
        >
          <span className="material-icons-round">close</span>
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 p-4 sm:p-6 pb-4 pr-14 sm:pr-16 border-b border-white/10 shrink-0">
          <div className="rounded-xl bg-white/5 overflow-hidden shrink-0 flex items-center justify-center" style={{ width: 52, height: 74 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt={name} style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
              onError={(ev) => { (ev.target as HTMLImageElement).style.display = 'none' }} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg sm:text-2xl font-black text-white leading-tight break-words">
              {name}
              {e.boss && <span className="ml-2 align-middle rounded bg-rose-500/85 px-1.5 py-0.5 text-[11px] font-bold text-white">{bossLabel}</span>}
            </h2>
            <div className="text-xs text-gray-500 mt-0.5">{e.unitCode}</div>
            {/* การเกิดในชั้นนี้ */}
            <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-gray-200">{T('ออกครั้งแรก', 'First spawn')} <b className="text-white">{e.initDelay}{sec}</b></span>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-gray-200">{T('เกิดใหม่ทุก', 'Respawn every')} <b className="text-white">{respawn}{sec}</b></span>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-gray-200">{T('จำนวนสูงสุด', 'Max count')} <b className="text-white">{e.maxCount.toLocaleString('en-US')}</b></span>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-6 flex-1 overflow-y-auto" style={{ maxHeight: bodyMaxHeight }}>
          <div ref={mainContentRef}>
            <RangerStatPanel rangerId={e.unitCode} rangerName={name} rangerImageUrl={imageUrl} mode="tower" tower={tower} />
          </div>
        </div>
      </div>
    </div>
  )
}
