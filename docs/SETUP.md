# ขั้นตอนตั้งค่า (ทำครั้งเดียว)

## ส่วนที่ 1 — GitHub

> ⚠ หน้าเว็บอ้างรูปด้วย path แบบ `/gacha/...` จึงต้องอยู่ที่ราก (root) ของโดเมน
> URL แบบ `navik3069.github.io/Line_ranger_wabsite_kiwi_forgithub/` จะโหลดรูป/ไฟล์ไม่ครบ
> → ช่วงที่ยังไม่มีโดเมน ให้เปิดเว็บผ่าน Worker แทน: `https://line-ranger-kiwi.<บัญชี>.workers.dev/`
>   (Worker ดึงหน้าเว็บจาก GitHub Pages มาเสิร์ฟที่ราก — ตั้งไว้แล้วใน `PAGES_ORIGIN` ของ wrangler.toml)

1. repo ต้องเป็น **Public** (Settings → General → Danger Zone → Change visibility)
2. **Settings → Pages → Build and deployment → Source = GitHub Actions**
3. **Settings → Actions → General → Workflow permissions = Read and write permissions** → Save
4. **Actions** → เลือก **Deploy** → **Run workflow** (ครั้งแรก)

## ส่วนที่ 2 — Cloudflare Worker

### 2.1 สมัคร + deploy
1. สมัครที่ https://dash.cloudflare.com/sign-up (ฟรี ไม่ต้องใช้บัตร)
2. ในเครื่อง:
   ```bash
   cd worker
   npm install
   npx wrangler login        # เปิดเบราว์เซอร์ให้กด Allow
   npx wrangler deploy       # ได้ URL แบบ https://line-ranger-kiwi.<ชื่อบัญชี>.workers.dev
   ```

### 2.2 GitHub token สำหรับ Worker (ให้หน้าแอดมิน commit ได้)
GitHub → Settings (ของบัญชี) → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token
- Repository access: **Only select repositories** → `Line_ranger_wabsite_kiwi_forgithub`
- Permissions → Repository permissions:
  - **Contents: Read and write**
  - **Actions: Read and write**
- Expiration: เลือกตามสะดวก (หมดอายุแล้วต้องสร้างใหม่ + ใส่ secret ใหม่)

### 2.3 ใส่ความลับให้ Worker (พิมพ์ค่าเองตอนถูกถาม — ไม่ต้องบอกใคร)
```bash
cd worker
npx wrangler secret put ADMIN_PASSWORD    # รหัสผ่านแอดมินที่จะใช้ล็อกอิน (ยาวๆ)
npx wrangler secret put SESSION_SECRET    # สุ่มยาวๆ เช่นจาก: node -e "console.log(crypto.randomUUID()+crypto.randomUUID())"
npx wrangler secret put GITHUB_TOKEN      # token จากข้อ 2.2
```
ชื่อผู้ใช้แอดมินตั้งที่ `worker/wrangler.toml` → `ADMIN_USERNAME`

### 2.4 บอก GitHub ว่า Worker อยู่ที่ไหน
GitHub repo → Settings → Secrets and variables → Actions → **Variables** → New repository variable
- `WORKER_URL` = URL จากข้อ 2.1 (เช่น `https://line-ranger-kiwi.xxx.workers.dev`)
- `SITE_URL` = URL ของเว็บ (ช่วงนี้ใส่ URL ของ Worker เดียวกัน)

แล้ว Actions → Deploy → Run workflow อีกรอบ → เปิด `https://line-ranger-kiwi.<บัญชี>.workers.dev/` ได้เลย

## ส่วนที่ 3 — โดเมน (เมื่อซื้อแล้ว)

1. Cloudflare Dashboard → **Domain Registration → Register Domains** → ซื้อโดเมน (ราคาทุน)
   (ถ้าซื้อที่อื่น: Cloudflare → Add a site → ทำตามที่บอกให้เปลี่ยน nameserver)
2. Cloudflare → โดเมน → **DNS → Records** → เพิ่ม:
   | Type | Name | Content | Proxy |
   |---|---|---|---|
   | CNAME | `@` | `navik3069.github.io` | DNS only (เมฆสีเทา) ตอนแรก |
   | CNAME | `www` | `navik3069.github.io` | DNS only |
3. GitHub repo → Settings → Pages → **Custom domain** = โดเมนของคุณ → Save → รอจนติ๊ก **Enforce HTTPS** ได้ แล้วติ๊ก
4. GitHub Variables: `CUSTOM_DOMAIN` = โดเมน, `SITE_URL` = `https://โดเมน`
5. Worker ใช้โดเมนย่อย `api.โดเมน` (ได้ cache ที่ edge ด้วย):
   - แก้ `worker/wrangler.toml` → เปิดส่วน `[[routes]]` ใส่ `api.โดเมน`
   - เพิ่ม `https://โดเมน` ใน `ALLOWED_ORIGINS` และ **ลบบรรทัด `PAGES_ORIGIN`** (ไม่ต้องเสิร์ฟหน้าเว็บผ่าน Worker แล้ว)
   - `npx wrangler deploy`
   - GitHub Variable `WORKER_URL` = `https://api.โดเมน` → Run workflow Deploy
6. (แนะนำ) Cloudflare → โดเมน → **Security → WAF → Rate limiting rules** → สร้าง rule:
   URI Path contains `/api/admin/login` → 10 requests / 1 minute → Block (กันเดารหัสผ่าน)

## ปิดของเก่า (หลังเว็บใหม่ใช้งานได้แล้ว)
- Vercel: ลบ project
- Neon: ลบ project (ข้อมูลที่แอดมินแก้ถูกย้ายมาไว้ใน `content/` แล้ว)
- Upstash Redis: ลบ database
- Cloudinary: รูปตู้กาชาถูกย้ายมาไว้ใน `public/content-images/` แล้ว — ลบได้ถ้าไม่ได้ใช้อย่างอื่น
