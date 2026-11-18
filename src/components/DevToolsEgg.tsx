'use client'

import { useEffect } from 'react'

export default function DevToolsEgg() {
  useEffect(() => {
    // Styled console message
    console.log(
      '%cWhat do you want to do bro? 🤔',
      'font-size:22px;font-weight:bold;color:#fbbf24;text-shadow:0 0 8px #f59e0b;'
    )
    console.log(
      '%c👀 แค่อยากรู้อยากเห็นใช่มั้ย? ไม่เป็นไร สบายใจได้เลย 😄',
      'font-size:14px;color:#a3e635;'
    )
    console.log(
      '%c🥝 Line Ranger Kiwi — Made with ❤️ by NAViK',
      'font-size:12px;color:#94a3b8;'
    )

    // Right-click easter egg — ปิดไว้ชั่วคราวระหว่างดูโค้ด (บอกไว้เปิดกลับทีหลัง)
    // const handleContextMenu = (e: MouseEvent) => {
    //   const target = e.target as HTMLElement
    //   if (target.tagName === 'IMG') return // ปล่อย save image ได้ปกติ
    //   e.preventDefault()
    //   console.log(
    //     '%c🖱️ คลิกขวาเหรอ? What do you want to do bro? 🤔',
    //     'font-size:16px;font-weight:bold;color:#fb923c;'
    //   )
    // }
    //
    // document.addEventListener('contextmenu', handleContextMenu)
    // return () => document.removeEventListener('contextmenu', handleContextMenu)
  }, [])

  return null
}
