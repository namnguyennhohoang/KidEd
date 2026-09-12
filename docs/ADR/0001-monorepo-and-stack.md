# ADR 0001 — Monorepo & Technology Stack

- Status: Accepted (Giai đoạn 0), **cập nhật Giai đoạn 1** (xem ADR 0007)
- Date: 2026-09-07

## Bối cảnh

Spec mục 11 nêu kiến trúc kỹ thuật mặc định "nếu không có ràng buộc khác". Sản phẩm phục vụ một gia đình trước, nhưng phải mở rộng có kiểm soát.

**Ràng buộc phát hiện ở Giai đoạn 1:** máy phát triển chỉ có Node.js, không có Python/Docker. Chủ dự án chọn hướng **all-TypeScript, không Docker**. Xem ADR 0007.

## Quyết định (đã cập nhật theo ADR 0007)

- **Monorepo** với npm workspaces: `apps/*`, `packages/*`.
- **Frontend**: Next.js (App Router) + React + TypeScript + Tailwind CSS + shadcn/ui. PWA + IndexedDB (Dexie) cho offline. Thiết bị chính: **desktop/laptop**.
- **Backend**: ~~FastAPI + Python~~ → **Fastify + TypeScript**, validate bằng **Zod**, OpenAPI qua `@fastify/swagger`.
- **ORM / migrations**: ~~SQLAlchemy + Alembic~~ → **Drizzle ORM + Drizzle Kit**.
- **Database**: PostgreSQL. Local dev: **PGlite** (Postgres nhúng, zero-install). Production: Postgres thật.
- **Object storage**: cổng `StoragePort`. Dev: `FilesystemStorage` (`./data/uploads`, gitignored). Production: S3-compatible.
- **Cache/queue**: Redis **chỉ khi thực sự cần**.
- **API**: REST + OpenAPI. Event schema tường minh.
- **Auth**: session cookie an toàn; child session do phụ huynh mở.
- **Container**: ~~Docker Compose~~ → không dùng ở dev. Đóng gói production để sau.
- **Testing**: Vitest (unit + integration) + Playwright E2E + contract tests.
- **AI**: provider abstraction (`AiProvider` port), không lock-in. Giai đoạn 1: **chỉ deterministic**, không gọi provider thật.

## Hệ quả

- **Một ngôn ngữ duy nhất (TypeScript)** cho web + api + domain → chia sẻ code (rule engine chạy cả server lẫn client offline).
- `packages/domain` (nghiệp vụ) tách khỏi ORM để test nhanh và tái dùng.
- JSON Schema (`packages/content-schema`) là nguồn sự thật cho payload nội dung, dùng chung web/api.
- Khác biệt PGlite ↔ Postgres thật: giữ SQL ở mức Drizzle chuẩn, có job CI chạy migration trên Postgres thật trước production.

## Lựa chọn đã cân nhắc

- FastAPI/Python + Docker (đúng spec mục 11): loại ở dev vì máy thiếu toolchain; có thể quay lại nếu triển khai đội ngũ lớn hơn.
- Python + SQLite (không Docker): loại — vẫn cần toolchain Python thứ hai; khác biệt dialect SQLite/Postgres lớn hơn PGlite.
- Next.js full-stack (API routes thay `apps/api`): loại — spec yêu cầu tách bạch backend rõ ràng; giữ `apps/api` là service Fastify độc lập.
- Nx/Turborepo: chưa cần; npm workspaces đủ.
