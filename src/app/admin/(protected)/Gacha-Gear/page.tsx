'use client'

// ====================================================
// Admin Gear Pools Page - จัดการตู้ Gacha เกียร์
// ====================================================

import { adminFetch, readOk, pendingImageFallback } from '@/lib/adminApi'
import AdminReplaceBar from '@/components/AdminReplaceBar'
import { apiFetch } from '@/lib/staticApi'
import { useState, useEffect, useRef } from 'react'

// ─── Types ────────────────────────────────────────
interface GearEntry {
  id: string; name: string; grade: string; rate: number; type: string; isChristmas?: boolean
  confetti?: boolean   // สุ่มได้ชิ้นนี้ → จุดพรุ้กระดาษฉลองในหน้าสุ่มจริง
  special?: boolean    // ไฮไลท์พื้นหลังทอง+ขอบทองในตาราง Gear Drop Rates (แค่ UI ไม่กระทบเรทจริง)
}
interface GuaranteedGearEntry { id: string; name: string; grade: string }
type ChristmasTierRates = { '5': number; '6': number; '7': number; '8': number }

interface GearPoolSummary {
  id: string
  name: string
  isActive: boolean
  isNew: boolean
  isEvent: boolean
  isTest: boolean
  isChristmas: boolean
  gearsCount: number
  imageUrl?: string | null
  createdAt: string
}

// ─── Constants ────────────────────────────────────
const GRADE_COLORS: Record<string, string> = {
  '5star': 'text-green-300',
  '6star': 'text-blue-300',
  '7star': 'text-purple-300',
  '8star': 'text-yellow-300',
}
const GRADE_OPTIONS = ['5star', '6star', '7star', '8star']

const TYPE_LABELS: Record<string, string> = { wpn: 'Weapon', amr: 'Armor', acc: 'Accessory', '?': '?' }
const TYPE_COLORS: Record<string, string> = { wpn: 'text-red-400', amr: 'text-blue-400', acc: 'text-green-400', '?': 'text-gray-400' }
const TYPE_IMG: Record<string, string> = {
  wpn: '/gacha/images/gear_weapon.png',
  amr: '/gacha/images/gear_armor.png',
  acc: '/gacha/images/gear_accessory.png',
}

// ─── Helpers ──────────────────────────────────────
function getGearType(id?: string): string {
  if (!id) return '?'
  if (id.includes('_wpn_')) return 'wpn'
  if (id.includes('_amr_')) return 'amr'
  if (id.includes('_acc_')) return 'acc'
  return '?'
}

/** ดาวที่ดึงมาอัตโนมัติอาจเป็นค่าที่ไม่อยู่ในลิสต์
 *  ถ้าไม่ใส่เข้าไปใน <select> ด้วย ค่าที่โชว์จะเพี้ยนไปเป็นตัวแรกของลิสต์ทันทีที่กดแก้ */
function gradeOptionsFor(current: string): string[] {
  return current && !GRADE_OPTIONS.includes(current) ? [current, ...GRADE_OPTIONS] : GRADE_OPTIONS
}

// parse ชื่อ (field แรก) + grade (ถ้ามี) + rate จาก text
// รับได้ทั้ง {"ชื่อ","เรท"} (ดาวดึงให้เอง) และ {"ชื่อ","ดาว","เรท"} (ระบุดาวเองแบบเดิม)
// แกะด้วยการเก็บทุกค่าที่อยู่ในเครื่องหมายคำพูด แล้วดูจำนวน — ทนกับช่องว่างและคอมมาท้ายบรรทัด
function parseGearText(raw: string): { parsed: Array<{ name: string; grade: string; rate: number }>; errors: string[] } {
  const parsed: Array<{ name: string; grade: string; rate: number }> = []
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
    if (!name) { errors.push(`บรรทัด ${idx + 1}: ไม่มีชื่อ Gear → ${line}`); return }
    if (isNaN(rate)) { errors.push(`บรรทัด ${idx + 1}: เรทไม่ใช่ตัวเลข → "${rateRaw}"`); return }
    parsed.push({ name, grade, rate })
  })
  return { parsed, errors }
}

