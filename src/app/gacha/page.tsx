'use client'
// /gacha เดิม → ย้ายไป /gacha-ranger (static export ไม่มี redirect ฝั่งเซิร์ฟเวอร์)
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function GachaRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/gacha-ranger') }, [router])
  return null
}
