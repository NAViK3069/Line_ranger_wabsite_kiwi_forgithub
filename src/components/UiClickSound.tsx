'use client'
// ====================================================
// UiClickSound — เล่นเสียงเมื่อคลิกปุ่ม/องค์ประกอบที่กำหนด (แต่ละอันเสียงต่างกันได้)
//   • ใช้ document-level listener ตัวเดียว (delegation) → เพิ่ม/แก้ที่เดียว
//   • RULES แต่ละข้อ: { classes, sound, container? }
//     - container=false/ไม่ระบุ (ตัวปุ่ม/การ์ดเอง) → คลิกโดนก็เล่น
//     - container=true (แถว/กล่องที่ห่อปุ่ม) → เล่นเฉพาะเมื่อคลิกปุ่ม/ลิงก์ "ข้างใน"
//   • เรียงข้อเจาะจง (เสียงเฉพาะ) ไว้ก่อน → ชนะข้อ click_global ทั่วไป
// ====================================================

import { useEffect } from 'react'
import { useSound } from '@/contexts/SoundContext'

interface Rule {
  classes: string[]
  sound: string
  container?: boolean
}

const RULES: Rule[] = [
  // ── เสียงเฉพาะ (เจาะจง) ──
  // ปุ่มติดตั้งเกียร์ (ม่วง)
  { classes: ['w-full', 'py-3', 'rounded-xl', 'bg-purple-600', 'hover:bg-purple-500', 'active:scale-95', 'text-white', 'font-bold', 'text-sm', 'transition-all', 'flex', 'items-center', 'justify-center', 'gap-2', 'shadow-lg', 'shadow-purple-900/40'], sound: 'gear_equip.ogg' },
  // ปุ่มถอดเกียร์ (แดง)
  { classes: ['flex-1', 'py-3', 'rounded-xl', 'bg-red-600', 'hover:bg-red-500', 'active:scale-95', 'text-white', 'font-bold', 'text-sm', 'transition-all', 'flex', 'items-center', 'justify-center', 'gap-1.5', 'shadow-lg', 'shadow-red-900/40'], sound: 'gear_remove.ogg' },

  // ── click_global (ตัวปุ่ม/องค์ประกอบเอง) ──
  { classes: ['p-1', 'rounded-lg', 'border', 'transition-colors', 'border-white/15', 'bg-white/5', 'hover:border-white/30'], sound: 'click_global.ogg' }, // ปุ่มติ๊ก grade/filter
  { classes: ['card-glass', 'hover:scale-[1.02]', 'cursor-pointer'], sound: 'click_global.ogg' },                    // การ์ด gacha
  { classes: ['bg-gradient-to-t', 'from-black/60', 'via-transparent', 'to-transparent'], sound: 'click_global.ogg' }, // overlay การ์ด
  { classes: ['text-gray-400', 'hover:text-white', 'transition-colors', 'flex', 'items-center', 'gap-1', 'text-sm'], sound: 'click_global.ogg' }, // ลิงก์ย้อนกลับ
  { classes: ['h-[38px]', 'flex', 'items-center', 'gap-1', 'px-3', 'rounded-xl', 'border', 'text-xs', 'font-bold', 'transition-colors', 'shrink-0'], sound: 'click_global.ogg' }, // ปุ่ม Filter
  { classes: ['flex', 'items-center', 'gap-1.5', 'px-3', 'py-1.5', 'rounded-lg', 'text-sm', 'font-semibold', 'border', 'transition-all'], sound: 'click_global.ogg' }, // toggle เหลือง meta
  { classes: ['flex', 'items-center', 'gap-1.5', 'text-gray-400', 'hover:text-white', 'text-sm', 'transition-colors'], sound: 'click_global.ogg' }, // ลิงก์เทา hover ขาว
  { classes: ['px-2.5', 'py-1', 'rounded-lg', 'border', 'font-semibold', 'transition-colors'], sound: 'click_global.ogg' }, // ปุ่ม Rows
  { classes: ['px-7', 'py-1.5', 'rounded-full', 'font-bold', 'text-sm', 'mb-1.5', 'transition', 'disabled:opacity-40'], sound: 'click_global.ogg' }, // pill
  { classes: ['flex-1', 'py-2.5', 'rounded-xl', 'text-gray-300', 'text-sm', 'transition', 'hover:bg-white/10'], sound: 'click_global.ogg' }, // ยกเลิก
  { classes: ['flex-1', 'py-2.5', 'bg-red-600', 'hover:bg-red-500', 'text-white', 'rounded-xl', 'text-sm', 'font-semibold', 'transition'], sound: 'click_global.ogg' }, // รีเซ็ต
  { classes: ['px-3', 'py-1', 'rounded-lg', 'text-white', 'font-bold', 'text-sm', 'transition', 'hover:opacity-80'], sound: 'click_global.ogg' }, // กากบาท
  { classes: ['flex', 'items-center', 'gap-3', 'rounded-xl', 'p-3', 'cursor-pointer', 'hover:bg-white/5', 'transition-colors'], sound: 'click_global.ogg' }, // list item
  { classes: ['mt-2', 'px-6', 'py-2', 'rounded-full', 'font-bold', 'text-sm', 'text-white', 'transition', 'hover:opacity-80'], sound: 'click_global.ogg' }, // pill ปิดผลกล่อง
  { classes: ['px-5', 'py-1.5', 'rounded-full', 'font-bold', 'text-white', 'text-sm', 'transition', 'hover:scale-105', 'active:scale-95'], sound: 'click_global.ogg' }, // pill เลือกในกล่อง
  { classes: ['text-gray-400', 'hover:text-white', 'transition-colors'], sound: 'click_global.ogg' }, // ลิงก์เทา hover ขาว (สั้น)
  { classes: ['p-1', 'rounded-lg', 'border', 'transition-colors', 'border-yellow-400', 'bg-yellow-400/20'], sound: 'click_global.ogg' }, // ปุ่มติ๊ก (เหลือง active)
  { classes: ['shrink-0', 'flex', 'items-center', 'gap-1', 'px-3', 'py-2', 'rounded-xl', 'border', 'text-xs', 'font-semibold', 'transition-colors', 'bg-white/5', 'border-white/10', 'text-gray-400', 'hover:text-white', 'hover:border-white/20'], sound: 'click_global.ogg' }, // ปุ่ม pill เล็ก
  { classes: ['flex-1', 'py-3', 'rounded-xl', 'bg-blue-600', 'hover:bg-blue-500', 'active:scale-95', 'text-white', 'font-bold', 'text-sm', 'transition-all', 'flex', 'items-center', 'justify-center', 'gap-1.5', 'shadow-lg', 'shadow-blue-900/40'], sound: 'click_global.ogg' }, // ปุ่มเปลี่ยนเกียร์ (ฟ้า)
  { classes: ['w-full', 'aspect-square', 'flex', 'items-center', 'justify-center'], sound: 'click_global.ogg' }, // รูปเรนเจอร์ — คลิกเล่นอนิเมชั่น
  { classes: ['ml-auto', 'text-[10px]', 'font-semibold', 'text-orange-300', 'hover:text-orange-200', 'transition-colors', 'relative', 'z-20'], sound: 'click_global.ogg' }, // ปุ่ม + เพิ่มเติม / − ปิดเพิ่มเติม (Switchable Effect)
  { classes: ['w-full', 'flex', 'items-center', 'gap-2', 'text-sm', 'rounded-lg', 'px-2', 'py-1.5', 'transition-colors', 'text-left'], sound: 'click_global.ogg' }, // ปุ่มเลือก Switchable Effect (เกียร์ที่ใส่แล้ว)
  { classes: ['flex', 'items-center', 'gap-1.5', 'px-2.5', 'py-1.5', 'rounded-lg', 'border', 'text-xs', 'font-bold', 'transition-colors', 'border-white/15', 'bg-white/5', 'text-gray-300', 'hover:border-white/30'], sound: 'click_global.ogg' }, // ปุ่มเทาเล็ก (เช่น sort)
  // ปุ่ม Previous/Next (pagination)
  { classes: ['flex', 'items-center', 'gap-1', 'px-3', 'py-1.5', 'text-xs', 'bg-white/10', 'rounded-lg', 'hover:bg-white/20', 'disabled:opacity-30', 'disabled:cursor-not-allowed', 'transition-colors'], sound: 'click_global.ogg' },

  // ── click_global (container — เล่นเฉพาะปุ่ม/ลิงก์ข้างใน) ──
  { classes: ['flex', 'flex-col', 'sm:flex-row', 'gap-4', 'justify-center'], sound: 'click_global.ogg', container: true }, // CTA หน้าแรก
  { classes: ['flex', 'flex-wrap', 'items-center', 'justify-center', 'gap-2', 'mb-4'], sound: 'click_global.ogg', container: true }, // แถวปุ่ม gacha detail
  { classes: ['flex', 'gap-3', 'justify-center', 'mb-6'], sound: 'click_global.ogg', container: true }, // แถวปุ่ม gacha detail
  { classes: ['flex', 'flex-wrap', 'gap-2', 'mb-4', 'items-center'], sound: 'click_global.ogg', container: true }, // แถวปุ่ม meta
  { classes: ['w-full', 'max-w-md', 'max-h-[85vh]', 'overflow-y-auto', 'rounded-2xl', 'bg-[#1A0A2E]', 'border', 'border-white/15', 'shadow-2xl'], sound: 'click_global.ogg', container: true }, // popup Filter (ทุกหน้า)
  { classes: ['flex', 'items-center', 'justify-center', 'gap-3', 'mt-4', 'pt-3', 'border-t', 'border-white/10'], sound: 'click_global.ogg', container: true }, // แถว Previous/Next
]

