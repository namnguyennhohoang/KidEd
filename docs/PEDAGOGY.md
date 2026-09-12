# PEDAGOGY.md — Nguyên tắc sư phạm bắt buộc

Hệ thống kết hợp có chọn lọc: Chương trình GDPT Việt Nam hiện hành · OECD Learning Compass (Student/Co-agency) · IB PYP inquiry-based & learner agency · Harvard Project Zero Visible Thinking / Thinking Routines · Metacognition & self-regulated learning · Universal Design for Learning · Social & Emotional Learning · Concrete–Pictorial–Abstract cho Toán · Project/maker/play-based learning · Retrieval / spaced practice / interleaving · Gradual release of responsibility · Formative assessment.

> Nguồn tham chiếu phải được kiểm tra phiên bản mới nhất và lưu ngày xác minh — xem cuối `PRODUCT.md` gốc và `docs/ADR/0003-content-pack-versioning.md`.

## 1. Chu trình học mặc định (Default Learning Loop)

Mọi nhiệm vụ phải đi qua phần lớn các bước sau:

| # | Bước | Bắt buộc? | Ghi chú |
|---|---|---|---|
| 1 | **Choose** | Có | Trẻ chọn 1 trong tối đa 2–3 phương án **cùng mục tiêu học tập** |
| 2 | **Predict** | Nên | Trẻ dự đoán / nêu điều đã biết / chọn cách bắt đầu |
| 3 | **Plan** | Nên | Trẻ nói/vẽ/chọn các bước dự định |
| 4 | **Try** | **Có** | Phải có ≥ 1 lần thử **trước khi** nhận lời giải |
| 5 | **Hint** | Theo yêu cầu | AI gợi ý theo thang trợ giúp, không làm thay |
| 6 | **Create/Act** | Có | Tạo sản phẩm / thực hiện hoạt động, ưu tiên ngoài màn hình |
| 7 | **Explain** | Có | Trẻ giải thích cách làm / lựa chọn |
| 8 | **Revise** | Nên | Trẻ chỉnh sửa sau phản hồi |
| 9 | **Reflect** | **Có** | Trẻ tự đánh giá: làm được gì, chỗ khó, bước tiếp theo |
| 10 | **Share** | Khi phù hợp | Chia sẻ với người thật theo Brave Steps |

Validation của ContentPack phải từ chối unit thiếu bước 1, 4, 9 và thiếu hoạt động ngoài màn hình.

## 2. Thang trợ giúp (Help Ladder) — AI và người lớn dùng CHUNG

| Mức | Hành động |
|---|---|
| 0 | Chỉ cho đủ thời gian để trẻ tự bắt đầu |
| 1 | Nhắc lại mục tiêu bằng câu ngắn hơn |
| 2 | Hỏi trẻ đang vướng ở bước nào |
| 3 | Gợi ý bằng hình ảnh / vật thật / một câu hỏi định hướng |
| 4 | Cho trẻ chọn giữa **hai** chiến lược |
| 5 | Làm mẫu **một bài tương tự**, không làm bài hiện tại |
| 6 | Chỉ trình bày lời giải **sau khi** trẻ đã thử; sau đó yêu cầu trẻ **dạy lại** |

**Quy tắc leo thang:**
- Không tăng mức trợ giúp chỉ vì trẻ im lặng vài giây.
- Thời gian chờ cấu hình theo tuổi, loại nhiệm vụ, hồ sơ người học.
- Rule engine quyết định mức; LLM **không** tự ý vượt thang (xem `AI_BEHAVIOR.md`).
- `minimum_attempts_before_solution` (mặc định 1) phải được tôn trọng tuyệt đối.

## 3. Quy tắc phản hồi (Feedback Rules)

- Phản hồi **hành vi & chiến lược**, không phán xét con người.
- Nêu **một** điểm cụ thể đã làm được + **một** bước cải thiện tiếp theo.
- Không khen chung chung lặp đi lặp lại ("giỏi quá", "xuất sắc").
- Không so sánh với trẻ khác.
- Không biến mọi hoạt động thành điểm/sao/phần thưởng.
- Không phạt khi trả lời sai. Sai lầm = **dữ liệu học tập**.
- Nếu trả lời đúng: vẫn hỏi trẻ giải thích hoặc tìm cách thứ hai khi phù hợp.

## 4. Gradual Release of Responsibility

Làm mẫu → làm cùng → trẻ tự làm. **Hỗ trợ phải được rút dần** (fade scaffolding). Nếu `mastery_high AND independence_low` → giữ độ khó học thuật, rút scaffolding, bắt buộc trẻ chọn.

## 5. Chu trình Inquiry & Project

```text
Notice → Wonder → Ask → Predict → Plan → Make/Test → Observe → Explain → Improve → Share
```

Mỗi dự án lưu: câu hỏi của trẻ · lựa chọn do trẻ đưa ra · phần người lớn/AI hỗ trợ · nhật ký thay đổi · sản phẩm & minh chứng · phản tư cuối · tác động thực tế (nếu có).

## 6. Nguyên tắc theo môn

- **Toán**: Concrete–Pictorial–Abstract; number sense trước tốc độ tính; nhiều chiến lược giải; phân biệt mastery / fluency / transfer / test readiness; chỉ bật luyện thời gian ở giai đoạn phù hợp.
- **Tiếng Việt**: đọc trôi chảy đi cùng đọc hiểu; kể lại – suy luận – tìm bằng chứng – đặt câu hỏi; tranh → lời nói → câu/đoạn/bài; phản hồi nội dung & cấu trúc trước lỗi bề mặt.
- **Tiếng Anh**: xem `English Pathway` — nghe–nói trước ở lớp 1–2; **không** lấy accent bản ngữ làm mục tiêu đánh giá chính.
- **Khoa học**: quan sát → đặt giả thuyết → thử nghiệm → giải thích.

## 7. Cấm (pedagogical red lines)

- AI làm thay bài của trẻ.
- Over-scaffolding: tăng trợ giúp khi chưa cần.
- Gamification gây lệ thuộc: streak gây lo âu, loot box, phần thưởng biến đổi.
- Tối ưu thời gian màn hình.
- Gắn nhãn con người thay vì mô tả hành vi.
- Dự báo "chắc chắn đậu/rớt".
- Biến mọi hành vi thành biểu đồ để phụ huynh vi mô hóa.

## 8. Áp dụng cho hồ sơ người học ban đầu

| Đặc điểm hồ sơ | Ứng xử hệ thống |
|---|---|
| Bị động, hay chờ người lớn | Bắt đầu mọi nhiệm vụ bằng **Choose**; `WAIT_AND_INVITE`; đo `initiation_latency`; fade hint khi có chuỗi độc lập |
| Rụt rè khi trình bày | Brave Steps bắt đầu ở mức 1 (nói một mình với app); giảm audience level khi lo âu **mà không** giảm độ khó tư duy |
| Thế mạnh vẽ / hình ảnh | `VISUAL_SCAFFOLD`, Creative Studio làm điểm vào; cho phép biểu đạt bằng vẽ thay vì viết |
| Thể trạng yếu | `MOVE_OFF_SCREEN`, nhiệm vụ vận động; bảo vệ giờ ngủ & chơi tự do; không phạt khi không đạt mục tiêu vận động |
| Piano / lĩnh vực làm chủ | Bài 5–15 phút, cho chọn bài/mục tiêu nhỏ; ghi âm so với chính mình; mini-recital theo Brave Steps |
