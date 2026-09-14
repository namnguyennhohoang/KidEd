# BACKLOG.md — Giai đoạn 0 & Giai đoạn 1

## Giai đoạn 0 — Discovery & Kiến trúc (đang thực hiện)

| ID | Hạng mục | Trạng thái | Ghi chú |
|---|---|---|---|
| P0-1 | `docs/PRODUCT.md` | ✅ | Phạm vi, 3 tầng mục tiêu, MVP |
| P0-2 | `docs/PEDAGOGY.md` | ✅ | Learning loop, help ladder, feedback rules |
| P0-3 | `docs/CHILD_SAFETY.md` | ✅ | Red lines R1–R13 + threat model T1–T13 |
| P0-4 | `docs/DATA_MODEL.md` + ERD | ✅ | Mermaid ERD, bounded contexts, cột chính |
| P0-5 | `docs/AI_BEHAVIOR.md` | ✅ | Rule engine vs LLM, structured output, gateway |
| P0-6 | `docs/CONTENT_AUTHORING.md` | ✅ | Vòng đời pack, validation S1–S10, contract test |
| P0-7 | `docs/SECURITY.md` | ✅ | RBAC, privacy, compliance checklist |
| P0-8 | `docs/API_OUTLINE.md` | ✅ | REST outline cho Giai đoạn 1 |
| P0-9 | ADR 0001–0006 | ✅ | Stack, rule-engine-first, versioning, authz, offline, dev-data |
| P0-10 | JSON Schema: content-pack, learning-unit, interaction-skill, event, ai-coach-response | ✅ | `packages/content-schema/schemas/` |
| P0-11 | Nội dung mẫu + validate script chạy được | ✅ | 1 unit mẫu; 8–12 unit đầy đủ chuyển sang P1 |
| P0-12 | Rà soát nhất quán pedagogy ↔ data model ↔ schema ↔ authz ↔ events | ✅ | Xem §Consistency check dưới |
| P0-13 | Threat model review với security/privacy (người) | ⛔ chờ | Cần chuyên gia người thật |
| P0-14 | Xác nhận giả định blocker với phụ huynh | ⛔ chờ | Xem §Câu hỏi cho chủ dự án |

### Consistency check (P0-12) — kết quả

- Learning loop (Choose/Try/Reflect bắt buộc) ↔ validation S2/S3 ↔ schema `quest_flow` + `minimum_attempts_before_solution` ✔
- Help ladder 0–6 ↔ `hint_interaction.help_ladder_level` ↔ AI structured output invariant `hint_level <= max_allowed` ✔
- "Không điểm tổng hợp" ↔ `child_skill_state` per-skill, không có bảng `child_overall_score` ✔
- "Tách admission khỏi learning objective" ↔ `admission_rule` riêng, không ở ContentPack ✔
- RBAC child ↔ `auth_session.kind`, threat T1/T2 ↔ endpoint dashboard tách + object-level authz ✔
- Offline-first ↔ `session.created_offline`, `client_generated_id`, API `/sync` ✔
- Provenance ↔ `content_pack.provenance_*` + schema `provenance` required ✔

## Giai đoạn 1 — Base Camp vertical slice

> Stack: all-TypeScript, không Docker (ADR 0007). Chia thành 4 slice chạy được + test được, không xây tất cả một lần.

### Slice 1 — Nền tảng & nạp nội dung  ✅ HOÀN THÀNH
| ID | Hạng mục | Trạng thái |
|---|---|---|
| P1-S1-1 | Root tooling: tsconfig base, ESLint (flat), Prettier, Vitest, npm scripts | ✅ |
| P1-S1-2 | `packages/domain`: rule engine v0 (help-ladder + fade scaffolding + fatigue + adaptations + kiểm bất biến phản hồi LLM) — pure, 16 unit test | ✅ |
| P1-S1-3 | `packages/analytics`: event types + 6 metric calculator — 13 unit test | ✅ |
| P1-S1-4 | `apps/api`: Fastify + `/health` + `/health/content-count` + `/openapi.json` + config loader (Zod) | ✅ |
| P1-S1-5 | Drizzle schema (4 bảng nội dung) + Drizzle Kit migration chạy từ DB rỗng (PGlite, path neo repo-root) | ✅ |
| P1-S1-6 | Seed idempotent: nạp `content/packs/**/*.pack.json` qua `@tiny/content-schema` validate; pack lỗi bị TỪ CHỐI | ✅ |
| P1-S1-7 | Integration (8 test): nạp nội dung, idempotent, từ chối pack lỗi, `GET /content/packs`/`units/:id`, 404 | ✅ |

**Kết quả Slice 1:** `npm test` → 40/40 pass. `npm run typecheck` → sạch. `npm run lint` → sạch. `npm run db:migrate && npm run db:seed` chạy từ DB rỗng; seed lần 2 = "updated" (idempotent). `npm run api` boot thật: `/health` ok, tự seed dev, `/content/*` trả dữ liệu.
**Bug đã sửa:** đường dẫn PGlite/storage phụ thuộc cwd làm server và seed trỏ 2 thư mục khác nhau → neo vào repo-root trong `apps/api/src/paths.ts`.
**Lệnh khi đổi schema:** `npm run db:generate --workspace apps/api` (sinh SQL migration mới, commit vào `apps/api/drizzle/`).

### Slice 2a — Auth + family/child + authz (API)  ✅ HOÀN THÀNH
| ID | Hạng mục | Trạng thái |
|---|---|---|
| P1-S2-1 | Auth: `/auth/register` (family+owner+pin), `/auth/login`, `/auth/logout`, `/auth/me`, `/auth/parent-pin/verify`. scrypt built-in, cookie HttpOnly + Bearer. Token chỉ lưu SHA-256 hash. | ✅ |
| P1-S2-2 | Bảng `family`, `app_user`, `auth_session`, `child_profile` + `child_interest`/`child_goal`/`child_accommodation`, `consent`, `audit_log` (append-only). Migration `0001`. | ✅ |
| P1-S2-3 | `POST /children` (tạo hồ sơ + interests/goals + consent DATA_PROCESSING bắt buộc + audit), `GET/PATCH /children/:id`, `GET /children` | ✅ |
| P1-S2-4 | Child session `POST /children/:id/child-session` (`kind=CHILD`, TTL 2h, `parent_session_id`, không nâng quyền) | ✅ |
| P1-S2-5 | Guards: `requireAuth`/`requireParent`/`requirePinVerified`; `assertFamilyAccess` → 404 khác family (chống IDOR/BOLA); child → 403 route phụ huynh | ✅ |
| P1-S2-6 | Placeholder `GET /children/:id/dashboard` (PIN-gated, parent-only) — số liệu thật ở Slice 4 | ✅ |
| P1-S2-7 | 15 integration test: đăng ký/đăng nhập/đăng xuất, không lộ secret, consent+audit, **IDOR/BOLA (GET/PATCH/child-session cross-family → 404)**, **cô lập child session (dashboard/create → 403; content → 200)**, PIN gate | ✅ |

**Kết quả Slice 2a:** `npm test` → **56/56 pass**. typecheck + lint sạch. migrate `0000`+`0001` từ DB rỗng OK. Smoke test HTTP thật: register→child→PIN gate (403→200)→child session isolation (403 dashboard, 200 content) đều đúng.

### Slice 2b — Web onboarding + Choose (Next.js)  ✅ HOÀN THÀNH
| ID | Hạng mục | Trạng thái |
|---|---|---|
| P1-S2b-1 | `apps/web` Next.js 15 (App Router) + Tailwind 3 + PWA manifest. **shadcn/ui hoãn** — dùng primitive Tailwind tối giản (`components/ui.tsx`), adopt sau. | ✅ |
| P1-S2b-2 | Proxy cùng-origin `app/api/[...path]` → `apps/api`; chuyển tiếp cookie + Set-Cookie (bỏ Domain). Trẻ/phụ huynh không gọi trực tiếp API, không cần CORS. | ✅ |
| P1-S2b-3 | `/onboarding` 2 bước: đăng ký phụ huynh + tạo hồ sơ trẻ (tháng/năm sinh, thời lượng phiên, sở thích, checkbox consent voice/image) | ✅ |
| P1-S2b-4 | `/parent`: liệt kê trẻ, "Bắt đầu cho bé" → mở child session; guard `kind=CHILD` → `/learn`; đăng xuất | ✅ |
| P1-S2b-5 | `/learn` màn **Choose**: 1 nhiệm vụ/màn hình, nút lớn `variant="big"`, hiển thị `unit.choices`, "Con muốn nghỉ" (gọi `/child-session/end`). Vòng lặp đầy đủ ở Slice 3. | ✅ |
| P1-S2b-6 | `POST /child-session/end` (API) — kết thúc phiên trẻ, cookie phụ huynh có hiệu lực lại; `extractToken` ưu tiên child cookie | ✅ |
| P1-S2b-7 | Playwright E2E (`apps/web/e2e/onboarding.spec.ts`): onboarding → tạo trẻ → child session → `/learn` có **2 lựa chọn** + "Con muốn nghỉ" → chọn → "Con chọn:" | ✅ |

**Kết quả Slice 2b:** `npm test` → **57/57 pass** (+1 test `/child-session/end`). typecheck + lint sạch. `npm run build:web` OK (6 route). `npm run e2e` → **1/1 pass** (Chromium; cần `npm run e2e:install` một lần để tải browser). API webServer cho E2E chạy `NODE_ENV=test` → PGlite in-memory, tự migrate + seed mỗi lần khởi động.
**Bug đã sửa:** proxy gửi `content-type: application/json` kèm body rỗng → Fastify 400; nay chỉ gửi khi có body. Sau khi mở child session, cookie phụ huynh vẫn được ưu tiên → `/learn` bật lại `/parent`; nay ưu tiên child cookie.
**Lệch spec (ghi nhận):** chưa dùng shadcn/ui (primitive tự viết); Next pin `^15.5.4` (CVE-2025-66478 ở 15.1.3).

### Slice 3 — Learning loop runtime (MVP bước 4–8)  ✅ HOÀN THÀNH (offline một phần)
| ID | Hạng mục | Trạng thái |
|---|---|---|
| P1-S3-1 | `packages/ai-gateway`: port `AiProvider` + `DeterministicCoach` (không LLM) chọn câu theo `directive` + `hints[]` đã duyệt; `assertCoachResponseValid`. 7 unit test. Migration `0002`. | ✅ |
| P1-S3-2 | Bảng `session`, `session_event` (idempotent (session_id, client_generated_id)), `attempt`, `hint_interaction`, `rule_firing`, `reflection`, `artifact`, `artifact_version` | ✅ |
| P1-S3-3 | Routes `/sessions` + `/plan` `/attempts` `/hint` `/artifacts` `/reflection` `/complete` `/pause` `/events` `GET /sessions/:id`. `requireChild` + object-level (child sở hữu; parent cùng family CHỈ đọc) | ✅ |
| P1-S3-4 | `/sessions/:id/hint`: `buildSnapshot` → `evaluate()` (rule engine) → `DeterministicCoach` → kiểm bất biến → ghi `rule_firing` + `hint_interaction`. **Chặn lời giải trước `minimum_attempts`** qua trần help-ladder (R-HL-1). Vi phạm bất biến → hạ về phản hồi an toàn + ghi lại. | ✅ |
| P1-S3-5 | `StoragePort` + `FilesystemStorage` (dev); `checkUpload` (MIME whitelist + magic bytes + ≤8MB); **consent gate**: PHOTO cần IMAGE_UPLOAD, VOICE cần VOICE_RECORDING; `artifact_version` v1 "bản gốc do trẻ tạo" | ✅ |
| P1-S3-6 | Web `/learn` chu trình đầy đủ: Choose → Plan → Try (+Hint, khoá "xong" tới khi đủ `minimumAttempts`) → Make (ảnh tùy chọn) → Reflect (chọn hình) → Done → "Con muốn nghỉ" (pause + end child session) | ✅ |
| P1-S3-7 | Offline nền: `public/sw.js` (điều hướng khi mất mạng + stale-while-revalidate `/api/content/*`, bỏ qua RSC/`_next`/API ghi) | ✅ |
| P1-S3-8 | 15 integration test (`session-flow.test.ts`): 12 bước, hint chặn lời giải, idempotent events, upload chặn magic-bytes sai + consent, parent đọc-không-ghi, `rule_firing` ghi, cô lập giữa trẻ. E2E Playwright chu trình đầy đủ. | ✅ |

