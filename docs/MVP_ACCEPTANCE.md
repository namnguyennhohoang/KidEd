# MVP_ACCEPTANCE.md — Đối chiếu tiêu chí nghiệm thu (spec mục 15)

Trạng thái Giai đoạn 1 sau Slice 1–4. Lệnh kiểm chứng: `npm test` (88), `npm run e2e` (1), `npm run typecheck`, `npm run lint`, `npm run build:web`, `npm run db:migrate && npm run db:seed`.

## Chức năng

| Tiêu chí | Trạng thái | Bằng chứng |
|---|---|---|
| End-to-end flow không cần sửa dữ liệu trực tiếp | ✅ | E2E `onboarding.spec.ts`: onboarding → loop → dashboard |
| ContentPack mới hợp lệ thêm được không sửa frontend/backend | ✅ | `contract.test.ts`: file `.pack.json` mới → nạp + API + chạy trọn phiên + minh chứng, zero code change |
| Hint level ghi đúng, không vượt cấp ngoài rule | ✅ | `session-flow.test.ts` "hint TRƯỚC khi thử → level ≤ 5"; `rule-engine.test.ts`; `hint_interaction.max_allowed_level` |
| Artifact/reflection/parent observation liên kết đúng session | ✅ | `session-flow.test.ts` `GET /sessions/:id`; `governance.test.ts` |
| Dashboard tính đúng dữ liệu kiểm thử | ✅ | `governance.test.ts` "tính số liệu từ phiên đã hoàn thành" |
| Mất AI không làm mất phiên học | ✅ | `AiGateway` mọi lối thoát → `DeterministicProvider`; `AI_PROVIDER=PLUGGABLE` = không gọi LLM |
| AI Coach: rule engine quyết định, LLM chỉ diễn đạt, chống prompt injection | ✅ | `packages/ai-gateway` `AiGateway` + `gateway.test.ts` (20) + `adversarial.test.ts` (ContentPack chèn lệnh → fallback an toàn) |
| Phiên học cốt lõi tiếp tục khi mất mạng + đồng bộ khi có lại | ✅ | Local-first (`lib/learn-store.ts`): hint tính tại client, mọi bước lưu IndexedDB; `POST /sessions/sync` idempotent; `sync.test.ts` (6) + E2E `offline → chu trình → reconnect → dashboard` |
| Không làm mất sản phẩm của trẻ khi sync | ✅ | Append-only + artifact dedupe theo `clientArtifactId` (giữ mọi `artifact_version`); `sync.test.ts` "artifact dedupe" |
| Artifact tạo offline có mã hóa cục bộ (spec §11) | ✅ | `lib/artifact-store.ts` — AES-GCM (khóa non-extractable IndexedDB), giải mã + upload khi có mạng; E2E `offline → … → artifact mã hóa` |

## Sư phạm

| Tiêu chí | Trạng thái | Bằng chứng |
|---|---|---|
| Mỗi unit có hành động của trẻ trước lời giải | ✅ | Validation S2; `learning-unit.schema.json` `minimum_attempts_before_solution ≥ 1` |
| Có lựa chọn nhưng không quá tải | ✅ | `choices` 2–3 (schema + S9) |
| Có explain / revise / reflect | ✅ | `quest_flow` bắt buộc `explain_prompt` + `reflection_prompt` (S3); web loop có Reflect |
| Phản hồi không gắn nhãn / so sánh | ✅ | `DeterministicCoach` dùng câu đã duyệt; `PRESSURE_BLOCKLIST` (S8); dashboard chặn từ khóa xếp hạng |
| Không tối ưu thời gian màn hình | ✅ | Không có metric "time on app" ở north-star; `rule engine` fatigue → dừng/vận động |
| ≥ 50–70% hoạt động ngoài màn hình (Base Camp) | ✅ (nội dung) | S4 (offline > 0) + S10 (offline ≥ screen); gói mẫu: screen 5+4 / offline 15+10 |

## An toàn

