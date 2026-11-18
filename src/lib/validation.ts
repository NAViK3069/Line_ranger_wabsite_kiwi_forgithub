// ====================================================
// Input Validation ด้วย Zod
// ตรวจสอบและกรอง input ก่อนนำไปใช้งาน
// ====================================================

import { z } from 'zod'

// Schema สำหรับสร้าง GachaPool ใหม่
export const createGachaPoolSchema = z.object({
  name: z
    .string()
    .min(1, 'กรุณาใส่ชื่อ Banner')
    .max(100, 'ชื่อต้องไม่เกิน 100 ตัวอักษร')
    .trim(),
  description: z
    .string()
    .max(500, 'คำอธิบายต้องไม่เกิน 500 ตัวอักษร')
    .optional(),
  isActive: z.boolean().default(false),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
})

// Schema สำหรับสร้างตัวละครใหม่
export const createCharacterSchema = z.object({
  name: z
    .string()
    .min(1, 'กรุณาใส่ชื่อตัวละคร')
    .max(100, 'ชื่อต้องไม่เกิน 100 ตัวอักษร')
    .trim(),
  rarity: z.enum(['ONE_STAR', 'TWO_STAR', 'THREE_STAR', 'FOUR_STAR', 'FIVE_STAR']),
  element: z.string().max(50).optional(),
})

// Schema สำหรับ Admin Login
export const adminLoginSchema = z.object({
  username: z
    .string()
    .min(1, 'กรุณาใส่ username')
    .max(50)
    .trim()
    .toLowerCase(),
  password: z
    .string()
    .min(8, 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร')
    .max(100),
})

// Helper function: validate และ return result
export function validate<T>(schema: z.ZodSchema<T>, data: unknown):
  | { success: true; data: T }
  | { success: false; errors: string[] } {
  const result = schema.safeParse(data)
  if (result.success) {
    return { success: true, data: result.data }
  }
  const errors = result.error.errors.map((e) => e.message)
  return { success: false, errors }
}
