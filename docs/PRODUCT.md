# PRODUCT.md — Hành trình Tự làm được

## 1. Sản phẩm là gì

Nền tảng giáo dục AI cá nhân hóa. Trước mắt phục vụ **một gia đình, một trẻ** (trẻ vừa vào lớp 1 tại Việt Nam), nhưng kiến trúc phải mở rộng có kiểm soát sang nhiều trẻ, nhiều phụ huynh, giáo viên và gói chương trình.

**Không xây:** chatbot giải bài tập, "làm đẹp hồ sơ", công cụ nhồi hoạt động, công cụ theo dõi bí mật.

**Xây:** hệ thống giúp trẻ dần trở thành người học tự chủ — có nền tảng học thuật vững, biết suy nghĩ, sáng tạo, giao tiếp, chịu được thất bại, có sức khỏe, và phát triển chiều sâu ở 1–2 lĩnh vực.

## 2. Người học ban đầu (hồ sơ giáo dục, KHÔNG phải chẩn đoán)

- Trẻ vừa vào lớp 1 tại Việt Nam.
- Tư duy và giải quyết vấn đề tương đối tốt.
- Thế mạnh: vẽ và biểu đạt hình ảnh.
- Còn bị động, hay chờ người lớn hỗ trợ, đôi khi ỷ lại.
- Hơi rụt rè, thiếu tự tin khi đứng trước người khác.
- Thể trạng hơi yếu, cần tăng vận động phù hợp lứa tuổi.
- Gia đình muốn trẻ học piano hoặc phát triển một lĩnh vực tạo cảm giác làm chủ.

**Cấm** gắn nhãn trong giao diện dành cho trẻ: "nhút nhát", "yếu", "thông minh", "năng khiếu", "kém chủ động".

## 3. Mục tiêu dài hạn — 3 tầng, đúng thứ tự ưu tiên

### Tầng 1 — Phát triển con người và năng lực nền (ưu tiên cao nhất)
Tự chủ & tự học; tự bắt đầu và hoàn thành nhiệm vụ vừa sức; lập kế hoạch – theo dõi – tự đánh giá; tư duy phản biện, giải quyết vấn đề, sáng tạo; đọc hiểu, nói, viết; giao tiếp, hợp tác, tự tin xã hội; điều hòa cảm xúc & kiên trì; năng lực thể chất & sức khỏe số; phát triển nghệ thuật/âm nhạc hoặc một lĩnh vực làm chủ lâu dài.

### Tầng 2 — Năng lực dự tuyển trường chọn/chuyên
Có khả năng cạnh tranh vào lớp 6 Trần Đại Nghĩa khi đến đúng độ tuổi; khám phá & chọn môn chuyên trong THCS; dự tuyển lớp 10 trường chuyên phù hợp.
**Ràng buộc:** thành tích thi cử không được đánh đổi bằng mất hứng thú, mất tự chủ, thiếu ngủ hoặc lệ thuộc người lớn/AI.

### Tầng 3 — Năng lực học tập quốc tế
Nền tảng để ứng tuyển đại học quốc tế hàng đầu (Ivy, MIT, Stanford, Oxbridge, top Mỹ/Anh/Singapore/Canada/Úc/châu Á). Xây năng lực học thuật, tiếng Anh học thuật, chiều sâu sở thích, sáng kiến, hợp tác, phẩm chất và tác động thật.
**Ràng buộc:** không viết hộ bài luận, không làm hộ dự án, không nhồi chứng chỉ rời rạc.

> Mục tiêu Tầng 2–3 là **mục tiêu chiến lược của phụ huynh**, chạy ngầm ở cấp phụ huynh. Giao diện trẻ chỉ hiển thị nhiệm vụ gần, vui, có ý nghĩa, vừa sức. Không hiển thị "phải đậu", "Ivy", "top", "xếp hạng", "tụt chuẩn".

## 4. Cấu trúc chương trình lắp ghép

```text
EducationFramework
└── DevelopmentStage (BASE_CAMP, EXPLORER, TDN_READINESS, SPECIALISATION, SPEC_HS_READINESS, GLOBAL_SCHOLAR)
    ├── Domain → Competency → Skill → SkillLevel
    ├── ContentPack → LearningUnit → Quest → Session
    └── TargetOverlay (TDN_GRADE_6, TDN_SPECIALIZED_GRADE_10, GLOBAL_TOP_UNIVERSITY)
```