// normalize ชื่อ: ลบ \n, collapse whitespace, lowercase
function normalizeName(s: string): string {
  return s.replace(/\\n|\n|\r/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
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
export default function AdminGearPoolsPage() {
  const [view, setView] = useState<'list' | 'add' | 'edit'>('list')
  const [editPoolId, setEditPoolId] = useState<string | null>(null)

  // List state
  const [pools, setPools] = useState<GearPoolSummary[]>([])
  const [loadingPools, setLoadingPools] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null)
  const [listMsg, setListMsg] = useState('')

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
  const [results, setResults] = useState<GearEntry[] | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editingRow, setEditingRow] = useState<GearEntry>({ id: '', name: '', grade: '8star', rate: 0, type: '?' })

  // Guaranteed Gears state
  const [guaranteedGears, setGuaranteedGears] = useState<GuaranteedGearEntry[]>([])
  const [editingGuarIdx, setEditingGuarIdx] = useState<number | null>(null)
  const [editingGuarRow, setEditingGuarRow] = useState<GuaranteedGearEntry>({ id: '', name: '', grade: '8star' })

  const [badge, setBadge] = useState<'none' | 'new' | 'event'>('none')
  const [isTest, setIsTest] = useState(false)
  const [copied, setCopied] = useState(false)
  const [guarText, setGuarText] = useState('')
  const [guarCopied, setGuarCopied] = useState(false)

  // Christmas mode state
  const [poolMode, setPoolMode] = useState<'normal' | 'christmas'>('normal')
  const [christmasTierRates, setChristmasTierRates] = useState<ChristmasTierRates>({ '5': 0, '6': 0, '7': 0, '8': 0 })

  // แทนที่ข้อความ (เช่นบัฟเรท 0.12 → 1.25) — ใช้กับช่องโค้ดข้อมูลตู้ และตารางข้อมูลอัตราสุ่ม
  const [replaceNew, setReplaceNew] = useState('')
  const [replaceOld, setReplaceOld] = useState('')
  const [replaceMsg, setReplaceMsg] = useState('')

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
    const before = pools
    setPools(newPools)
    adminFetch('/api/admin/gacha/gear-pools/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: newPools.map(p => p.id) }),
    })
      .then(res => readOk(res, 'เรียงลำดับไม่สำเร็จ'))
      .catch(err => { setPools(before); failMsg(err, 'เรียงลำดับไม่สำเร็จ') })
  }

  /** บันทึกไม่สำเร็จ → บอกแอดมิน (หน้าจอถูกย้อนกลับเป็นค่าเดิมแล้ว) */
  function failMsg(err: unknown, what: string) {
    setListMsg(`✗ ${what}: ${err instanceof Error ? err.message : 'เกิดข้อผิดพลาด'} — หน้าจอย้อนกลับเป็นค่าเดิมแล้ว`)
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
      const res = await adminFetch('/api/admin/gacha/gear-pools')
      const data = await res.json()
      setPools(data.pools ?? [])
    } catch { /* silent */ }
    finally { setLoadingPools(false) }
  }

  async function startEdit(pool: GearPoolSummary) {
    setListMsg('')
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
      const res = await adminFetch(`/api/admin/gacha/gear-pools/${pool.id}`)
      const data = await res.json()
      setPoolName(data.name ?? pool.name)
      setExistingImageUrl(data.imageUrl ?? null)
      setBannerPreview(data.imageUrl ?? '')
      setResults(Array.isArray(data.gears) ? data.gears : [])
      // normalize: ข้อมูลเก่าอาจไม่มี id field
      setGuaranteedGears(Array.isArray(data.guaranteedGears)
        ? data.guaranteedGears.map((g: { id?: string; name: string; grade: string }) => ({ id: g.id ?? '', name: g.name, grade: g.grade }))
        : [])
      setBadge(data.isEvent ? 'event' : data.isNew ? 'new' : 'none')
      setIsTest(data.isTest ?? false)
      setPoolMode(data.isChristmas ? 'christmas' : 'normal')
      const tr = data.christmasTierRates ?? {}
      setChristmasTierRates({
        '5': Number(tr['5']) || 0,
        '6': Number(tr['6']) || 0,
        '7': Number(tr['7']) || 0,
        '8': Number(tr['8']) || 0,
      })
    } catch {
      setError('โหลดข้อมูลตู้กาชาเกียร์ไม่สำเร็จ')
    }
  }

  async function deletePool(id: string) {
    setConfirmDeleteId(null)
    try {
      await readOk(await adminFetch(`/api/admin/gacha/gear-pools/${id}`, { method: 'DELETE' }), 'ลบไม่สำเร็จ')
      setPools(prev => prev.filter(p => p.id !== id))
    } catch (err) {
      failMsg(err, 'ลบตู้ไม่สำเร็จ')
    }
  }

  // สลับธงจากการ์ดในหน้าลิสต์ได้เลย ไม่ต้องเข้าฟอร์มแก้ไข
  // ตู้ใหม่กับตู้อีเว้นท์เป็นอันเดียวกันไม่ได้ (ฟอร์มแก้ไขก็เลือกได้อย่างเดียว) เปิดอันหนึ่งจึงปิดอีกอัน
  async function toggleFlag(pool: GearPoolSummary, flag: 'isNew' | 'isEvent' | 'isTest') {
    const next: Partial<GearPoolSummary> = { [flag]: !pool[flag] }
    if (flag === 'isNew' && !pool.isNew) next.isEvent = false
    if (flag === 'isEvent' && !pool.isEvent) next.isNew = false

    const before = { isNew: pool.isNew, isEvent: pool.isEvent, isTest: pool.isTest }
    setPools(prev => prev.map(p => p.id === pool.id ? { ...p, ...next } : p))
    try {
      await readOk(await adminFetch(`/api/admin/gacha/gear-pools/${pool.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      }))
    } catch (err) {
      setPools(prev => prev.map(p => p.id === pool.id ? { ...p, ...before } : p))
      failMsg(err, 'เปลี่ยนป้ายไม่สำเร็จ')
    }
  }

  // สำเนาตู้ (ข้อมูลเหมือนเดิมทุกอย่าง) — ตู้สำเนาเริ่มแบบปิดไว้ ต้องกด "เปิด" เองถึงจะแสดงบนเว็บ
  async function duplicatePool(pool: GearPoolSummary) {
    if (duplicatingId) return
    setDuplicatingId(pool.id)
    setListMsg('')
    try {
      const d = await readOk(await adminFetch(`/api/admin/gacha/gear-pools/${pool.id}/duplicate`, { method: 'POST' }), 'สำเนาไม่สำเร็จ')
      await fetchPools()
      setListMsg(`✓ สร้าง "${d.pool?.name ?? pool.name}" แล้ว (ปิดไว้ก่อน — กด "เปิด" เมื่อพร้อมแสดง)`)
    } catch (err) {
      setListMsg(`✗ ${err instanceof Error ? err.message : 'สำเนาไม่สำเร็จ'}`)
    } finally {
      setDuplicatingId(null)
    }
  }

  async function toggleActive(id: string, current: boolean) {
    setPools(prev => prev.map(p => p.id === id ? { ...p, isActive: !current } : p))
    try {
      await readOk(await adminFetch(`/api/admin/gacha/gear-pools/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !current }),
      }))
    } catch (err) {
      setPools(prev => prev.map(p => p.id === id ? { ...p, isActive: current } : p))
      failMsg(err, current ? 'ปิดตู้ไม่สำเร็จ' : 'เปิดตู้ไม่สำเร็จ')
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

      const body = {
        name: poolName.trim(),
        imageUrl,
        gears: results,
        guaranteedGears,
        // ตู้ใหม่ = เปิดเลย · แก้ไขตู้เดิม = ไม่ส่ง isActive (คงเปิด/ปิดเดิม — ตู้ที่ปิดอยู่จะยังปิดหลังบันทึก)
        ...(editPoolId ? {} : { isActive: true }),
        isNew: badge === 'new',
        isEvent: badge === 'event',
        isTest,
        isChristmas: poolMode === 'christmas',
        christmasTierRates: poolMode === 'christmas' ? christmasTierRates : {},
      }
      const url = editPoolId ? `/api/admin/gacha/gear-pools/${editPoolId}` : '/api/admin/gacha/gear-pools'
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
    setGuaranteedGears([]); setEditingGuarIdx(null); setBadge('none'); setCopied(false); setGuarText('')
    setPoolMode('normal'); setChristmasTierRates({ '5': 0, '6': 0, '7': 0, '8': 0 })
    setReplaceNew(''); setReplaceOld(''); setReplaceMsg(''); setListMsg('')
  }

  // แทนที่ "ข้อความเดิม" ทุกจุดด้วย "ข้อความใหม่" (ตรงตัว ไม่ใช่ regex)
  //   ช่องโค้ดข้อมูลตู้ → แทนในข้อความ
  //   ตารางข้อมูลอัตราสุ่ม (ถ้ามี) → แทนในชื่อ / ดาว / เรท ของทุกแถวด้วย (ไอดีเกียร์ไม่แตะ)
  //     เรทที่แทนแล้วไม่ใช่ตัวเลข จะคงค่าเดิมไว้
  function applyReplace() {
    const from = replaceOld
    if (!from) { setReplaceMsg('ใส่ข้อความเดิมที่ต้องการแทนที่ก่อน'); return }
    const count = (s: string) => s.split(from).length - 1
    const swap = (s: string) => s.split(from).join(replaceNew)

    const textHits = count(textInput)
    if (textHits) setTextInput(swap(textInput))

    let tableHits = 0
    if (results?.length) {
      setResults(results.map(r => {
        const rate = String(r.rate)
        tableHits += count(r.name) + count(r.grade) + count(rate)
        const nextRate = parseFloat(swap(rate))
        return { ...r, name: swap(r.name), grade: swap(r.grade), rate: isNaN(nextRate) ? r.rate : nextRate }
      }))
      setEditingIdx(null)
    }

    const parts = [textHits && `ช่องโค้ด ${textHits} จุด`, tableHits && `ตาราง ${tableHits} จุด`].filter(Boolean)
    setReplaceMsg(parts.length ? `✓ แทนที่ "${from}" → "${replaceNew}" แล้ว: ${parts.join(' · ')}` : `ไม่พบ "${from}"`)
  }

  function handleBanner(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setBannerFile(file); setBannerPreview(URL.createObjectURL(file)); setExistingImageUrl(null)
  }

  // ─── Lookup: ชื่อ → id → ดาว ────────────────────
  // โหลดสองอย่างพร้อมกันครั้งเดียวแล้วเก็บไว้ใน ref:
  //   • /api/lerico/equip-names → ชื่อ EN → gearId (คีย์ลงท้าย _nm)
  //   • /api/gear-book          → id (itemCode ไม่มี _nm) → grade → ดาว
  // ทำให้วาง text ได้แค่ {"ชื่อ","เรท"} ไม่ต้องพิมพ์ดาวเองทุกบรรทัดอีก
  // (ทั้งสองเส้นเป็นไฟล์ static ใน /data — โหลดครั้งเดียวตอนเปิดฟอร์ม)
  const lookupRef = useRef<{ nameToId: Map<string, string>; starById: Map<string, string>; idToName: Map<string, string> } | null>(null)

  async function ensureLookup() {
    if (lookupRef.current) return lookupRef.current
    const nameToId = new Map<string, string>()
    const starById = new Map<string, string>()
    const idToName = new Map<string, string>()
    const [namesRes, bookRes] = await Promise.allSettled([
      apiFetch('/api/lerico/equip-names'),
      apiFetch('/api/gear-book'),
    ])
    try {
      if (namesRes.status === 'fulfilled' && namesRes.value.ok) {
        const data = await namesRes.value.json()
        const inner = (data['en:EQUIP'] ?? data['EQUIP'] ?? data) as Record<string, string>
        for (const [key, value] of Object.entries(inner)) {
          if (key.endsWith('_nm') && typeof value === 'string') {
            nameToId.set(normalizeName(value), key)
            idToName.set(key, value.replace(/\\n|\n|\r/g, ' ').replace(/\s+/g, ' ').trim())
          }
        }
      }
    } catch { /* fallback: id จะว่าง */ }
    try {
      if (bookRes.status === 'fulfilled' && bookRes.value.ok) {
        const data = await bookRes.value.json() as { items?: Array<{ id: string; name: string; grade: number | null }> }
        for (const g of data.items ?? []) {
          if (g.grade) starById.set(g.id, `${g.grade}star`)
          // เผื่อชื่อที่ไม่มีใน translate map (gear book มีชื่อของตัวเองอยู่แล้ว)
          // คีย์ของ map ฝั่งนี้ต้องลงท้าย _nm ให้เหมือนกัน ไม่งั้น starFor() หาไม่เจอ
          if (g.name && !nameToId.has(normalizeName(g.name))) {
            nameToId.set(normalizeName(g.name), `${g.id}_nm`)
          }
          if (g.name && !idToName.has(`${g.id}_nm`)) idToName.set(`${g.id}_nm`, g.name)
        }
      }
    } catch { /* fallback: ดาวจะว่าง ให้แก้ในตารางเอา */ }
    lookupRef.current = { nameToId, starById, idToName }
    return lookupRef.current
  }

  /** gearId ของตารางลงท้าย _nm แต่ gear book คีย์ด้วย itemCode เปล่าๆ */
  function starFor(starById: Map<string, string>, gearId: string): string {
    return gearId ? (starById.get(gearId.replace(/_nm$/, '')) ?? '') : ''
  }

  /** field แรกของ text code เป็นได้ทั้งชื่อ EN และ itemCode (ตามที่ตัวอย่างในฟอร์มโชว์ไว้)
   *  ของเดิมรองรับแค่ชื่อ พอวาง id ตามตัวอย่างจะได้ id ว่างเงียบๆ แล้วรูปไม่ขึ้น */
  function resolveGear(field: string, lk: { nameToId: Map<string, string>; idToName: Map<string, string> }) {
    if (/^eq_/i.test(field)) {
      const id = field.endsWith('_nm') ? field : `${field}_nm`
      return { id, name: lk.idToName.get(id) ?? field }
    }
    return { id: lk.nameToId.get(normalizeName(field)) ?? '', name: field }
  }

  async function parseAndFetchNames() {
    setTextErrors([])

    // Parse text → ได้ชื่อ, grade (ถ้าใส่มา), rate
    const { parsed: entries, errors } = parseGearText(textInput)
    setTextErrors(errors)
    if (entries.length === 0) return

    const lk = await ensureLookup()
    const missingStar: string[] = []

    // map ชื่อ/id → gearId → type + ดาว
    const gears: GearEntry[] = entries.map(entry => {
      const { id: gearId, name } = resolveGear(entry.name, lk)
      // ดาวที่พิมพ์มาเองมาก่อนเสมอ — ไม่งั้นตู้ที่จงใจใส่ดาวไม่ตรงของจริงจะถูกเขียนทับ
      const grade = entry.grade || starFor(lk.starById, gearId)
      if (!grade) missingStar.push(entry.name)
      return {
        id: gearId,
        name,
        grade: grade || '8star',
        rate: entry.rate,
        type: getGearType(gearId),
      }
    })

    if (missingStar.length > 0) {
      setTextErrors([...errors, `หาดาวไม่เจอ ${missingStar.length} ชิ้น (ใส่ 8star ไว้ก่อน แก้ในตารางได้): ${missingStar.join(', ')}`])
    }
    setResults(gears)
    setEditingIdx(null)
  }

  // เติมดาวใหม่ให้ทุกแถวจาก Gear Book — ใช้กับตู้เก่าที่ดาวค้างผิดอยู่
  async function refillStars() {
    if (!results) return
    const lk = await ensureLookup()
    setResults(results.map(g => {
      const gearId = g.id || resolveGear(g.name, lk).id
      return { ...g, id: gearId, type: getGearType(gearId), grade: starFor(lk.starById, gearId) || g.grade }
    }))
    setEditingIdx(null)
  }

  function startRowEdit(i: number) { setEditingIdx(i); setEditingRow({ ...results![i] }) }
  function saveRowEdit() {
    if (editingIdx === null || !results) return
    const updated = [...results]
    updated[editingIdx] = { ...editingRow, rate: Number(editingRow.rate), type: getGearType(editingRow.id) }
    setResults(updated); setEditingIdx(null)
  }
  function cancelRowEdit() { setEditingIdx(null) }
  function deleteRow(i: number) {
    if (!results) return
    setResults(results.filter((_, idx) => idx !== i))
    if (editingIdx === i) setEditingIdx(null)
  }
  function addRow() {
    const newRow: GearEntry = { id: '', name: 'ชื่อ Gear', grade: '8star', rate: 0, type: '?' }
    const updated = [...(results ?? []), newRow]
    setResults(updated); setEditingIdx(updated.length - 1); setEditingRow(newRow)
  }

  // ─── Guaranteed Gears Text Import ──────────────
  async function parseGuarText() {
    // รับได้ทั้ง {"ชื่อ"} (ดาวดึงให้เอง) และ {"ชื่อ","ดาว"} (ระบุดาวเองแบบเดิม)
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

    const lk = await ensureLookup()

    const gears: GuaranteedGearEntry[] = rows.map(entry => {
      const { id: gearId, name } = resolveGear(entry.name, lk)
      return {
        id: gearId,
        name,
        grade: entry.grade || starFor(lk.starById, gearId) || '8star',
      }
    })
    setGuaranteedGears(gears)
    setGuarText('')
  }

  // ─── Guaranteed Gears CRUD ─────────────────────
  function startGuarEdit(i: number) { setEditingGuarIdx(i); setEditingGuarRow({ ...guaranteedGears[i] }) }
  function saveGuarEdit() {
    if (editingGuarIdx === null) return
    const updated = [...guaranteedGears]
    updated[editingGuarIdx] = { ...editingGuarRow }
    setGuaranteedGears(updated); setEditingGuarIdx(null)
  }
  function cancelGuarEdit() { setEditingGuarIdx(null) }
  function deleteGuarRow(i: number) {
    setGuaranteedGears(guaranteedGears.filter((_, idx) => idx !== i))
    if (editingGuarIdx === i) setEditingGuarIdx(null)
  }
  function addGuarRow() {
    const newRow: GuaranteedGearEntry = { id: '', name: 'ชื่อ Gear การันตี', grade: '8star' }
    const updated = [...guaranteedGears, newRow]
    setGuaranteedGears(updated); setEditingGuarIdx(updated.length - 1); setEditingGuarRow(newRow)
  }

  // ─────────────────────────────────────────────────
  // LIST VIEW
  // ─────────────────────────────────────────────────
  if (view === 'list') {
    return (
      <div>
        {/* มือถือ: ชื่อหน้าอยู่บน ปุ่มสองปุ่มเรียงแถวล่างเต็มความกว้าง / sm ขึ้นไป: แบบเดิม */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-white mb-1">จัดการ Gacha เกียร์</h1>
            <p className="text-gray-400 text-sm">สร้าง แก้ไข หรือเปิด/ปิดตู้กาชาเกียร์</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
            <button
              onClick={() => { resetForm(); setView('add') }}
              className="justify-center whitespace-nowrap px-3 sm:px-5 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-semibold rounded-xl transition-all flex items-center gap-2"
            >
              <span className="material-icons-round text-sm">add</span>
              เพิ่มตู้กาชาเกียร์
            </button>
            <button
              onClick={() => { resetForm(); setPoolMode('christmas'); setView('add') }}
              className="justify-center whitespace-nowrap px-3 sm:px-5 py-2.5 bg-gradient-to-r from-red-600 to-green-600 hover:from-red-500 hover:to-green-500 text-white font-semibold rounded-xl transition-all flex items-center gap-2"
            >
              <span className="material-icons-round text-sm">ac_unit</span>
              เพิ่มตู้คริสต์มาส
            </button>
          </div>
        </div>

        {listMsg && (
          <div className={`mb-4 px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 ${listMsg.startsWith('✓') ? 'bg-green-500/15 text-green-300' : 'bg-red-500/15 text-red-300'}`}>
            <span className="flex-1">{listMsg}</span>
            <button onClick={() => setListMsg('')} className="text-current opacity-60 hover:opacity-100" aria-label="close">
              <span className="material-icons-round text-base">close</span>
            </button>
          </div>
        )}

        {loadingPools ? (
          <div className="card-glass p-12 text-center">
            <span className="material-icons-round text-5xl text-gray-600 animate-spin">refresh</span>
            <p className="text-gray-500 mt-4">กำลังโหลด...</p>
          </div>
        ) : pools.length === 0 ? (
          <div className="card-glass p-12 text-center">
            <span className="material-icons-round text-7xl text-gray-700">shield</span>
            <p className="text-gray-500 mt-4">ยังไม่มีตู้กาชาเกียร์</p>
            <p className="text-gray-600 text-sm mt-1">กด &quot;เพิ่มตู้กาชาเกียร์&quot; เพื่อเริ่มสร้าง</p>
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
                      loading="lazy" decoding="async"
                      onError={pendingImageFallback}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="material-icons-round text-6xl text-white/10">shield</span>
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
                  {/* Badge คริสต์มาส */}
                  {pool.isChristmas && (
                    <span className={`absolute ${pool.isTest ? 'top-[60px]' : 'top-9'} right-2.5 px-2.5 py-1 rounded-full text-xs font-bold backdrop-blur-sm bg-red-500/40 text-red-100 border border-red-400/50 flex items-center gap-1`}>
                      <span className="material-icons-round text-xs">ac_unit</span>คริสต์มาส
                    </span>
                  )}
                </div>

                <div className="p-4 flex-1 flex flex-col">
                  <h3 className="text-white font-bold text-sm leading-tight mb-1">{pool.name}</h3>
                  <p className="text-gray-500 text-xs mb-4">
                    <span className="material-icons-round text-xs align-middle mr-1">shield</span>
                    {pool.gearsCount.toLocaleString()} Gear
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
                    href={`/gacha-gear/${pool.id}`}
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
                    {/* สำเนาตู้ — ตู้ใหม่เริ่มแบบปิดไว้ */}
                    <button
                      onClick={() => duplicatePool(pool)}
                      disabled={!!duplicatingId}
                      title="สำเนาตู้นี้ (ตู้สำเนาจะปิดไว้ก่อน)"
                      className="flex-1 py-2 text-xs bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 disabled:opacity-50 disabled:cursor-wait rounded-lg transition-colors flex items-center justify-center gap-1 font-medium"
                    >
                      <span className={`material-icons-round text-sm ${duplicatingId === pool.id ? 'animate-spin' : ''}`}>
                        {duplicatingId === pool.id ? 'refresh' : 'content_copy'}
                      </span>
                      สำเนา
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
              <h2 className="text-white font-bold mb-2">ลบตู้กาชาเกียร์นี้?</h2>
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
      {/* Header — มือถือ: ปุ่มบันทึกลงไปเต็มความกว้างบรรทัดล่าง / sm ขึ้นไป: แถวเดียวแบบเดิม */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-3 mb-6 sm:mb-8">
        <button
          onClick={() => { setView('list'); resetForm() }}
          className="text-gray-400 hover:text-white transition-colors flex items-center gap-1"
        >
          <span className="material-icons-round text-sm">arrow_back</span>กลับ
        </button>
        <h1 className="text-2xl sm:text-3xl font-black text-white flex items-center gap-2">
          {view === 'edit' ? 'แก้ไขตู้กาชาเกียร์' : 'เพิ่มตู้กาชาเกียร์ใหม่'}
          {poolMode === 'christmas' && (
            <span className="px-3 py-1 bg-gradient-to-r from-red-500/30 to-green-500/30 border border-red-400/40 text-red-200 rounded-full text-sm font-bold flex items-center gap-1">
              <span className="material-icons-round text-base">ac_unit</span>คริสต์มาส
            </span>
          )}
        </h1>
        <button
          onClick={save}
          disabled={saving}
          className="w-full sm:w-auto sm:ml-auto justify-center whitespace-nowrap px-5 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-green-900/30"
        >
          {saving
            ? <><span className="material-icons-round animate-spin text-sm">refresh</span>กำลังบันทึก...</>
            : <><span className="material-icons-round text-sm">save</span>{view === 'edit' ? 'บันทึกการแก้ไข' : 'บันทึกตู้กาชาเกียร์'}</>}
        </button>
      </div>

      <div className="space-y-6">

        {/* ① ชื่อ */}
        <div className="card-glass p-4 sm:p-6">
          <label className="block text-sm text-gray-400 mb-2">① ชื่อตู้กาชาเกียร์</label>
          <input
            type="text"
            value={poolName}
            onChange={e => setPoolName(e.target.value)}
            placeholder="เช่น Gear Gacha Vol.1"
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 transition-colors"
          />
        </div>

        {/* ② Banner */}
        <div className="card-glass p-4 sm:p-6">
          <label className="block text-sm text-gray-400 mb-3">② รูป Banner ตู้กาชาเกียร์</label>
          <div
            onClick={() => bannerRef.current?.click()}
            className="border-2 border-dashed border-white/20 rounded-xl p-6 text-center cursor-pointer hover:border-purple-500/60 transition-colors"
          >
            {bannerPreview ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={bannerPreview} alt="banner" onError={pendingImageFallback} className="max-h-44 mx-auto rounded-lg object-contain" />
            ) : (
              <div>
                <span className="material-icons-round text-5xl text-gray-600">add_photo_alternate</span>
                <p className="text-gray-500 text-sm mt-2">คลิกเพื่ออัปโหลดรูป Banner</p>
              </div>
            )}
          </div>
          <input ref={bannerRef} type="file" accept="image/*" onChange={handleBanner} className="hidden" />
        </div>

        {/* ★ โหมดตู้คริสต์มาส: Tier Rates สำหรับ Guaranteed Slot */}
        {poolMode === 'christmas' && (() => {
          const total = (Number(christmasTierRates['5']) || 0) + (Number(christmasTierRates['6']) || 0) + (Number(christmasTierRates['7']) || 0) + (Number(christmasTierRates['8']) || 0)
          return (
            <div className="card-glass p-4 sm:p-6 border border-red-400/30 bg-gradient-to-br from-red-500/5 to-green-500/5">
              <div className="flex items-center gap-2 mb-1">
                <span className="material-icons-round text-red-300">ac_unit</span>
                <label className="block text-sm text-gray-300 font-semibold">★ เรท Tier สำหรับ Guaranteed Slot (ช่องที่ 6)</label>
              </div>
              <p className="text-xs text-gray-500 mb-4">
                เมื่อสุ่ม 5+1 ครั้ง ช่องที่ 6 จะบังคับสุ่มเฉพาะเกียร์ที่ติ๊ก <span className="text-red-300">Christmas</span> ในตาราง โดยใช้เรทด้านล่างตามระดับดาว — ถ้ารวมไม่ครบ 100% ระบบจะ normalize แบบน้ำหนัก (weighted)
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {(['5', '6', '7', '8'] as const).map(star => (
                  <div key={star} className="bg-white/5 border border-white/10 rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/gacha/images/${star}star.png`} alt={`${star}star`} className="h-5" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                      <span className={`text-xs font-semibold ${GRADE_COLORS[`${star}star`] ?? 'text-gray-400'}`}>{star}★</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={christmasTierRates[star]}
                        onChange={e => setChristmasTierRates({ ...christmasTierRates, [star]: parseFloat(e.target.value) || 0 })}
                        className="w-full px-2 py-1.5 bg-white/10 border border-white/10 rounded-lg text-yellow-400 text-sm font-mono text-right focus:outline-none focus:border-red-400/60"
                      />
                      <span className="text-xs text-gray-500">%</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-gray-500">รวม</span>
                <span className={`font-mono font-semibold ${Math.abs(total - 100) < 0.01 ? 'text-green-400' : total === 0 ? 'text-gray-500' : 'text-orange-300'}`}>
                  {total.toFixed(2)}% {Math.abs(total - 100) < 0.01 ? '✓' : total === 0 ? '' : '(จะ normalize อัตโนมัติ)'}
                </span>
              </div>
            </div>
          )
        })()}

        {/* ③ อัตราสุ่มเกียร์ */}
        <div className="card-glass p-4 sm:p-6">
          <label className="block text-sm text-gray-400 mb-3">③ ข้อมูลอัตราสุ่มเกียร์</label>

          <div className="space-y-3">
            <div className="bg-white/5 rounded-xl px-4 py-3 border border-white/10">
              <p className="text-xs text-gray-500 mb-1">รูปแบบ (แต่ละบรรทัด):</p>
              <code className="text-xs text-cyan-400 font-mono">{`{"ชื่อ Gear หรือ itemCode","เรท"},`}</code>
              <p className="text-xs text-gray-600 mt-1.5">ระดับดาวดึงจาก Gear Book ให้เองจากชื่อ → id ไม่ต้องพิมพ์</p>
              <p className="text-xs text-gray-600 mt-0.5">อยากกำหนดดาวเองก็ใส่ตรงกลางได้เหมือนเดิม: <code className="text-cyan-600 font-mono">{`{"ชื่อ","ดาว","เรท"}`}</code> หรือแก้ในตารางข้างล่าง</p>
              <p className="text-xs text-gray-600 mt-0.5">
                ประเภทจะถูกตรวจจับอัตโนมัติจาก ID <span className="text-gray-400">(_wpn_, _amr_, _acc_)</span>
              </p>
            </div>
            <AdminReplaceBar
              newText={replaceNew} oldText={replaceOld} message={replaceMsg} onApply={applyReplace}
              onNewText={v => { setReplaceNew(v); setReplaceMsg('') }}
              onOldText={v => { setReplaceOld(v); setReplaceMsg('') }}
            />
            <textarea
              value={textInput}
              onChange={e => setTextInput(e.target.value)}
              placeholder={`{"eq_2604_acc_06_nm","0.88"},\n{"eq_2604_wpn_01_nm","1.20"},`}
              rows={10}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-700 font-mono text-sm focus:outline-none focus:border-blue-500 transition-colors resize-y"
            />
            {textErrors.length > 0 && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 space-y-1">
                {textErrors.map((e, i) => <p key={i} className="text-red-400 text-xs">{e}</p>)}
              </div>
            )}
            <button
              onClick={parseAndFetchNames} disabled={!textInput.trim()}
              className="w-full py-3 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
            >
              <span className="material-icons-round text-sm">table_view</span>สร้างตาราง
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

        {/* ─── เกียร์การันตี (Guaranteed Gears) ─── */}
        <div className="card-glass p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="material-icons-round text-yellow-400">stars</span>
              <h3 className="text-white font-bold text-lg">
                จัดการเกียร์การันตี
                <span className="text-gray-400 font-normal text-sm ml-2">{guaranteedGears.length} รายการ</span>
              </h3>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => {
                  const text = guaranteedGears.map(g => `{"${g.name}","${g.grade}"}`).join('\n')
                  navigator.clipboard.writeText(text).then(() => { setGuarCopied(true); setTimeout(() => setGuarCopied(false), 2000) })
                }}
                disabled={guaranteedGears.length === 0}
                className="whitespace-nowrap px-3 py-1.5 text-xs bg-blue-500/20 border border-blue-500/30 text-blue-400 rounded-lg hover:bg-blue-500/30 disabled:opacity-40 transition-colors flex items-center gap-1"
              >
                <span className="material-icons-round text-sm">{guarCopied ? 'check' : 'content_copy'}</span>
                {guarCopied ? 'คัดลอกแล้ว!' : 'คัดลอก'}
              </button>
              <button onClick={addGuarRow} className="whitespace-nowrap px-3 py-1.5 text-xs bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 rounded-lg hover:bg-yellow-500/30 transition-colors flex items-center gap-1">
                <span className="material-icons-round text-sm">add</span>เพิ่มแถว
              </button>
            </div>
          </div>

          {/* Text import */}
          <div className="mb-4 space-y-2">
            <div className="bg-white/5 rounded-xl px-4 py-2 border border-white/10">
              <p className="text-xs text-gray-500">วางข้อมูลเพื่อเพิ่มทีเดียว: <code className="text-cyan-400 font-mono">{`{"ชื่อ Gear"},`}</code> <span className="text-gray-600">— ดาวดึงให้เอง หรือใส่เองก็ได้ <code className="text-cyan-600 font-mono">{`{"ชื่อ","ดาว"}`}</code></span></p>
            </div>
            <div className="flex gap-2">
              <textarea
                value={guarText} onChange={e => setGuarText(e.target.value)}
                placeholder={`{"Ultra Shield"},\n{"Hyper Sword"},`}
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

          {guaranteedGears.length === 0 ? (
            <div className="text-center py-8 text-gray-600 text-sm">ยังไม่มีเกียร์การันตี — กด &quot;เพิ่มแถว&quot; หรือวาง text code ด้านบน</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead>
                  <tr className="border-b border-white/10 text-left">
                    <th className="pb-3 text-gray-400 text-xs font-medium w-8">#</th>
                    <th className="pb-3 text-gray-400 text-xs font-medium w-20">ประเภท</th>
                    <th className="pb-3 text-gray-400 text-xs font-medium w-12">รูป</th>
                    <th className="pb-3 text-gray-400 text-xs font-medium">ไอดีเกียร์</th>
                    <th className="pb-3 text-gray-400 text-xs font-medium">ชื่อ Gear</th>
                    <th className="pb-3 text-gray-400 text-xs font-medium text-center">ระดับ</th>
                    <th className="pb-3 text-gray-400 text-xs font-medium text-center w-20">จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {guaranteedGears.map((g, i) =>
                    editingGuarIdx === i ? (
                      <tr key={i} className="border-b border-white/10 bg-white/5">
                        <td className="py-2 text-xs text-gray-600">{i + 1}</td>
                        <td className="py-2 pr-2">
                          <span className={`text-xs font-medium ${TYPE_COLORS[getGearType(editingGuarRow.id)] ?? 'text-gray-400'}`}>
                            {TYPE_LABELS[getGearType(editingGuarRow.id)] ?? '?'}
                          </span>
                        </td>
                        <td className="py-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={editingGuarRow.id ? `https://rangers.lerico.net/res/gear_icon/${editingGuarRow.id.replace(/_nm$/, '')}_icon.png` : ''}
                            alt=""
                            className="h-9 w-9 object-contain rounded bg-white/5"
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                            style={{ display: editingGuarRow.id ? 'block' : 'none' }}
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            value={editingGuarRow.id}
                            onChange={e => setEditingGuarRow({ ...editingGuarRow, id: e.target.value })}
                            placeholder="eq_xxxx_acc_xx_nm"
                            className="w-full px-2 py-1 bg-white/10 border border-purple-500/50 rounded-lg text-white text-xs font-mono focus:outline-none"
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            value={editingGuarRow.name}
                            onChange={e => setEditingGuarRow({ ...editingGuarRow, name: e.target.value })}
                            placeholder="ชื่อ Gear การันตี"
                            className="w-full px-2 py-1 bg-white/10 border border-yellow-500/50 rounded-lg text-white text-sm focus:outline-none"
                          />
                        </td>
                        <td className="py-2 px-2">
                          <select value={editingGuarRow.grade} onChange={e => setEditingGuarRow({ ...editingGuarRow, grade: e.target.value })}
                            className="w-full px-2 py-1 bg-gray-900 border border-yellow-500/50 rounded-lg text-white text-xs focus:outline-none">
                            {gradeOptionsFor(editingGuarRow.grade).map(g => <option key={g} value={g}>{g}</option>)}
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
                          <img src={TYPE_IMG[getGearType(g.id)] ?? ''} alt={getGearType(g.id)} className="h-7 object-contain" style={{ width: '3rem' }}
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                        </td>
                        <td className="py-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={g.id ? `https://rangers.lerico.net/res/gear_icon/${g.id.replace(/_nm$/, '')}_icon.png` : ''}
                            alt={g.name}
                            className="h-9 w-9 object-contain rounded bg-white/5"
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                        </td>
                        <td className="py-2 text-xs font-mono text-gray-400">{g.id}</td>
                        <td className="py-2 text-white text-sm">{g.name}</td>
                        <td className={`py-2 text-center text-xs font-semibold ${GRADE_COLORS[g.grade] ?? 'text-gray-400'}`}>{g.grade}</td>
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
        </div>

        {/* ─── ตารางผลลัพธ์ (แก้ไขได้) ─── */}
        {results && (
          <div className="card-glass p-4 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="material-icons-round text-green-400">check_circle</span>
                <h3 className="text-white font-bold text-lg">
                  ข้อมูลอัตราสุ่มเกียร์
                  <span className="text-gray-400 font-normal text-sm ml-2">{results.length} รายการ</span>
                </h3>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {/* ── ปุ่มคัดลอกตาราง ── */}
                <button
                  onClick={() => {
                    const text = results.map(r => `{"${r.name}","${r.grade}","${r.rate}"}`).join('\n')
                    navigator.clipboard.writeText(text).then(() => {
                      setCopied(true)
                      setTimeout(() => setCopied(false), 2000)
                    })
                  }}
                  className="whitespace-nowrap px-3 py-1.5 text-xs bg-blue-500/20 border border-blue-500/30 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-colors flex items-center gap-1"
                >
                  <span className="material-icons-round text-sm">{copied ? 'check' : 'content_copy'}</span>
                  {copied ? 'คัดลอกแล้ว!' : 'คัดลอก'}
                </button>
                {/* ── ปุ่ม Test ── */}
                <button
                  onClick={() => setIsTest(!isTest)}
                  className={`whitespace-nowrap px-3 py-1.5 text-xs rounded-lg border transition-colors flex items-center gap-1 ${isTest ? 'bg-orange-500/30 border-orange-500/50 text-orange-300' : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'}`}
                >
                  <span className="material-icons-round text-sm">{isTest ? 'science' : 'radio_button_unchecked'}</span>
                  Test
                </button>
                {/* ── Radio: ไม่มีป้าย / ตู้ใหม่ / ตู้อีเว้นท์ ── */}
                <button
                  onClick={() => setBadge(badge === 'new' ? 'none' : 'new')}
                  className={`whitespace-nowrap px-3 py-1.5 text-xs rounded-lg border transition-colors flex items-center gap-1 ${badge === 'new' ? 'bg-red-500/30 border-red-500/50 text-red-300' : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'}`}
                >
                  <span className="material-icons-round text-sm">{badge === 'new' ? 'fiber_new' : 'radio_button_unchecked'}</span>
                  ตู้ใหม่
                </button>
                <button
                  onClick={() => setBadge(badge === 'event' ? 'none' : 'event')}
                  className={`whitespace-nowrap px-3 py-1.5 text-xs rounded-lg border transition-colors flex items-center gap-1 ${badge === 'event' ? 'bg-yellow-500/30 border-yellow-500/50 text-yellow-300' : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'}`}
                >
                  <span className="material-icons-round text-sm">{badge === 'event' ? 'event' : 'radio_button_unchecked'}</span>
                  ตู้อีเว้นท์
                </button>
                {/* ตู้เก่าที่ดาวค้างผิด กดอันนี้เติมใหม่จาก Gear Book ได้ทั้งตาราง */}
                <button onClick={refillStars} className="whitespace-nowrap px-3 py-1.5 text-xs bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 rounded-lg hover:bg-cyan-500/30 transition-colors flex items-center gap-1">
                  <span className="material-icons-round text-sm">auto_fix_high</span>เติมดาวจาก Gear Book
                </button>
                <button onClick={addRow} className="whitespace-nowrap px-3 py-1.5 text-xs bg-green-500/20 border border-green-500/30 text-green-400 rounded-lg hover:bg-green-500/30 transition-colors flex items-center gap-1">
                  <span className="material-icons-round text-sm">add</span>เพิ่มแถว
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead>
                  <tr className="border-b border-white/10 text-left">
                    <th className="pb-3 text-gray-400 text-xs font-medium w-8">#</th>
                    <th className="pb-3 text-gray-400 text-xs font-medium w-20">ประเภท</th>
                    <th className="pb-3 text-gray-400 text-xs font-medium w-12">รูป</th>
                    <th className="pb-3 text-gray-400 text-xs font-medium">ไอดีเกียร์</th>
                    <th className="pb-3 text-gray-400 text-xs font-medium pl-4">ชื่อ</th>
                    <th className="pb-3 text-gray-400 text-xs font-medium text-center">ระดับ</th>
                    <th className="pb-3 text-gray-400 text-xs font-medium text-right">อัตราสุ่ม</th>
                    <th className="pb-3 text-yellow-300 text-xs font-medium text-center w-16" aria-label="ติ๊ก = สุ่มได้ชิ้นนี้แล้วจุดพรุ้กระดาษ">
                      <span className="material-icons-round text-sm align-middle">celebration</span>
                    </th>
                    <th className="pb-3 text-amber-300 text-xs font-medium text-center w-16" aria-label="ติ๊ก = ไฮไลท์แถวนี้ในตาราง Gear Drop Rates (แค่ UI ไม่กระทบเรทจริง)">
                      <span className="material-icons-round text-sm align-middle">auto_awesome</span>
                    </th>
                    {poolMode === 'christmas' && (
                      <th className="pb-3 text-red-300 text-xs font-medium text-center w-20" aria-label="เกียร์คริสต์มาส — ช่องที่ 6 จะสุ่มจากเกียร์ที่ติ๊กเท่านั้น">
                        <span className="material-icons-round text-sm align-middle">ac_unit</span> Xmas
                      </th>
                    )}
                    <th className="pb-3 text-gray-400 text-xs font-medium text-center w-20">จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) =>
                    editingIdx === i ? (
                      <tr key={i} className="border-b border-white/10 bg-white/5">
                        <td className="py-2 text-xs text-gray-600">{i + 1}</td>
                        <td className="py-2 pr-2">
                          <span className={`text-xs font-medium ${TYPE_COLORS[getGearType(editingRow.id)] ?? 'text-gray-400'}`}>
                            {TYPE_LABELS[getGearType(editingRow.id)] ?? '?'}
                          </span>
                        </td>
                        <td className="py-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={editingRow.id ? `https://rangers.lerico.net/res/gear_icon/${editingRow.id.replace(/_nm$/, '')}_icon.png` : ''}
                            alt=""
                            className="h-9 w-9 object-contain rounded bg-white/5"
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                            style={{ display: editingRow.id ? 'block' : 'none' }}
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            value={editingRow.id}
                            onChange={e => setEditingRow({ ...editingRow, id: e.target.value, type: getGearType(e.target.value) })}
                            placeholder="eq_xxxx_acc_xx_nm"
                            className="w-full px-2 py-1 bg-white/10 border border-purple-500/50 rounded-lg text-white text-xs font-mono focus:outline-none"
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input value={editingRow.name} onChange={e => setEditingRow({ ...editingRow, name: e.target.value })}
                            className="w-full px-2 py-1 bg-white/10 border border-purple-500/50 rounded-lg text-white text-sm focus:outline-none" />
                        </td>
                        <td className="py-2 px-2">
                          <select value={editingRow.grade} onChange={e => setEditingRow({ ...editingRow, grade: e.target.value })}
                            className="w-full px-2 py-1 bg-gray-900 border border-purple-500/50 rounded-lg text-white text-xs focus:outline-none">
                            {gradeOptionsFor(editingRow.grade).map(g => <option key={g} value={g}>{g}</option>)}
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
                        {poolMode === 'christmas' && (
                          <td className="py-2 text-center">
                            <input
                              type="checkbox"
                              checked={!!editingRow.isChristmas}
                              onChange={e => setEditingRow({ ...editingRow, isChristmas: e.target.checked })}
                              className="w-4 h-4 accent-red-500 cursor-pointer"
                            />
                          </td>
                        )}
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
                          <img src={TYPE_IMG[r.type] ?? ''} alt={r.type} className="h-7 object-contain" style={{ width: '3rem' }}
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                        </td>
                        <td className="py-2.5">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`https://rangers.lerico.net/res/gear_icon/${r.id.replace(/_nm$/, '')}_icon.png`}
                            alt={r.name}
                            className="h-9 w-9 object-contain rounded bg-white/5"
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                          />
                        </td>
                        <td className="py-2.5 text-xs font-mono text-gray-400">{r.id}</td>
                        <td className="py-2.5 text-sm text-white pl-4">{r.name}</td>
                        <td className="py-2.5 text-center">
                          <div className="flex flex-col items-center gap-0.5">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={`/gacha/images/${r.grade}.png`} alt={r.grade} className="h-5 mx-auto"
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
                        {poolMode === 'christmas' && (
                          <td className="py-2.5 text-center">
                            <input
                              type="checkbox"
                              checked={!!r.isChristmas}
                              onChange={e => {
                                if (!results) return
                                const updated = [...results]
                                updated[i] = { ...updated[i], isChristmas: e.target.checked }
                                setResults(updated)
                              }}
                              className="w-4 h-4 accent-red-500 cursor-pointer"
                            />
                          </td>
                        )}
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
                    <td colSpan={6} className="pt-3 text-xs text-gray-500 text-right pr-4">รวมทั้งหมด</td>
                    <td className="pt-3 text-right text-sm font-mono font-semibold text-white">
                      {results.reduce((s, r) => s + (Number(r.rate) || 0), 0).toFixed(2)}%
                    </td>
                    <td />
                    <td />
                    {poolMode === 'christmas' && (
                      <td className="pt-3 text-center text-xs font-mono text-red-300">
                        {results.filter(r => r.isChristmas).length}
                      </td>
                    )}
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
