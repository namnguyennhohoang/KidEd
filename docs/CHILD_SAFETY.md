# CHILD_SAFETY.md — An toàn trẻ em & Threat Model

Nguyên tắc: **safety-by-design** + **privacy-by-design**. Tham chiếu: UNESCO Guidance for Generative AI in Education; UNICEF Policy Guidance on AI and Children (kiểm tra bản mới nhất khi triển khai).

## 1. Lằn ranh đỏ (hard constraints — không cấu hình tắt được)

| # | Cấm | Lý do |
|---|---|---|
| R1 | AI viết hộ bài luận / làm hộ dự án / giả mạo tiếng nói học sinh | Phá hủy mục tiêu tự chủ & tính trung thực học thuật |
| R2 | Đưa lời giải trước khi trẻ thử (`minimum_attempts_before_solution`) | Vi phạm chu trình học |
| R3 | Gắn nhãn trẻ ("nhút nhát", "yếu", "năng khiếu"...) ở bất kỳ giao diện nào | Định kiến, tổn thương |
| R4 | Chẩn đoán tâm lý/y khoa (IQ, ADHD, lo âu, trầm cảm, tự kỷ, năng khiếu) từ dữ liệu hành vi | Ngoài phạm vi, sai lệch, nguy hiểm |
| R5 | Nhận diện khuôn mặt / suy đoán cảm xúc bằng computer vision | Giám sát sinh trắc trẻ em |
| R6 | Dự báo "chắc chắn đậu/rớt" tuyển sinh | Áp lực, sai lệch, phi giáo dục |
| R7 | Open chat tự do / liên hệ người lạ / trẻ tự mở link ngoài | Grooming, nội dung độc hại |
| R8 | Công khai hình ảnh/giọng nói/sản phẩm của trẻ theo mặc định | Quyền riêng tư trẻ em |
| R9 | Dùng dữ liệu trẻ để train model (mặc định) | Đồng ý & mục đích |
| R10 | Quảng cáo / bán / chia sẻ dữ liệu / hồ sơ thương mại / social graph | Khai thác trẻ em |
| R11 | AI quyết định cơ hội học tập quan trọng mà không có người lớn xem xét | Human-in-the-loop bắt buộc |
| R12 | Dark pattern: feed vô tận, streak gây lo âu, loot box, avatar giả làm bạn thân có cảm xúc | Thao túng trẻ |
| R13 | Biến app thành công cụ theo dõi bí mật (trẻ không biết đang bị ghi gì) | Minh bạch với trẻ |

## 2. Nguyên tắc dữ liệu

- **Data minimization** + **purpose limitation**: chỉ thu thập cái cần cho mục đích học tập đã nêu.
- **Parent consent** + **child assent** (khi phù hợp tuổi/quy định).
- Retention cấu hình được; mặc định `DATA_RETENTION_DAYS=1095`.
- Export / correction / deletion phải hoạt động end-to-end (có test).
- Không gửi tên thật, trường học, vị trí, dữ liệu nhận dạng không cần thiết đến nhà cung cấp AI.
- Tách **telemetry kỹ thuật** khỏi **nội dung học của trẻ**.

## 3. Threat Model (STRIDE-lite, tập trung rủi ro cho trẻ)