### Slice 3c — Offline sâu (local-first)  ✅ HOÀN THÀNH
| ID | Hạng mục | Trạng thái |
|---|---|---|
| P1-S3c-1 | `POST /sessions/sync`: gộp một phiên **tạo offline** (session + plan + attempts + events + hints + `rule_firing` + reflection + completed). Idempotent theo `session.client_generated_id` và `(session, cgid)` cho attempt/event. Sinh `skill_evidence` một lần khi completed. Audit `session.synced`. Migration `0004` (+ unique index `attempt_idem`, `artifact.client_artifact_id`). | ✅ |
| P1-S3c-2 | Artifact dedupe theo `clientArtifactId` (retry / sync) — trả artifact cũ, **không** tạo bản trùng, giữ mọi `artifact_version` | ✅ |
| P1-S3c-3 | Web local-first: `lib/learn-store.ts` (IndexedDB) — mọi bước ghi cục bộ trước; **hint tính tại client** bằng `@tiny/domain` `evaluate` + `@tiny/ai-gateway` `coachTurnSync` (kết quả trùng server); `syncSession`/`syncAllPending` gửi `/sessions/sync` khi có mạng; `installSyncOnReconnect` bắt sự kiện `online` | ✅ |
| P1-S3c-4 | `/learn` viết lại theo local-first; banner "Đang ngoại tuyến"; `next.config` `transpilePackages` + `extensionAlias` để bundle package workspace | ✅ |
| P1-S3c-5 | 6 integration test (`sync.test.ts`): tạo phiên offline → 201 gộp đủ; sync lại → 200 không nhân đôi; cô lập cgid giữa trẻ → 404; completed một lần (skill_evidence không sinh lại); artifact dedupe. E2E Playwright **offline → chu trình → reconnect → đồng bộ → dashboard đếm đúng** | ✅ |

**Kết quả Slice 3 + 3c:** `npm test` → **95 pass** + 2 skipped (pg-smoke) — 11 file. typecheck + lint sạch. `build:web` OK. `npm run e2e` → **2/2** (chu trình đầy đủ + offline→online). migrate `0000–0004` từ DB rỗng; seed idempotent (2 pack).

### Slice 4 — Parent dashboard + governance (MVP bước 9–12)  ✅ HOÀN THÀNH
| ID | Hạng mục | Trạng thái |
|---|---|---|
| P1-S4-1 | Bảng `parent_observation`, `skill_evidence`, `data_request` (migration `0003`) | ✅ |
| P1-S4-2 | `POST /children/:id/observations` (family-scoped, emit `PARENT_OBSERVATION_ADDED`, audit) | ✅ |
| P1-S4-3 | `GET /children/:id/dashboard` (PIN-gated): độc lập, initiation latency trung vị, hint trend (down/flat/up), số chiến lược/phiên, reflection, minh chứng kỹ năng, gợi ý một hành động nhỏ. **Không xếp hạng / dự báo / IQ** (test chặn từ khóa). | ✅ |
| P1-S4-4 | `skill_evidence` tự sinh khi `/complete` — nhiều minh chứng/kỹ năng, `verifier=SYSTEM`, `confidence=LOW`; `GET /children/:id/skill-evidence` gom theo kỹ năng | ✅ |
| P1-S4-5 | `data_request`: EXPORT → gom toàn bộ dữ liệu family/trẻ ra JSON (không mật khẩu/hash/token) + tải xuống; DELETE trẻ (cần `confirm`) / cả family — cascade FK; `GET /families/:id/audit-log` | ✅ |
| P1-S4-6 | Web: `/parent/child/[id]` (PIN gate → số liệu + form quan sát + nút export); `/parent` thêm "Xem tiến trình" | ✅ |
| P1-S4-7 | 9 integration test (`governance.test.ts`) + E2E mở rộng: loop đầy đủ → nghỉ → dashboard (PIN, completed=1, thêm quan sát, export) | ✅ |

**Kết quả Slice 4:** `npm test` → **88/88 pass** (8 file). typecheck + lint sạch. `build:web` OK (7 route + `/parent/child/[id]`). `npm run e2e` → **1/1** trọn vẹn 10 bước. migrate `0000–0003` từ DB rỗng; seed idempotent.
**Bug đã sửa:** "Con muốn nghỉ" sau khi hoàn thành gọi `/pause` → phiên COMPLETED bị đưa về PAUSED (dashboard đếm 0); nay client + server đều chặn. Service worker cache-first bắt cả RSC payload → hỏng điều hướng Next; nay SW chỉ xử lý `mode==='navigate'`, bỏ qua `_rsc`/`_next`/API.

### CI (xuyên suốt)  ✅
| ID | Hạng mục | Trạng thái |
|---|---|---|
| P1-CI-1 | `.github/workflows/ci.yml` job `check`: `npm ci` + lint + typecheck + `validate:content` + `npm test` + `build:web` + migration/seed từ DB rỗng (PGlite) | ✅ |
| P1-CI-2 | Job `postgres` (service `postgres:16`): `db:migrate` + `db:seed` + `postgres-smoke.test.ts` (đăng ký → child session → chu trình học trọn vẹn → minh chứng) trên **Postgres thật** — bù rủi ro PGlite (ADR 0007). Local: skip khi không có `DATABASE_URL`. | ✅ |

### Adapter production  ✅
| ID | Hạng mục | Trạng thái |
|---|---|---|
| P1-ADP-1 | `createDatabase`: có `DATABASE_URL` → Postgres thật (`pg.Pool` + `drizzle-orm/node-postgres`, nạp động); không có → PGlite. `runMigrations` chọn migrator theo driver. | ✅ |
| P1-ADP-2 | `createStorage`: `STORAGE_DRIVER=s3` → `S3Storage` (`@aws-sdk/client-s3` nạp động, `forcePathStyle` cho MinIO); mặc định filesystem | ✅ |
| P1-ADP-3 | Contract test `apps/api/src/content/contract.test.ts`: file `.pack.json` mới → nạp + phục vụ API + chạy trọn phiên + minh chứng — **không sửa mã** | ✅ |
| P1-ADP-4 | Gói nội dung mẫu thứ 2: `content/packs/base-camp/vi-g1-observe-shadows.pack.json` (khoa học quan sát). Sửa dương-tính-giả S8 ("ngu" trong "nguồn") → so khớp theo ranh giới từ Unicode. | ✅ |

### Domain & dữ liệu
| ID | Hạng mục |
|---|---|
| P1-DOM-1 | `packages/domain`: entities Identity/Family/Child + value objects, không ORM |
| P1-DOM-2 | Models + migrations: family, user, auth_session, child_profile + nhóm child_* |
| P1-DOM-3 | Models: content_pack, learning_unit(+skill/outcome) |
| P1-DOM-4 | Models: session, session_event, attempt, hint_interaction, reflection, artifact(+version) |
| P1-DOM-5 | Models: parent_observation, skill_evidence |
| P1-DOM-6 | Models: consent, data_request, audit_log |
| P1-DOM-7 | Rule engine tối thiểu: help-ladder + fade scaffolding + fatigue stop (deterministic) |

### Luồng người dùng (12 bước MVP)
| ID | Bước MVP |
|---|---|
| P1-FLOW-1 | Parent onboarding: tạo family + child + cấu hình thời lượng + consent cơ bản |
| P1-FLOW-2 | Load ContentPack đã duyệt (seed) |
| P1-FLOW-3 | Child chọn 1/2 nhiệm vụ (Choose) |
| P1-FLOW-4 | Plan đơn giản (voice/hình/chọn) |
| P1-FLOW-5 | Attempt + yêu cầu hint theo thang (deterministic; AI optional) |
| P1-FLOW-6 | Chặn lời giải trước `minimum_attempts` |
| P1-FLOW-7 | Upload ảnh tranh / ghi âm giải thích |
| P1-FLOW-8 | Reflection bằng giọng nói hoặc chọn hình |
| P1-FLOW-9 | Parent thêm observation |
| P1-FLOW-10 | Dashboard tối thiểu: độc lập, hint trend, chiến lược, minh chứng — không xếp hạng |
| P1-FLOW-11 | Offline fallback: phiên chạy được khi mất AI/mạng; sync sau |
| P1-FLOW-12 | Export + delete dữ liệu family |

### Nội dung mẫu (8–12 LearningUnit)
Toán number sense · Đọc hiểu tiếng Việt · Vẽ–kể chuyện · English listening/speaking · Khoa học quan sát · Trò chơi executive function · Brave Step · Nhiệm vụ vận động · Piano/nhịp điệu (+ 1–3 unit bổ sung để phủ schema).

### Test (Giai đoạn 1)
| ID | Loại |
|---|---|
| P1-TEST-1 | Unit: rule engine (help ladder, fade, fatigue), validation S1–S10 |
| P1-TEST-2 | Integration: session flow, idempotent events, artifact↔session, dashboard tính đúng |
| P1-TEST-3 | Contract: nạp ContentPack mới không sửa code (`CONTENT_AUTHORING §5`) |
| P1-TEST-4 | Security: child session → 403 dashboard; IDOR/BOLA; upload abuse; no secret in log |
| P1-TEST-5 | E2E Playwright: 12 bước MVP; offline→online sync giữ artifact |
| P1-TEST-6 | Export/delete e2e + audit trail |

### Nghiệm thu: xem `PRODUCT.md §6` + spec mục 15 (Chức năng / Sư phạm / An toàn / Chất lượng phần mềm).

### Slice 5 — Hardening & tự-audit (Prompt 9)  ✅ HOÀN THÀNH (phần trong phạm vi)
| ID | Hạng mục | Trạng thái |
|---|---|---|
| P1-S5-1 | `LoginThrottle` (5 lần sai / 15’ → khóa mềm 5’, theo email chuẩn hoá) + audit `auth.login_failed` / `auth.login_locked`; 4 unit + 1 integration test | ✅ |
| P1-S5-2 | `session_event.type` kiểm enum: `/events` → 400 loại lạ; `/sync` → bỏ qua + `eventsDropped` | ✅ |
| P1-S5-3 | `data_request` DELETE bắt buộc PIN gần đây (+ `confirm`) — hành động không hoàn tác | ✅ |
| P1-S5-4 | `clientArtifactId` giới hạn 200 ký tự | ✅ |
| P1-S5-5 | Client: cooldown 3s giữa các lần "Con cần gợi ý" | ✅ |
| P1-S5-6 | `docs/AUDIT_PHASE1.md` — tự-audit 3 vai trò (security / privacy / giáo dục trẻ), 25 phát hiện, điều kiện GO | ✅ |

**Kết quả Slice 5:** `npm test` → **100 pass** + 2 skipped — 12 file. typecheck + lint sạch. `build:web` OK. `npm run e2e` → 2/2. migrate `0000–0004` từ DB rỗng.

### Slice 6 — Hardening đợt 2 (từ AUDIT_PHASE1)  ✅ HOÀN THÀNH
| ID | Hạng mục | Trạng thái |
|---|---|---|
| P1-S6-1 | SEC-5: child session lọc nội dung theo `current_stage`; pack/unit ngoài stage → 404 (`content-authz.test.ts`) | ✅ |
| P1-S6-2 | EDU-1: **server-side** hint cooldown 8s ở `/hint` (trả gợi ý gần nhất, không leo thang, không ghi hint mới) | ✅ |
| P1-S6-3 | EDU-2: `checkFatigue` client dùng `decideFatigue` + thời lượng phiên thật → "nghỉ nudge"; `child-session` trả `childContext` (tuổi/thời lượng/stage, **không PII**) → `computeHint` dùng tuổi thật (EDU-3) | ✅ |
| P1-S6-4 | PRV-1/PRV-2: `jobs/retention.ts` + `npm run job:retention` — xóa phiên đã kết thúc > `RETENTION_DAYS` (cascade), file export > `EXPORT_TTL_DAYS`, `audit_log` > `AUDIT_RETENTION_DAYS`; 3 test | ✅ |
| P1-S6-5 | SEC-8: `bodyLimit: 2MB` tường minh | ✅ |

