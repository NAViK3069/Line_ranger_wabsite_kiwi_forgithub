// ====================================================
// Rate limit — ไม่มีเซิร์ฟเวอร์แล้ว (static site)
// route handlers เดิมถูกเรียกเฉพาะตอน build (scripts/emit-data.ts) ซึ่งยิงหลายพันครั้งจาก "IP เดียว"
// จึงต้องผ่านเสมอ — การกันบอทย้ายไปเป็น Rate limiting rule ของ Cloudflare แทน
// ====================================================

export interface RateLimitConfig {
  interval: number
  limit: number
}

export function rateLimit(_config: RateLimitConfig) {
  return (_key: string) => ({ success: true, remaining: Infinity, reset: 0 })
}

export function getClientIp(headers: { get(name: string): string | null }): string {
  return headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'build'
}

export const apiRateLimit = rateLimit({ interval: 60_000, limit: Infinity })
export const authRateLimit = rateLimit({ interval: 60_000, limit: Infinity })
export const uploadRateLimit = rateLimit({ interval: 60_000, limit: Infinity })
