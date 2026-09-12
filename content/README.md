# content/

Nội dung lắp ghép — **thêm/sửa/thay thế không cần sửa code**. Mọi file phải qua `packages/content-schema` validate (schema + semantic S1–S10).

| Thư mục | Nội dung |
|---|---|
| `frameworks/` | Ánh xạ khung tham chiếu (VN_GDPT, OECD, IB PYP, UDL, SEL...) + ngày xác minh |
| `skills/` | Skill Graph: mô tả theo tuổi, mức tiến triển, tiền quyết, loại minh chứng |
| `packs/` | ContentPack → LearningUnit (theo `stage`) |
| `overlays/` | TargetOverlay (TDN_GRADE_6, TDN_SPECIALIZED_GRADE_10, GLOBAL_TOP_UNIVERSITY) + `admission_rule` version hóa theo năm |
| `rubrics/` | Rubric đánh giá (criteria + levels) |

Hiện có: `packs/base-camp/vi-g1-base-camp-starter.pack.json` — gói mẫu Giai đoạn 0 (2 unit) để kiểm chứng schema. **Không** phải chương trình đầy đủ.

Bản quyền: không sao chép SGK có bản quyền ngoài phạm vi được cấp phép. `provenance.license` phải phản ánh đúng quyền dùng.
