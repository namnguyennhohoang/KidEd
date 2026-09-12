# AUDIT_PHASE1.md — Tự-audit Giai đoạn 1 (Prompt 9)

Audit theo ba vai trò trên mã nguồn hiện tại (Slice 1–3c + hardening). **Đây là tự-audit của đội xây dựng, KHÔNG thay cho rà soát độc lập bởi chuyên gia người thật** — vẫn là điều kiện bắt buộc trước production (`MVP_ACCEPTANCE.md` mục "Còn nợ").

Ký hiệu trạng thái: ✅ đã sửa trong lượt này · 🟡 mở, có chủ · ⛔ chặn production.

## A. Security engineer

| ID | Mức | Phát hiện | Bằng chứng | Xử lý |
|---|---|---|---|---|
| SEC-1 | MED | `session_event.type` nhận `z.string()` bất kỳ ở `/events` và `/sync` → client trẻ có thể bơm loại event lạ, làm nhiễu analytics | `routes/sessions.ts` | ✅ `/events` → 400 nếu có loại ngoài enum; `/sync` → bỏ qua & trả `eventsDropped` (dùng `isSessionEventType`) |
| SEC-2 | MED | `data_request` DELETE chỉ cần `confirm:true` — phiên phụ huynh bị đánh cắp có thể xóa toàn bộ dữ liệu | `routes/governance.ts` | ✅ DELETE nay bắt buộc **PIN gần đây** (`requirePinVerified` inline) + `confirm:true` |
| SEC-3 | LOW | `clientArtifactId` từ multipart không giới hạn độ dài | `routes/sessions.ts` | ✅ cắt `slice(0, 200)` |
| SEC-4 | MED | Không rate-limit đăng nhập | `routes/auth.ts` | ✅ `LoginThrottle` (5 lần sai / 15’ → khóa mềm 5’), audit `auth.login_failed` / `auth.login_locked` |
| SEC-5 | MED | `/content/*` trả **mọi** pack bất kể `current_stage` của trẻ — child session xem được nội dung ngoài giai đoạn | `routes/content.ts` | ✅ child session lọc theo `child_profile.current_stage`; pack/unit ngoài stage → 404 (`content-authz.test.ts`) |
| SEC-6 | LOW | Không có CSRF token cho route POST dùng cookie | toàn bộ | ✅ double-submit `tiny_csrf` (cookie non-HttpOnly + header `x-csrf-token`); hook chặn khi xác thực bằng cookie + method thay đổi trạng thái; Bearer miễn. `csrf.test.ts` (5) |
| SEC-7 | MED | Chưa quét malware cho file upload (mới magic-bytes + MIME + size + consent) | `storage/validate-upload.ts` | 🟡 mở — tích hợp scanner (ClamAV/định dạng đám mây) trước production |
| SEC-8 | LOW | `bodyLimit` mặc định Fastify 1MB; `/sync` `attempts[].content` là `z.record(z.unknown())` không giới hạn độ sâu | `server.ts` | ✅ `bodyLimit: 2MB` tường minh; mảng trong `/sync` đã `.max()` |
| SEC-9 | MED | PGlite dev DB + `FilesystemStorage` không mã hóa at-rest (spec §11/§12) | `db/client.ts`, `storage/index.ts` | 🟡 mở — production dùng Postgres + S3 có mã hóa; dev chấp nhận. Artifact offline trên thiết bị: xem EDU-4 |
| SEC-10 | LOW | Adapter S3 chưa có integration test | `storage/index.ts` | 🟡 mở — cần MinIO trong CI |

## B. Privacy reviewer

| ID | Mức | Phát hiện | Bằng chứng | Xử lý |
|---|---|---|---|---|
| PRV-1 | MED | File export (`exports/<familyId>/<reqId>.json`) chứa toàn bộ dữ liệu family, **không có TTL/dọn dẹp** | `routes/governance.ts` | ✅ `jobs/retention.ts` xóa file + bản ghi sau `EXPORT_TTL_DAYS` (mặc định 7); `retention.test.ts` |
| PRV-2 | MED | `audit_log` append-only, **chưa có purge theo retention** | schema + không có job | ✅ `jobs/retention.ts`: phiên đã kết thúc > `RETENTION_DAYS` (cascade), `audit_log` > `AUDIT_RETENTION_DAYS`. `npm run job:retention` (cron ở hạ tầng). `retention.test.ts` (3) |
| PRV-3 | MED | Chưa hiện thực `child_assent` (spec §6.1/§12) | schema | ✅ (một phần) bảng `child_assent` + `POST/GET /children/:id/assent` + có trong export + audit `child_assent.recorded`. **Advisory** — chính sách "chặn khi thiếu assent" + từ ngữ hỏi trẻ theo tuổi do rà soát người quyết. `governance.test.ts` (2) |
| PRV-4 | LOW | Redaction layer gửi AI provider chưa tồn tại | — | 🟢 N/A Giai đoạn 1 (không gọi provider); bắt buộc trước Giai đoạn 2 |
| PRV-5 | OK | Export **không** chứa `password_hash` / `pin_hash` / token | `learning/export.ts` (chỉ chọn field an toàn) + test `sync`/`governance` | ✅ có test |
| PRV-6 | OK | Event payload không chứa văn bản trẻ (chỉ `ordinal`, `choiceIds`…); nội dung học nằm ở `attempt.content` đúng chỗ | `routes/sessions.ts` | ✅ |
| PRV-7 | LOW | Không dùng dữ liệu trẻ để train model — mới là cờ config, chưa có ràng buộc hợp đồng provider | `.env` | 🟢 N/A Giai đoạn 1 |