**Kết quả Slice 6:** `npm test` → **107 pass** + 2 skipped — 14 file. typecheck + lint sạch. `build:web` OK. `npm run e2e` → 2/2. migrate `0000–0004` từ DB rỗng.

### Slice 7 — Assent + CSRF + idle nudge  ✅ HOÀN THÀNH
| ID | Hạng mục | Trạng thái |
|---|---|---|
| P1-S7-1 | `child_assent` (migration `0005`) + `POST/GET /children/:id/assent` + có trong export + audit `child_assent.recorded`. Advisory (chưa chặn) — chờ chính sách người. `governance.test.ts` (+2) | ✅ |
| P1-S7-2 | CSRF double-submit: cookie `tiny_csrf` (non-HttpOnly) + header `x-csrf-token`; hook chặn POST/PATCH/DELETE khi auth bằng cookie; Bearer miễn; `/auth/login|register` miễn. Proxy web forward header; `lib/api.ts` + `learn-store.ts` tự gắn. `csrf.test.ts` (5) | ✅ |
| P1-S7-3 | EDU-2: idle nudge — timer 20s ở `/learn` chạy `checkFatigue` kể cả khi trẻ không thao tác | ✅ |

**Kết quả Slice 7:** `npm test` → **114 pass** + 2 skipped — 15 file. typecheck + lint sạch. `build:web` OK. `npm run e2e` → 2/2 (CSRF end-to-end qua trình duyệt). migrate `0000–0005` từ DB rỗng.

### Slice 8 — Offline artifact có mã hóa (EDU-4)  ✅ HOÀN THÀNH
| ID | Hạng mục | Trạng thái |
|---|---|---|
| P1-S8-1 | `lib/artifact-store.ts`: ảnh mã hóa **AES-GCM** (khóa non-extractable trong IndexedDB) → xếp hàng → giải mã + upload khi có mạng, dedupe `clientArtifactId`; thiếu consent → giữ lại chờ | ✅ |
| P1-S8-2 | `/learn` phase "make": bật input ảnh (cả khi offline); banner "đã lưu mã hóa, gửi sau"; flush khi `online` | ✅ |
| P1-S8-3 | **Bug đã sửa:** proxy Next mangle body nhị phân/multipart (`req.text()`) → nay forward nguyên byte (`arrayBuffer`) — cũng sửa luôn đường upload ảnh khi online | ✅ |
| P1-S8-4 | E2E: `offline → chu trình + chụp ảnh → reconnect → session + artifact mã hóa đồng bộ` | ✅ |

**Kết quả Slice 8:** `npm test` → **114 pass** + 2 skipped — 15 file. typecheck + lint sạch. `build:web` OK. `npm run e2e` → **2/2** (test offline nay có bước ảnh mã hóa). migrate `0000–0005`.
**Còn mở — tất cả cần chuyên gia người hoặc hạ tầng:** rà soát bởi người · quét malware upload · mã hóa at-rest production (adapter đã có) · chính sách chặn-khi-thiếu-assent. 🟡 S3 integration test (MinIO).

## Giai đoạn 2 — Content Studio (Prompt 3)

### Slice 2a — API soạn/duyệt/xuất bản  ✅ HOÀN THÀNH
| ID | Hạng mục | Trạng thái |
|---|---|---|
| G2-2a-1 | Migration `0006`: `content_pack` +`origin/family_id/ai_generated/created_by/submitted_by/reviewed_by/review_note/code`; bảng `content_review`, `content_import_job` | ✅ |
| G2-2a-2 | `loadContent` (nội dung repo) nay đặt `status=PUBLISHED`, `origin=REFERENCE`. Content route công khai lọc **PUBLISHED** + pack STUDIO chỉ hiện cho family sở hữu | ✅ |
| G2-2a-3 | `routes/studio.ts`: `POST /studio/packs` (validate schema+semantic; ERROR → 422 không tạo), `PUT` (chỉ DRAFT), `/validate`, `/submit` (DRAFT→IN_REVIEW, phải pass validate), `/approve` (**PIN**, IN_REVIEW→PUBLISHED, supersede pack cùng `code`, ghi `content_review` + `self_review`), `/reject`, `/withdraw` (PIN), `GET /studio/packs`, `GET :id`, `GET :id/preview` (hình child-facing) | ✅ |
| G2-2a-4 | AI-generated **không auto-publish**: cờ `ai_generated` vẫn phải qua DRAFT→submit→approve; audit ghi `aiGenerated` + `selfReview` | ✅ |
| G2-2a-5 | RBAC: mỗi pack STUDIO gắn `family_id`; author = phụ huynh family đó; studio của family khác → 404. Audit mọi bước (`content_pack.created/submitted/published/rejected/withdrawn`) | ✅ |
| G2-2a-6 | `studio.test.ts` (10): vòng đời đầy đủ, 422 chặn pack lỗi, PIN gate approve, child cùng family thấy pack đã publish / family khác không, withdraw ẩn pack, sửa non-DRAFT → 409, preview, cô lập family | ✅ |

**Kết quả 2a:** `npm test` → **124 pass** + 2 skipped — 16 file. typecheck + lint sạch. `build:web` OK. `npm run e2e` → 2/2. migrate `0000–0006`.

### Slice 2b — Import CSV/JSON  ✅ HOÀN THÀNH
| ID | Hạng mục | Trạng thái |
|---|---|---|
| G2-2b-1 | `content/csv.ts`: parser RFC 4180 tối giản (không dep) + `csvToPacks` (CSV phẳng: 1 dòng = 1 unit, gom theo `pack_code`). `csv.test.ts` (5) | ✅ |
| G2-2b-2 | `POST /studio/imports` `{ format: JSON\|CSV, content }`: JSON mảng/đơn; CSV → nhiều pack. Mỗi pack qua `createDraftPack`; lỗi → `errorReport [{row, errors}]`. `content_import_job` lưu kết quả. `GET /studio/imports/:id`. Audit `content_import.run` | ✅ |
| G2-2b-3 | `studio.test.ts` (+3): JSON mảng (pack tốt tạo, pack lỗi vào report), CSV tạo DRAFT, JSON hỏng cú pháp → 400 | ✅ |

### Slice 2c — Web `/studio`  ✅ HOÀN THÀNH
| ID | Hạng mục | Trạng thái |
|---|---|---|
| G2-2c-1 | `/studio`: danh sách gói (badge trạng thái + AI), JSON editor tạo bản nháp (hiện findings khi 422), nút Gửi duyệt / Duyệt&xuất bản (PIN) / Thu hồi (PIN), panel Import JSON/CSV + báo cáo lỗi | ✅ |
| G2-2c-2 | Link "Xưởng nội dung" ở `/parent`; `e2e/helpers.ts` (tách helper dùng chung) | ✅ |
| G2-2c-3 | E2E `Content Studio: soạn → gửi duyệt → PIN → xuất bản` | ✅ |

### Slice 2d — Socratic AI Coach / AI Gateway (Prompt 4)  ✅ HOÀN THÀNH
| ID | Hạng mục | Trạng thái |
|---|---|---|
| G2-2d-1 | `packages/ai-gateway`: `AiGateway` — rule engine quyết định, LLM chỉ diễn đạt. Pipeline: handoff (không gọi LLM) → pre-moderation quét injection (input trẻ / hint ContentPack / tài liệu retrieval) → gọi provider (timeout + retry + **circuit breaker**) → `validateCoachResponseShape` → **kiểm bất biến** (`checkCoachResponseInvariants`) → moderation đầu ra (nhãn/chẩn đoán/áp lực + không "vọng lại" lệnh) → PII leak → LLM `NEEDS_PARENT` → PARENT_HANDOFF. Mọi lối thoát → `DeterministicProvider`. | ✅ |
| G2-2d-2 | `injection.ts` (mẫu Anh+Việt), `moderation.ts` (nhãn/chẩn đoán/áp lực + PII), `circuit-breaker.ts`, `providers.ts` (`DeterministicProvider` + `MockLlmProvider` cho test đối kháng) | ✅ |
| G2-2d-3 | `gateway.test.ts` (20): shape validator, injection Anh/Việt, moderation, đường bình thường, **10 kịch bản đối kháng** (tiết lộ lời giải, vượt trần, gắn nhãn, lộ PII, vọng lệnh, invalid JSON, timeout, throw, circuit open, needs_parent) + "mọi fallback đều thỏa bất biến" | ✅ |
| G2-2d-4 | Nối vào `apps/api`: `runCoachTurn` dùng `AiGateway` (config `AI_PROVIDER=PLUGGABLE` → deterministic); ghi `ai_call_log` (provider, fell_back, reason, violations, latency). Migration `0007`. | ✅ |
| G2-2d-5 | `adversarial.test.ts` (integration): ContentPack có hint chèn lệnh → publish qua Studio → trẻ dùng → `/hint` phát hiện `injection_detected`, fallback, **không lộ đáp án / không vọng lệnh**, `ai_call_log.reason` đúng | ✅ |

**Kết quả Giai đoạn 2 (2a–2d):** `npm test` → **153 pass** + 2 skipped — 19 file. typecheck + lint sạch. `build:web` OK. `npm run e2e` → **3/3**. migrate `0000–0007`.
**Còn 🟡:** adapter LLM thật (chỉ cần viết `AiProvider` + đăng ký ở `makeGateway`) · XLSX import · `CONTENT_REVIEWER` platform-wide · RAG từ kho nội dung đã duyệt (hiện `retrievedContext` để trống) · editor có cấu trúc.

## Giai đoạn 3 — Explorer & TDN Readiness

### Slice 3a — Admissions Rule Tracker (§6.15, Prompt 6, ADR 0003)  ✅ HOÀN THÀNH
| ID | Hạng mục | Trạng thái |
|---|---|---|
| G3-3a-1 | Migration `0008`: `target_overlay` (3 mã, seed idempotent) + `admission_rule` — mọi số câu/thời lượng/môn/cách tính điểm nằm trong jsonb (`eligibility`/`exam_or_portfolio_structure`/`subjects`/`duration_info`/`scoring_method`/`cutoff`), **không viết cứng ở code** | ✅ |
| G3-3a-2 | `routes/admissions.ts`: `POST /admissions/rules` (DRAFT), `PUT` (chỉ DRAFT), `/verify` (**PIN**, bắt buộc `source_url`+`source_checked_date`, DRAFT→VERIFIED, **supersede** quy chế VERIFIED năm cũ cùng cơ sở), `/archive`, `GET /admissions/rules` (lọc năm/cơ sở/overlay + `staleness`), `GET :id`, `GET :id/diff/:otherId` (field-level), `GET /admissions/expiring` | ✅ |
| G3-3a-3 | `learning/admissions.ts`: `diffRules` (so sánh field jsonb), `assessStaleness` (quá năm / quá hạn rà soát / thiếu nguồn → cảnh báo) — "không mặc định quy chế còn hiệu lực" | ✅ |
| G3-3a-4 | Family-scoped (như Studio) + audit `admission_rule.created/verified/archived`. `admissions.test.ts` (8) | ✅ |

**Kết quả 3a:** `npm test` → **161 pass** + 2 skipped — 20 file. typecheck + lint sạch. `build:web` OK. `npm run e2e` → 3/3. migrate `0000–0008`.

