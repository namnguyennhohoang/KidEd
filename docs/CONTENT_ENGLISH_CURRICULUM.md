# CONTENT_ENGLISH_CURRICULUM.md — Chương trình tiếng Anh cho bé (Starters → Movers)

## 1. Vì sao có tài liệu này

Nội dung tiếng Anh trước đây chỉ có 2 unit rời rạc (EXPLORER). Tài liệu này đưa ra một **khung
chương trình** dựa trên Cambridge Young Learners English (Starters / Movers / Flyers) — bộ khung
tham chiếu phổ biến nhất cho tiếng Anh thiếu nhi — rồi ánh xạ vào 2 stage hiện có (BASE_CAMP,
EXPLORER) của nền tảng. Nội dung cụ thể (unit) triển khai dần theo khung này, không cần đổi schema.

**Nguồn tham chiếu:** Cambridge Assessment English — *Young Learners: Starters, Movers, Flyers*
(wordlist chủ đề + can-do statements 4 kỹ năng Nghe/Nói/Đọc/Viết). Ghi theo đúng quy ước
`provenance.source_refs` đã dùng trong toàn bộ nội dung khác của dự án.

## 2. Ánh xạ Stage ↔ Cambridge YLE

| Stage nền tảng | Lớp/tuổi | Cấp Cambridge YLE | CEFR tương đương |
|---|---|---|---|
| `BASE_CAMP` | Lớp 1, 6–7 tuổi | **Starters** (Pre-A1) | Pre-A1 |
| `EXPLORER` | Lớp 3, 8–9 tuổi | **Movers** (đang xây), hướng tới **Flyers** ở lớp trên | A1 → A2 |
| `TDN_READINESS`/`SPECIALISATION` (ngoài phạm vi hiện tại) | Lớp 6+ | Flyers → KET/PET | A2 → B1 |

Lý do không tạo skill riêng theo từng cấp Cambridge (`ENGLISH_STARTERS_*`, `ENGLISH_MOVERS_*`): đi
theo đúng mẫu đã dùng cho `MATH_NUMBER_SENSE` — **một skill xuyên suốt nhiều stage**, độ khó phân biệt
qua `descriptionByAge` (5-7 vs 8-11) và qua nội dung unit, không phải qua mã skill khác nhau. Giữ Skill
Graph gọn, dễ theo dõi tiến bộ liên tục thay vì coi mỗi cấp là một kỹ năng tách biệt.

## 3. Skill Graph tiếng Anh (đã cập nhật ở `content/skills/skills.json`)

| Skill | BASE_CAMP (Starters) | EXPLORER (Movers) | Ghi chú |
|---|---|---|---|
| `ENGLISH_VOCABULARY` *(mới)* | ✅ PRIMARY khả dụng | ✅ | Nhận diện từ qua tranh (Starters) → mở rộng chủ đề (Movers) |
| `ENGLISH_LISTENING` | ✅ *(mở rộng — trước đây chỉ EXPLORER)* | ✅ | Nghe từ/câu lệnh đơn (Starters) → hội thoại ngắn, lệnh nhiều bước (Movers) |
| `ENGLISH_SPEAKING` *(mới)* | ✅ | ✅ | Chào hỏi/tự giới thiệu bằng từ (Starters) → câu hoàn chỉnh, hỏi-đáp (Movers) |
| `ENGLISH_READING` | ⛔ (chưa dùng — trẻ Starters còn đang học đọc tiếng Việt) | ✅ | Giữ nguyên ở mức Movers/Flyers |
| `ENGLISH_WRITING` | ⛔ | ✅ *(mở rộng — trước đây chỉ TDN_READINESS)* | Điền từ/hoàn thành câu có khung (Movers) |

`ENGLISH_READING` **cố tình không mở cho BASE_CAMP**: trẻ 6–7 tuổi ở Việt Nam thường chưa đọc thạo
tiếng Việt, đọc độc lập tiếng Anh ở tuổi này chưa phù hợp. Cambridge Starters cũng chỉ yêu cầu ghép
tranh–từ (vocabulary), không phải đọc hiểu đoạn văn — đúng là việc `ENGLISH_VOCABULARY` đảm nhiệm.

## 4. Chủ đề từ vựng theo cấp (rút gọn từ wordlist Cambridge YLE)

**Starters (BASE_CAMP)** — danh từ cụ thể, nhìn tranh gọi tên được ngay:
màu sắc · số 1–20 · con vật nuôi/nông trại · thành viên gia đình · bộ phận cơ thể · đồ vật lớp học ·
quần áo · đồ ăn quen thuộc.

**Movers (EXPLORER)** — mở rộng thêm chủ đề trừu tượng hơn một chút + cấu trúc câu:
thời tiết & mùa · nghề nghiệp · nơi chốn trong thị trấn · phương tiện đi lại · sở thích/thể thao ·
thì quá khứ đơn (regular) · so sánh hơn · "there is/are" · "can" chỉ khả năng.

## 5. Unit đã triển khai (Slice 7i + 7j)