| Tiêu chí | Trạng thái | Bằng chứng |
|---|---|---|
| Child session không truy cập Parent Dashboard | ✅ | `auth.test.ts` + `governance.test.ts` "child → dashboard 403" |
| Không lộ API key / secret ở client / log | ✅ | Không có provider key ở GĐ1; logger redact `authorization`/`cookie`/`set-cookie`; test "không lộ mật khẩu/pin/scrypt$" |
| Rate-limit đăng nhập / khóa mềm | ✅ | `LoginThrottle` (5/15’ → khóa 5’) + audit `auth.login_locked`; `rate-limit.test.ts` (4) + integration |
| CSRF cho route ghi dùng cookie | ✅ | double-submit `tiny_csrf` + `x-csrf-token`; `csrf.test.ts` (5) |
| Sự đồng ý của trẻ (`child_assent`) | ✅ (một phần) | bảng + API + export + audit; **advisory** — chính sách chặn do rà soát người quyết |
| Test IDOR/BOLA cho tài nguyên trẻ | ✅ | `auth.test.ts` (GET/PATCH/child-session cross-family → 404); `session-flow.test.ts`; `governance.test.ts` (observation/export cross-family → 404) |
| Upload: type, size, malware strategy, authorization | ⚠️ một phần | `checkUpload` (MIME whitelist + magic bytes + ≤8MB) + consent gate + child sở hữu session; **quét malware thực tế** chưa (chỉ chiến lược) |
| Dữ liệu trẻ không dùng train model theo mặc định | ✅ | `DATA_USED_FOR_MODEL_TRAINING=false`; GĐ1 không gửi gì cho provider |
| Có export/delete test + audit trail | ✅ | `governance.test.ts` EXPORT DONE + tải JSON (không hash); DELETE cần confirm → cascade; `audit-log` chứa mọi thao tác |

## Chất lượng phần mềm

| Tiêu chí | Trạng thái | Bằng chứng |
|---|---|---|
| Type check + lint + test chạy bằng lệnh trong README | ✅ | `npm run typecheck` / `lint` / `test` |
| Migration chạy từ database rỗng | ✅ | `npm run db:migrate` (`0000–0003`); PGlite local + **Postgres thật** trong CI job `postgres` |
| Seed idempotent | ✅ | seed lần 2 = "updated", số lượng ổn định (2 pack) |
| API có OpenAPI docs | ✅ | `GET /openapi.json` (`@fastify/swagger`) |
| Unit/integration/E2E cho luồng chính | ✅ | 89 unit/integration (+2 pg-smoke chạy trong CI) + 1 E2E Playwright |
| CI | ✅ | `.github/workflows/ci.yml`: job `check` (PGlite) + job `postgres` (Postgres 16 service) |
| Không TODO security quan trọng trên đường chạy production | ⚠️ | Còn: quét malware thực tế; rate-limit login; rà soát bởi người. Xem "Còn nợ". |

## Còn nợ trước khi coi Giai đoạn 1 là "MVP xong"

1. ~~Contract test~~ ✅ · ~~CI~~ ✅ · ~~Adapter Postgres/S3~~ ✅ · ~~Offline sâu (P1-S3c)~~ ✅
2. **Rà soát an toàn/sư phạm/bảo mật bởi người** (Prompt 9) + threat model review với chuyên gia. Tự-audit đã có: `docs/AUDIT_PHASE1.md` (25 phát hiện, 5 đã sửa).
3. ⛔ Quét malware upload · mã hóa at-rest (Postgres/S3 production) · `child_assent` · job retention (`audit_log`/`session_event`/export) · server-side hint cooldown · cưỡng chế `screen_session_minutes`.
4. 🟡 Lọc nội dung theo `current_stage` · CSRF token · `bodyLimit` tường minh · S3 integration test (MinIO).
5. Voice-first thật (ghi âm) nối UI; shadcn/ui; accessibility pass (screen reader, bàn phím).
6. `git` — repo là git nhưng **chưa có commit nào**.
