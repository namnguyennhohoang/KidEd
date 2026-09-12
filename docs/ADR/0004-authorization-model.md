# ADR 0004 — Mô hình phân quyền lấy family làm gốc

- Status: Accepted (Giai đoạn 0)
- Date: 2026-09-07

## Bối cảnh

Dữ liệu trẻ em cực nhạy cảm. Rủi ro: IDOR/BOLA, child session truy cập dashboard phụ huynh, teacher/mentor xem quá phạm vi.

## Quyết định

- **Tenant = family**. Mọi tài nguyên dữ liệu trẻ mang `family_id`. Truy vấn luôn kèm điều kiện `family_id` + kiểm tra quan hệ vai trò.
- **Object-level authorization** bắt buộc ở backend cho mọi resource id từ client. Không dựa vào ẩn UI.
- Vai trò: `PLATFORM_ADMIN`, `FAMILY_OWNER`, `PARENT`, `CHILD`, `TEACHER`, `MENTOR`, `CONTENT_AUTHOR`, `CONTENT_REVIEWER`.
- `TEACHER` / `MENTOR` chỉ thấy dữ liệu **trong scope phụ huynh cấp tường minh** (`teacher_assignment` / `mentor_assignment` với danh sách scope).
- **Child session** (`auth_session.kind = CHILD`) do phụ huynh mở, có `parent_session_id`, TTL ngắn, không nâng quyền, không truy cập route phụ huynh.
- **Parent Dashboard** sau PIN / xác thực lại.
- Deny-by-default, least privilege, audit mọi cấp quyền và truy cập dữ liệu trẻ.

## Hệ quả

- Cần middleware/policy layer ở `apps/api` (vd dependency injection FastAPI) kiểm tra quan hệ.
- Test bắt buộc: cross-family access → 403/404; child → dashboard 403; teacher ngoài scope → 403.
- `audit_log` append-only cho mọi truy cập/ghi dữ liệu trẻ.
