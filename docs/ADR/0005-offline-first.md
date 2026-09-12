# ADR 0005 — Offline-first cho phiên học cốt lõi

- Status: Accepted (Giai đoạn 0)
- Date: 2026-09-07

## Bối cảnh

Spec mục 11 & MVP bước 11: phiên học phải tiếp tục khi mất mạng / mất kết nối AI. Trẻ không được mất sản phẩm.

## Quyết định

- **PWA + IndexedDB + sync queue**.
- Khi offline có sẵn: nội dung unit đã tải, **hint deterministic** (help ladder không cần LLM), tạo artifact cục bộ (mã hóa phù hợp).
- Mọi event/attempt/artifact tạo offline mang `client_generated_id` → server **idempotent** khi sync.
- **Conflict resolution** không làm mất sản phẩm: giữ **mọi** phiên bản (`artifact_version`), không ghi đè; đánh dấu xung đột để phụ huynh/trẻ xem lại.
- AI Gateway có **deterministic fallback**: nếu AI lỗi/timeout/circuit-open → dùng bản cài đặt cứng của InteractionSkill; phiên không dừng.

## Hệ quả

- Rule engine phần help-ladder phải chạy được ở client (chia sẻ logic qua `packages/domain` biên dịch được cho cả hai môi trường, hoặc port TS thuần cho client).
- Test: e2e offline → online, tạo xung đột artifact, xác nhận không mất dữ liệu.
- Mã hóa artifact cục bộ trên thiết bị (Web Crypto).