## C. Chuyên gia giáo dục trẻ em

| ID | Mức | Phát hiện | Bằng chứng | Xử lý |
|---|---|---|---|---|
| EDU-1 | MED | Không có cooldown giữa các lần bấm "Con cần gợi ý" — bé có thể xin liên tục, mỗi lần +1 mức | `app/learn/page.tsx` + `routes/sessions.ts` | ✅ client cooldown 3s **+ server** cooldown 8s ở `/hint` (trả lại gợi ý gần nhất, `rulesFired:0`, không ghi hint mới). `content-authz.test.ts` |
| EDU-2 | MED | `screen_session_minutes` cấu hình nhưng **không cưỡng chế** phía client | `learn-store.ts`, `app/learn/page.tsx` | ✅ `checkFatigue(s, ctx)` dùng `decideFatigue` với thời lượng phiên thật; "nghỉ nudge" khi SHORTEN/STOP — kích hoạt sau attempt/hint **và** qua timer 20s (kể cả khi trẻ không thao tác). Server `/hint` đã nạp `sessionMinutes`. |
| EDU-3 | LOW | `computeHint` client hardcode `childAgeYears: 6` | `learn-store.ts` | ✅ `child-session` trả `childContext { ageYears, screenSessionMinutes, stage }` (không PII); client cache & truyền vào `computeHint` |
| EDU-4 | LOW | Chưa có upload artifact khi offline | `app/learn/page.tsx` | ✅ `lib/artifact-store.ts`: ảnh được **mã hóa AES-GCM** (khóa non-extractable trong IndexedDB) rồi xếp hàng; giải mã + upload khi có mạng với dedupe `clientArtifactId`. Nếu thiếu consent → giữ lại chờ. E2E `offline → … → artifact mã hóa`. **Bug đã sửa:** proxy Next mangle body nhị phân/multipart (`req.text()`) → nay forward nguyên byte. |
| EDU-5 | OK | Không streak/điểm/huy hiệu; reflection là mặt cười cảm xúc, không phải điểm | `app/learn/page.tsx`, dashboard | ✅ |
| EDU-6 | OK | "Con muốn nghỉ" hiển thị ở mọi bước; chặn "làm xong" tới khi đủ `minimum_attempts` | `app/learn/page.tsx` | ✅ (E2E xác nhận) |
| EDU-7 | OK | Dashboard: một gợi ý hành động, không xếp hạng/dự báo (test chặn từ khóa) | `learning/dashboard.ts`, `governance.test.ts` | ✅ |
| EDU-8 | OK | Hint chỉ dùng nội dung `hints[]` đã duyệt; không sinh lời giải; trần help-ladder chặn mức 6 khi chưa đủ số lần thử | `deterministic-coach.ts`, `rule-engine`, test | ✅ |

## Tổng kết & điều kiện GO

**Đã sửa (4 lượt hardening):** SEC-1..6, SEC-8, PRV-1, PRV-2, PRV-3 (một phần), EDU-1..4. `npm test` → **114 pass** + 3 E2E kịch bản (2 test).

**⛔ Chặn production (phải xong trước GO):**
1. Rà soát độc lập bởi chuyên gia người thật (an toàn trẻ + bảo mật + pháp lý) + threat model review.
2. SEC-7 quét malware upload · SEC-9 mã hóa at-rest (dùng Postgres/S3 production).
3. PRV-3: chốt chính sách chặn-khi-thiếu-assent + từ ngữ hỏi trẻ theo tuổi (cần chuyên gia).

**🟡 Nên xong sớm:** SEC-10 S3 integration test (MinIO).
