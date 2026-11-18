# 🥝 Line Ranger Kiwi (GitHub Pages)

เว็บแฟนสำหรับเกม **Line Rangers** — สุ่ม Gacha เรนเจอร์ & เกียร์, Meta PvP, Ranger/Gear Book, Lobby, Custom Gacha, ตัวเล่นอนิเมชัน

เวอร์ชันนี้เป็น **static site** บน GitHub Pages ไม่มีเซิร์ฟเวอร์ ไม่มีฐานข้อมูล (ไม่ใช้ Vercel / Neon / Redis แล้ว)
ค่าใช้จ่ายมีแค่ค่าโดเมน

## สถาปัตยกรรม

```
GitHub Actions
  ├─ Daily Data (ทุกวัน 07:00 น.)  scrape lerico/warmycat → public/data/*.json → เก็บใน branch `data`
  └─ Deploy (push main / หลัง Daily Data)  next build (static export) → GitHub Pages

Cloudflare Worker (ฟรี)  worker/
  ├─ /lerico/*   proxy ไป rangers.lerico.net (ต้นทางไม่มี CORS) — ตัวเล่นอนิเมชัน, /res, Lobby, export รูป
  └─ /admin/*    ล็อกอินแอดมิน + commit content/*.json ขึ้น GitHub → Deploy รันเอง
```

| โฟลเดอร์ | คืออะไร |
|---|---|
| `src/app/` | หน้าเว็บ (Next.js App Router, `output: 'export'`) |
| `src/server/api/` | route handler เดิม — **รันเฉพาะตอน build** เพื่อเขียนไฟล์ JSON (`scripts/emit-data.ts`) |
| `src/lib/staticApi.ts` | `apiFetch('/api/...')` ฝั่ง browser → อ่าน `/data/...json` แทน API เดิม |
| `src/lib/adminApi.ts` | หน้าแอดมิน → Worker (อ่าน/เขียน `content/`) |
| `src/lib/db.ts` | "ฐานข้อมูล" แบบไฟล์ JSON ที่หน้าตาเหมือน Prisma (ใช้ตอน build เท่านั้น) |
| `content/` | ข้อมูลที่แอดมินแก้: ตู้กาชา, top40, หน้า About |
| `worker/` | Cloudflare Worker |

## รันในเครื่อง

```bash
npm install
cp .env.example .env.local

# ข้อมูลเกม (ครั้งแรกใช้เวลาราว 10–20 นาที)
npm run data:sync
npm run data:pvp
npm run data:emit

# Worker (อีกหน้าต่าง) — ต้องมี worker/.dev.vars (ดู worker/wrangler.toml)
cd worker && npm install && npx wrangler dev

npm run dev          # http://localhost:3000
# หรือดูแบบเดียวกับของจริง:
npm run build && npm run serve
```

## ความลับ (ไม่อยู่ใน repo)

| ที่ | ชื่อ | ใช้ทำอะไร |
|---|---|---|
| Worker Secret | `ADMIN_PASSWORD` | รหัสผ่านแอดมิน |
| Worker Secret | `SESSION_SECRET` | เซ็น token ล็อกอิน (สุ่มยาวๆ) |
| Worker Secret | `GITHUB_TOKEN` | fine-grained token: repo นี้เท่านั้น, Contents + Actions = Read and write |
| GitHub Variable | `WORKER_URL`, `SITE_URL`, `CUSTOM_DOMAIN` | ค่าตอน build |
