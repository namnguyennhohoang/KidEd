# Hành trình Tự làm được

Nền tảng giáo dục AI cá nhân hóa cho trẻ. Mục tiêu: giúp trẻ trở thành người học **tự chủ**, có nền tảng học thuật vững, biết suy nghĩ – sáng tạo – giao tiếp, chịu được thất bại, có sức khỏe và chiều sâu ở một vài lĩnh vực.

> Đây **không** phải chatbot giải bài tập. AI đóng vai người huấn luyện theo lối Socratic, không làm thay trẻ.

## Trạng thái hiện tại: Giai đoạn 0 (Discovery & Kiến trúc)

Chưa xây UI lớn. Repo hiện chứa:

| Thư mục | Nội dung |
|---|---|
| `docs/` | Tài liệu sản phẩm, sư phạm, an toàn trẻ em, data model, hành vi AI, bảo mật |
| `docs/ADR/` | Architecture Decision Records |
| `packages/content-schema/` | JSON Schema cho ContentPack / LearningUnit / InteractionSkill / Event + trình validate |
| `content/` | Nội dung mẫu để kiểm chứng schema (không phải chương trình đầy đủ) |

## Stack (ADR 0001 + ADR 0007 — all-TypeScript, không Docker)

Next.js + React + TS + Tailwind + shadcn/ui (web) · Fastify + TS + Zod (api) · Drizzle ORM · PGlite ở dev / Postgres ở production · FilesystemStorage ở dev / S3 ở production · Vitest + Playwright · AI provider abstraction (Giai đoạn 1 chỉ deterministic).

## Cây monorepo (đích Giai đoạn 1+)

```text
apps/
  web/            # Next.js + React + TS + Tailwind + shadcn/ui + PWA + IndexedDB
  api/            # Fastify + TypeScript + Zod + Drizzle + PGlite/Postgres
packages/
  domain/         # Logic nghiệp vụ độc lập lớp (rule engine, chu trình học) — pure TS, no ORM
  content-schema/ # JSON Schema + validation (đã có ở Giai đoạn 0)
  ui/             # Component dùng chung
  ai-gateway/     # Provider port + DeterministicCoach fallback
  analytics/      # Event schema, chỉ số học tập
content/
  frameworks/  skills/  packs/  overlays/  rubrics/
docs/
infra/            # Cấu hình hạ tầng production (để sau)
tests/            # contract / e2e dùng chung
```

## Lệnh

```bash
npm install                 # cài toàn bộ workspace

npm run validate:content    # kiểm chứng nội dung theo JSON Schema + semantic (Giai đoạn 0)

# Giai đoạn 1:
npm run db:migrate          # chạy migration từ DB rỗng (PGlite tại ./data/pglite)
npm run db:seed             # seed idempotent (ContentPack đã duyệt, qua validate)
npm run api                 # Fastify tại http://localhost:4000 (tự seed ở dev nếu DB rỗng)
npm run web                 # Next.js tại http://localhost:3000 (proxy /api -> :4000)
npm test                    # Vitest: unit + integration (57 test)
npm run lint                # ESLint
npm run typecheck           # tsc --noEmit mọi workspace
npm run build:web           # next build

npm run e2e:install         # (một lần) tải Chromium cho Playwright
npm run e2e                 # Playwright: onboarding -> child session -> Choose

npm run job:retention       # dọn dữ liệu quá hạn (đặt cron ở hạ tầng)
npm run db:generate --workspace apps/api   # sau khi đổi Drizzle schema: sinh migration SQL mới
```

Chạy đủ dev: mở 2 terminal — `npm run api` và `npm run web` — rồi vào http://localhost:3000.

## Tiến độ Giai đoạn 1

**Giai đoạn 1 (Base Camp MVP)** ✅ — nền tảng, auth/authz, learning loop + coach tất định, offline local-first + artifact mã hóa, dashboard + governance + export/delete, CI 2 job, adapter Postgres/S3, 4 lượt hardening từ tự-audit.

**Giai đoạn 2 (Content Studio + AI Coach)** ✅ — soạn/duyệt/xuất bản ContentPack (DRAFT→IN_REVIEW→PUBLISHED, PIN gate, AI-generated không auto-publish), import JSON/CSV, web `/studio`; **AI Gateway** (rule engine quyết định, LLM chỉ diễn đạt, chống prompt injection + moderation + circuit breaker + fallback tất định — `AI_PROVIDER=PLUGGABLE` chưa gọi LLM thật).

**Giai đoạn 3 (Explorer & TDN Readiness)** 🔨 — Admissions Rule Tracker (quy chế version hóa theo năm, so sánh, cảnh báo lỗi thời), error taxonomy 9 nguyên nhân, readiness-by-skill (không dự báo đậu/rớt), ContentPack Explorer lớp 3, web `/parent/admissions` + `/parent/child/[id]/readiness`.

Còn (cần chuyên gia người / hạ tầng): rà soát bởi người, quét malware upload, mã hóa at-rest production, `child_assent` policy. Xem [docs/AUDIT_PHASE1.md](docs/AUDIT_PHASE1.md), [docs/MVP_ACCEPTANCE.md](docs/MVP_ACCEPTANCE.md), [docs/BACKLOG.md](docs/BACKLOG.md).

`npm test` → **169 pass** (+2 pg-smoke trong CI) · `npm run e2e` → **4 pass** (chu trình học + readiness · offline→online · Quy chế tuyển sinh · Content Studio).

## Tài liệu nên đọc trước

1. [docs/PRODUCT.md](docs/PRODUCT.md) – phạm vi sản phẩm, mục tiêu 3 tầng, MVP
2. [docs/PEDAGOGY.md](docs/PEDAGOGY.md) – nguyên tắc sư phạm, chu trình học, thang trợ giúp
3. [docs/CHILD_SAFETY.md](docs/CHILD_SAFETY.md) – threat model & lằn ranh đỏ về an toàn trẻ
4. [docs/DATA_MODEL.md](docs/DATA_MODEL.md) – ERD và các nhóm dữ liệu
5. [docs/AI_BEHAVIOR.md](docs/AI_BEHAVIOR.md) – rule engine vs LLM, structured output
6. [docs/CONTENT_AUTHORING.md](docs/CONTENT_AUTHORING.md) – quy trình soạn & duyệt nội dung
7. [docs/SECURITY.md](docs/SECURITY.md) – bảo mật, quyền riêng tư, RBAC
8. [docs/BACKLOG.md](docs/BACKLOG.md) – backlog Giai đoạn 0 & 1
9. [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) – triển khai web (Vercel) + API (Railway)

## Biến cấu hình mặc định

Xem [.env.example](.env.example). Các giá trị là **mặc định kỹ thuật**, không phải kết luận y khoa hay giới hạn giáo dục cứng.