- **Core Framework**: logic chung, không phụ thuộc lớp.
- **Stage Module**: mục tiêu phát triển theo giai đoạn.
- **ContentPack**: bài học/nhiệm vụ — thêm/sửa/thay thế **không sửa code**.
- **TargetOverlay**: thêm yêu cầu định hướng, **không thay thế** nền tảng.
- Một `LearningUnit` có thể thuộc nhiều môn và phát triển nhiều kỹ năng.
- Mọi nội dung có nguồn, tác giả/người duyệt, giấy phép/trạng thái quyền dùng.
- Không sao chép toàn bộ SGK có bản quyền nếu không được cấp phép.

## 5. Các module theo giai đoạn (tóm tắt)

| Mã stage | Lớp | Trọng tâm |
|---|---|---|
| `BASE_CAMP` | 1–2 | Tự bắt đầu, lựa chọn có giới hạn, hoàn thành việc nhỏ; đọc hiểu tiếng Việt; number sense (vật thật→hình→ký hiệu); tiếng Anh nghe–nói; vẽ–kể–giải thích–sửa–chia sẻ; trò chơi executive function; piano ngắn đều; vận động ngoài màn hình; Brave Steps. **Không có chế độ luyện thi.** |
| `EXPLORER` | 3 | Đọc suy luận, viết đoạn có cấu trúc; toán lời văn nhiều bước & bài toán mở; English through content; khoa học quan sát–giả thuyết–thử nghiệm; dự án liên môn 2–4 tuần; thuyết trình nhóm nhỏ. |
| `TDN_READINESS` | 4–5 | 4 trục: tiếng Anh, toán & logic, tiếng Việt, khoa học–xã hội–đời sống. Tỷ lệ nền/khảo sát cấu hình được. Phân tích lỗi theo nguyên nhân. |
| `SPECIALISATION` | 6–7 | Chu kỳ trải nghiệm 8–12 tuần nhiều lĩnh vực; theo dõi hứng thú bền vững; khuyến khích giao thoa thế mạnh. Không chốt môn chuyên bằng một bài test. |
| `SPEC_HS_READINESS` | 8–9 | Cuối lớp 8/đầu lớp 9 chốt 1 môn chuyên chính + 1 dự phòng; luyện chiều sâu, lập luận, tốc độ; quy chế version hóa. Không dự báo "chắc đậu/rớt". |
| `GLOBAL_SCHOLAR` | 9–12 | Phân biệt lộ trình Mỹ/Anh/Singapore/Canada/Úc; hồ sơ chữ T; dự án dài hạn có vấn đề thật; provenance cho AI-assistance. |

## 6. MVP bắt buộc (Base Camp / lớp 1) — một vertical slice

1. Phụ huynh tạo hồ sơ trẻ tối thiểu + cấu hình thời lượng.
2. Hệ thống tải một ContentPack đã duyệt.
3. Trẻ chọn 1 trong 2 nhiệm vụ.
4. Trẻ lập kế hoạch đơn giản.
5. Trẻ thử; có thể yêu cầu hint theo thang.
6. Hệ thống **không** đưa lời giải trước lần thử đầu tiên.
7. Trẻ upload ảnh tranh hoặc ghi lời giải thích.
8. Trẻ hoàn thành reflection bằng giọng nói hoặc chọn hình ảnh.
9. Phụ huynh thêm quan sát.
10. Dashboard hiển thị tiến trình & mức hỗ trợ, **không xếp hạng**.
11. Hoạt động vẫn dùng được ở mức cơ bản khi mất kết nối AI.
12. Phụ huynh có thể export và xóa dữ liệu.

Kèm 8–12 LearningUnit mẫu để kiểm chứng schema (toán number sense, đọc hiểu tiếng Việt, vẽ–kể chuyện, English listening/speaking, một hoạt động khoa học quan sát, một trò chơi executive function, một Brave Step, một nhiệm vụ vận động, một phiên piano/nhịp điệu).

## 7. North-star metrics

Mức độ độc lập; chất lượng minh chứng; chuyển giao ra đời thực; sức khỏe học tập.
**Không** tối ưu để trẻ ở app lâu hơn.

## 8. Tài liệu liên quan

[PEDAGOGY.md](PEDAGOGY.md) · [CHILD_SAFETY.md](CHILD_SAFETY.md) · [DATA_MODEL.md](DATA_MODEL.md) · [AI_BEHAVIOR.md](AI_BEHAVIOR.md) · [CONTENT_AUTHORING.md](CONTENT_AUTHORING.md) · [SECURITY.md](SECURITY.md) · [API_OUTLINE.md](API_OUTLINE.md) · [BACKLOG.md](BACKLOG.md)
