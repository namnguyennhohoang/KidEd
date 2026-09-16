# CONTENT_AUTHORING.md — Soạn & Duyệt nội dung

## 1. Mục tiêu

Phụ huynh / giáo viên / admin có thể **thêm, sửa, thay thế** bài học mà **không sửa code**. Nội dung cụ thể từng lớp sống trong `ContentPack`, không viết cứng vào mã nguồn.

## 2. Vòng đời ContentPack

```text
DRAFT ──submit──▶ IN_REVIEW ──approve──▶ PUBLISHED ──withdraw──▶ WITHDRAWN
   ▲                   │                      │
   └────reject─────────┘                 supersede
                                              ▼
                                        SUPERSEDED  (bản mới PUBLISHED thay thế)
```

- Sửa bản `PUBLISHED` → tạo `content_version` mới ở trạng thái `DRAFT`, không sửa tại chỗ.
- Nội dung **AI-generated không bao giờ auto-publish** cho trẻ (`PARENT_REVIEW_REQUIRED_FOR_AI_CONTENT=true`).
- Mỗi bản ghi: tác giả, nguồn (`source_refs`), giấy phép (`license`), người duyệt (`reviewer`).

## 3. Công cụ (Content Studio — ✅ Giai đoạn 2, xem `routes/studio.ts` + web `/studio`)

- Tạo/sửa qua **form** hoặc **JSON/YAML**.
- Import có kiểm soát từ **CSV / XLSX / JSON** qua pipeline: parse → map cột → validate từng dòng → báo cáo lỗi → chỉ import dòng hợp lệ.
- Gắn `learning_outcomes` (framework + code) và `skills` (PRIMARY/SECONDARY).
- **Xem trước giao diện trẻ**.
- Chạy validation (dưới đây).
- Duyệt / xuất bản / thu hồi / tạo phiên bản mới.
- RBAC: `CONTENT_AUTHOR` soạn; `CONTENT_REVIEWER` duyệt/xuất bản; audit log mọi thao tác.

## 4. Validation bắt buộc (schema + semantic)

Trình validate: `packages/content-schema` (JSON Schema 2020-12 + luật ngữ nghĩa).

**Schema-level** (`learning-unit.schema.json`):
- `id, schema_version, content_version, status, title, locale, stage, grades` — bắt buộc.
- `domains` ⊆ enum; `skills[].role` ∈ {PRIMARY, SECONDARY}; ≥ 1 PRIMARY.
- `duration_minutes.screen` và `duration_minutes.offline` đều ≥ 0; **offline > 0**.
- `quest_flow.attempt_requirement.minimum_attempts_before_solution` ≥ 1.
- `quest_flow.attempt_options` (tuỳ chọn, 2–6 mục `{id, label}`): khi có, web hiện bước "thử làm" dưới
  dạng trắc nghiệm (bấm chọn) thay vì ô gõ chữ — phù hợp trẻ chưa viết thạo (BASE_CAMP). Web luôn tự
  thêm nút "Cách khác" mở lại ô gõ, nên KHÔNG cần liệt kê hết mọi đáp án đúng có thể có (ví dụ bài
  chia 10 thành hai nhóm không cần liệt kê đủ 1–9, 2–8, ...). Bỏ trống -> vẫn dùng ô gõ chữ như cũ.
- `hints[]` sắp theo `level` tăng dần; mỗi hint có `type` ∈ {REPHRASE, QUESTION, VISUAL, STRATEGY_CHOICE, WORKED_EXAMPLE}.
- `evidence[]` ⊆ enum; `provenance.license` ∈ {ORIGINAL_OR_LICENSED, PUBLIC_DOMAIN, CC_BY, CC_BY_SA, LICENSED_THIRD_PARTY}.
- Nội dung tiếng Anh (`domains` có `ENGLISH`) đi theo khung Cambridge Young Learners English
  (Starters/Movers/Flyers) — xem `CONTENT_ENGLISH_CURRICULUM.md` để biết ánh xạ stage↔cấp, skill
  (`ENGLISH_VOCABULARY`, `ENGLISH_LISTENING`, `ENGLISH_SPEAKING`, `ENGLISH_READING`, `ENGLISH_WRITING`)
  và chủ đề từ vựng/ngữ pháp theo từng cấp trước khi soạn unit mới.

**Semantic-level** (luật, không chỉ schema):
| Luật | Mô tả |
|---|---|
| S1 | Có mục tiêu học tập **và** kỹ năng rõ ràng (≥1 outcome, ≥1 PRIMARY skill) |
| S2 | Có ít nhất một **hành động của trẻ trước lời giải** (`quest_flow` có `plan_prompt` hoặc `predict_prompt` + `minimum_attempts >= 1`) |
| S3 | Có **reflection** (`reflection_prompt` không rỗng) |
| S4 | Có thời lượng **màn hình và ngoài màn hình** (offline > 0) |
| S5 | Có nguồn / quyền sử dụng (`provenance.license` + `author`) |
| S6 | **Hint không chứa lời giải sớm**: hint `level <= 3` không được chứa đáp án cuối / công thức đầy đủ (kiểm heuristic + review người) |
| S7 | **Ngôn ngữ phù hợp tuổi**: độ dài câu, từ vựng theo `stage` (cảnh báo, reviewer chốt) |
| S8 | **Không nội dung tạo áp lực / gắn nhãn / thao túng**: blocklist cụm từ ("phải đậu", "kém", "thông minh hơn", "top", xếp hạng...) + review |
| S9 | `choices[]` có 2–3 phương án **cùng mục tiêu học tập** (reviewer xác nhận tương đương) |
| S10 | Với Base Camp: tổng `offline` ≥ tổng `screen` (khuyến khích ≥ tỷ lệ `TARGET_OFFLINE_ACTIVITY_RATIO`) |

Validation report: mỗi finding có `rule_id, severity (ERROR|WARN), path, message`. `ERROR` chặn publish.

## 5. Contract test (chứng minh không cần sửa code)

`tests/contract/new-content-pack.spec` phải chứng minh: nạp một ContentPack **mới hợp lệ** (file JSON) → xuất hiện trong danh sách nội dung, chạy được end-to-end trong Base Camp slice, **không** thay đổi frontend/backend code.

## 6. Bản quyền

Không thu thập hoặc sao chép toàn bộ sách giáo khoa có bản quyền nếu không được cấp phép. `source_refs` ghi rõ nguồn; `license` phản ánh đúng quyền sử dụng. Nội dung gốc do đội ngũ soạn = `ORIGINAL_OR_LICENSED`.

## 7. Nguồn khung tham chiếu

Xem cuối tài liệu spec gốc. Mỗi nguồn khi dùng phải lưu **ngày xác minh** và **phiên bản**. Quy chế tuyển sinh: xem `admission_rule` (không nằm ở ContentPack).