| Pack | Unit | Cấp | Skill PRIMARY | Cấu trúc/chủ đề Cambridge |
|---|---|---|---|---|
| `vi-g1-english-colours-shapes.pack.json` | 🌈 Colours & Shapes | Starters | `ENGLISH_VOCABULARY` | Colours wordlist — ghép tranh với từ màu |
| `vi-g1-english-greetings.pack.json` | 👋 Hello, my name is... | Starters | `ENGLISH_SPEAKING` | Can-do Starters: chào hỏi + tự giới thiệu tên/tuổi |
| `vi-g1-english-listening-animals-numbers.pack.json` | 🐘 Listen & Point | Starters | `ENGLISH_LISTENING` | Nghe 1 lệnh đơn (point to / count) — animals + numbers 1–10 |
| `vi-g3-english-weather-speaking.pack.json` | ☀️ What's the weather like? | Movers | `ENGLISH_SPEAKING` | Weather wordlist + thì hiện tại đơn "It's + adj" |
| `vi-g3-english-past-simple-writing.pack.json` | ✍️ Yesterday I... | Movers | `ENGLISH_WRITING` | Quá khứ đơn động từ có quy tắc — điền vào chỗ trống |
| `vi-g3-english-comparatives-vocabulary.pack.json` | 📏 Bigger or smaller? | Movers | `ENGLISH_VOCABULARY` | So sánh hơn (comparative adjectives) qua mô tả tranh |
| `vi-g1-english-family.pack.json` | 👪 My Family | Starters | `ENGLISH_VOCABULARY` | Family wordlist — gọi tên thành viên gia đình |
| `vi-g1-english-body-parts.pack.json` | 🙆 Head, Shoulders, Knees & Toes | Starters | `ENGLISH_VOCABULARY` | Body parts wordlist — chỉ + gọi tên (kết hợp vận động) |
| `vi-g1-english-clothes.pack.json` | 👕 What are you wearing? | Starters | `ENGLISH_VOCABULARY` | Clothes wordlist — "I am wearing..." |
| `vi-g1-english-food.pack.json` | 🍎 Yummy or Yucky? | Starters | `ENGLISH_VOCABULARY` | Food wordlist + "I like / I don't like" |
| `vi-g1-english-numbers-11-20.pack.json` | 🔢 Numbers 11–20 | Starters | `ENGLISH_LISTENING` | Đếm tiếp 11–20, nối tiếp unit Listen & Point (1–10) |
| `vi-g3-english-there-is-are.pack.json` | 🏠 There is a cat in the garden | Movers | `ENGLISH_SPEAKING` | Cấu trúc "there is/there are" |
| `vi-g3-english-can-ability.pack.json` | 🏊 I can swim | Movers | `ENGLISH_SPEAKING` | "can/can't" chỉ khả năng |
| `vi-g3-english-jobs.pack.json` | 👨‍⚕️ What does a doctor do? | Movers | `ENGLISH_VOCABULARY` | Jobs wordlist + mô tả công việc |
| `vi-g3-english-transport.pack.json` | 🚌 How do you get to school? | Movers | `ENGLISH_VOCABULARY` | Transport wordlist — "I go to school by..." |

Đơn vị Starters dùng **MCQ** (`quest_flow.attempt_options`, ảnh + từ tiếng Anh, luôn kèm "Cách khác")
vì trẻ 6–7 tuổi vừa mới làm quen mặt chữ tiếng Anh — chọn tranh/từ đúng phù hợp hơn gõ chữ. Đơn vị
Movers giữ ô gõ chữ/nói (audio) như các unit EXPLORER khác, vì mục tiêu là tự tạo câu, không chỉ nhận
diện.

## 6. Chưa làm (còn 🟡, để tránh ôm quá nhiều trong một lần)

- Starters: đã phủ colours, greetings, animals/numbers 1–10, family, body parts, clothes, food,
  numbers 11–20 — còn thiếu vài chủ đề phụ (thời tiết/mùa ở mức Starters, đồ vật lớp học riêng biệt).
- Movers: đã phủ weather, past simple, comparatives, there is/are, can, jobs, transport — còn thiếu
  giới từ chỉ thời gian, thì tương lai gần "going to", câu mệnh lệnh (imperatives).
- Flyers (A2) — ngoài phạm vi 2 stage hiện có, để dành khi mở TDN_READINESS/lớp lớn hơn.
- Studio chưa có form riêng để soạn unit tiếng Anh (ảnh + audio) — hiện vẫn qua JSON thô, phần
  `content_ref` cho ảnh minh hoạ từ vựng cần được đội nội dung thật gán link ảnh đã duyệt bản quyền.
- Nội dung là **mẫu do AI soạn dựa trên khung Cambridge công khai**, chưa qua giáo viên tiếng Anh bản
  ngữ/chuyên môn YLE duyệt thật — bắt buộc review trước khi dùng cho trẻ thật (đúng quy chế
  `CONTENT_AUTHORING.md` §2: nội dung AI-generated không auto-publish).
