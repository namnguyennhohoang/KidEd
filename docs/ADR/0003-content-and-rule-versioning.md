# ADR 0003 — Version hóa nội dung, quy chế tuyển sinh & luật

- Status: Accepted (Giai đoạn 0)
- Date: 2026-09-07

## Bối cảnh

Spec nhấn mạnh: quy chế tuyển sinh / yêu cầu đại học chỉ là mốc tham khảo, **không được mặc định còn hiệu lực trong tương lai**. Nội dung và luật cá nhân hóa phải truy vết được.

## Quyết định

- **ContentPack** có `schema_version` + `content_version`. Sửa bản `PUBLISHED` tạo version mới (DRAFT), không sửa tại chỗ. Trạng thái: DRAFT / IN_REVIEW / PUBLISHED / WITHDRAWN / SUPERSEDED.
- **admission_rule** tách khỏi ContentPack và learning objective. Mỗi bản có: `admission_year`, `effective_date`, `source_url`, `source_checked_date`, `status` (DRAFT/VERIFIED/SUPERSEDED/ARCHIVED), `review_by_date`. Có bảng diff năm-qua-năm và cảnh báo sắp lỗi thời.
- **Không viết cứng** số câu, thời gian, môn, cách tính điểm, điểm chuẩn trong code — tất cả là dữ liệu `admission_rule`.
- **personalization_rule** và **interaction_skill** có `version`; `rule_firing` / `interaction_skill_invocation` ghi lại version đã dùng.
- Nguồn khung tham chiếu (OECD, Project Zero, UDL, EEF, UNESCO, UNICEF, cổng tuyển sinh) phải lưu **ngày xác minh** + **phiên bản** khi sử dụng.

## Hệ quả

- Cần job/nhắc "review_by_date" cho admission_rule.
- Migration nội dung phải tương thích ngược; đề xuất migration trước khi đổi schema.
- TargetOverlay thay đổi quy chế **không** làm hỏng skill history hay ContentPack nền (có test — Prompt 6).