const ELEMENT_RULES = RULES.filter(r => !r.container)
const CONTAINER_RULES = RULES.filter(r => r.container)

function ruleFor(el: Element, rules: Rule[]): Rule | null {
  const cl = el.classList
  if (!cl || cl.length === 0) return null
  for (const r of rules) {
    if (r.classes.every(c => cl.contains(c))) return r
  }
  return null
}

// ไต่ ancestor หา rule แรกที่ match
function findRule(start: Element | null, rules: Rule[], maxDepth = 12): Rule | null {
  for (let el = start, i = 0; el && i < maxDepth; i++, el = el.parentElement) {
    if (el.nodeType === 1) {
      const r = ruleFor(el, rules)
      if (r) return r
    }
  }
  return null
}

export default function UiClickSound() {
  const { play } = useSound()

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null
      if (!target) return

      // 1) ตัวปุ่ม/การ์ดเอง → คลิกโดนก็เล่น
      const elRule = findRule(target, ELEMENT_RULES)
      if (elRule) { play(elRule.sound); return }

      // 2) container → เล่นเฉพาะเมื่อคลิก "ปุ่ม/ลิงก์" ที่อยู่ในกล่อง (ไม่ใช่พื้นที่ว่าง)
      const clickable = target.closest('button, a, [role="button"]')
      if (clickable) {
        const cRule = findRule(clickable, CONTAINER_RULES)
        if (cRule) { play(cRule.sound); return }
      }
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [play])

  return null
}
