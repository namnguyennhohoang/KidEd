# ADR 0007 — All-TypeScript stack, không Docker ở dev

- Status: Accepted (Giai đoạn 1)
- Date: 2026-09-07
- Sửa đổi: ADR 0001

## Bối cảnh

Khi bắt đầu Giai đoạn 1, kiểm tra máy phát triển (Windows 11): có **Node.js 24 + git**, **không có Python, không có Docker, không có pip**. Stack mặc định spec mục 11 (FastAPI/Python + Docker + Postgres + MinIO) cần cài 2 toolchain nặng.

Chủ dự án đã chọn: **all-TypeScript, không Docker**; thiết bị chính của trẻ là **desktop/laptop**; Giai đoạn 1 **không** tích hợp AI provider thật (chỉ rule engine deterministic + fallback).

## Quyết định

| Thành phần | Spec gốc (mục 11) | Giai đoạn 1 |
|---|---|---|
| Backend | FastAPI + Python + Pydantic | **Fastify + TypeScript + Zod** |
| ORM / migration | SQLAlchemy + Alembic | **Drizzle ORM + Drizzle Kit** |
| DB (dev) | Postgres qua Docker | **PGlite** (`@electric-sql/pglite`) — Postgres nhúng, zero-install |
| DB (prod) | Postgres | Postgres thật (không đổi) |
| Object storage (dev) | MinIO qua Docker | **FilesystemStorage** (`./data/uploads`) sau cổng `StoragePort` |
| Object storage (prod) | S3-compatible | S3-compatible (không đổi) |
| Container | Docker Compose | Không dùng ở dev |
| AI | provider abstraction | Giữ abstraction; GĐ1 chỉ `DeterministicCoach` |

Giữ nguyên: monorepo npm workspaces, Next.js/React/Tailwind/shadcn cho web, PWA + IndexedDB offline, REST + OpenAPI, tách `apps/api` là service độc lập, `packages/domain` không phụ thuộc ORM, provider abstraction cho AI.

## Hệ quả

- **Ưu điểm**: một ngôn ngữ, chạy ngay không cài thêm, rule engine chia sẻ được giữa server và client (offline-first), giảm chi phí bảo trì.
- **Rủi ro**: PGlite không phải Postgres 1:1 (thiếu vài extension, khác một số hành vi concurrency). Giảm thiểu: chỉ dùng SQL qua Drizzle chuẩn; thêm CI job chạy migration + test tích hợp trên Postgres thật **trước khi** tuyên bố production-ready (đưa vào `docs/BACKLOG.md` GĐ tiền-production).
- Tài liệu bị ảnh hưởng đã cập nhật: `README.md`, `.env.example`, `docs/API_OUTLINE.md`, `docs/DATA_MODEL.md §5`, `docs/BACKLOG.md`.
- Nếu sau này cần quay lại Python/Docker (đội ngũ lớn, yêu cầu hạ tầng): `packages/domain` + `packages/content-schema` + JSON Schema + ERD giữ nguyên giá trị; chỉ viết lại tầng `apps/api`.

## Không thay đổi lằn ranh an toàn / sư phạm

Mọi ràng buộc ở `CHILD_SAFETY.md`, `PEDAGOGY.md`, `AI_BEHAVIOR.md`, `SECURITY.md` giữ nguyên. Đổi toolchain không nới lỏng bất biến nào.
