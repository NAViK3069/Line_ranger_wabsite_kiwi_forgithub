# การตั้งค่าเว็บ (อ้างอิง)

ตั้งค่าครบแล้ว เว็บใช้งานจริงอยู่ที่ **https://ranger-kiwi.com**
เอกสารนี้เก็บไว้ดูว่าตั้งอะไรไว้ที่ไหน และไว้ใช้ตอนต้องทำใหม่ (เช่น token หมดอายุ หรือย้ายบัญชี)

| ส่วน | ที่อยู่ |
|---|---|
| หน้าเว็บ | GitHub Pages → `ranger-kiwi.com` (+ `www`) |
| Worker | Cloudflare Worker `line-ranger-kiwi` → `api.ranger-kiwi.com` (ลิงก์ `*.workers.dev` ปิดแล้ว) |
| โดเมน | ซื้อที่ Cloudflare Registrar (2026-11-19) |

> ⚠ หน้าเว็บอ้างไฟล์ด้วย path แบบ `/gacha/...` จึงต้องอยู่ที่ราก (root) ของโดเมน
> URL แบบ `navik3069.github.io/Line_ranger_wabsite_kiwi_forgithub/` จะโหลดรูป/ไฟล์ไม่ครบ

## 1. GitHub

1. repo ต้องเป็น **Public** (branch `data` ถูกดึงตอน build โดยไม่ใช้ token)
2. **Settings → Pages → Build and deployment → Source = GitHub Actions**
3. **Settings → Pages → Custom domain** = `ranger-kiwi.com` + ติ๊ก **Enforce HTTPS**
4. **Settings → Actions → General → Workflow permissions = Read and write permissions**
5. **Settings → Secrets and variables → Actions → Variables**

   | ชื่อ | ค่า |
   |---|---|
   | `WORKER_URL` | `https://api.ranger-kiwi.com` |
   | `SITE_URL` | `https://ranger-kiwi.com` |
   | `CUSTOM_DOMAIN` | `ranger-kiwi.com` |
   | `CF_BEACON_TOKEN` | token สคริปต์ Cloudflare Web Analytics (ไม่ใช่ความลับ · เว้นว่าง = ไม่นับสถิติ) |

แก้ค่าแล้วต้อง **Actions → Deploy → Run workflow** ใหม่ (ค่าพวกนี้ถูกฝังตอน build)

## 2. Cloudflare DNS (โดเมน ranger-kiwi.com)

| Type | Name | Content | Proxy |
|---|---|---|---|
| CNAME | `@` | `navik3069.github.io` | DNS only (เมฆสีเทา) |
| CNAME | `www` | `navik3069.github.io` | DNS only |

`api.ranger-kiwi.com` ไม่ต้องเพิ่มเอง — `wrangler deploy` สร้าง DNS + ใบรับรองให้จาก `[[routes]]` ใน `worker/wrangler.toml`

## 3. Cloudflare Worker

ค่าทั่วไปอยู่ใน `worker/wrangler.toml` → `[vars]`
(`ADMIN_USERNAME`, `GITHUB_REPO`, `GITHUB_BRANCH`, `ALLOWED_ORIGINS`, `CF_ACCOUNT_ID`)
`workers_dev = false` ต้องคงไว้ — พอมี `[[routes]]` แล้ว ถ้าไม่ระบุ wrangler จะปิด workers.dev ให้เองและขึ้น error 1042

### 3.1 deploy (ทุกครั้งที่แก้โค้ดใน `worker/`)
workflow Deploy ของ GitHub **ไม่** deploy Worker ให้ — ต้องรันเองในเครื่อง:
```bash
cd worker
npm install
npx wrangler login        # ครั้งแรกในเครื่องนั้น
npx wrangler deploy
```

### 3.2 GitHub token ของ Worker (ให้หน้าแอดมิน commit / สั่งรัน workflow ได้)
GitHub → Settings (ของบัญชี) → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token
- Repository access: **Only select repositories** → `Line_ranger_wabsite_kiwi_forgithub`
- Repository permissions: **Contents: Read and write**, **Actions: Read and write**
- หมดอายุแล้ว → สร้างใหม่ แล้ว `npx wrangler secret put GITHUB_TOKEN` อีกรอบ

### 3.3 ความลับ (Worker Secrets — พิมพ์ค่าเองตอนถูกถาม)
```bash
cd worker
npx wrangler secret put ADMIN_PASSWORD    # รหัสผ่านแอดมิน (ยาวๆ)
npx wrangler secret put SESSION_SECRET    # สุ่มยาว ≥ 32 ตัว เช่น: node -e "console.log(crypto.randomUUID()+crypto.randomUUID())"
npx wrangler secret put GITHUB_TOKEN      # token จากข้อ 3.2
npx wrangler secret put CF_API_TOKEN      # (หน้าสถิติแอดมิน) Cloudflare API token สิทธิ์ Account Analytics: Read
```
ถ้า `ADMIN_PASSWORD` / `SESSION_SECRET` / `GITHUB_TOKEN` ขาดตัวใดตัวหนึ่ง Worker จะปิดระบบแอดมินทั้งหมด (ล็อกอินไม่ได้)

### 3.4 กันเดารหัสผ่าน
- Worker จำกัดล็อกอินไว้แล้ว 5 ครั้ง / 60 วินาที / IP (`[[ratelimits]]` ใน wrangler.toml)
- (เสริม) Cloudflare → โดเมน → **Security → WAF → Rate limiting rules**:
  URI Path contains `/api/admin/login` → 10 requests / 1 minute → Block

## 4. ของเก่า

โปรเจคเดิม (Vercel + Neon + Upstash Redis + Cloudinary) เลิกใช้แล้ว
ข้อมูลที่แอดมินแก้อยู่ใน `content/` และรูปตู้กาชาอยู่ใน `public/content-images/`
