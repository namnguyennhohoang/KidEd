# Triển khai: Web (Vercel) + API (Render, miễn phí) + Postgres (Neon, miễn phí)

Kiến trúc: web Next.js gọi API qua proxy cùng-origin `apps/web/app/api/[...path]/route.ts`
(server-side fetch, không CORS). Nhờ vậy web và API **được phép nằm ở hai host khác nhau**
— trình duyệt chỉ bao giờ nói chuyện với domain Vercel; proxy tự bỏ `Domain=` khỏi
`Set-Cookie` nên cookie phiên vẫn áp cho đúng domain Vercel.

**Bộ này 0đ/tháng, không cần thẻ để trả phí.** Đánh đổi: service Render free ngủ sau ~15
phút không có request → lượt gọi đầu tiên sau đó chậm ~30–50s để "thức dậy". Chấp nhận được
cho demo/gia đình dùng; không hợp nếu cần phản hồi tức thời liên tục (xem § "Thay thế" cuối
trang nếu cần luôn nhanh, có trả phí).

## 0. Trước khi lên mạng — đọc [BACKLOG.md § "Còn ⛔"](BACKLOG.md)

Các mục sau **chưa có** và cần cân nhắc trước khi cho dữ liệu trẻ em thật:
quét mã độc file upload, mã hóa at-rest ở tầng ứng dụng, rà soát pháp lý/an toàn trẻ em,
`child_assent` mới ở mức advisory. Dùng để demo/nội bộ thì ổn.

## 1. Postgres miễn phí trên Neon

1. Vào **https://neon.tech** → đăng nhập bằng GitHub → **Create a project**.
2. Sau khi tạo, vào **Connection Details** → copy connection string dạng
   `postgres://<user>:<pass>@<host>/<db>?sslmode=require`.
3. Không cần tạo bảng gì — API tự chạy migration khi khởi động lần đầu.

Neon free tier không có hạn dùng (khác Postgres free của Render, tự xoá sau một thời gian) —
vì vậy dùng Neon làm CSDL dù host API ở đâu.

## 2. API miễn phí trên Render

1. Vào **https://render.com** → đăng nhập bằng GitHub → **New** → **Blueprint**.
2. Chọn repo `namnguyennhohoang/KidEd`. Render đọc thấy `render.yaml` ở gốc repo và tự đề
   xuất tạo service `tiny-api` (Node, plan Free, build `npm ci`, start
   `npm run start --workspace apps/api`) — bấm **Apply**.
   - Nếu muốn tạo tay thay vì Blueprint: **New** → **Web Service** → chọn repo → Runtime
     **Node** → Root Directory để **trống** (không phải `apps/api` — cần `npm ci` chạy ở
     gốc repo vì đây là npm workspaces) → Build Command `npm ci` → Start Command
     `npm run start --workspace apps/api`.
3. **Biến môi trường** (service → tab **Environment**) — `render.yaml` đã điền sẵn hầu hết,
   chỉ cần bổ sung:

   | Biến | Giá trị |
   |---|---|
   | `DATABASE_URL` | connection string Neon ở bước 1 |
   | `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | chỉ khi đổi `STORAGE_DRIVER=s3` |
   | `ANTHROPIC_API_KEY`, `AI_MODEL`, `AI_BASE_URL`, `AI_TIMEOUT_MS` | chỉ khi đổi `AI_PROVIDER=ANTHROPIC` |

   ⚠️ **`tsx` là devDependency** (API chạy thẳng TypeScript, không build). `render.yaml` đã
   đặt sẵn `NPM_CONFIG_PRODUCTION=false` — đừng xoá biến này, thiếu nó service sẽ crash lúc
   khởi động với lỗi "tsx: not found".

4. Deploy xong, Render cấp domain dạng `https://tiny-api.onrender.com`. Kiểm tra:
   `curl https://tiny-api.onrender.com/health` → `{"status":"ok","db":true,"ts":"..."}`
   (lần gọi đầu có thể mất ~30–50s nếu service vừa "ngủ dậy").
5. Seed nội dung mẫu — chạy MỘT LẦN (idempotent, chạy lại vô hại). Render free không có
   shell/CLI chạy lệnh một lần tiện như Railway; cách đơn giản nhất là tạm sửa Start Command
   thành `npm run db:seed --workspace apps/api && npm run start --workspace apps/api`,
   deploy một lần, xem log thấy `Seed hoàn tất: 3 pack.`, rồi đổi Start Command về lại
   `npm run start --workspace apps/api` và deploy lại.
   (`seedTargetOverlays`/`seedSkills` tự chạy mỗi lần khởi động; riêng ContentPack trong
   `content/` chỉ tự nạp khi `NODE_ENV != production`, nên production cần bước trên.)

## 3. Web miễn phí trên Vercel

1. Vào **https://vercel.com** → đăng nhập bằng GitHub → **Add New → Project** → chọn repo
   `namnguyennhohoang/KidEd`.
2. **Root Directory**: `apps/web`. Framework tự nhận diện **Next.js**. Vercel tự nhận đây
   là npm-workspaces monorepo và chạy `npm install` ở gốc repo trước khi build trong
   `apps/web` — không cần `vercel.json`.
3. **Biến môi trường** (Project Settings → Environment Variables, áp cho Production):

   | Biến | Giá trị |
   |---|---|
   | `API_INTERNAL_BASE` | `https://tiny-api.onrender.com` (domain Render ở bước 2, **không** localhost) |

4. Deploy. Mở domain Vercel → `/onboarding` để tạo gia đình đầu tiên.

## 4. Sau khi deploy — việc vận hành định kỳ

- **Retention job** (`npm run job:retention --workspace apps/api`) không tự chạy theo lịch —
  Render free không có Cron Job miễn phí đi kèm; có thể dùng một dịch vụ cron ngoài miễn phí
  (vd cron-job.org gọi một endpoint kích hoạt job, hoặc GitHub Actions `schedule` chạy
  `railway`-style qua SSH/API) — chưa cấu hình, làm sau nếu cần.
- **Migration** chạy tự động mỗi lần API khởi động (`runMigrations` trong `index.ts`) — an
  toàn vì idempotent.
- **Backup Postgres**: Neon có point-in-time restore theo giờ ở free tier — không cần cấu
  hình thêm, nhưng nên biết giới hạn (xem trang pricing Neon) trước khi coi đó là backup dài hạn.
- **Đánh thức trước khi demo**: nếu sắp cho ai xem trực tiếp, mở trước `https://tiny-api.onrender.com/health`
  vài phút để service kịp "thức dậy", tránh chờ 30–50s ngay lúc demo.

## Thay thế trả phí (không ngủ, nhanh liên tục)

- **Railway** thay Render: file `railway.json` ở gốc repo đã sẵn cho hướng này (New Project
  → Deploy from GitHub repo → thêm Postgres add-on hoặc dùng Neon → biến môi trường tương tự
  bảng ở trên, thêm `NODE_ENV=production`). Có credit dùng thử, sau đó tính phí (~5$/tháng).
- **Fly.io**: cần Dockerfile (không dùng Nixpacks/Blueprint như Render/Railway). Nếu muốn,
  nói để viết `Dockerfile` + `fly.toml` tương ứng.
