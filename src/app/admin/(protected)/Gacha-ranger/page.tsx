'use client'

// ====================================================
// Admin Pools Page - จัดการตู้ Gacha
// ====================================================

import { adminFetch } from '@/lib/adminApi'
import { apiFetch } from '@/lib/staticApi'
import { useState, useEffect, useRef } from 'react'

// ─── Types ────────────────────────────────────────
interface RangerEntry {
  name: string; grade: string; rate: number; rangerId?: string
  confetti?: boolean   // สุ่มได้ตัวนี้ → จุดพรุ้กระดาษฉลองในหน้าสุ่มจริง
  special?: boolean    // ไฮไลท์พื้นหลังทอง+ขอบทองในตาราง Ranger Drop Rates (แค่ UI ไม่กระทบเรทจริง)
}
interface GuaranteedEntry { name: string; grade: string; rangerId?: string }

interface PoolSummary {
  id: string
  name: string
  isActive: boolean
  isNew: boolean
  isEvent: boolean
  isTest: boolean
  isFrog: boolean
  rangersCount: number
  imageUrl?: string | null
  createdAt: string
}

// ─── Constants ────────────────────────────────────
const GRADE_COLORS: Record<string, string> = {
  '9star':  'text-yellow-300',
  '8+star': 'text-cyan-300',
  '8#star': 'text-green-400',
  '8star':  'text-purple-400',
  '7+star': 'text-cyan-500',
  '7star':  'text-gray-300',
}
const GRADE_OPTIONS      = ['7star', '7+star', '8star', '8#star', '8+star', '9star']
const GRADE_OPTIONS_FROG = ['7star', '7+star', '8star', '8#star', '8+star', '9star']

// ─── Helpers ──────────────────────────────────────
function gradeImgSrc(grade: string) {
  return `/gacha/images/${grade.replace('#', '%23')}.png`
}
function rangerImgUrl(rangerId?: string): string | null {
  return rangerId ? `https://rangers.lerico.net/res/${rangerId}/${rangerId}-thum.png` : null
}

/** ดาวที่ดึงมาอัตโนมัติอาจเป็นค่าที่ไม่อยู่ในลิสต์ (เช่น 6star ของตัวเก่าๆ)
 *  ถ้าไม่ใส่เข้าไปใน <select> ด้วย ค่าที่โชว์จะเพี้ยนไปเป็นตัวแรกของลิสต์ทันทีที่กดแก้ */
function gradeOptionsFor(current: string, frog: boolean): string[] {
  const base = frog ? GRADE_OPTIONS_FROG : GRADE_OPTIONS
  return current && !base.includes(current) ? [current, ...base] : base
}

/** grade + evolution จาก ranger book → ชื่อไฟล์ดาวที่หน้ากาชาใช้
 *  (กฎเดียวกับ tierIconKey ใน lib/rangerData — hyper = #, ultra = +) */
function starFromBook(grade: number | null, evolution: string | null): string {
  if (!grade) return ''
  if (evolution === 'hyper') return `${grade}#star`
  if (evolution === 'ultra') return `${grade}+star`
  return `${grade}star`
}

// รับได้ทั้ง {"ชื่อ","เรท"} (ดาวดึงให้เอง) และ {"ชื่อ","ดาว","เรท"} (ระบุดาวเองแบบเดิม)
// แกะด้วยการเก็บทุกค่าที่อยู่ในเครื่องหมายคำพูด แล้วดูจำนวน — ทนกับช่องว่างและคอมมาท้ายบรรทัด
function parseTextInput(raw: string): { parsed: RangerEntry[]; errors: string[] } {
  const parsed: RangerEntry[] = []
  const errors: string[] = []
  raw.split('\n').forEach((line, idx) => {
    const t = line.trim().replace(/[,.]$/, '')
    if (!t) return
    const inner = t.match(/^\{(.*)\}$/)
    const fields = inner ? [...inner[1].matchAll(/"([^"]*)"/g)].map(m => m[1].trim()) : []
    if (fields.length !== 2 && fields.length !== 3) {
      errors.push(`บรรทัด ${idx + 1}: รูปแบบไม่ถูกต้อง → ${line}`); return
    }
    const name = fields[0]
    const grade = fields.length === 3 ? fields[1] : ''
    const rateRaw = fields[fields.length - 1]
    const rate = parseFloat(rateRaw)
    if (!name) { errors.push(`บรรทัด ${idx + 1}: ไม่มีชื่อ Ranger → ${line}`); return }
    if (isNaN(rate)) { errors.push(`บรรทัด ${idx + 1}: เรทไม่ใช่ตัวเลข → "${rateRaw}"`); return }
    parsed.push({ name, grade, rate })
  })
  return { parsed, errors }
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = reject
    r.readAsDataURL(file)
  })
}

