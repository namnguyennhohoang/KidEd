# ADR 0006 — Chính sách dữ liệu phát triển & kiểm thử

- Status: Accepted (Giai đoạn 0)
- Date: 2026-09-07

## Bối cảnh

Spec mục 17: "Không dùng dữ liệu trẻ thật trong development/seed/test." Rủi ro rò rỉ và vi phạm quyền riêng tư trẻ em.

## Quyết định

- Seed / fixtures / test **chỉ dùng dữ liệu tổng hợp** (synthetic), gắn nhãn rõ `synthetic: true`.
- Hồ sơ trẻ mẫu dùng tên hư cấu, ngày sinh giả, không ảnh/giọng thật.
- Nội dung mẫu (`content/packs/**`) là nội dung gốc do đội ngũ soạn (`license: ORIGINAL_OR_LICENSED`), không trích SGK có bản quyền.
- Không kết nối môi trường dev tới dữ liệu production.
- Seed **idempotent**: chạy nhiều lần cho cùng kết quả; chạy được từ DB rỗng sau migration.
- Không có thao tác phá hủy repo/DB nếu chưa được cho phép rõ ràng.

## Hệ quả

- Cần bộ generator dữ liệu synthetic ở `apps/api` (Giai đoạn 1).
- CI chạy migration + seed trên DB rỗng.