### Slice 3b — Error taxonomy + readiness-by-skill + ContentPack Explorer  ✅ HOÀN THÀNH
| ID | Hạng mục | Trạng thái |
|---|---|---|
| G3-3b-1 | `@tiny/domain` `error-taxonomy.ts`: 9 nguyên nhân lỗi (§Module C) + `ERROR_CAUSE_VI` + `suggestCauses` (advisory từ tín hiệu phiên). 3 unit test | ✅ |
| G3-3b-2 | Migration `0009`: `attempt_error` (attempt/session/child, cause, skill, classified_by SYSTEM/PARENT/TEACHER) | ✅ |
| G3-3b-3 | `routes/readiness.ts`: `GET /learning/error-causes`; `POST /sessions/:id/attempts/:attemptId/error` (family-scoped, validate cause, audit); `GET /children/:id/readiness?overlay=` (**PIN**) | ✅ |
| G3-3b-4 | `learning/readiness.ts` `buildReadiness`: per-skill `band` (EMERGING/DEVELOPING/SECURE) + `confidence` (LOW/MED/HIGH theo số & độ mới minh chứng) + phân bố nguyên nhân lỗi. **KHÔNG điểm tổng hợp, KHÔNG dự báo đậu/rớt** (test chặn từ khóa) | ✅ |
| G3-3b-5 | ContentPack Explorer mẫu `content/packs/explorer/vi-g3-explorer-starter.pack.json` (stage EXPLORER, lớp 3): toán lời văn 2 bước + đọc suy luận. Qua validate S1–S10. Child ở EXPLORER thấy đúng pack lớp 3. | ✅ |
| G3-3b-6 | `readiness.test.ts` (6) + `error-taxonomy.test.ts` (3) | ✅ |

**Kết quả 3b:** `npm test` → **169 pass** + 2 skipped — 22 file. typecheck + lint sạch. `build:web` OK. migrate `0000–0009`; seed 3 pack.

### Slice 3c — Web cho Giai đoạn 3  ✅ HOÀN THÀNH
| ID | Hạng mục | Trạng thái |
|---|---|---|
| G3-3c-1 | `/parent/admissions`: danh sách quy chế + badge trạng thái + cảnh báo lỗi thời, form thêm (cơ sở/năm/overlay/nguồn/ngày rà soát), nút Xác minh (PIN) / Lưu trữ, banner "N quy chế cần rà soát" | ✅ |
| G3-3c-2 | `/parent/child/[id]/readiness`: PIN gate → bảng mức sẵn sàng theo kỹ năng (band + độ tin cậy, số minh chứng, nguyên nhân lỗi), **disclaimer nổi bật** "không phải xếp hạng" | ✅ |
| G3-3c-3 | Link "Quy chế tuyển sinh" ở `/parent`; "Mức sẵn sàng" ở `/parent/child/[id]` | ✅ |
| G3-3c-4 | E2E: (a) sau chu trình học → mở dashboard → "Mức sẵn sàng" → thấy disclaimer + band kỹ năng; (b) tạo quy chế → xác minh (PIN) → VERIFIED | ✅ |

**Kết quả 3c:** `npm test` → **169 pass**. typecheck + lint sạch. `build:web` OK (route `/parent/admissions`, `/parent/child/[id]/readiness`). `npm run e2e` → **4/4**.

### Slice 3d — Skill Graph + readiness gắn overlay  ✅ HOÀN THÀNH
| ID | Hạng mục | Trạng thái |
|---|---|---|
| G3-3d-1 | Migration `0010`: bảng `skill` (code, group, title_vi, description_by_age, prerequisites, accepted_evidence_types, stage_relevance, **overlays**) — DATA_MODEL §6.2 | ✅ |
| G3-3d-2 | `content/skills/skills.json` (~19 skill, 10 nhóm) + `content/skill-loader.ts` `seedSkills` (Zod validate, idempotent theo `code`) — thêm/sửa không đổi code. Nối vào seed/harness/index | ✅ |
| G3-3d-3 | `buildReadiness` **gắn overlay**: `?overlay=` → chỉ kỹ năng của overlay đó + gộp cả kỹ năng chưa có minh chứng (`notStarted`); mỗi kỹ năng kèm `title`/`group` từ skill graph; `summary.notStarted` | ✅ |
| G3-3d-4 | `GET /learning/skills?overlay=&group=` — duyệt Skill Graph | ✅ |
| G3-3d-5 | Web `/parent/child/[id]/readiness`: dropdown "Xem theo mục tiêu" (overlay), chip "chưa bắt đầu", ô "chưa đụng tới" trong tóm tắt | ✅ |
| G3-3d-6 | `readiness.test.ts` (+2): lọc overlay + `notStarted`; `GET /learning/skills` lọc. Sửa `validate.mjs` bỏ qua file không phải ContentPack (`content/skills/*`) | ✅ |

**Kết quả 3d:** `npm test` → **171 pass** + 2 skipped — 22 file. typecheck + lint sạch. `validate:content` 4 file 0 ERROR. `build:web` OK. `npm run e2e` → 4/4. migrate `0000–0010`; seed 3 pack + 3 overlay + 19 skill.

### Slice 3e — Luyện có tính giờ (timed practice)  ✅ HOÀN THÀNH
| ID | Hạng mục | Trạng thái |
|---|---|---|
| G3-3e-1 | Migration `0011`: `session.timed` (bool, default false), `session.time_budget_seconds`, `session.time_spent_seconds` | ✅ |
| G3-3e-2 | `POST /sessions` nhận `timed` + `timeBudgetSeconds` (30–3600, mặc định 300s khi bật giờ); phản hồi kèm 2 field | ✅ |
| G3-3e-3 | `POST /sessions/:id/complete` tính `timeSpentSeconds = now − startedAt`, lưu + phát trong `SESSION_COMPLETED` | ✅ |
| G3-3e-4 | Vượt quỹ giờ (`timed && timeSpent > budget`) → tự ghi `attempt_error` cause **`TIME_PRESSURE`**, `classifiedBy='SYSTEM'`, `attemptId=null`, `skillId` lấy từ `learning_unit_skill` role PRIMARY. Advisory — chỉ nuôi readiness, không phạt điểm/không xếp hạng | ✅ |
| G3-3e-5 | `POST /sessions/sync` nhận `timed`/`timeBudgetSeconds` trong schema + insert; nhánh `completed` tính `timeSpentSeconds` từ `startedAt` client-supplied + cùng logic TIME_PRESSURE | ✅ |
| G3-3e-6 | `session-flow.test.ts` (+5): timed→phản hồi budget · vượt giờ→`time_spent_seconds`+TIME_PRESSURE(SYSTEM, attempt_id null) · trong giờ→không ghi · không tính giờ ngồi lâu→không ghi · sync offline vượt giờ→TIME_PRESSURE | ✅ |

**Kết quả 3e:** `npm test` → **176 pass** + 2 skipped — 22 file. typecheck + `eslint .` sạch. `validate:content` 4 file 0 ERROR. `build:web` OK. `npm run e2e` → 4/4. migrate `0000–0011` từ DB rỗng; seed idempotent 3 pack + 3 overlay + 19 skill; `job:retention` OK.

### Slice 3f — Web cho timed practice  ✅ HOÀN THÀNH
| ID | Hạng mục | Trạng thái |
|---|---|---|
| G3-3f-1 | `/parent`: checkbox "Luyện có tính giờ" (`data-testid=timed-toggle`) → ghi `sessionStorage['tiny_timed']` khi mở phiên cho bé | ✅ |
| G3-3f-2 | `learn-store`: `LocalSession` mang `timed`/`timeBudgetSeconds`; `createLocalSession(unit, stage, {timed, timeBudgetSeconds})` (kẹp 30–3600s); `syncSession` truyền 2 field trong `session` | ✅ |
| G3-3f-3 | `/learn`: đọc `tiny_timed`; ngân sách = `screenSessionMinutes×60`; đồng hồ đếm ngược `mm:ss` (`data-testid=countdown`, tính lại từ `startedAt`); hết giờ → banner nhẹ `time-up-nudge` (KHÔNG khóa nút, KHÔNG tự nộp, KHÔNG chấm điểm) | ✅ |
| G3-3f-4 | E2E (+1): bật đồng hồ → `/learn` hiện `countdown` → hoàn thành → `POST /sessions/sync` gửi `session.timed=true` | ✅ |

**Kết quả 3f:** `npm test` → **176 pass** + 2 skipped. typecheck + `eslint .` sạch. `build:web` OK. `npm run e2e` → **5/5**. Không đổi schema/migration (đường sync đã nhận `timed` từ Slice 3e).

## Giai đoạn 4 — Specialisation (PRODUCT.md §5, lớp 6–7)

Trọng tâm spec: chu kỳ trải nghiệm **8–12 tuần nhiều lĩnh vực**; theo dõi **hứng thú bền vững** (nhiều tín hiệu theo thời gian, không phải một khảo sát); **khuyến khích giao thoa thế mạnh**. **Không chốt môn chuyên bằng một bài test.**

### Slice 4a — Chu kỳ trải nghiệm + hồ sơ hứng thú theo thời gian (API)  ✅ HOÀN THÀNH
| ID | Hạng mục | Trạng thái |
|---|---|---|
| G4-4a-1 | Migration `0012`: `exploration_cycle` (family-scoped; `domains` jsonb, `planned_weeks` 8–12, `status` ACTIVE/COMPLETED/ABANDONED, `reflection_note` — **KHÔNG** có trường "môn chuyên đã chọn") + `interest_signal` (`domain`, `source` CHILD_SELF/PARENT_OBSERVED/SESSION_ENGAGEMENT, `strength` LOW/MED/HIGH, `observed_at` — nhiều dòng theo thời gian) | ✅ |
| G4-4a-2 | `learning/specialisation.ts`: `KNOWN_DOMAINS` (12, khớp content-schema) · `isoWeek()` · `buildInterestProfile()` → mỗi domain có `signalCount`/`distinctWeeks`/`spanDays`/`maxGapDays`/`trend` (RISING·STEADY·FADING·SPARSE)/`sustained` (≥3 tuần riêng biệt, span ≥21 ngày, gap ≤35 ngày) · `crossoverHints` (cặp domain đồng xuất hiện trong nhiệm vụ trẻ đã làm & cả hai có tín hiệu) · `SPECIALISATION_DISCLAIMER`. KHÔNG điểm tổng, KHÔNG xếp hạng domain, KHÔNG đề xuất môn | ✅ |
| G4-4a-3 | `routes/specialisation.ts`: `GET /specialisation/domains` · `POST /specialisation/cycles` (requireParent; ≥3 domain→else 422, plannedWeeks 8–12→else 422, 1 ACTIVE/trẻ→else 409) · `GET /specialisation/cycles?childId=` (PIN) · `POST /specialisation/cycles/:id/complete` (reflectionNote bắt buộc; **không nhận/không sinh** "môn nên chọn") · `POST /children/:id/interest-signals` (parent hoặc trẻ trong phiên trẻ; `observedAt` cho phép backdate) · `GET /children/:id/interest-profile` (PIN) | ✅ |
| G4-4a-4 | Đăng ký route trong `server.ts` | ✅ |
| G4-4a-5 | `specialisation.test.ts` (+13): domains=12 · <3 domain→422 · plannedWeeks 4→422 · tạo→201 ACTIVE, chu kỳ 2→409 · list cần PIN · complete→COMPLETED + ghi chú "không phải kết luận", complete lại→409 · trẻ tự ghi (CHILD_SELF), ghi hộ trẻ khác→404 · domain/strength lạ→422 · tín hiệu rải thời gian→`sustained`, 1 tín hiệu→SPARSE · crossover `ART_DESIGN+MATHEMATICS` · **chống "một bài test"**: JSON không có `recommendedSpecialisation`/`chosenTrack`/`bestFit`/`rank`/`percentile`/`aptitude`/`"score"`; disclaimer chứa "không chốt"/"không phải gợi ý" · trẻ family khác→404 · `isoWeek` | ✅ |

