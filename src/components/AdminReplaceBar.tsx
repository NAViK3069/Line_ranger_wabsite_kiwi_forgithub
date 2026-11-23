'use client'

// ====================================================
// AdminReplaceBar — แถบ "แทนที่ข้อความทั้งหมด" ในฟอร์มตู้กาชา (หน้าแอดมิน Gacha เรนเจอร์ / เกียร์)
//   [ ข้อความใหม่ ] ← [ ข้อความเดิม ] [แทนที่]   เช่นบัฟเรท: 1.25 ← 0.12
// ตัวแทนที่จริงอยู่ในหน้าแต่ละหน้า (onApply) — ที่นี่เป็นแค่หน้าตา
// ====================================================

interface Props {
  newText: string
  oldText: string
  onNewText: (v: string) => void
  onOldText: (v: string) => void
  onApply: () => void
  /** ผลล่าสุด — ขึ้นต้นด้วย ✓ = สำเร็จ (สีเขียว) */
  message: string
}

const inputCls = 'flex-1 min-w-0 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-600 font-mono text-sm focus:outline-none focus:border-amber-500 transition-colors'

export default function AdminReplaceBar({ newText, oldText, onNewText, onOldText, onApply, message }: Props) {
  const onKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter') onApply() }
  return (
    <div className="bg-white/5 rounded-xl px-3 py-3 border border-white/10">
      <p className="text-xs text-gray-400 mb-2 flex items-center gap-1">
        <span className="material-icons-round text-sm text-amber-400">find_replace</span>
        แทนที่ข้อความทั้งหมด (ช่องโค้ดข้างล่าง + ตารางอัตราสุ่ม)
      </p>
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <input type="text" value={newText} onChange={e => onNewText(e.target.value)} onKeyDown={onKey}
          placeholder="ข้อความใหม่ เช่น 1.25" className={inputCls} />
        <span className="material-icons-round text-gray-500 self-center rotate-90 sm:rotate-0" title="แทนที่ด้วย">arrow_back</span>
        <input type="text" value={oldText} onChange={e => onOldText(e.target.value)} onKeyDown={onKey}
          placeholder="ข้อความเดิม เช่น 0.12" className={inputCls} />
        <button
          onClick={onApply} disabled={!oldText}
          className="whitespace-nowrap px-4 py-2 text-sm bg-amber-500/20 border border-amber-500/30 text-amber-300 rounded-lg hover:bg-amber-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1 font-semibold"
        >
          <span className="material-icons-round text-sm">swap_horiz</span>แทนที่
        </button>
      </div>
      {message && (
        <p className={`text-xs mt-2 ${message.startsWith('✓') ? 'text-green-400' : 'text-gray-400'}`}>{message}</p>
      )}
    </div>
  )
}