| ID | Tài sản / bề mặt | Mối đe dọa | Tác động lên trẻ | Giảm thiểu | Test phòng tái diễn |
|---|---|---|---|---|---|
| T1 | Child session | Truy cập Parent Dashboard / dữ liệu chiến lược | Áp lực, mất an toàn tâm lý | Session `kind=CHILD` tách biệt, PIN gate dashboard, kiểm tra ở backend | e2e: child session → 403 mọi route phụ huynh |
| T2 | Tài nguyên trẻ (artifact, session, reflection) | IDOR / BOLA — đổi id lấy dữ liệu trẻ khác | Rò rỉ dữ liệu trẻ | Authorization dựa quan hệ family + scope ở backend, không chỉ ẩn nút | integration: user A đọc resource của family B → 403/404 |
| T3 | Media upload (ảnh tranh, ghi âm) | Malware / file type giả / oversize / SSRF qua URL | Hạ tầng, rò rỉ | Kiểm tra magic bytes, whitelist MIME, giới hạn kích thước, quét, tách domain phục vụ, không fetch URL do input | unit + integration upload abuse |
| T4 | AI prompt (ContentPack, child input, uploaded text, retrieved docs) | Prompt injection → AI làm thay / lộ system prompt / vượt thang trợ giúp | Phá chu trình học, nội dung sai | Structured output validation, allowlist InteractionSkill, rule engine phủ quyết, moderation trước+sau, không nhúng input thô vào system prompt | adversarial tests (Prompt 4) |
| T5 | Content pipeline | Content poisoning — nội dung độc/sai/áp lực lọt vào kho duyệt | Trẻ tiếp xúc nội dung hại | Review bắt buộc, AI-generated không auto-publish, provenance + license, validation ngữ nghĩa | contract test: AI content không thể publish nếu thiếu reviewer |
| T6 | Broken access control (Teacher/Mentor) | Xem nhật ký gia đình / dữ liệu ngoài phạm vi | Rò rỉ, vi phạm niềm tin | Scope tối thiểu theo vai trò, phụ huynh cấp quyền tường minh, audit log | integration: teacher chỉ thấy dữ liệu được cấp |
| T7 | Data leakage → AI provider | Gửi tên/trường/vị trí trẻ ra ngoài | Nhận dạng trẻ | Redaction layer ở AI Gateway, pseudonymous child id, allowlist field | unit: payload gửi provider không chứa PII |
| T8 | Model training default | Dữ liệu trẻ vào tập huấn luyện | Vĩnh viễn mất kiểm soát | `DATA_USED_FOR_MODEL_TRAINING=false`, hợp đồng provider no-train, header opt-out | test: cờ mặc định + assert gọi API kèm opt-out |
| T9 | Secret leakage | API key ở client / log / repo | Lạm dụng, chi phí, rò rỉ | Secret chỉ ở server, `.env` gitignore, structured log redaction, scan CI | CI secret scan; test log không chứa key |
| T10 | Emotion/streak pressure | Gamification gây lo âu, so sánh | Sức khỏe tâm lý | Không streak gây lo âu, không xếp hạng, feedback theo quy tắc §PEDAGOGY | review checklist + UI test |
| T11 | Over-scaffolding drift | AI tăng trợ giúp làm trẻ lệ thuộc | Mất tự chủ (rủi ro cốt lõi) | Rule engine fade scaffolding, đo `median_hint_level` xu hướng, quota `max_uses_per_session` | test: chuỗi độc lập → gỡ 1 lớp hint |
| T12 | Offline artifact | Mất/hỏng sản phẩm của trẻ khi sync | Mất công sức, tổn thương | Local encrypt, conflict resolution giữ mọi phiên bản, không ghi đè | e2e offline→online, tạo xung đột |
| T13 | Báo cáo nội dung bất thường | Không có luồng báo cho phụ huynh, HOẶC luồng biến thành giám sát bí mật | Bỏ sót rủi ro / vi phạm minh bạch | Luồng report tường minh, trẻ biết, tổng hợp không lộ transcript riêng tư dư thừa | integration: flag → parent note, không lộ dư |

## 4. Human-in-the-loop bắt buộc

AI phải chuyển cho phụ huynh/người duyệt khi:
- Không chắc chắn về kiến thức / an toàn.
- Có `safety_flag` trong structured output.
- Trẻ có dấu hiệu quá tải / căng thẳng kéo dài.
- Quyết định ảnh hưởng cơ hội học tập (chọn môn chuyên, đánh giá năng lực).

`PARENT_HANDOFF` là InteractionSkill; khi kích hoạt, phiên dừng phần AI dẫn dắt.

## 5. Tuân thủ pháp luật

Tuân thủ pháp luật Việt Nam hiện hành về dữ liệu cá nhân, trẻ em, an ninh mạng và quy định tại thị trường triển khai. **Không** tuyên bố "đã tuân thủ" chỉ vì có checkbox đồng ý — phải lập compliance checklist và xác minh với chuyên gia pháp lý trước production (xem `SECURITY.md` §Compliance).