**Kết quả 4a:** `npm test` → **189 pass** + 2 skipped — 23 file. typecheck + `eslint .` sạch. `validate:content` 4 file 0 ERROR. `build:web` OK. `npm run e2e` → 5/5. migrate `0000–0012` từ DB rỗng; seed idempotent 3 pack + 3 overlay + 19 skill; `job:retention` OK.

### Slice 4b — SPEC_HS_READINESS: chốt môn chuyên (chính + dự phòng) + kế hoạch chiều sâu (API)  ✅ HOÀN THÀNH
Spec (PRODUCT.md §5, lớp 8–9): "chốt 1 môn chuyên chính + 1 dự phòng; luyện chiều sâu, lập luận, tốc độ; quy chế version hóa. **Không dự báo 'chắc đậu/rớt'**."
| ID | Hạng mục | Trạng thái |
|---|---|---|
| G4-4b-1 | `content/skills/skills.json` +4 kỹ năng overlay `TDN_SPECIALIZED_GRADE_10` (SCIENCE_EXPERIMENT_DESIGN, VIETNAMESE_LITERARY_ANALYSIS, ENGLISH_ACADEMIC_ESSAY, ARGUMENT_CONSTRUCTION) — chỉ thêm data, seed idempotent, không đổi code | ✅ |
| G4-4b-2 | Migration `0013`: `specialisation_choice` (family-scoped; `primary_subject`/`backup_subject` ∈ KNOWN_DOMAINS & khác nhau; `rationale` bắt buộc; `status` ACTIVE/SUPERSEDED/WITHDRAWN; `superseded_by_id` → lịch sử version; `based_on_cycle_id` FK) | ✅ |
| G4-4b-3 | `specialisation.ts`: `buildDepthPlan()` — tái dùng `buildReadiness(overlay=TDN_SPECIALIZED_GRADE_10)`, lọc kỹ năng khớp môn chính/dự phòng (`skillMatchesSubject`, prefix mã + kỹ năng lập luận liên môn), gắn band/confidence/notStarted. `SPEC_CHOICE_DISCLAIMER` ("không dự báo đậu/rớt; đổi/rút bất kỳ lúc nào"). KHÔNG xác suất, KHÔNG xếp hạng | ✅ |
| G4-4b-4 | `routes/specialisation.ts`: `POST /specialisation/choices` (requireParent; primary≠backup & môn hợp lệ→else 422; **cần ≥1 chu kỳ COMPLETED**→else 409 `need_completed_cycle`; đã có ACTIVE→409 `choice_exists`) · `PUT /specialisation/choices/:id` (đổi = supersede, giữ lịch sử) · `POST .../withdraw` · `GET /children/:id/specialisation-choice` (PIN → current + history + depthPlan + disclaimer) | ✅ |
| G4-4b-5 | `specialisation.test.ts` (+7): chưa có chu kỳ→409 · primary=backup→422 & môn lạ→422 · chốt→201, chốt lại→409 · GET: current + depthPlan lọc đúng môn (`MATH_LOGIC_PATTERN`+`SCIENCE_EXPERIMENT_DESIGN`+`ARGUMENT_CONSTRUCTION`, KHÔNG `ENGLISH_ACADEMIC_ESSAY`) + **không** `admitProbability`/`pass_probability`/`willPass`/`guaranteed`/`rank`/`percentile`/`"score"` + disclaimer "không dự báo" · PUT→supersede, history=2, PUT bản cũ→409 · withdraw→current null, depthPlan null · trẻ family khác→404 | ✅ |

**Kết quả 4b:** `npm test` → **196 pass** + 2 skipped — 23 file. typecheck + `eslint .` sạch. `validate:content` 4 file 0 ERROR. `build:web` OK. `npm run e2e` → 5/5. migrate `0000–0013` từ DB rỗng; seed idempotent 3 pack + 3 overlay + **23 skill**; `job:retention` OK.

## Giai đoạn 5 — Global Scholar (PRODUCT.md §5, lớp 9–12)

Trọng tâm spec: phân biệt lộ trình **Mỹ/Anh/Singapore/Canada/Úc**; **hồ sơ chữ T** (rộng + một mũi sâu); **dự án dài hạn có vấn đề thật**; **provenance cho AI-assistance**.

### Slice 5a — Dự án dài hạn + bản kê khai AI-assistance + hồ sơ chữ T (API)  ✅ HOÀN THÀNH
| ID | Hạng mục | Trạng thái |
|---|---|---|
| G5-5a-1 | Migration `0014`: `scholar_project` (family-scoped; `driving_question` = vấn đề thật; `pathway` US/UK/SG/CA/AU/UNDECIDED — chỉ là NHÃN, không viết cứng quy chế nước nào; `disciplines` jsonb; `target_months` 3–24; `status` ACTIVE/COMPLETED/SHELVED) + `project_contribution` (`kind` RESEARCH/BUILD/WRITE/FIELDWORK/REVISION/OUTREACH; `ai_assistance_level` khớp DATA_MODEL 4 mức; `ai_assistance_note`; `artifact_id` FK set-null) | ✅ |
| G5-5a-2 | `learning/scholar.ts`: `aiProvenanceOk()` — **bắt buộc mô tả** khi mức ∈ {CO_CREATED_TOOL, AI_GENERATED_DRAFT} (≥12 ký tự); NONE/HINTS_ONLY = người dẫn dắt. `buildScholarPortfolio()` → mỗi dự án có `aiAssistanceBreakdown` (đếm theo mức), `humanLedShare`, `provenanceGaps`; `tShape` (breadth = nhóm kỹ năng có minh chứng + lĩnh vực dự án; depth = môn chuyên ACTIVE + số kỹ năng overlay lớp-10-chuyên vững/đang lên; `hasSpike`). `SCHOLAR_DISCLAIMER` ("không phải dự báo trúng tuyển; mỗi nước đánh giá khác nhau; khai báo AI để minh bạch, không trừ điểm") | ✅ |
| G5-5a-3 | `routes/scholar.ts`: `GET /scholar/meta` · `POST /scholar/projects` (parent hoặc trẻ; targetMonths 3–24→else 422, pathway hợp lệ→else 422, ≤2 ACTIVE/trẻ→else 409) · `GET /scholar/projects?childId=` (PIN, kèm contributions) · `POST /scholar/projects/:id/contributions` (parent hoặc trẻ; kind hợp lệ; **AI mức cao thiếu ghi chú→422 `ai_note_required`**; dự án đã đóng→409) · `POST /scholar/projects/:id/complete` (reflectionNote bắt buộc) · `GET /children/:id/scholar-portfolio` (PIN) | ✅ |
| G5-5a-4 | Đăng ký route trong `server.ts` | ✅ |
| G5-5a-5 | `scholar.test.ts` (+9): meta 4 mức AI · targetMonths 2→422 & pathway lạ→422 · tạo→201, dự án 3→409 · đóng góp NONE ok, AI_GENERATED_DRAFT thiếu ghi chú→422, ghi chú ngắn→422, đủ→201, kind lạ→422 · trẻ tự tạo + đóng góp, làm hộ trẻ khác→404 · list cần PIN, kèm contributions · complete→COMPLETED, đóng góp sau→409 · portfolio: breakdown AI trung thực + `humanLedShare`=2/3 + `provenanceGaps`=0 + `tShape` + **không** `admitChance`/`admissionProbability`/`competitiveness`/`willAdmit`/`rank`/`percentile`/`strengthScore`/`"score"` + disclaimer "không phải dự báo trúng tuyển" · trẻ family khác→404 | ✅ |

**Kết quả 5a:** `npm test` → **205 pass** + 2 skipped — 24 file. typecheck + `eslint .` sạch. `validate:content` 4 file 0 ERROR. `build:web` OK. `npm run e2e` → 5/5. migrate `0000–0014` từ DB rỗng; seed idempotent 3 pack + 3 overlay + 23 skill; `job:retention` OK.

### Slice 5b — EXPORT/DELETE bao phủ dữ liệu Giai đoạn 3–5 (MVP bước 12)  ✅ HOÀN THÀNH
| ID | Hạng mục | Trạng thái |
|---|---|---|
| G5-5b-1 | `learning/export.ts` `collectExport()` +8 bảng: `attemptErrors` (GĐ3) · `explorationCycles`/`interestSignals`/`specialisationChoices` (GĐ4) · `scholarProjects`/`projectContributions` (GĐ5) · `admissionRules` (chỉ quy chế do gia đình tự thêm, `family_id` khớp — không kèm bản nền nền tảng) | ✅ |
| G5-5b-2 | `governance.test.ts` (+1): seed interest_signal + scholar_project + contribution → EXPORT JSON có đủ khoá mới; sau `DELETE` trẻ (PIN + confirm) → `interest_signal`/`scholar_project`/`project_contribution` của trẻ về 0 (cascade FK `child_profile`) | ✅ |

**Kết quả 5b:** `npm test` → **206 pass** + 2 skipped — 24 file. typecheck + `eslint .` sạch. `validate:content` 4/0. `build:web` OK. `npm run e2e` → 5/5. Không đổi schema/migration.

### Slice 5c — FK cứng `skill_id` → `skill.code` + kiểm mã kỹ năng khi nạp/soạn nội dung  ✅ HOÀN THÀNH
| ID | Hạng mục | Trạng thái |
|---|---|---|
| G5-5c-1 | Migration `0015`: FK `learning_unit_skill.skill_id` → `skill.code` (`restrict`), `skill_evidence.skill_id` → `skill.code` (`restrict`), `attempt_error.skill_id` → `skill.code` (`set null`, giữ nullable). `seedSkills`→`loadContent` đã đúng thứ tự ở cả `seed.ts`/`index.ts`/harness | ✅ |
| G5-5c-2 | `loader.ts` `assertKnownSkills()`: mọi `skill_id` trong pack phải có trong Skill Graph, nếu không → ném lỗi liệt kê mã lạ, KHÔNG ghi DB (chặn trước cả `contentPack` insert) | ✅ |
| G5-5c-3 | `studio.ts` `assertKnownSkills()`: `POST /studio/packs` + `PUT /studio/packs/:id` → mã kỹ năng lạ trả **422 `unknown_skill`** + `unknownSkills[]`, không tạo/không sửa; import CSV/JSON → mã lạ thành lỗi dòng | ✅ |
| G5-5c-4 | `loader.test.ts` (+1): pack hợp lệ nhưng skill_id ma → `loadContent` reject, `content_pack` không tăng. `studio.test.ts` (+1): skill_id lạ → 422 `unknown_skill`, không tạo | ✅ |

**Kết quả 5c:** `npm test` → **208 pass** + 2 skipped — 24 file. typecheck + `eslint .` sạch. `validate:content` 4/0. `build:web` OK. `npm run e2e` → 5/5. migrate `0000–0015` từ DB rỗng; seed idempotent 3 pack + 3 overlay + 23 skill; `job:retention` OK.

### Slice 5d — Tự sinh `interest_signal` từ phiên học (`SESSION_ENGAGEMENT`)  ✅ HOÀN THÀNH
| ID | Hạng mục | Trạng thái |
|---|---|---|
| G5-5d-1 | Migration `0016`: `interest_signal.session_id` (nullable FK → `session`, cascade) — truy vết + chống trùng cho tín hiệu tự động | ✅ |
| G5-5d-2 | `skill-evidence.ts` `recordSessionInterestSignals()`: khi hoàn thành phiên → 1 `interest_signal` / mỗi domain của nhiệm vụ, `source=SESSION_ENGAGEMENT`, `strength` = HIGH nếu ≤1 gợi ý ngược lại MED, `note` = "Tự động từ phiên học: …". Idempotent theo `session_id`. Đây là hứng thú **được quan sát**, nuôi interest-profile GĐ4 | ✅ |
| G5-5d-3 | `routes/sessions.ts`: gọi trong `/sessions/:id/complete` và nhánh `completed` của `/sessions/sync` (ngay sau `recordSessionSkillEvidence`) | ✅ |
| G5-5d-4 | `specialisation.test.ts` (+1): hoàn thành phiên trên unit 3 domain → interest-profile có đúng 3 domain, mỗi domain `sources=['SESSION_ENGAGEMENT']`, `signalCount=1`; sync lại không nhân đôi | ✅ |

