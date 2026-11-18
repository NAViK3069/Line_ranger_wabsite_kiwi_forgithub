'use client'

// ====================================================
// Admin About Me Page - ตั้งค่าโปรไฟล์เจ้าของเว็บ
// ====================================================

import { adminFetch } from '@/lib/adminApi'
import { useState, useEffect, useRef } from 'react'

interface LinkEntry {
  label: string
  url: string
}

interface SiteProfile {
  id: string
  displayName: string
  email: string
  facebookName: string
  facebookUrl: string
  description: string
  announcement: string
  profileImage: string | null
  links: LinkEntry[]
  updatedAt: string
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = reject
    r.readAsDataURL(file)
  })
}

const inputClass =
  'w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-purple-400'
const labelClass = 'block text-sm text-gray-300 mb-1'

export default function AboutMePage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  const imgRef = useRef<HTMLInputElement>(null)

  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [facebookName, setFacebookName] = useState('')
  const [facebookUrl, setFacebookUrl] = useState('')
  const [description, setDescription] = useState('')
  const [announcement, setAnnouncement] = useState('')
  const [profileImage, setProfileImage] = useState('')
  const [links, setLinks] = useState<LinkEntry[]>([])

  useEffect(() => {
    adminFetch('/api/admin/site-profile')
      .then((r) => r.json())
      .then((data: SiteProfile) => {
        setDisplayName(data.displayName ?? '')
        setEmail(data.email ?? '')
        setFacebookName(data.facebookName ?? '')
        setFacebookUrl(data.facebookUrl ?? '')
        setDescription(data.description ?? '')
        setAnnouncement(data.announcement ?? '')
        setProfileImage(data.profileImage ?? '')
        setLinks(Array.isArray(data.links) ? data.links : [])
      })
      .catch(() => setToast({ type: 'error', msg: 'โหลดข้อมูลไม่สำเร็จ' }))
      .finally(() => setLoading(false))
  }, [])

  function showToast(type: 'success' | 'error', msg: string) {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 4000)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await adminFetch('/api/admin/site-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName,
          email,
          facebookName,
          facebookUrl,
          description,
          announcement,
          profileImage: profileImage || null,
          links,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        showToast('error', err.error ?? 'บันทึกไม่สำเร็จ')
      } else {
        showToast('success', 'บันทึกข้อมูลสำเร็จแล้ว')
      }
    } catch {
      showToast('error', 'เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setSaving(false)
    }
  }

  async function handleImgFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const b64 = await fileToBase64(file)
    setProfileImage(b64)
  }

  function addLink() {
    setLinks([...links, { label: '', url: '' }])
  }

  function removeLink(idx: number) {
    setLinks(links.filter((_, i) => i !== idx))
  }

  function updateLink(idx: number, field: 'label' | 'url', value: string) {
    setLinks(links.map((l, i) => (i === idx ? { ...l, [field]: value } : l)))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-gray-400 text-sm animate-pulse">กำลังโหลด...</div>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-black text-white mb-1">About Me</h1>
      <p className="text-gray-400 text-sm mb-6">ตั้งค่าโปรไฟล์และข้อมูลเจ้าของเว็บ</p>

      {/* Profile Image */}
      <div className="card-glass rounded-2xl p-4 sm:p-6 mb-6">
        <h2 className="text-lg font-bold text-white mb-4">รูปโปรไฟล์</h2>
        <div
          onClick={() => imgRef.current?.click()}
          className="border-2 border-dashed border-white/20 rounded-xl p-6 text-center cursor-pointer hover:border-purple-500/60 transition-colors"
        >
          {profileImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profileImage}
              alt="Profile preview"
              className="w-32 h-32 rounded-full object-cover border-2 border-purple-500/50 mx-auto"
            />
          ) : (
            <div>
              <span className="material-icons-round text-5xl text-gray-600">add_photo_alternate</span>
              <p className="text-gray-500 text-sm mt-2">คลิกเพื่ออัปโหลดรูปโปรไฟล์</p>
            </div>
          )}
        </div>
        <input ref={imgRef} type="file" accept="image/*" onChange={handleImgFile} className="hidden" />
        {profileImage && (
          <button
            onClick={() => { setProfileImage(''); if (imgRef.current) imgRef.current.value = '' }}
            className="mt-3 text-xs text-red-400 hover:text-red-300 transition"
          >
            ✕ ลบรูปโปรไฟล์
          </button>
        )}
      </div>

      {/* Basic Info */}
      <div className="card-glass rounded-2xl p-4 sm:p-6 mb-6">
        <h2 className="text-lg font-bold text-white mb-4">ข้อมูลพื้นฐาน</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>ชื่อที่แสดง (Display Name)</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="ชื่อเจ้าของเว็บ"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>อีเมล</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@email.com"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>ชื่อ Facebook</label>
            <input
              type="text"
              value={facebookName}
              onChange={(e) => setFacebookName(e.target.value)}
              placeholder="ชื่อ Facebook"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>ลิงก์ Facebook</label>
            <input
              type="url"
              value={facebookUrl}
              onChange={(e) => setFacebookUrl(e.target.value)}
              placeholder="https://facebook.com/..."
              className={inputClass}
            />
          </div>
        </div>

        <div className="mt-4">
          <label className={labelClass}>คำอธิบาย / About</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="เล่าเกี่ยวกับตัวเองและเว็บไซต์..."
            className={inputClass + ' resize-y'}
          />
        </div>

        <div className="mt-4">
          <label className={labelClass}>ประกาศ / Announcement</label>
          <input
            type="text"
            value={announcement}
            onChange={(e) => setAnnouncement(e.target.value)}
            placeholder="ข้อความประกาศที่จะแสดงบนเว็บ"
            className={inputClass}
          />
        </div>
      </div>

      {/* Links */}
      <div className="card-glass rounded-2xl p-4 sm:p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">ลิงก์อื่น ๆ</h2>
          <button
            onClick={addLink}
            className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white bg-white/10 hover:bg-white/20 border border-white/10 transition"
          >
            + เพิ่มลิงก์
          </button>
        </div>

        {links.length === 0 && (
          <p className="text-gray-500 text-sm">ยังไม่มีลิงก์ กด "เพิ่มลิงก์" เพื่อเริ่มต้น</p>
        )}

        <div className="space-y-3">
          {/* มือถือ: [ชื่อลิงก์][✕] แล้ว URL เต็มความกว้างบรรทัดล่าง / sm: แถวเดียวแบบเดิม */}
          {links.map((link, idx) => (
            <div key={idx} className="flex flex-wrap sm:flex-nowrap gap-2 sm:gap-3 items-center pb-3 border-b border-white/5 last:pb-0 last:border-0 sm:pb-0 sm:border-0">
              <input
                type="text"
                value={link.label}
                onChange={(e) => updateLink(idx, 'label', e.target.value)}
                placeholder="ชื่อลิงก์ เช่น YouTube"
                className={inputClass + ' flex-1 min-w-0'}
              />
              <input
                type="url"
                value={link.url}
                onChange={(e) => updateLink(idx, 'url', e.target.value)}
                placeholder="https://..."
                className={inputClass + ' order-3 sm:order-none basis-full sm:basis-auto sm:flex-[2] min-w-0'}
              />
              <button
                onClick={() => removeLink(idx)}
                className="text-red-400 hover:text-red-300 transition text-lg leading-none px-1"
                aria-label="ลบลิงก์นี้"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-90 transition disabled:opacity-50"
        >
          {saving ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
        </button>
        {toast && (
          <span
            className={`text-sm font-medium ${
              toast.type === 'success' ? 'text-green-400' : 'text-red-400'
            }`}
          >
            {toast.type === 'success' ? '✓ ' : '✗ '}
            {toast.msg}
          </span>
        )}
      </div>
    </div>
  )
}
