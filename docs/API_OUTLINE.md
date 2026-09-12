# API_OUTLINE.md — Phác thảo API (REST / OpenAPI)

Trạng thái: **outline** cho Giai đoạn 1. Triển khai bằng **Fastify + TypeScript + Zod**, OpenAPI sinh qua `@fastify/swagger` tại `/openapi.json` (ADR 0007). Mọi endpoint dữ liệu trẻ kiểm tra quan hệ + scope ở backend.

## Quy ước

- Base: `/api/v1`
- Auth: cookie session (HttpOnly). Child session do phụ huynh mở, TTL ngắn.
- Lỗi: RFC 7807 `application/problem+json`.
- Idempotency: `client_generated_id` cho events/artifacts tạo offline.
- Phân trang: cursor-based.

## Identity & Family

| Method | Path | Vai trò | Mô tả |
|---|---|---|---|
| POST | `/auth/login` | công khai | Đăng nhập phụ huynh |
| POST | `/auth/logout` | mọi | |
| POST | `/auth/parent-pin/verify` | PARENT | Mở khóa dashboard |
| POST | `/families` | PARENT | Tạo family (onboarding) |
| GET | `/families/me` | PARENT | Thông tin family + trẻ |
| POST | `/children` | PARENT | Tạo hồ sơ trẻ tối thiểu |
| GET | `/children/{childId}` | PARENT, TEACHER(scope) | |
| PATCH | `/children/{childId}` | PARENT | Cập nhật hồ sơ / cấu hình thời lượng |
| POST | `/children/{childId}/sessions/child-login` | PARENT | Mở child session cho thiết bị |

## Content

| Method | Path | Vai trò | Mô tả |
|---|---|---|---|
| GET | `/content/packs` | PARENT, CHILD(filtered) | Danh sách pack đã PUBLISHED theo stage |
| GET | `/content/packs/{packId}` | PARENT, CHILD(filtered) | |
| GET | `/content/units/{unitId}` | CHILD | Unit cho phiên học (đã lọc theo tuổi) |
| POST | `/content/packs` | CONTENT_AUTHOR | Tạo DRAFT (Giai đoạn 2) |
| POST | `/content/packs/{id}:validate` | CONTENT_AUTHOR | Chạy validation, trả report |
| POST | `/content/packs/{id}:submit` / `:approve` / `:publish` / `:withdraw` | AUTHOR/REVIEWER | Vòng đời |
| POST | `/content/imports` | CONTENT_AUTHOR | Import CSV/XLSX/JSON |

## Runtime học tập

| Method | Path | Vai trò | Mô tả |
|---|---|---|---|
| POST | `/sessions` | CHILD | Bắt đầu phiên cho một unit (trả session + choices) |
| POST | `/sessions/{id}/events` | CHILD | Ghi 1..n event (idempotent) |
| POST | `/sessions/{id}/choice` | CHILD | Chọn phương án |
| POST | `/sessions/{id}/plan` | CHILD | Gửi kế hoạch (text/voice/chọn hình) |
| POST | `/sessions/{id}/attempts` | CHILD | Nộp lần thử |
| POST | `/sessions/{id}/hint` | CHILD | Yêu cầu hint → rule engine + AI Gateway trả bước tiếp theo (structured) |
| POST | `/sessions/{id}/artifacts` | CHILD | Upload ảnh / ghi âm / text (multipart, idempotent) |
| POST | `/sessions/{id}/reflection` | CHILD | Hoàn thành reflection |
| POST | `/sessions/{id}:complete` / `:pause` | CHILD | |
| POST | `/sessions/{id}/sync` | CHILD | Đồng bộ batch offline (conflict resolution) |

## Đánh giá & phụ huynh

| Method | Path | Vai trò | Mô tả |
|---|---|---|---|
| POST | `/children/{childId}/observations` | PARENT | Thêm quan sát (có thể gắn session) |
| GET | `/children/{childId}/dashboard` | PARENT | Số liệu độc lập, hint trend, chiến lược, minh chứng — **không xếp hạng** |
| GET | `/children/{childId}/skill-evidence` | PARENT, TEACHER(scope) | |
| POST | `/skill-evidence/{id}:verify` | TEACHER(scope) | Xác nhận theo rubric |
| POST | `/children/{childId}/teacher-assignments` | PARENT | Cấp quyền teacher/mentor + scope |

## Governance

| Method | Path | Vai trò | Mô tả |
|---|---|---|---|
| POST | `/families/{id}/consents` | PARENT | Cấp/thu hồi consent |
| POST | `/families/{id}/data-requests` | PARENT | EXPORT hoặc DELETE |
| GET | `/families/{id}/data-requests/{reqId}` | PARENT | Trạng thái + link tải export |
| GET | `/families/{id}/audit-log` | PARENT | Nhật ký thao tác trên dữ liệu family |

## AI Gateway (nội bộ, không expose trực tiếp cho client)

`packages/ai-gateway` cung cấp cổng `POST /internal/ai/coach-turn` — chỉ gọi từ `apps/api` sau khi rule engine đã tính giới hạn. Trả structured response, validate schema, fallback deterministic.

## Offline

- Client (PWA + IndexedDB) cache unit đã tải, hint deterministic, artifact cục bộ (mã hóa).
- Sync queue gửi events/attempts/artifacts khi có mạng; server dùng `client_generated_id` để idempotent; conflict resolution **không làm mất sản phẩm của trẻ** (giữ mọi phiên bản).