// ─── Main Component ───────────────────────────────
export default function AdminPoolsPage() {
  const [view, setView] = useState<'list' | 'add' | 'edit'>('list')
  const [poolMode, setPoolMode] = useState<'normal' | 'frog'>('normal')
  const [editPoolId, setEditPoolId] = useState<string | null>(null)

  // List state
  const [pools, setPools] = useState<PoolSummary[]>([])
  const [loadingPools, setLoadingPools] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Drag-and-drop state
  const dragIndexRef = useRef<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  // Form state
  const [poolName, setPoolName] = useState('')
  const [bannerFile, setBannerFile] = useState<File | null>(null)
  const [bannerPreview, setBannerPreview] = useState('')
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null)
  const [textInput, setTextInput] = useState('')
  const [textErrors, setTextErrors] = useState<string[]>([])
  const [results, setResults] = useState<RangerEntry[] | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editingRow, setEditingRow] = useState<RangerEntry>({ name: '', grade: '8star', rate: 0, rangerId: '' })

  // Guaranteed Rangers state
  const [guaranteedRangers, setGuaranteedRangers] = useState<GuaranteedEntry[]>([])
  const [editingGuarIdx, setEditingGuarIdx] = useState<number | null>(null)
  const [editingGuarRow, setEditingGuarRow] = useState<GuaranteedEntry>({ name: '', grade: '8star', rangerId: '' })

  const [badge, setBadge] = useState<'none' | 'new' | 'event'>('none')
  const [isTest, setIsTest] = useState(false)
  const [copied, setCopied] = useState(false)
  const [guarText, setGuarText] = useState('')
  const [guarCopied, setGuarCopied] = useState(false)

  const bannerRef = useRef<HTMLInputElement>(null)

  // ─── Drag & Drop ──────────────────────────────────
  function handleDragStart(i: number) {
    dragIndexRef.current = i
  }
  function handleDragOver(e: React.DragEvent, i: number) {
    e.preventDefault()
    setDragOverIndex(i)
  }
  function handleDrop(i: number) {
    const from = dragIndexRef.current
    dragIndexRef.current = null
    setDragOverIndex(null)
    if (from === null || from === i) return
    const newPools = [...pools]
    const [moved] = newPools.splice(from, 1)
    newPools.splice(i, 0, moved)
    setPools(newPools)
    adminFetch('/api/admin/gacha/pools/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: newPools.map(p => p.id) }),
    })
  }
  function handleDragEnd() {
    dragIndexRef.current = null
    setDragOverIndex(null)
  }

  // โหลด list เมื่อเข้าหน้า list
  useEffect(() => {
    if (view === 'list') fetchPools()
  }, [view])

  async function fetchPools() {
    setLoadingPools(true)
    try {
      const res = await adminFetch('/api/admin/gacha/pools')
      const data = await res.json()
      setPools(data.pools ?? [])
    } catch { /* silent */ }
    finally { setLoadingPools(false) }
  }

  async function startEdit(pool: PoolSummary) {
    setEditPoolId(pool.id)
    setPoolName(pool.name)
    setResults(null)
    setBannerPreview('')
    setExistingImageUrl(null)
    setBannerFile(null)
    setEditingIdx(null)
    setError('')
    setView('edit')

    try {
      const res = await adminFetch(`/api/admin/gacha/pools/${pool.id}`)
      const data = await res.json()
      setPoolName(data.name ?? pool.name)
      setExistingImageUrl(data.imageUrl ?? null)
      setBannerPreview(data.imageUrl ?? '')
      setResults(Array.isArray(data.rangers) ? data.rangers : [])
      setGuaranteedRangers(Array.isArray(data.guaranteedRangers) ? data.guaranteedRangers : [])
      setBadge(data.isEvent ? 'event' : data.isNew ? 'new' : 'none')
      setIsTest(data.isTest ?? false)
      setPoolMode(data.isFrog ? 'frog' : 'normal')
    } catch {
      setError('โหลดข้อมูลตู้กาชาไม่สำเร็จ')
    }
  }

  async function deletePool(id: string) {
    try {
      await adminFetch(`/api/admin/gacha/pools/${id}`, { method: 'DELETE' })
      setPools(prev => prev.filter(p => p.id !== id))
    } catch { /* ignore */ }
    setConfirmDeleteId(null)
  }

  // สลับธงจากการ์ดในหน้าลิสต์ได้เลย ไม่ต้องเข้าฟอร์มแก้ไข
  // ตู้ใหม่กับตู้อีเว้นท์เป็นอันเดียวกันไม่ได้ (ฟอร์มแก้ไขก็เลือกได้อย่างเดียว) เปิดอันหนึ่งจึงปิดอีกอัน
  async function toggleFlag(pool: PoolSummary, flag: 'isNew' | 'isEvent' | 'isTest') {
    const next: Partial<PoolSummary> = { [flag]: !pool[flag] }
    if (flag === 'isNew' && !pool.isNew) next.isEvent = false
    if (flag === 'isEvent' && !pool.isEvent) next.isNew = false

    const before = { isNew: pool.isNew, isEvent: pool.isEvent, isTest: pool.isTest }
    setPools(prev => prev.map(p => p.id === pool.id ? { ...p, ...next } : p))
    try {
      const res = await adminFetch(`/api/admin/gacha/pools/${pool.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      })
      if (!res.ok) throw new Error('patch failed')
    } catch {
      setPools(prev => prev.map(p => p.id === pool.id ? { ...p, ...before } : p))
    }
  }

  async function toggleActive(id: string, current: boolean) {
    setPools(prev => prev.map(p => p.id === id ? { ...p, isActive: !current } : p))
    try {
      await adminFetch(`/api/admin/gacha/pools/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !current }),
      })
    } catch {
      setPools(prev => prev.map(p => p.id === id ? { ...p, isActive: current } : p))
    }
  }

  async function save() {
    if (!poolName.trim()) { setError('กรุณาใส่ชื่อตู้กาชา'); return }
    if (!results || results.length === 0) { setError('กรุณาเพิ่มข้อมูลอัตราสุ่มก่อนบันทึก'); return }
    setSaving(true)
    setError('')
    try {
      let imageUrl = existingImageUrl
      if (bannerFile) imageUrl = await fileToBase64(bannerFile)

      const body = { name: poolName.trim(), imageUrl, rangers: results, guaranteedRangers, isActive: true, isNew: badge === 'new', isEvent: badge === 'event', isTest, isFrog: poolMode === 'frog' }
      const url = editPoolId ? `/api/admin/gacha/pools/${editPoolId}` : '/api/admin/gacha/pools'
      const method = editPoolId ? 'PUT' : 'POST'

      const res = await adminFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? 'บันทึกไม่สำเร็จ') }

      setView('list')
      resetForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
    } finally {
      setSaving(false)
    }
  }

  function resetForm() {
    setPoolName(''); setBannerFile(null); setBannerPreview(''); setExistingImageUrl(null)
    setResults(null); setError('')
    setTextInput(''); setTextErrors([]); setEditingIdx(null); setEditPoolId(null)
    setGuaranteedRangers([]); setEditingGuarIdx(null); setBadge('none'); setCopied(false); setPoolMode('normal'); setGuarText('')
  }

  function handleBanner(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setBannerFile(file); setBannerPreview(URL.createObjectURL(file)); setExistingImageUrl(null)
  }

  function parseText() {
    const { parsed, errors } = parseTextInput(textInput)
    setTextErrors(errors)
    if (parsed.length > 0) { setResults(parsed); setEditingIdx(null) }
  }

  function startRowEdit(i: number) { setEditingIdx(i); setEditingRow({ ...results![i] }) }
  function saveRowEdit() {
    if (editingIdx === null || !results) return
    const updated = [...results]
    updated[editingIdx] = { ...editingRow, rate: Number(editingRow.rate) }
    setResults(updated); setEditingIdx(null)
  }
  function cancelRowEdit() { setEditingIdx(null) }
  function deleteRow(i: number) {
    if (!results) return
    setResults(results.filter((_, idx) => idx !== i))
    if (editingIdx === i) setEditingIdx(null)
  }
  function addRow() {
    const newRow: RangerEntry = { name: 'ชื่อ Ranger', grade: '8star', rate: 0, rangerId: '' }
    const updated = [...(results ?? []), newRow]
    setResults(updated); setEditingIdx(updated.length - 1); setEditingRow(newRow)
  }

  // ─── Lookup: ชื่อ → id → ดาว ────────────────────
  // โหลดสองอย่างพร้อมกันครั้งเดียวแล้วเก็บไว้ใน ref:
  //   • /api/lerico/ranger-names → ชื่อ EN → id
  //   • /api/ranger-book         → id → grade + evolution → ดาว
  // ทำให้วาง text ได้แค่ {"ชื่อ","เรท"} ไม่ต้องพิมพ์ดาวเองทุกบรรทัดอีก
  // (ทั้งสองเส้นเป็นแคช Redis/CDN อยู่แล้ว เปิดฟอร์มทีเดียวไม่ไปแตะ DB)
  const lookupRef = useRef<{ nameToId: Map<string, string>; starById: Map<string, string> } | null>(null)

  async function ensureLookup() {
    if (lookupRef.current) return lookupRef.current
    const nameToId = new Map<string, string>()
    const starById = new Map<string, string>()
    const [namesRes, bookRes] = await Promise.allSettled([
      apiFetch('/api/lerico/ranger-names'),
      apiFetch('/api/ranger-book'),
    ])
    try {
      if (namesRes.status === 'fulfilled' && namesRes.value.ok) {
        const data = await namesRes.value.json() as Record<string, Record<string, string>>
        const unitData = data['en:UNIT'] ?? {}
        for (const [key, value] of Object.entries(unitData)) {
          if (key.endsWith('_nm') && typeof value === 'string') {
            nameToId.set(value.toLowerCase().trim(), key.slice(0, -3))
          }
        }
      }
    } catch { /* fallback: rangerId จะว่าง */ }
    try {
      if (bookRes.status === 'fulfilled' && bookRes.value.ok) {
        const data = await bookRes.value.json() as { rangers?: Array<{ id: string; name: string; grade: number | null; evolution: string | null }> }
        for (const r of data.rangers ?? []) {
          const star = starFromBook(r.grade, r.evolution)
          if (star) starById.set(r.id, star)
          // เผื่อชื่อที่ไม่มีใน translate map (ranger book มีชื่อของตัวเองอยู่แล้ว)
          if (r.name && !nameToId.has(r.name.toLowerCase().trim())) {
            nameToId.set(r.name.toLowerCase().trim(), r.id)
          }
        }
      }
    } catch { /* fallback: ดาวจะว่าง ให้แก้ในตารางเอา */ }
    lookupRef.current = { nameToId, starById }
    return lookupRef.current
  }

  // ─── Parse + Lookup Ranger IDs ─────────────────
  async function parseAndLookupIds() {
    setTextErrors([])
    const { parsed, errors } = parseTextInput(textInput)
    setTextErrors(errors)
    if (parsed.length === 0) return

    const { nameToId, starById } = await ensureLookup()
    const missingStar: string[] = []

    const rangers: RangerEntry[] = parsed.map(entry => {
      const rangerId = nameToId.get(entry.name.toLowerCase().trim()) ?? ''
      // ดาวที่พิมพ์มาเองมาก่อนเสมอ — ไม่งั้นตู้ที่จงใจใส่ดาวไม่ตรงของจริงจะถูกเขียนทับ
      const grade = entry.grade || starById.get(rangerId) || ''
      if (!grade) missingStar.push(entry.name)
      return { ...entry, grade: grade || '8star', rangerId }
    })

    if (missingStar.length > 0) {
      setTextErrors([...errors, `หาดาวไม่เจอ ${missingStar.length} ตัว (ใส่ 8star ไว้ก่อน แก้ในตารางได้): ${missingStar.join(', ')}`])
    }
    setResults(rangers)
    setEditingIdx(null)
  }

  // เติมดาวใหม่ให้ทุกแถวจาก ranger book — ใช้กับตู้เก่าที่ดาวค้างผิดอยู่
  async function refillStars() {
    if (!results) return
    const { nameToId, starById } = await ensureLookup()
    setResults(results.map(r => {
      const rangerId = r.rangerId || nameToId.get(r.name.toLowerCase().trim()) || ''
      return { ...r, rangerId, grade: starById.get(rangerId) || r.grade }
    }))
    setEditingIdx(null)
  }

  // ─── Guaranteed Rangers Text Import ────────────
  // รับได้ทั้ง {"ชื่อ"} (ดาวดึงให้เอง) และ {"ชื่อ","ดาว"} (ระบุดาวเองแบบเดิม)
  async function parseGuarText() {
    const rows: Array<{ name: string; grade: string }> = []
    guarText.split('\n').forEach(line => {
      const t = line.trim().replace(/[,.]$/, '')
      if (!t) return
      const inner = t.match(/^\{(.*)\}$/)
      if (!inner) return
      const fields = [...inner[1].matchAll(/"([^"]*)"/g)].map(m => m[1].trim())
      if (fields.length === 0 || !fields[0]) return
      rows.push({ name: fields[0], grade: fields[1] ?? '' })
    })
    if (rows.length === 0) return

    const { nameToId, starById } = await ensureLookup()

    const rangers: GuaranteedEntry[] = rows.map(entry => {
      const rangerId = nameToId.get(entry.name.toLowerCase().trim()) ?? ''
      return {
        name: entry.name,
        grade: entry.grade || starById.get(rangerId) || '8star',
        rangerId,
      }
    })
    setGuaranteedRangers(rangers)
    setGuarText('')
  }

  // ─── Guaranteed Rangers CRUD ───────────────────
  function startGuarEdit(i: number) { setEditingGuarIdx(i); setEditingGuarRow({ ...guaranteedRangers[i] }) }
  function saveGuarEdit() {
    if (editingGuarIdx === null) return
    const updated = [...guaranteedRangers]
    updated[editingGuarIdx] = { ...editingGuarRow }
    setGuaranteedRangers(updated); setEditingGuarIdx(null)
  }
  function cancelGuarEdit() { setEditingGuarIdx(null) }
  function deleteGuarRow(i: number) {
    setGuaranteedRangers(guaranteedRangers.filter((_, idx) => idx !== i))
    if (editingGuarIdx === i) setEditingGuarIdx(null)
  }
  function addGuarRow() {
    const newRow: GuaranteedEntry = { name: 'ชื่อ Ranger การันตี', grade: '8star', rangerId: '' }
    const updated = [...guaranteedRangers, newRow]
    setGuaranteedRangers(updated); setEditingGuarIdx(updated.length - 1); setEditingGuarRow(newRow)
  }

  // ─────────────────────────────────────────────────
  // LIST VIEW
  // ─────────────────────────────────────────────────
  if (view === 'list') {
    return (
      <div>
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-black text-white mb-1">จัดการ Gacha Pool</h1>
            <p className="text-gray-400 text-sm">สร้าง แก้ไข หรือเปิด/ปิดตู้กาชา</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { resetForm(); setPoolMode('normal'); setView('add') }}
              className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-semibold rounded-xl transition-all flex items-center gap-2"
            >
              <span className="material-icons-round text-sm">add</span>
              เพิ่มตู้กาชา
            </button>
            <button
              onClick={() => { resetForm(); setPoolMode('frog'); setView('add') }}
              className="px-5 py-2.5 bg-gradient-to-r from-green-700 to-teal-700 hover:from-green-600 hover:to-teal-600 text-white font-semibold rounded-xl transition-all flex items-center gap-2"
            >
              <span className="material-icons-round text-sm">add</span>
              ตู้กาชากบ
            </button>
          </div>
        </div>

        {loadingPools ? (
          <div className="card-glass p-12 text-center">
            <span className="material-icons-round text-5xl text-gray-600 animate-spin">refresh</span>
            <p className="text-gray-500 mt-4">กำลังโหลด...</p>
          </div>
        ) : pools.length === 0 ? (
          <div className="card-glass p-12 text-center">
            <span className="material-icons-round text-7xl text-gray-700">casino</span>
            <p className="text-gray-500 mt-4">ยังไม่มีตู้กาชา</p>
            <p className="text-gray-600 text-sm mt-1">กด &quot;เพิ่มตู้กาชา&quot; เพื่อเริ่มสร้าง</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {pools.map((pool, i) => (
              <div
                key={pool.id}
                draggable
                onDragStart={() => handleDragStart(i)}
                onDragOver={(e) => handleDragOver(e, i)}
                onDrop={() => handleDrop(i)}
                onDragEnd={handleDragEnd}
                className={`card-glass rounded-2xl overflow-hidden flex flex-col transition-all duration-150 select-none ${dragOverIndex === i ? 'ring-2 ring-purple-400 scale-[1.02] shadow-lg shadow-purple-500/20' : ''}`}
              >
                {/* Banner / Header */}
                <div className="h-36 relative overflow-hidden bg-gradient-to-br from-purple-900/60 to-pink-900/60 flex items-center justify-center">
                  {pool.imageUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={pool.imageUrl}
                      alt={pool.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="material-icons-round text-6xl text-white/10">casino</span>
                  )}
                  {/* Drag handle */}
                  <div className="absolute top-0 left-0 right-0 flex justify-center pt-1.5 cursor-grab active:cursor-grabbing">
                    <span className="material-icons-round text-white/70 bg-black/40 rounded-full px-2 text-base select-none backdrop-blur-sm">
                      drag_indicator
                    </span>
                  </div>
                  {/* Badge เปิด/ปิด ทับบนรูป */}
                  <span className={`absolute top-2.5 right-2.5 px-2.5 py-1 rounded-full text-xs font-bold backdrop-blur-sm ${pool.isActive ? 'bg-green-500/40 text-green-200 border border-green-400/50' : 'bg-gray-800/70 text-gray-400 border border-gray-600/50'}`}>
                    {pool.isActive ? '● เปิด' : '○ ปิด'}
                  </span>
                  {/* Badge ทดสอบ */}
                  {pool.isTest && (
                    <span className="absolute top-9 right-2.5 px-2.5 py-1 rounded-full text-xs font-bold backdrop-blur-sm bg-orange-500/40 text-orange-200 border border-orange-400/50">
                      ● ทดสอบ
                    </span>
                  )}
                  {/* ป้าย NEW / EVENT — รูปและตำแหน่งชุดเดียวกับหน้าสาธารณะ จะได้เห็นสถานะจริงตั้งแต่ในแอดมิน */}
                  {(pool.isNew || pool.isEvent) && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={pool.isEvent ? '/gacha/images/gacha_event.png' : '/gacha/images/gacha_new.png'}
                      alt={pool.isEvent ? 'EVENT' : 'NEW'}
                      className="absolute object-contain pointer-events-none"
                      style={{ top: '-6px', left: '-2px', width: '6rem', height: '6rem' }}
                    />
                  )}
                </div>

                <div className="p-4 flex-1 flex flex-col">
                  <h3 className="text-white font-bold text-sm leading-tight mb-1">{pool.name}</h3>
                  <p className="text-gray-500 text-xs mb-4">
                    <span className="material-icons-round text-xs align-middle mr-1">people</span>
                    {pool.rangersCount.toLocaleString()} Ranger
                  </p>

                  {/* สลับธงได้จากตรงนี้เลย ของเดิมต้องเข้าไปกดในฟอร์มแก้ไข (ยังกดที่นั่นได้เหมือนเดิม) */}
                  <div className="flex gap-1.5 mb-2">
                    <button
                      onClick={() => toggleFlag(pool, 'isTest')}
                      className={`flex-1 py-1.5 text-[11px] rounded-lg border transition-colors flex items-center justify-center gap-1 ${pool.isTest ? 'bg-orange-500/30 border-orange-500/50 text-orange-300' : 'bg-white/5 border-white/10 text-gray-500 hover:bg-white/10'}`}
                    >
                      <span className="material-icons-round text-[13px]">{pool.isTest ? 'science' : 'radio_button_unchecked'}</span>
                      Test
                    </button>
                    <button
                      onClick={() => toggleFlag(pool, 'isNew')}
                      className={`flex-1 py-1.5 text-[11px] rounded-lg border transition-colors flex items-center justify-center gap-1 ${pool.isNew ? 'bg-red-500/30 border-red-500/50 text-red-300' : 'bg-white/5 border-white/10 text-gray-500 hover:bg-white/10'}`}
                    >
                      <span className="material-icons-round text-[13px]">{pool.isNew ? 'fiber_new' : 'radio_button_unchecked'}</span>
                      ใหม่
                    </button>
                    <button
                      onClick={() => toggleFlag(pool, 'isEvent')}
                      className={`flex-1 py-1.5 text-[11px] rounded-lg border transition-colors flex items-center justify-center gap-1 ${pool.isEvent ? 'bg-yellow-500/30 border-yellow-500/50 text-yellow-300' : 'bg-white/5 border-white/10 text-gray-500 hover:bg-white/10'}`}
                    >
                      <span className="material-icons-round text-[13px]">{pool.isEvent ? 'celebration' : 'radio_button_unchecked'}</span>
                      อีเว้นท์
                    </button>
                  </div>

                  {/* ลองสุ่มได้ก่อนเปิดให้คนทั่วไป — ตู้ที่ยังปิดอยู่ก็เข้าได้ถ้าล็อกอินแอดมินอยู่ */}
                  <a
                    href={`/gacha-ranger/${pool.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-2 mb-2 text-xs bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 rounded-lg transition-colors flex items-center justify-center gap-1 font-medium"
                  >
                    <span className="material-icons-round text-sm">casino</span>ลองสุ่ม
                  </a>

                  <div className="flex gap-2 mt-auto">
                    <button
                      onClick={() => startEdit(pool)}
                      className="flex-1 py-2 text-xs bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded-lg transition-colors flex items-center justify-center gap-1 font-medium"
                    >
                      <span className="material-icons-round text-sm">edit</span>แก้ไข
                    </button>
                    <button
                      onClick={() => toggleActive(pool.id, pool.isActive)}
                      className={`flex-1 py-2 text-xs rounded-lg transition-colors flex items-center justify-center gap-1 font-medium ${pool.isActive ? 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30' : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'}`}
                    >
                      <span className="material-icons-round text-sm">{pool.isActive ? 'visibility_off' : 'visibility'}</span>
                      {pool.isActive ? 'ปิด' : 'เปิด'}
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(pool.id)}
                      className="py-2 px-2.5 text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg transition-colors"
                    >
                      <span className="material-icons-round text-sm">delete</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Delete confirm modal */}
        {confirmDeleteId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setConfirmDeleteId(null)} />
            <div className="relative z-10 card-glass p-7 rounded-2xl max-w-xs w-full text-center shadow-2xl border border-red-500/30">
              <span className="material-icons-round text-red-400 text-5xl mb-3 block">warning</span>
              <h2 className="text-white font-bold mb-2">ลบตู้กาชานี้?</h2>
              <p className="text-gray-400 text-sm mb-6">ข้อมูลทั้งหมดจะถูกลบถาวร ไม่สามารถกู้คืนได้</p>
              <div className="flex gap-3">
                <button onClick={() => setConfirmDeleteId(null)} className="flex-1 py-2.5 bg-white/10 text-gray-300 rounded-xl hover:bg-white/20 transition-colors text-sm">ยกเลิก</button>
                <button onClick={() => deletePool(confirmDeleteId)} className="flex-1 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-500 transition-colors text-sm font-semibold">ลบ</button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ─────────────────────────────────────────────────
  // ADD / EDIT FORM VIEW
  // ─────────────────────────────────────────────────
  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={() => { setView('list'); resetForm() }}
          className="text-gray-400 hover:text-white transition-colors flex items-center gap-1"
        >
          <span className="material-icons-round text-sm">arrow_back</span>กลับ
        </button>
        <h1 className="text-3xl font-black text-white">
          {view === 'edit' ? 'แก้ไขตู้กาชา' : poolMode === 'frog' ? 'เพิ่มตู้กาชากบใหม่' : 'เพิ่มตู้กาชาใหม่'}
        </h1>
        <button
          onClick={save}
          disabled={saving}
          className="ml-auto px-5 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-green-900/30"
        >
          {saving
            ? <><span className="material-icons-round animate-spin text-sm">refresh</span>กำลังบันทึก...</>
            : <><span className="material-icons-round text-sm">save</span>{view === 'edit' ? 'บันทึกการแก้ไข' : 'บันทึกตู้กาชา'}</>}
        </button>
      </div>

      <div className="space-y-6">

        {/* ① ชื่อ */}
        <div className="card-glass p-6">
          <label className="block text-sm text-gray-400 mb-2">① ชื่อตู้กาชา</label>
          <input
            type="text"
            value={poolName}
            onChange={e => setPoolName(e.target.value)}
            placeholder="เช่น Ultra Rare Gacha Vol.1"
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 transition-colors"
          />
        </div>

        {/* ② Banner */}
        <div className="card-glass p-6">
          <label className="block text-sm text-gray-400 mb-3">② รูป Banner ตู้กาชา</label>
          <div
            onClick={() => bannerRef.current?.click()}
            className="border-2 border-dashed border-white/20 rounded-xl p-6 text-center cursor-pointer hover:border-purple-500/60 transition-colors"
          >
            {bannerPreview ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={bannerPreview} alt="banner" className="max-h-44 mx-auto rounded-lg object-contain" />
            ) : (
              <div>
                <span className="material-icons-round text-5xl text-gray-600">add_photo_alternate</span>
                <p className="text-gray-500 text-sm mt-2">คลิกเพื่ออัปโหลดรูป Banner</p>
              </div>
            )}
          </div>
          <input ref={bannerRef} type="file" accept="image/*" onChange={handleBanner} className="hidden" />
        </div>

        {/* ③ อัตราสุ่ม */}
        <div className="card-glass p-6">
          <label className="block text-sm text-gray-400 mb-3">③ ข้อมูลอัตราสุ่ม</label>

          <div className="space-y-3">
            <div className="bg-white/5 rounded-xl px-4 py-3 border border-white/10">
              <p className="text-xs text-gray-500 mb-1">รูปแบบ (แต่ละบรรทัด):</p>
              <code className="text-xs text-cyan-400 font-mono">{`{"ชื่อ Ranger","เรท"},`}</code>
              <p className="text-xs text-gray-600 mt-1.5">ระดับดาวดึงจาก Ranger Book ให้เองจากชื่อ → id ไม่ต้องพิมพ์</p>
              <p className="text-xs text-gray-600 mt-0.5">อยากกำหนดดาวเองก็ใส่ตรงกลางได้เหมือนเดิม: <code className="text-cyan-600 font-mono">{`{"ชื่อ","ดาว","เรท"}`}</code> หรือแก้ในตารางข้างล่าง</p>
            </div>
            <textarea
              value={textInput}
              onChange={e => setTextInput(e.target.value)}
              placeholder={`{"Fighter Simon","0.12"},\n{"Kickboxer Simon","0.02"},`}
              rows={10}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-700 font-mono text-sm focus:outline-none focus:border-blue-500 transition-colors resize-y"
            />
            {textErrors.length > 0 && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 space-y-1">
                {textErrors.map((e, i) => <p key={i} className="text-red-400 text-xs">{e}</p>)}
              </div>
            )}
            <button
              onClick={parseAndLookupIds} disabled={!textInput.trim()}
              className="w-full py-3 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
            >
              <span className="material-icons-round text-sm">manage_search</span>สร้างตารางและค้นหา Ranger ID + ดาว
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="card-glass p-4 border border-red-500/30 bg-red-500/10 flex items-center gap-2 rounded-xl">
            <span className="material-icons-round text-red-400">warning</span>
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* ─── เรนเจอร์การันตี (Pity) ─── */}
        {poolMode !== 'frog' && (<div className="card-glass p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="material-icons-round text-yellow-400">stars</span>
              <h3 className="text-white font-bold text-lg">
                จัดการเรนเจอร์การันตี
                <span className="text-gray-400 font-normal text-sm ml-2">{guaranteedRangers.length} รายการ</span>
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const text = guaranteedRangers.map(r => `{"${r.name}","${r.grade}"}`).join('\n')
                  navigator.clipboard.writeText(text).then(() => { setGuarCopied(true); setTimeout(() => setGuarCopied(false), 2000) })
                }}
                disabled={guaranteedRangers.length === 0}
                className="px-3 py-1.5 text-xs bg-blue-500/20 border border-blue-500/30 text-blue-400 rounded-lg hover:bg-blue-500/30 disabled:opacity-40 transition-colors flex items-center gap-1"
              >
                <span className="material-icons-round text-sm">{guarCopied ? 'check' : 'content_copy'}</span>
                {guarCopied ? 'คัดลอกแล้ว!' : 'คัดลอก'}
              </button>
              <button onClick={addGuarRow} className="px-3 py-1.5 text-xs bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 rounded-lg hover:bg-yellow-500/30 transition-colors flex items-center gap-1">
                <span className="material-icons-round text-sm">add</span>เพิ่มแถว
              </button>
            </div>
          </div>

          {/* Text import */}
          <div className="mb-4 space-y-2">
            <div className="bg-white/5 rounded-xl px-4 py-2 border border-white/10">
              <p className="text-xs text-gray-500">วางข้อมูลเพื่อเพิ่มทีเดียว: <code className="text-cyan-400 font-mono">{`{"ชื่อ Ranger"},`}</code> <span className="text-gray-600">— ดาวดึงให้เอง หรือใส่เองก็ได้ <code className="text-cyan-600 font-mono">{`{"ชื่อ","ดาว"}`}</code></span></p>
            </div>
            <div className="flex gap-2">
              <textarea
                value={guarText} onChange={e => setGuarText(e.target.value)}
                placeholder={`{"Ultra Simon"},\n{"Hyper Simon"},`}
                rows={8}
                className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-700 font-mono text-xs focus:outline-none focus:border-yellow-500 transition-colors resize-y"
              />
              <button
                onClick={parseGuarText} disabled={!guarText.trim()}
                className="px-3 py-2 bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 disabled:opacity-40 text-white font-semibold rounded-xl text-xs flex items-center gap-1 self-stretch"
              >
                <span className="material-icons-round text-sm">playlist_add</span>นำเข้า
              </button>
            </div>
          </div>

          {guaranteedRangers.length === 0 ? (
            <div className="text-center py-8 text-gray-600 text-sm">ยังไม่มีเรนเจอร์การันตี — กด &quot;เพิ่มแถว&quot; หรือวาง text code ด้านบน</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10 text-left">
                    <th className="pb-3 text-gray-400 text-xs font-medium w-8">#</th>
                    <th className="pb-3 text-gray-400 text-xs font-medium w-12">รูป</th>
                    <th className="pb-3 text-gray-400 text-xs font-medium">ชื่อ Ranger</th>
                    <th className="pb-3 text-gray-400 text-xs font-medium">Ranger ID</th>
                    <th className="pb-3 text-gray-400 text-xs font-medium text-center">ระดับ</th>
                    <th className="pb-3 text-gray-400 text-xs font-medium text-center w-20">จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {guaranteedRangers.map((r, i) =>
                    editingGuarIdx === i ? (
                      <tr key={i} className="border-b border-white/10 bg-white/5">
                        <td className="py-2 text-xs text-gray-600">{i + 1}</td>
                        <td className="py-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={rangerImgUrl(editingGuarRow.rangerId) ?? ''} alt=""
                            className="h-10 w-10 object-contain rounded bg-white/5"
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                            style={{ display: editingGuarRow.rangerId ? 'block' : 'none' }} />
                        </td>
                        <td className="py-2 pr-2">
                          <div className="flex flex-col gap-1">
                            <input value={editingGuarRow.name} onChange={e => setEditingGuarRow({ ...editingGuarRow, name: e.target.value })}
                              placeholder="ชื่อ Ranger"
                              className="w-full px-2 py-1 bg-white/10 border border-yellow-500/50 rounded-lg text-white text-sm focus:outline-none" />
                            <input value={editingGuarRow.rangerId ?? ''} onChange={e => setEditingGuarRow({ ...editingGuarRow, rangerId: e.target.value })}
                              placeholder="Ranger ID เช่น u093e-honey"
                              className="w-full px-2 py-1 bg-white/10 border border-green-500/30 rounded-lg text-green-400 text-xs font-mono focus:outline-none" />
                          </div>
                        </td>
                        <td className="py-2 px-2">
                          <select value={editingGuarRow.grade} onChange={e => setEditingGuarRow({ ...editingGuarRow, grade: e.target.value })}
                            className="w-full px-2 py-1 bg-gray-900 border border-yellow-500/50 rounded-lg text-white text-xs focus:outline-none">
                            {gradeOptionsFor(editingGuarRow.grade, false).map(g => <option key={g} value={g}>{g}</option>)}
                          </select>
                        </td>
                        <td className="py-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={saveGuarEdit} className="text-green-400 hover:text-green-300"><span className="material-icons-round text-base">check</span></button>
                            <button onClick={cancelGuarEdit} className="text-gray-500 hover:text-gray-300"><span className="material-icons-round text-base">close</span></button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={i} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                        <td className="py-2 text-xs text-gray-600">{i + 1}</td>
                        <td className="py-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={rangerImgUrl(r.rangerId) ?? ''} alt={r.name}
                            className="h-10 w-10 object-contain rounded bg-white/5"
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                        </td>
                        <td className="py-2 text-white text-sm">{r.name}</td>
                        <td className="py-2 text-xs font-mono text-green-400">{r.rangerId ?? ''}</td>
                        <td className={`py-2 text-center text-xs font-semibold ${GRADE_COLORS[r.grade] ?? 'text-gray-400'}`}>{r.grade}</td>
                        <td className="py-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => startGuarEdit(i)} className="text-blue-400 hover:text-blue-300"><span className="material-icons-round text-base">edit</span></button>
                            <button onClick={() => deleteGuarRow(i)} className="text-red-400 hover:text-red-300"><span className="material-icons-round text-base">delete</span></button>
                          </div>
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>)}

        {/* ─── ตารางผลลัพธ์ (แก้ไขได้) ─── */}
        {results && (
          <div className="card-glass p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <span className="material-icons-round text-green-400">check_circle</span>
                <h3 className="text-white font-bold text-lg">
                  ข้อมูลอัตราสุ่ม
                  <span className="text-gray-400 font-normal text-sm ml-2">{results.length} รายการ</span>
                </h3>
              </div>
              <div className="flex items-center gap-2">
                {/* ── ปุ่มคัดลอกตาราง ── */}
                <button
                  onClick={() => {
                    const text = results.map(r => `{"${r.name}","${r.grade}","${r.rate}"}`).join('\n')
                    navigator.clipboard.writeText(text).then(() => {
                      setCopied(true)
                      setTimeout(() => setCopied(false), 2000)
                    })
                  }}
                  className="px-3 py-1.5 text-xs bg-blue-500/20 border border-blue-500/30 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-colors flex items-center gap-1"
                >
                  <span className="material-icons-round text-sm">{copied ? 'check' : 'content_copy'}</span>
                  {copied ? 'คัดลอกแล้ว!' : 'คัดลอก'}
                </button>
                {/* ── ปุ่ม Test ── */}
                <button
                  onClick={() => setIsTest(!isTest)}
                  className={`px-3 py-1.5 text-xs rounded-lg border transition-colors flex items-center gap-1 ${isTest ? 'bg-orange-500/30 border-orange-500/50 text-orange-300' : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'}`}
                >
                  <span className="material-icons-round text-sm">{isTest ? 'science' : 'radio_button_unchecked'}</span>
                  Test
                </button>
                {/* ── Radio: ไม่มีป้าย / ตู้ใหม่ / ตู้อีเว้นท์ ── */}
                <button
                  onClick={() => setBadge(badge === 'new' ? 'none' : 'new')}
                  className={`px-3 py-1.5 text-xs rounded-lg border transition-colors flex items-center gap-1 ${badge === 'new' ? 'bg-red-500/30 border-red-500/50 text-red-300' : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'}`}
                >
                  <span className="material-icons-round text-sm">{badge === 'new' ? 'fiber_new' : 'radio_button_unchecked'}</span>
                  ตู้ใหม่
                </button>
                <button
                  onClick={() => setBadge(badge === 'event' ? 'none' : 'event')}
                  className={`px-3 py-1.5 text-xs rounded-lg border transition-colors flex items-center gap-1 ${badge === 'event' ? 'bg-yellow-500/30 border-yellow-500/50 text-yellow-300' : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'}`}
                >
                  <span className="material-icons-round text-sm">{badge === 'event' ? 'event' : 'radio_button_unchecked'}</span>
                  ตู้อีเว้นท์
                </button>
                {/* ตู้เก่าที่ดาวค้างผิด (หรือเรนเจอร์ที่เพิ่งปลดร่าง) กดอันนี้เติมใหม่จาก Ranger Book ได้ทั้งตาราง */}
                <button onClick={refillStars} className="px-3 py-1.5 text-xs bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 rounded-lg hover:bg-cyan-500/30 transition-colors flex items-center gap-1">
                  <span className="material-icons-round text-sm">auto_fix_high</span>เติมดาวจาก Ranger Book
                </button>
                <button onClick={addRow} className="px-3 py-1.5 text-xs bg-green-500/20 border border-green-500/30 text-green-400 rounded-lg hover:bg-green-500/30 transition-colors flex items-center gap-1">
                  <span className="material-icons-round text-sm">add</span>เพิ่มแถว
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10 text-left">
                    <th className="pb-3 text-gray-400 text-xs font-medium w-8">#</th>
                    <th className="pb-3 text-gray-400 text-xs font-medium w-12">รูป</th>
                    <th className="pb-3 text-gray-400 text-xs font-medium">ชื่อ</th>
                    <th className="pb-3 text-gray-400 text-xs font-medium">Ranger ID</th>
                    <th className="pb-3 text-gray-400 text-xs font-medium text-center">ดาว</th>
                    <th className="pb-3 text-gray-400 text-xs font-medium text-right">เรท</th>
                    <th className="pb-3 text-yellow-300 text-xs font-medium text-center w-16" aria-label="ติ๊ก = สุ่มได้ตัวนี้แล้วจุดพรุ้กระดาษ">
                      <span className="material-icons-round text-sm align-middle">celebration</span>
                    </th>
                    <th className="pb-3 text-amber-300 text-xs font-medium text-center w-16" aria-label="ติ๊ก = ไฮไลท์แถวนี้ในตาราง Ranger Drop Rates (แค่ UI ไม่กระทบเรทจริง)">
                      <span className="material-icons-round text-sm align-middle">auto_awesome</span>
                    </th>
                    <th className="pb-3 text-gray-400 text-xs font-medium text-center w-20">จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) =>
                    editingIdx === i ? (
                      <tr key={i} className="border-b border-white/10 bg-white/5">
                        <td className="py-2 text-xs text-gray-600">{i + 1}</td>
                        <td className="py-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={rangerImgUrl(editingRow.rangerId) ?? ''} alt=""
                            className="h-10 w-10 object-contain rounded bg-white/5"
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                            onLoad={e => { (e.target as HTMLImageElement).style.display = 'block' }}
                            style={{ display: editingRow.rangerId ? 'block' : 'none' }} />
                        </td>
                        <td className="py-2 pr-2">
                          <input value={editingRow.name} onChange={e => setEditingRow({ ...editingRow, name: e.target.value })}
                            className="w-full px-2 py-1 bg-white/10 border border-purple-500/50 rounded-lg text-white text-sm focus:outline-none" />
                        </td>
                        <td className="py-2 pr-2">
                          <input value={editingRow.rangerId ?? ''} onChange={e => setEditingRow({ ...editingRow, rangerId: e.target.value })}
                            placeholder="เช่น u093e-honey"
                            className="w-full px-2 py-1 bg-white/10 border border-green-500/50 rounded-lg text-green-300 text-sm font-mono focus:outline-none" />
                        </td>
                        <td className="py-2 px-2">
                          <select value={editingRow.grade} onChange={e => setEditingRow({ ...editingRow, grade: e.target.value })}
                            className="w-full px-2 py-1 bg-gray-900 border border-purple-500/50 rounded-lg text-white text-xs focus:outline-none">
                            {gradeOptionsFor(editingRow.grade, poolMode === 'frog').map(g => <option key={g} value={g}>{g}</option>)}
                          </select>
                        </td>
                        <td className="py-2 px-2">
                          <input type="number" step="0.01" value={editingRow.rate}
                            onChange={e => setEditingRow({ ...editingRow, rate: parseFloat(e.target.value) || 0 })}
                            className="w-full px-2 py-1 bg-white/10 border border-purple-500/50 rounded-lg text-yellow-400 text-sm font-mono text-right focus:outline-none" />
                        </td>
                        <td className="py-2 text-center">
                          <input
                            type="checkbox"
                            checked={!!editingRow.confetti}
                            onChange={e => setEditingRow({ ...editingRow, confetti: e.target.checked })}
                            className="w-4 h-4 accent-yellow-500 cursor-pointer"
                          />
                        </td>
                        <td className="py-2 text-center">
                          <input
                            type="checkbox"
                            checked={!!editingRow.special}
                            onChange={e => setEditingRow({ ...editingRow, special: e.target.checked })}
                            className="w-4 h-4 accent-amber-500 cursor-pointer"
                          />
                        </td>
                        <td className="py-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={saveRowEdit} className="text-green-400 hover:text-green-300"><span className="material-icons-round text-base">check</span></button>
                            <button onClick={cancelRowEdit} className="text-gray-500 hover:text-gray-300"><span className="material-icons-round text-base">close</span></button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors group">
                        <td className="py-2.5 text-xs text-gray-600">{i + 1}</td>
                        <td className="py-2.5">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={rangerImgUrl(r.rangerId) ?? ''} alt={r.name}
                            className="h-10 w-10 object-contain rounded bg-white/5"
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                        </td>
                        <td className="py-2.5 text-sm text-white">{r.name}</td>
                        <td className="py-2.5 text-sm font-mono text-green-400">{r.rangerId ?? ''}</td>
                        <td className="py-2.5 text-center">
                          <div className="flex flex-col items-center gap-0.5">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={gradeImgSrc(r.grade)} alt={r.grade} className="h-5 mx-auto"
                              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                            <span className={`text-xs font-mono ${GRADE_COLORS[r.grade] ?? 'text-gray-400'}`}>{r.grade}</span>
                          </div>
                        </td>
                        <td className="py-2.5 text-right">
                          <span className="text-sm font-mono text-yellow-400 font-semibold">{r.rate}%</span>
                        </td>
                        <td className="py-2.5 text-center">
                          <input
                            type="checkbox"
                            checked={!!r.confetti}
                            onChange={e => {
                              if (!results) return
                              const updated = [...results]
                              updated[i] = { ...updated[i], confetti: e.target.checked }
                              setResults(updated)
                            }}
                            className="w-4 h-4 accent-yellow-500 cursor-pointer"
                          />
                        </td>
                        <td className="py-2.5 text-center">
                          <input
                            type="checkbox"
                            checked={!!r.special}
                            onChange={e => {
                              if (!results) return
                              const updated = [...results]
                              updated[i] = { ...updated[i], special: e.target.checked }
                              setResults(updated)
                            }}
                            className="w-4 h-4 accent-amber-500 cursor-pointer"
                          />
                        </td>
                        <td className="py-2.5 text-center">
                          <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => startRowEdit(i)} className="text-blue-400 hover:text-blue-300"><span className="material-icons-round text-base">edit</span></button>
                            <button onClick={() => deleteRow(i)} className="text-red-400 hover:text-red-300"><span className="material-icons-round text-base">delete</span></button>
                          </div>
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t border-white/10">
                    <td colSpan={5} className="pt-3 text-xs text-gray-500 text-right pr-4">รวมทั้งหมด</td>
                    <td className="pt-3 text-right text-sm font-mono font-semibold text-white">
                      {results.reduce((s, r) => s + (Number(r.rate) || 0), 0).toFixed(2)}%
                    </td>
                    <td />
                    <td />
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

      </div>

    </div>
  )
}
