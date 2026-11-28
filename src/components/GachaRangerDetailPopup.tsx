'use client'

// ====================================================
// GachaRangerDetailPopup
// แสดง Ranger Detail แบบ "เปล่า ๆ" สำหรับหน้าตู้กาชา:
//   • ไม่ปลดลิมิต (level = 1, base stats)
//   • ไม่มีเกียร์ (3 ช่อง + เปล่า, ไม่มี bonus)
//   • ไม่มีตาราง gear ranking / top sets (ไม่ใช่หน้า Meta)
// ====================================================

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import RangerStatPanel, { type RangerPanelMode } from './RangerStatPanel'
import TalentSection from './TalentSection'
import EvolutionSection from './EvolutionSection'
import { useLanguage } from '@/contexts/LanguageContext'
import { useSound } from '@/contexts/SoundContext'

interface Props {
  rangerId: string
  rangerName: string
  rangerImageUrl: string
  onClose: () => void
  mode?: RangerPanelMode   // 'gacha' (default) | 'book' (ranger-book: ใส่เกียร์เองได้)
}

export default function GachaRangerDetailPopup({
  rangerId, rangerName, rangerImageUrl, onClose, mode = 'gacha',
}: Props) {
  const { tRanger } = useLanguage()
  const { play } = useSound()
  const handleClose = () => { play('click_collect_cancel.ogg'); onClose() }

  // ── ร่างที่กำลังเปิดดูอยู่ ──
  // เริ่มจาก prop แต่สลับได้เองผ่าน Evolution (กดร่างอื่น → พับร่างนี้แล้วโหลดร่างนั้นแทนใน popup เดิม)
  const [viewId, setViewId] = useState(rangerId)
  const [viewName, setViewName] = useState(rangerName)
  useEffect(() => { setViewId(rangerId); setViewName(rangerName) }, [rangerId, rangerName])
  const viewImageUrl = viewId === rangerId
    ? rangerImageUrl
    : `https://rangers.lerico.net/res/${viewId}/${viewId}-thum.png`

  const displayName = tRanger(viewId, viewName)

  // ── ระดับพรสวรรค์ 0-4 (Ranger Book เท่านั้น) — ใช้ร่วมกันระหว่าง RangerStatPanel (คำนวณค่าพลัง) และ TalentSection (slider UI) ──
  const [talentLevel, setTalentLevel] = useState(0)

  // เสียงเปิด popup (ครั้งเดียวตอน mount; ref guard กัน StrictMode เล่นซ้ำ)
  const openedRef = useRef(false)
  useEffect(() => {
    if (openedRef.current) return
    openedRef.current = true
    play('click_collect.ogg')
  }, [])

  // ปิดด้วย Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose])

  // ล็อก body scroll ทุกขนาดหน้าจอ ขณะ popup เปิด
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // ── JS measurement: lock body height = main content + padding
  //    + grow-only: เก็บค่าสูงสุดที่เคยวัดได้ใน ref → popup ไม่หดเมื่อ user ใส่/ถอดเกียร์
  const mainContentRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const maxBodyHeightRef = useRef<number>(0)
  const [bodyMaxHeight, setBodyMaxHeight] = useState<string | undefined>(undefined)

  useLayoutEffect(() => {
    if (!mainContentRef.current) return
    maxBodyHeightRef.current = 0    // reset ตอน mount ใหม่
    const bodyEl = mainContentRef.current.parentElement
    const update = () => {
      if (mainContentRef.current && bodyEl) {
        const style = window.getComputedStyle(bodyEl)
        const padTop = parseFloat(style.paddingTop) || 0
        const padBottom = parseFloat(style.paddingBottom) || 0
        // ตัดหน้าแรกที่เส้นหัวข้อแรกใต้แผงหลัก (ศักยภาพ — data-fold-divider) ให้เห็นเส้นเต็ม + 6px
        // เรนเจอร์ที่ไม่มีศักยภาพ → แบบเดิม: ทั้งแผง + เผย divider "พรสวรรค์" เป็นแถบเล็กๆ
        const core = mainContentRef.current
        const divider = core.querySelector('[data-fold-divider]') as HTMLElement | null
        const h = divider
          ? Math.round(divider.getBoundingClientRect().bottom - core.getBoundingClientRect().top + padTop + 6)
          : core.offsetHeight + padTop + padBottom + 8
        // grow-only: ใช้ค่าสูงสุดเท่านั้น (popup ไม่หดหลังใส่/ถอดเกียร์)
        if (h > maxBodyHeightRef.current) {
          maxBodyHeightRef.current = h
          setBodyMaxHeight(`${h}px`)
        }
      }
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(mainContentRef.current)
    return () => ro.disconnect()
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}
    >
      <div className="lr-detail-zone card-glass w-full max-h-[90vh] flex flex-col rounded-2xl relative overflow-hidden" style={{ maxWidth: '58rem' }}>
        {/* Close */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors z-10"
          aria-label="ปิด"
        >
          <span className="material-icons-round">close</span>
        </button>

        {/* Header — เล็กกว่า popup ของ Meta (ไม่มี usage stats), sticky ที่ด้านบน */}
        <div className="flex items-center gap-3 p-4 sm:p-6 pb-4 pr-14 sm:pr-16 border-b border-white/10 shrink-0">
          <div
            className="rounded-xl bg-white/5 overflow-hidden shrink-0 flex items-center justify-center"
            style={{ width: 52, height: 74 }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={viewImageUrl}
              alt={displayName}
              style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg sm:text-2xl font-black text-white leading-tight break-words">{displayName}</h2>
            <div className="text-xs text-gray-500 mt-0.5">{viewId}</div>
          </div>
        </div>

        {/* Detail panel — body scrollable
            maxHeight ถูก lock ให้เท่า main content (ไม่นับ Talent)
            → popup คงขนาดเดิม Talent อยู่ในส่วน scroll */}
        <div
          ref={bodyRef}
          className="p-4 sm:p-6 flex-1 overflow-y-auto"
          style={{ maxHeight: bodyMaxHeight }}
        >
          <div ref={mainContentRef}>
            <RangerStatPanel
              rangerId={viewId}
              rangerName={viewName}
              rangerImageUrl={viewImageUrl}
              mode={mode}
              talentLevel={talentLevel}
            />
          </div>

          {/* Talent (outside ref — ไม่นับใน popup size lock) */}
          <TalentSection
            rangerId={viewId}
            showLevelSlider={mode === 'book'}
            talentLevel={talentLevel}
            onTalentLevelChange={setTalentLevel}
          />

          {/* Evolution — สายร่างของเรนเจอร์ตัวนี้ กดสลับร่างได้ (self-hide ถ้าไม่มีสาย) */}
          <EvolutionSection
            rangerId={viewId}
            onSelect={(id, name) => {
              play('click_collect.ogg')
              setViewId(id)
              setViewName(name)
              setTalentLevel(0)   // ร่างใหม่ = เริ่มที่ยังไม่ปลดพรสวรรค์ (ไม่งั้นค่าพลังคิดจาก slider ของร่างเดิม)
              // เด้งกลับบนสุด — ไม่งั้นค้างอยู่ตรงแถว Evolution ของร่างเดิม
              bodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
            }}
          />
        </div>
      </div>
    </div>
  )
}