**Kết quả 5d:** `npm test` → **209 pass** + 2 skipped — 24 file. typecheck + `eslint .` sạch. `validate:content` 4/0. `build:web` OK. `npm run e2e` → 5/5. migrate `0000–0016` từ DB rỗng; seed idempotent; `job:retention` OK.

### Slice 4c — Web GĐ4: trang Chu kỳ trải nghiệm & Hứng thú  ✅ HOÀN THÀNH
| ID | Hạng mục | Trạng thái |
|---|---|---|
| G4-4c-1 | `/parent/child/[id]/specialisation` (PIN-gated như readiness): phần **Chu kỳ trải nghiệm** — danh sách + badge trạng thái, form tạo (tên · slider 8–12 tuần · chip chọn ≥3 lĩnh vực), nút khép lại chu kỳ ACTIVE kèm ô ghi chú | ✅ |
| G4-4c-2 | Phần **Hứng thú theo thời gian**: tóm tắt 3 ô (lĩnh vực có tín hiệu · bền vững · tổng tín hiệu), mỗi domain 1 thẻ với chip `trend` (đang lên/ổn định/đang phai/còn ít dữ liệu) + badge "bền vững" + nguồn tín hiệu; danh sách "giao thoa thế mạnh"; banner disclaimer | ✅ |
| G4-4c-3 | Nhãn domain tiếng Việt (`DOMAIN_VI`), link "Hứng thú" trên dashboard trẻ (`specialisation-link`) | ✅ |
| G4-4c-4 | E2E (+1): hoàn thành phiên học → trang Hứng thú hiện `trend-MATHEMATICS` (tín hiệu tự động từ GĐ5d) → tạo chu kỳ 3 lĩnh vực → `cycle-status-*` = "đang chạy" | ✅ |

**Kết quả 4c:** `npm test` → **209 pass** + 2 skipped. typecheck + `eslint .` sạch. `build:web` OK. `npm run e2e` → **6/6**. Không đổi API/schema (chỉ web + 1 link).

### Slice 5e — Web GĐ5: trang Dự án học giả  ✅ HOÀN THÀNH
| ID | Hạng mục | Trạng thái |
|---|---|---|
| G5-5e-1 | `/parent/child/[id]/scholar` (PIN-gated): panel **Hồ sơ chữ T** (bề rộng lĩnh vực · chiều sâu = môn chuyên + kỹ năng vững/đang lên · có mũi nhọn?) + panel **Kê khai hỗ trợ AI** (đếm theo 4 mức + % do con dẫn dắt); banner disclaimer | ✅ |
| G5-5e-2 | Danh sách dự án + mốc (kind, tóm tắt, badge mức AI, ghi chú AI); form tạo dự án (tên · câu hỏi dẫn dắt · lộ trình US/UK/SG/CA/AU · slider 3–24 tháng · chip lĩnh vực) — ẩn khi đã 2 dự án ACTIVE | ✅ |
| G5-5e-3 | Form ghi mốc: select kind + mức AI; **ô khai báo AI chỉ hiện & bắt buộc khi mức ∈ {đồng tạo, AI viết nháp}** (client chặn < độ dài tối thiểu; server vẫn là nguồn chân lý → 422 `ai_note_required`); nút hoàn thành dự án kèm reflection. Nhãn tiếng Việt cho pathway/kind/mức AI/lĩnh vực. Link "Dự án" trên dashboard trẻ | ✅ |
| G5-5e-4 | E2E (+1): mở trang → tạo dự án 1 lĩnh vực → `project-status` = "đang làm" → chọn mức "AI viết bản nháp" làm ô khai báo hiện ra → ghi mốc → kê khai AI cập nhật "AI viết bản nháp: 1" | ✅ |

**Kết quả 5e:** `npm test` → **209 pass** + 2 skipped. typecheck + `eslint .` sạch. `build:web` OK. `npm run e2e` → **7/7**. Không đổi API/schema.

### Slice 4d — Web GĐ4b: màn chốt môn chuyên (chính + dự phòng)  ✅ HOÀN THÀNH
| ID | Hạng mục | Trạng thái |
|---|---|---|
| G4-4d-1 | `lib/api.ts` thêm `api.put`; proxy `app/api/[...path]/route.ts` thêm handler `PUT` | ✅ |
| G4-4d-2 | Trang `/parent/child/[id]/specialisation` thêm mục **Chốt môn chuyên**: nếu có lựa chọn ACTIVE → hiện môn chính/dự phòng + lý do + **kế hoạch chiều sâu** (`depth-<skill>` kèm nhãn chính/dự phòng/cả hai + band) + nút "Đổi lựa chọn" (PUT → supersede) / "Rút lại"; nếu chưa → form chốt (2 select môn + lý do), có cảnh báo "cần hoàn thành ≥1 chu kỳ" khi chưa có COMPLETED (server vẫn chặn 409 `need_completed_cycle`) | ✅ |
| G4-4d-3 | Lịch sử đổi hiển thị số lần đã đổi; banner `choice-disclaimer` ("không dự báo đậu/rớt") | ✅ |
| G4-4d-4 | E2E: nối tiếp test GĐ4 — khép lại chu kỳ → chốt Toán/Khoa học → `choice-current` chứa "Toán" + có mục `depth-*` | ✅ |

**Kết quả 4d:** `npm test` → **209 pass** + 2 skipped. typecheck + `eslint .` sạch. `build:web` OK. `npm run e2e` → **7/7**. Không đổi API/schema (chỉ web + proxy PUT).

### Slice 6a — Quy chế tuyển sinh theo lộ trình quốc gia (`GLOBAL_TOP_UNIVERSITY`)  ✅ HOÀN THÀNH
| ID | Hạng mục | Trạng thái |
|---|---|---|
| G6-6a-1 | Migration `0017`: `admission_rule.pathway_code` (nullable; US/UK/SG/CA/AU — chỉ dùng với overlay `GLOBAL_TOP_UNIVERSITY`) | ✅ |
| G6-6a-2 | `routes/admissions.ts`: `POST`/`PUT` nhận `pathwayCode`; **422 `pathway_needs_global_overlay`** nếu đặt pathway trên overlay khác; `GET /admissions/rules?pathway=` lọc | ✅ |
| G6-6a-3 | `learning/scholar.ts` `buildScholarPortfolio(db, childId, familyId)`: thêm `pathwayReferences` — gom quy chế đã theo dõi (visible-to-family, overlay GLOBAL, không ARCHIVED) theo lộ trình quốc gia của các dự án: `{pathway, verified, draft, needsReview (assessStaleness), institutions[]}`. KHÔNG dự báo trúng tuyển | ✅ |
| G6-6a-4 | Web `/parent/child/[id]/scholar`: card "Quy chế đã theo dõi theo lộ trình" (`pathway-ref-<code>`) + link tới `/parent/admissions` | ✅ |
| G6-6a-5 | `admissions.test.ts` (+1): pathway trên TDN overlay→422, trên GLOBAL→201 + lọc `?pathway=US`. `scholar.test.ts` (+1): dự án pathway US + quy chế MIT verified → `pathwayReferences[US].verified=1`, institutions chứa `MIT` | ✅ |

**Kết quả 6a:** `npm test` → **211 pass** + 2 skipped — 24 file. typecheck + `eslint .` sạch. `validate:content` 4/0. `build:web` OK. `npm run e2e` → 7/7. migrate `0000–0017` từ DB rỗng; seed idempotent; `job:retention` OK.

## Giai đoạn 6 — Giáo viên / Cố vấn (chọn: (a) tài khoản educator + (b) link chỉ-đọc)

### Slice 6b — Chia sẻ chỉ-đọc theo phạm vi bằng LINK (không cần tài khoản)  ✅ HOÀN THÀNH
| ID | Hạng mục | Trạng thái |
|---|---|---|
| G6-6b-1 | Migration `0018`: `educator_share` (family+child scoped; `role` TEACHER/MENTOR; `scope` jsonb {dashboard,readiness,specialisation,scholar}; `mode` LINK/ACCOUNT — bảng dùng chung cho cả 6c; `token_hash` sha256; `invite_email`/`invite_code_hash`/`educator_user_id` để dành 6c; `status` ACTIVE/REVOKED/PENDING; `expires_at`) | ✅ |
| G6-6b-2 | `routes/shares.ts` — phụ huynh: `POST /children/:id/shares` (scope rỗng→422; trả `token` **một lần**, DB chỉ giữ bản băm; `expiresDays` tuỳ chọn) · `GET /children/:id/shares` (PIN; không lộ token/hash) · `POST /shares/:id/revoke` | ✅ |
| G6-6b-3 | Người xem (không phiên, header `x-share-token`): `GET /shared/resolve` (tên bé + role + scope) · `/shared/dashboard` · `/shared/readiness` · `/shared/specialisation` (interestProfile + cycles) · `/shared/scholar`. Mỗi mục gate theo `scope` (ngoài phạm vi→403 `section_not_shared`); token sai/hết hạn/đã thu hồi→401. Tất cả chỉ-đọc, tái dùng `buildDashboard/buildReadiness/buildInterestProfile/buildScholarPortfolio` | ✅ |
| G6-6b-4 | `export.ts` +`educatorShares` (không kèm token/hash); DELETE trẻ cascade qua FK `child_profile` | ✅ |
| G6-6b-5 | `shares.test.ts` (+6): scope rỗng→422 · tạo→resolve+đọc trong phạm vi, ngoài phạm vi→403 · token sai/thiếu→401 · list cần PIN + không lộ token, revoke→link chết · hết hạn→401 · family khác không tạo/thu hồi→404 | ✅ |

**Kết quả 6b:** `npm test` → **217 pass** + 2 skipped — 25 file. typecheck + `eslint .` sạch. `validate:content` 4/0. `build:web` OK. `npm run e2e` → 7/7. migrate `0000–0018` từ DB rỗng; seed idempotent; `job:retention` OK.

### Slice 6c — Tài khoản giáo viên/cố vấn: mời bằng email + mã (ACCOUNT)  ✅ HOÀN THÀNH
| ID | Hạng mục | Trạng thái |
|---|---|---|
| G6-6c-1 | `auth/service.ts`: `registerEducator()` — user `familyId=null`, `role` TEACHER/MENTOR, không PIN. `login()` chọn `kind` phiên theo `user.role` (TEACHER/MENTOR/PARENT). `issueSession` mở rộng kind. Không đổi schema (dùng cột `invite_email`/`invite_code_hash`/`educator_user_id` từ migration `0018`) | ✅ |
| G6-6c-2 | `auth/context.ts`: guard `requireEducator` (kind ∈ {TEACHER, MENTOR}). `routes/auth.ts`: `POST /auth/register-educator` | ✅ |
| G6-6c-3 | `routes/shares.ts`: `POST /children/:id/educators` (phụ huynh mời — `mode=ACCOUNT`, `status=PENDING`, **mã trả về một lần**, DB giữ băm) · `POST /educator/invites/accept` (khớp email lowercase→else 403 `invite_email_mismatch`; mã sai/hết hạn→404; PENDING→ACTIVE + gắn `educatorUserId`) · `GET /educator/children` · `GET /educator/children/:childId/{dashboard,readiness,specialisation,scholar}` (share ACTIVE + trong `scope`→else 403; không có→404). `/shared/*` refactor dùng chung `sectionData()` | ✅ |
| G6-6c-4 | `shares.test.ts` (+3): mời→đăng ký→nhận lời→đọc trong phạm vi + ngoài phạm vi 403 · mã sai→404, email lệch→403, phụ huynh gọi `/educator/*`→403 · phụ huynh thu hồi→educator mất quyền (404 + list rỗng) | ✅ |

**Kết quả 6c:** `npm test` → **220 pass** + 2 skipped — 25 file. typecheck + `eslint .` sạch. `validate:content` 4/0. `build:web` OK. `npm run e2e` → 7/7. migrate `0000–0018` (không thêm migration); seed idempotent; `job:retention` OK.

