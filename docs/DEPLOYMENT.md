# Triển khai: Web (Vercel) + API (Railway)

Kiến trúc: web Next.js gọi API qua proxy cùng-origin `apps/web/app/api/[...path]/route.ts`
(server-side fetch, không CORS). Nhờ vậy web và API **được phép nằm ở hai host khác nhau**
(Vercel + Railway) — trình duyệt chỉ bao giờ nói chuyện với domain Vercel; proxy tự bỏ
`Domain=` khỏi `Set-Cookie` nên cookie phiên vẫn áp cho đúng domain Vercel.

## 0. Trước khi lên mạng — đọc [BACKLOG.md § "Còn ⛔"](BACKLOG.md)

Các mục sau **chưa có** và cần cân nhắc trước khi cho dữ liệu trẻ em thật:
quét mã độc file upload, mã hóa at-rest ở tầng ứng dụng, rà soát pháp lý/an toàn trẻ em,
`child_assent` mới ở mức advisory. Dùng để demo/nội bộ thì ổn.

## 1. Postgres (chọn một)

Neon, Supabase, hoặc Postgres add-on ngay trên Railway (đơn giản nhất — cùng project).
Lấy connection string dạng `postgres://user:pass@host:port/db?sslmode=require`.

## 2. API trên Railway

1. **New Project → Deploy from GitHub repo** (chọn repo này).
2. **KHÔNG** đặt "Root Directory" thành `apps/api` — để nguyên gốc repo, vì đây là npm
   workspaces, cần `npm ci` chạy ở root để resolve `@tiny/*`. File `railway.json` ở gốc
   repo đã khai báo `buildCommand`/`startCommand`, Railway sẽ tự áp dụng.
3. **Biến môi trường** (Settings → Variables):

   | Biến | Giá trị |
   |---|---|
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | connection string Postgres ở bước 1 |
   | `API_PORT` | `8080` (hoặc để Railway tự cấp `PORT` — xem ghi chú bên dưới) |
   | `STORAGE_DRIVER` | `filesystem` (demo, mất khi redeploy) hoặc `s3` |
   | `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | nếu dùng `s3` |
   | `AI_PROVIDER` | `PLUGGABLE` (mặc định, tất định) hoặc `ANTHROPIC` |
   | `ANTHROPIC_API_KEY`, `AI_MODEL`, `AI_BASE_URL`, `AI_TIMEOUT_MS` | chỉ khi `AI_PROVIDER=ANTHROPIC` |
   | `NPM_CONFIG_PRODUCTION` | `false` — **bắt buộc**, xem cảnh báo bên dưới |

   ⚠️ **`tsx` là devDependency** (API chạy thẳng TypeScript, không build). Một số nền tảng
   bỏ qua devDependencies khi thấy `NODE_ENV=production` lúc `npm ci`. Đặt
   `NPM_CONFIG_PRODUCTION=false` để đảm bảo `tsx` được cài, nếu không service sẽ crash
   ngay khi khởi động với lỗi "tsx: not found".

4. Railway tự cấp domain `https://<tên>.up.railway.app` và biến `PORT` — nếu dùng biến đó
   thay vì `API_PORT` cố định, đặt thêm `API_PORT=$PORT` trong Variables (Railway hỗ trợ
   tham chiếu biến).
5. Deploy xong, seed nội dung mẫu (chạy MỘT LẦN, idempotent — chạy lại vô hại):
   ```bash
   railway run npm run db:seed --workspace apps/api
   ```
   (`seedTargetOverlays`/`seedSkills` tự chạy mỗi lần khởi động; riêng ContentPack trong
   `content/` chỉ tự nạp khi `NODE_ENV != production`, nên production cần lệnh trên.)
6. Kiểm tra: `curl https://<api-domain>/health` → `{"status":"ok","db":true,"ts":"..."}`.

## 3. Web trên Vercel

1. **Import Project** từ repo này trên vercel.com.
2. **Root Directory**: `apps/web`. Framework tự nhận diện **Next.js**. Vercel tự nhận đây
   là npm-workspaces monorepo và chạy `npm install` ở gốc repo trước khi build trong
   `apps/web` — không cần `vercel.json`.
3. **Biến môi trường** (Project Settings → Environment Variables, áp cho Production):

   | Biến | Giá trị |
   |---|---|
   | `API_INTERNAL_BASE` | `https://<api-domain-railway>` (URL công khai của API, **không** localhost) |

4. Deploy. Mở domain Vercel → `/onboarding` để tạo gia đình đầu tiên.

## 4. Sau khi deploy — việc vận hành định kỳ

- **Retention job** (`npm run job:retention --workspace apps/api`) không tự chạy theo lịch —
  cần một cron ngoài gọi nó định kỳ (Railway "Cron Job" service riêng dùng cùng repo, cùng
  `DATABASE_URL`, lệnh `npm run job:retention --workspace apps/api`).
- **Migration** chạy tự động mỗi lần API khởi động (`runMigrations` trong `index.ts`) — an
  toàn vì idempotent, nhưng nếu chạy nhiều instance cùng lúc, cân nhắc tách bước migrate
  thành release-command riêng thay vì để mỗi instance tự chạy.
- **Backup Postgres**: bật backup tự động của nhà cung cấp (Neon/Supabase/Railway đều có).

## Thay thế: Fly.io thay Railway

Fly cần Dockerfile (không dùng Nixpacks mặc định như Railway). Nếu muốn dùng Fly, nói để
mình viết `Dockerfile` + `fly.toml` tương ứng — chưa làm vì bạn chọn hướng Railway trước.
