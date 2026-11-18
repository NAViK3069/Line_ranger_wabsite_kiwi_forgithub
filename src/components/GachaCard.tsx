'use client'

// ====================================================
// GachaCard - การ์ดแสดงตัวละครที่สุ่มได้
// ====================================================

import { motion } from 'framer-motion'

// สีของแต่ละ Rarity
const RARITY_STYLES = {
  FIVE_STAR: {
    border: 'border-yellow-400',
    glow: 'shadow-yellow-400/50',
    label: '⭐⭐⭐⭐⭐',
    bg: 'from-yellow-900/40 to-orange-900/40',
  },
  FOUR_STAR: {
    border: 'border-purple-400',
    glow: 'shadow-purple-400/50',
    label: '⭐⭐⭐⭐',
    bg: 'from-purple-900/40 to-indigo-900/40',
  },
  THREE_STAR: {
    border: 'border-blue-400',
    glow: 'shadow-blue-400/50',
    label: '⭐⭐⭐',
    bg: 'from-blue-900/40 to-cyan-900/40',
  },
  TWO_STAR: {
    border: 'border-green-400',
    glow: 'shadow-green-400/50',
    label: '⭐⭐',
    bg: 'from-green-900/30 to-emerald-900/30',
  },
  ONE_STAR: {
    border: 'border-gray-400',
    glow: 'shadow-gray-400/50',
    label: '⭐',
    bg: 'from-gray-900/30 to-slate-900/30',
  },
} as const

type Rarity = keyof typeof RARITY_STYLES

interface GachaCardProps {
  name: string
  rarity: Rarity
  imageUrl?: string | null
  rate?: number
  isRevealing?: boolean
}

export default function GachaCard({
  name,
  rarity,
  imageUrl,
  rate,
  isRevealing = false,
}: GachaCardProps) {
  const styles = RARITY_STYLES[rarity]

  return (
    <motion.div
      initial={isRevealing ? { scale: 0, rotate: -180, opacity: 0 } : false}
      animate={{ scale: 1, rotate: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 200, damping: 15 }}
      className={`
        relative w-36 h-48 rounded-2xl border-2 ${styles.border}
        bg-gradient-to-b ${styles.bg}
        shadow-lg ${styles.glow}
        flex flex-col items-center justify-center p-3
        overflow-hidden
      `}
    >
      {/* Shine effect */}
      {(rarity === 'FIVE_STAR' || rarity === 'FOUR_STAR') && (
        <div className="absolute inset-0 shimmer opacity-30" />
      )}

      {/* Character image or placeholder */}
      <div className="w-20 h-20 rounded-xl bg-white/10 flex items-center justify-center mb-2 overflow-hidden">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-3xl">👤</span>
        )}
      </div>

      {/* Rarity stars */}
      <div className="text-xs mb-1">{styles.label}</div>

      {/* Name */}
      <p className="text-white text-xs font-semibold text-center leading-tight">{name}</p>

      {/* Rate */}
      {rate !== undefined && (
        <p className="text-gray-400 text-xs mt-1">{rate}%</p>
      )}
    </motion.div>
  )
}