### Slice 6d — Web GĐ6: màn chia sẻ (phụ huynh) + trang xem bằng link  ✅ HOÀN THÀNH
| ID | Hạng mục | Trạng thái |
|---|---|---|
| G6-6d-1 | Proxy `app/api/[...path]/route.ts` chuyển tiếp header `x-share-token`; `lib/api.ts` thêm `shared.get(path, token)` | ✅ |
| G6-6d-2 | `/parent/child/[id]/share` (PIN-gated): chọn vai trò + phạm vi (4 checkbox) + ghi chú + hạn (7/30/90/không) → **Tạo liên kết chỉ-đọc** (hiện URL `…/shared#<token>` một lần) hoặc **Mời bằng tài khoản** (email → mã một lần); danh sách "Đang chia sẻ" + nút thu hồi; link "Chia sẻ" trên dashboard trẻ | ✅ |
| G6-6d-3 | `/shared` (không auth): nhập link/token (đọc từ `#hash` hoặc sessionStorage) → `shared/resolve` → tab theo `scope` → render gọn 4 mục (readiness/specialisation/scholar/dashboard) chỉ-đọc, kèm disclaimer | ✅ |
| G6-6d-4 | E2E (+1): hoàn thành phiên → dashboard → Chia sẻ → tạo link (readiness+dashboard) → mở `…/shared#token` → thấy tên bé + tab readiness + số liệu dashboard | ✅ |

**Kết quả 6d:** `npm test` → **220 pass** + 2 skipped. typecheck + `eslint .` sạch. `build:web` OK. `npm run e2e` → **8/8**. Không đổi API/schema (web + proxy header).

### Slice 6e — Web GĐ6: cổng giáo viên/cố vấn `/educator`  ✅ HOÀN THÀNH
| ID | Hạng mục | Trạng thái |
|---|---|---|
| G6-6e-1 | Tách `components/section-view.tsx` (renderer chỉ-đọc gọn cho 4 mục) — dùng chung `/shared` + `/educator` | ✅ |
| G6-6e-2 | `/educator`: chưa đăng nhập → tab Đăng nhập / Tạo tài khoản (`/auth/login` \| `/auth/register-educator`, chọn vai trò); đã đăng nhập → ô "Nhận lời mời" (mã) + danh sách học sinh được chia sẻ, mỗi em có tab theo `scope` → xem `SectionView`; nút đăng xuất | ✅ |
| G6-6e-3 | **Bug fix:** `Card` không forward props → `data-testid` trên `<Card>` bị mất (ảnh hưởng `/educator` + màn chia sẻ). `components/ui.tsx` `Card` giờ spread `...props` | ✅ |
| G6-6e-4 | E2E (+1): phụ huynh mời giáo viên bằng email → clearCookies → `/educator` đăng ký → nhập mã → "Đã nhận lời mời." → thẻ học sinh hiện → mở tab readiness → thấy disclaimer "không phải xếp hạng" | ✅ |

**Kết quả 6e:** `npm test` → **220 pass** + 2 skipped. typecheck + `eslint .` sạch. `build:web` OK. `npm run e2e` → **9/9**. Không đổi API/schema.

**→ Roadmap Giai đoạn 0–6 hoàn tất ở tầng code (API + web + test).**

### Slice 7a — LLM adapter thật (Anthropic), có gate  ✅ HOÀN THÀNH
| ID | Hạng mục | Trạng thái |
|---|---|---|
| G7-7a-1 | `packages/ai-gateway` `AnthropicProvider` (`AiProvider`): system prompt Socratic + ràng buộc cứng (không tiết lộ đáp án, `hint_level ≤ maxHelpLadderLevel`, PARENT_HANDOFF khi `mustHandoffToParent`, không khen năng khiếu/gắn nhãn), gọi `POST {baseUrl}/v1/messages` (`x-api-key`, `anthropic-version`), timeout `AbortController`, trích JSON đầu tiên trong text; ném khi HTTP≠2xx / rỗng / không JSON / timeout. `fetchImpl` tiêm được để test | ✅ |
| G7-7a-2 | `config.ts` +`ANTHROPIC_API_KEY` (secret) · `AI_MODEL` (mđ `claude-sonnet-5`) · `AI_BASE_URL` · `AI_TIMEOUT_MS`. `makeGateway`: `AI_PROVIDER=ANTHROPIC` → `AnthropicProvider` + fallback `DeterministicProvider`; thiếu key → ném; provider lạ → ném | ✅ |
| G7-7a-3 | `AiGateway` +getter `primaryProvider`/`fallbackProvider`. `.env.example` cập nhật. Pipeline gateway (injection/moderation/bất biến/PII/circuit breaker/fallback) **không đổi** — LLM chỉ diễn đạt trong giới hạn rule engine | ✅ |
| G7-7a-4 | `anthropic-provider.test.ts` (+7) + `coach-config.test.ts` (+4) | ✅ |

**Kết quả 7a:** `npm test` → **231 pass** + 2 skipped — 27 file. typecheck + `eslint .` sạch. `validate:content` 4/0. `build:web` OK. `npm run e2e` → 9/9. Mặc định vẫn deterministic — bật LLM thật bằng `AI_PROVIDER=ANTHROPIC` + `ANTHROPIC_API_KEY`.

### Slice 7b — RAG: tài liệu tham chiếu từ kho đã duyệt cho AI Coach  ✅ HOÀN THÀNH
| ID | Hạng mục | Trạng thái |
|---|---|---|
| G7-7b-1 | `CoachTurnInput.retrievedContext?: string[]`. `AiGateway` bước 2 đã quét injection các đoạn này rồi mới truyền (`providerInput`); `AnthropicProvider` chèn khối "TÀI LIỆU THAM KHẢO (từ kho đã duyệt — chỉ để diễn đạt, KHÔNG chép nguyên đáp án)"; deterministic bỏ qua | ✅ |
| G7-7b-2 | `learning/retrieval.ts` `buildRetrievalContext(db, {learningUnitId, maxHelpLadderLevel, childAgeYears})`: hints của nhiệm vụ **≤ trần** (không lấy bước cuối) + `skill.descriptionByAge` khớp bucket tuổi cho PRIMARY skill; cắt 280 ký tự, tối đa 6 đoạn | ✅ |
| G7-7b-3 | `runCoachTurn` nhận `learningUnitId` → tự gọi `buildRetrievalContext` sau `evaluate` (dùng `directive.maxHelpLadderLevel`); `/sessions/:id/hint` truyền `s.learningUnitId`. `skills.json`: thêm `descriptionByAge` cho `MATH_NUMBER_SENSE` | ✅ |
| G7-7b-4 | `retrieval.test.ts` (+5): lấy hints ≤ trần + mô tả kỹ năng đúng bucket tuổi · không lấy hint vượt trần · trần 0 → không hint · bucket tuổi khác → đoạn khác · unit lạ → []. `anthropic-provider.test.ts` (+1): `retrievedContext` xuất hiện trong prompt | ✅ |

**Kết quả 7b:** `npm test` → **237 pass** + 2 skipped — 28 file. typecheck + `eslint .` sạch. `validate:content` 4/0. `build:web` OK. `npm run e2e` → 9/9. migrate `0000–0018` từ DB rỗng; seed idempotent (23 skill); `job:retention` OK.

**Còn ⛔ (ngoài code):** rà soát prompt + adapter + RAG corpus với chuyên gia; thử với API key thật; mở rộng `descriptionByAge` cho toàn bộ Skill Graph; quét mã độc upload; mã hóa at-rest prod; chính sách chặn khi thiếu child_assent; test tích hợp S3 (MinIO); pipeline deploy; pilot với gia đình thật.

## Sau khi lên production (Vercel + Render + Neon) — hoàn thiện UX & nội dung

Không đánh số slice theo Giai đoạn nữa (đã hết phạm vi roadmap gốc) — ghi ngắn gọn theo yêu cầu thực tế
sau khi có bản chạy thật, xem chi tiết trong lịch sử commit trên GitHub (`namnguyennhohoang/KidEd`):
- **Deploy**: `render.yaml` + `docs/DEPLOYMENT.md` (Render free + Neon + Vercel); fix `tsx`/`typescript`/
  `@types/node` phải khai báo trong `apps/web/package.json` (Vercel chỉ cài theo workspace, không hoist
  từ gốc); server tự nạp lại `content/` mỗi lần khởi động kể cả production (không cần `db:seed` tay nữa).
- **Giao diện `/learn` theo góc nhìn giáo dục/tâm lý trẻ**: màu có ý nghĩa cố định (xanh lá=xong,
  vàng=cần giúp, xanh dương=việc phụ/nghỉ), mascot 🦉 lặp lại, placeholder rõ ràng cho ô nhập (kèm nói
  rõ ô nào bắt buộc/không bắt buộc), đổi 😐→🤔 cho lựa chọn "khó" (growth mindset), input ảnh dạng
  drop-zone lớn thay vì `<input type=file>` mặc định.
- **Bố cục rộng hơn cho desktop/laptop** (thiết bị chính của bé): `/learn` + trang chủ/`/onboarding`/
  `/parent` từ `max-w-md`/`max-w-lg` → `max-w-2xl`, nền gradient phủ toàn màn hình thay vì bị nhốt
  trong cột hẹp. Cố tình KHÔNG chia nút thành lưới nhiều cột (sẽ làm mỗi nút *nhỏ hơn*).

### Slice 7c — MCQ cho bước "thử làm" (thay ô gõ chữ khi nội dung có sẵn đáp án)  ✅ HOÀN THÀNH
| ID | Hạng mục | Trạng thái |
|---|---|---|
| G7-7c-1 | `learning-unit.schema.json`: `quest_flow.attempt_options?` (2–6 mục `{id, label}`, `additionalProperties:false`). Không cần migration (đã nằm trong `quest_flow` jsonb có sẵn); Studio đã passthrough field lạ trong `quest_flow` từ trước nên không cần sửa `studio.ts` | ✅ |
| G7-7c-2 | `lib/api.ts` `LearningUnit.questFlow.attempt_options?`. `/learn`: khi unit có `attempt_options` → hiện nút bấm chọn (bấm = nộp attempt ngay, không cần nút "xong" riêng) + luôn kèm nút **"🔀 Cách khác"** mở lại ô gõ chữ cũ — không giới hạn cách trả lời, không cần liệt kê hết đáp án đúng có thể có. Không có `attempt_options` → giữ nguyên ô gõ chữ như trước (tương thích ngược) | ✅ |
| G7-7c-3 | `submitAttempt` tổng quát hoá nhận `content` bất kỳ (dùng chung cho gõ chữ lẫn chọn MCQ) — không đổi mô hình lưu trữ `attempt.content` (vẫn jsonb tự do) | ✅ |
| G7-7c-4 | Thêm `attempt_options` mẫu cho unit "10 chú chim" (base-camp). `validate.test.ts` (+1: hợp lệ qua, <2 lựa chọn hoặc thiếu `label` → lỗi schema). `e2e/helpers.ts` `runLoop` cập nhật dùng MCQ; `onboarding.spec.ts` (+1): MCQ hiện mặc định (4 lựa chọn, không có ô gõ) → "Cách khác" mở lại ô gõ + nộp được như cũ | ✅ |

**Kết quả 7c:** `npm test` → **238 pass** + 2 skipped — 28 file. typecheck + `eslint .` sạch. `validate:content` 4/0. `build:web` OK. `npm run e2e` → **10/10**.
**Còn 🟡:** chỉ 1 unit mẫu có MCQ — cần bổ sung `attempt_options` cho các unit khác khi soạn nội dung thật; chưa có UI Content Studio riêng để soạn MCQ (hiện soạn qua JSON thô).

