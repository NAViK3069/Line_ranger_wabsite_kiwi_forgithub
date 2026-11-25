# 🥝 Line Ranger Kiwi (GitHub Pages)

เว็บแฟนสำหรับเกม **Line Rangers** — สุ่ม Gacha เรนเจอร์ & เกียร์, Meta PvP, Ranger/Gear Book, Lobby, Custom Gacha, ตัวเล่นอนิเมชัน

เวอร์ชันนี้เป็น **static site** บน GitHub Pages ไม่มีเซิร์ฟเวอร์ ไม่มีฐานข้อมูล (ไม่ใช้ Vercel / Neon / Redis แล้ว)
ค่าใช้จ่ายมีแค่ค่าโดเมน

## สถาปัตยกรรม

```
GitHub Actions
  ├─ Daily Data (ทุกวัน 07:23 น.)  ข้อมูลเกมของเราเอง (branch `gamedata`) + อันดับ PvP (lerico) → public/data/*.json → เก็บใน branch `data`
  └─ Deploy (push main / หลัง Daily Data)  next build (static export) → GitHub Pages

Cloudflare Worker (ฟรี)  worker/  →  https://api.ranger-kiwi.com
  ├─ /lerico/*   proxy ไป rangers.lerico.net (ต้นทางไม่มี CORS) — ตัวเล่นอนิเมชัน, /res, Lobby, export รูป
  └─ /api/admin/*  ล็อกอินแอดมิน, commit content/*.json ขึ้น GitHub (→ Deploy รันเอง), ดู build log, สถิติคนเข้า
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
| `src/anme/` | Video Studio (`/custom-video`) — โคลนจากโปรเจค Line_ranger_ANME · CSS แก้ที่ `styles.src.css` แล้วรัน `node scripts/scope-anme-css.cjs` |

## ที่มาของข้อมูล

| ข้อมูล | มาจาก |
|---|---|
| เรนเจอร์ / สกิล / ความสามารถ / ทาเลนต์ / ตื่นพลัง / เกียร์ / Spec+ / ข้อความทุกภาษา | ข้อมูลเกมที่เราถอดเองจากไฟล์ล่าสุดของเกม (branch `gamedata` → `src/lib/gameData.ts`) |
| อันดับ PvP + เกียร์ที่ผู้เล่นใช้ (หน้า /meta) | API ของ rangers.lerico.net (`scripts/refresh-pvp.ts`) |
| อัตราใช้ตื่นพลัง / ทาเลนต์ใน PvP | pvp-data.warmycat.com (`src/lib/pvpUsage.ts`) |
| รูป / เสียง / ไฟล์อนิเมชัน (.sam) / หน้า /res | rangers.lerico.net/res ผ่าน Worker |

## รันในเครื่อง

```bash
npm install
cp .env.example .env.local

# ข้อมูลเกมที่ถอดแล้ว (.gamedata) — ดึงจาก branch gamedata
git fetch --depth=1 origin gamedata && mkdir -p .gamedata && git archive FETCH_HEAD | tar -x -C .gamedata

# Ranger/Gear Book + อันดับ PvP + ไฟล์ JSON ของเว็บ
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
| Worker Secret | `CF_API_TOKEN` | หน้าสถิติแอดมิน — Cloudflare API token สิทธิ์ Account Analytics: Read |
| GitHub Variable | `WORKER_URL`, `SITE_URL`, `CUSTOM_DOMAIN`, `CF_BEACON_TOKEN` | ค่าตอน build |

ขั้นตอนตั้งค่าทั้งหมด (และค่าที่ใช้จริงตอนนี้) ดู [docs/SETUP.md](docs/SETUP.md)