**Cập nhật:** thêm `attempt_options` cho unit BASE_CAMP thứ hai ("🔦 Đi tìm bóng" — 3 lựa chọn mô tả cách
làm: để đèn gần / để đèn xa / thử cả hai). Cố tình **không** thêm cho 2 unit EXPLORER (lớp 3, "Đi chợ
giúp bà" + "Chiếc chìa khóa biến mất") — MCQ được thiết kế cho trẻ BASE_CAMP chưa viết thạo; trẻ lớp 3
đã viết được nên ép chọn trắc nghiệm sẽ làm giảm chất lượng lập luận/giải thích bằng lời mà 2 unit đó
đang muốn rèn (`explain_prompt` yêu cầu diễn giải nhiều bước / trích dẫn manh mối). Đã chạy lại
`validate:content` (4 file, 0 lỗi), `npm test` (238 pass, không đổi), `npm run e2e` (10/10, không đổi).

### Slice 7d — Thêm 2 unit BASE_CAMP mới (lấp khoảng trống kỹ năng)  ✅ HOÀN THÀNH

Rà lại Skill Graph (`content/skills/skills.json`) thấy 2 kỹ năng liên quan lớp 1 chưa có unit nào làm
PRIMARY: `VIETNAMESE_READING_FLUENCY` (đọc trôi chảy — kỹ năng học thuật cốt lõi lớp 1, trước đây
**chưa có unit nào cả**) và `MOVEMENT_HABIT` (vận động — trước đây không unit nào thuộc domain
`PHYSICAL_WELLBEING`). Thêm 2 pack mới, theo đúng khuôn mẫu đã có (không sửa code/schema/migration):

| Pack | Unit | Domain chính | MCQ (`attempt_options`) |
|---|---|---|---|
| `vi-g1-reading-animal-words.pack.json` | 📖 Đọc đúng tên con vật | VIETNAMESE_LITERACY | 3 thẻ chữ khớp tranh (mèo/chó/gà) — đáp án rời rạc nên hợp MCQ |
| `vi-g1-movement-break.pack.json` | 🤸 5 phút vận động vui | PHYSICAL_WELLBEING | 3 cách mô tả kiểu vận động (nhanh/chậm/đổi qua lại) — giống mẫu "Đi tìm bóng" (mô tả cách làm, không phải một đáp án đúng duy nhất) |

Cả hai cùng có `predict_prompt`, `plan_prompt`, `explain_prompt`, `revision_prompt`,
`reflection_prompt`, 3 mức hint tăng dần (không lộ đáp án ở hint mức thấp — S6), `evidence`,
`adaptations` (easier/harder/low_confidence/low_stamina) như các unit mẫu trước.

Do `loader.test.ts` đếm cứng số dòng trong DB sau khi nạp toàn bộ `content/`, phải cập nhật số kỳ vọng:
`content_pack` 3→5, `learning_unit` 5→7, `learning_unit_skill` 15→21, `learning_unit_outcome` 5→7 (mỗi
unit mới có đúng 3 skill + 1 outcome). Các assertion khác dùng `toBeGreaterThanOrEqual` nên không cần sửa.

**Kết quả 7d:** `validate:content` → **6 file, 0 ERROR, 0 WARN**. `npm test` → **238 pass** + 2 skipped
(không đổi tổng số vì chỉ sửa số đếm, không thêm test case mới). typecheck + `eslint .` sạch.
`npm run e2e` → **10/10** (không đổi — `/learn` vẫn lấy `packs[0]` theo stage, cả 4 unit BASE_CAMP hiện
đều tương thích với `runLoop`).
**Còn 🟡:** vẫn chưa có UI Content Studio để soạn MCQ qua form (chỉ JSON thô); các kỹ năng BASE_CAMP còn
lại chưa có unit riêng làm PRIMARY: `TASK_INITIATION`, `FLEXIBLE_THINKING`, `SOCIAL_CONFIDENCE`,
`VISUAL_STORYTELLING` (hiện chỉ xuất hiện làm SECONDARY ở các unit khác).

### Slice 7e — 4 unit BASE_CAMP còn lại (mỗi kỹ năng có 1 unit làm PRIMARY)  ✅ HOÀN THÀNH

Lấp nốt 4 kỹ năng BASE_CAMP còn thiếu unit PRIMARY từ 7d, gộp theo domain vào 2 pack mới:

| Pack | Unit | Kỹ năng PRIMARY | MCQ (`attempt_options`) mô tả gì |
|---|---|---|---|
| `vi-g1-executive-function.pack.json` | 🧹 Tự bắt đầu dọn góc học tập | `TASK_INITIATION` | Thứ tự dọn: xong hẳn một góc / xen kẽ / từng món |
| `vi-g1-executive-function.pack.json` | 🔄 Đổi cách khi tháp bị đổ | `FLEXIBLE_THINKING` | Chiến lược thử lại: đế rộng hơn / thấp hơn / đổi thứ tự xếp |
| `vi-g1-confidence-storytelling.pack.json` | 🙋 Tự giới thiệu về mình | `SOCIAL_CONFIDENCE` | Nói tên / nói điều thích / nói cả hai |
| `vi-g1-confidence-storytelling.pack.json` | 🖼️ Vẽ chuyện ba khung tranh | `VISUAL_STORYTELLING` | Thứ tự vẽ: theo chuyện / kết thúc trước / bất kỳ |

Cùng khuôn mẫu 7 phases (hook → predict → plan → try/MCQ → make → reflect), 3 mức hint không lộ đáp án,
`adaptations` đủ 4 nhóm. Do các kỹ năng này (chức năng điều hành, xã hội-cảm xúc, kể chuyện hình) vốn
không có "một đáp án đúng duy nhất", MCQ ở đây mô tả **cách/chiến lược trẻ chọn thử** (giống mẫu "Đi tìm
bóng"/"5 phút vận động"), không phải kiểm tra kiến thức — giữ đúng tinh thần "Cách khác" luôn có sẵn để
không giới hạn câu trả lời.

`loader.test.ts` cập nhật số đếm: `content_pack` 5→7, `learning_unit` 7→11, `learning_unit_skill`
21→33, `learning_unit_outcome` 7→11 (mỗi unit mới +3 skill/+1 outcome × 4 unit).

**Kết quả 7e:** `validate:content` → **8 file, 0 ERROR, 0 WARN**. `npm test` → **238 pass** + 2 skipped
(chỉ sửa số đếm). typecheck + `eslint .` sạch. `npm run e2e` → **10/10**.
**Còn 🟡:** mọi kỹ năng BASE_CAMP hiện đã có ≥1 unit PRIMARY; các unit vẫn là nội dung *mẫu* (chưa qua
review chuyên môn sư phạm/tâm lý trẻ thật) và chưa có UI Content Studio để soạn MCQ qua form.

### Slice 7f — Lấp 2 khoảng trống academic ở EXPLORER (lớp 3)  ✅ HOÀN THÀNH

Sau khi BASE_CAMP đã đủ mọi kỹ năng PRIMARY, rà Skill Graph cho stage EXPLORER: 18 kỹ năng liên quan,
nhưng gói khởi động (`vi-g3-explorer-starter`) mới phủ 2 (`MATH_WORD_PROBLEM_MULTISTEP`,
`READING_INFERENCE`) — còn tới 13 kỹ năng chưa có unit nào. Vì đây vẫn là *nội dung mẫu kiểm chứng kiến
trúc* (không phải phủ hết chương trình lớp 3), chỉ lấp 2 kỹ năng academic cốt lõi còn trống hoàn toàn
(0 unit, kể cả SECONDARY) thay vì làm hết 13:

| Pack | Unit | Kỹ năng PRIMARY |
|---|---|---|
| `vi-g3-explorer-logic-writing.pack.json` | 🔢 Tìm quy luật dãy số | `MATH_LOGIC_PATTERN` |
| `vi-g3-explorer-logic-writing.pack.json` | 📝 Viết đoạn văn có mở – thân – kết | `VIETNAMESE_STRUCTURED_WRITING` |

Giữ nguyên quy tắc đã thống nhất ở Slice 7c: **không** thêm `attempt_options` (MCQ) cho unit EXPLORER —
trẻ lớp 3 đã viết được, và cả hai bài này (giải thích quy luật, viết đoạn văn) mục tiêu chính là rèn
diễn đạt/viết mở rộng bằng lời, ép chọn trắc nghiệm sẽ đi ngược mục tiêu học tập.

`loader.test.ts` cập nhật số đếm: `content_pack` 7→8, `learning_unit` 11→13, `learning_unit_skill`
33→39, `learning_unit_outcome` 11→13.

**Kết quả 7f:** `validate:content` → **9 file, 0 ERROR, 0 WARN**. `npm test` → **238 pass** + 2 skipped
(chỉ sửa số đếm). typecheck + `eslint .` sạch. `npm run e2e` → **10/10**.
**Còn 🟡:** EXPLORER vẫn còn 11 kỹ năng chưa có unit (ví dụ tiếng Anh nghe/đọc, khoa học quan sát, vận
dụng liên môn) — để dành cho lần soạn nội dung thật, không mở rộng thêm ở dạng mẫu kiểm chứng kiến trúc
nữa trừ khi được yêu cầu cụ thể.

### Slice 7g — 3 unit EXPLORER nữa (khoa học, tiếng Anh, chức năng điều hành)  ✅ HOÀN THÀNH

Người dùng yêu cầu tiếp tục thêm nội dung; lấp thêm 3 trong 11 kỹ năng EXPLORER còn trống hoàn toàn
(0 unit) từ danh sách 7f, ưu tiên các domain trước đó chưa có bài nào ở EXPLORER:

| Pack | Unit | Kỹ năng PRIMARY | Ghi chú |
|---|---|---|---|
| `vi-g3-science-material-absorption.pack.json` | 💧 Vật nào thấm nước nhanh hơn? | `SCIENCE_OBSERVATION` | Domain SCIENCE lần đầu có unit ở EXPLORER |
| `vi-g3-english-reading-turtle-story.pack.json` | 🐢 Đọc hiểu: chú rùa chậm rãi | `ENGLISH_READING` | Domain ENGLISH lần đầu có unit trong **toàn bộ** nội dung |
| `vi-g3-executive-function-homework-start.pack.json` | 📓 Tự mở vở làm bài không cần nhắc | `TASK_INITIATION` | Phiên bản EXPLORER của kỹ năng đã có ở BASE_CAMP (7e), nội dung khó hơn phù hợp lớp 3 |

Cả 3 vẫn không dùng MCQ (giữ quy tắc EXPLORER = ô gõ chữ, rèn diễn đạt/viết). Unit tiếng Anh có hook
bằng câu tiếng Anh thật kèm `explain_prompt` yêu cầu kể lại bằng tiếng Việt (kiểm tra hiểu, không chỉ
chép lại).

`loader.test.ts` cập nhật số đếm: `content_pack` 8→11, `learning_unit` 13→16, `learning_unit_skill`
39→48, `learning_unit_outcome` 13→16.

**Kết quả 7g:** `validate:content` → **12 file, 0 ERROR, 0 WARN**. `npm test` → **238 pass** + 2 skipped
(chỉ sửa số đếm). typecheck + `eslint .` sạch. `npm run e2e` → **10/10**.
**Còn 🟡:** EXPLORER còn 8 kỹ năng chưa có unit: `FLEXIBLE_THINKING`, `SOCIAL_CONFIDENCE`,
`VISUAL_STORYTELLING`, `MOVEMENT_HABIT`, `MATH_NUMBER_SENSE`, `VIETNAMESE_READING_FLUENCY`,
`ENGLISH_LISTENING`, `INTERDISCIPLINARY_APPLICATION`. Vẫn là nội dung mẫu, chưa qua duyệt chuyên môn.

## Ngoài phạm vi Giai đoạn 0–1 (ghi để không quên)

Content Studio đầy đủ (GĐ2) · Socratic AI Coach production (GĐ2) · Explorer/TDN Readiness (GĐ3) · Admissions Rule Tracker UI (GĐ3) · Specialisation (GĐ4) · Global Scholar (GĐ5) · multi-family scaling · teacher/mentor workspace đầy đủ.
