# AI_BEHAVIOR.md — Hành vi AI, Rule Engine vs LLM

## 1. Nguyên tắc phân vai

| Tầng | Trách nhiệm | Ai quyết |
|---|---|---|
| **Rule Engine** (deterministic) | Chọn có nên tăng trợ giúp, mức help-ladder, InteractionSkill nào được phép, khi nào PARENT_HANDOFF, khi nào dừng phiên | **Quyết định** |
| **AI Orchestrator** | Chọn 1 hoặc chuỗi `InteractionSkill` **trong allowlist** rule engine cho phép | Đề xuất, rule engine phủ quyết được |
| **LLM** | Diễn đạt ngôn ngữ theo tuổi, sinh biến thể câu hỏi, gợi ý trong giới hạn skill | Chỉ là **lớp diễn đạt** |
| **Deterministic skill impl** | Bản cài đặt cứng cho các InteractionSkill cốt lõi khi LLM lỗi/không an toàn | Fallback |

> LLM **không** phải điểm kiểm soát duy nhất. Mọi skill cốt lõi có deterministic implementation.

## 2. Socratic AI Coach — quy tắc

- Câu ngắn, **một ý mỗi lượt**, từ vựng theo tuổi.
- **Một câu hỏi tại một thời điểm.**
- Cho thời gian chờ (`wait_seconds` theo tuổi/nhiệm vụ/hồ sơ).
- Yêu cầu trẻ **thử trước** khi tăng gợi ý.
- Dùng sở thích trẻ để tạo bối cảnh, **không** bóp méo mục tiêu học tập.
- Khuyến khích nhiều cách biểu đạt: nói, vẽ, thao tác, viết, mô hình.
- Gợi ý mức tiếp theo **theo rule engine**; LLM không tự ý vượt thang.
- Nhận biết khi không chắc chắn → chuyển phụ huynh/người duyệt.
- Chỉ dùng nội dung chương trình **đã duyệt** khi chấm kiến thức (RAG từ approved store).

## 3. Structured output bắt buộc

LLM phải trả JSON theo schema `packages/content-schema/schemas/ai-coach-response.schema.json`. Ví dụ:

```json
{
  "intent": "ASK_SCAFFOLDING_QUESTION",
  "child_message": "Con muốn bắt đầu bằng hình vẽ hay bằng các khối đồ chơi?",
  "hint_level": 2,
  "expected_action": "CHOOSE_STARTING_STRATEGY",
  "wait_seconds": 12,
  "allowed_next_actions": ["WAIT", "REPHRASE_GOAL", "OFFER_VISUAL_HINT"],
  "safety_flag": null,
  "parent_note": null
}
```

Pipeline mỗi lượt AI:
1. Rule engine tính `max_allowed_hint_level`, `allowed_interaction_skills`, `must_handoff`.
2. Nếu `must_handoff` → trả `PARENT_HANDOFF`, không gọi LLM.
3. Build prompt: system (theo tuổi + module) + state (đã redact PII) + approved-content context. Input trẻ/nội dung **không** nhúng vào system prompt.
4. Gọi LLM (timeout, retry ≤ N, circuit breaker).
5. Validate JSON theo schema. Nếu fail → deterministic fallback skill.
6. **Kiểm tra bất biến**: `hint_level <= max_allowed_hint_level`; `intent` ∈ allowlist; không lộ lời giải khi `attempts < minimum`; không có nhãn/so sánh/chẩn đoán. Vi phạm → chặn, log, fallback.
7. Moderation output. Ghi `ai_call_log` (tối thiểu, pseudonymous).

## 4. InteractionSkill Registry

Skill ban đầu: `WAIT_AND_INVITE`, `LIMITED_CHOICE`, `AGE_REPHRASE`, `VISUAL_SCAFFOLD`, `ASK_FOR_REASONING`, `NORMALIZE_ERROR`, `STRATEGY_SWITCH`, `CREATIVE_DIVERGENCE`, `BILINGUAL_BRIDGE`, `BRAVE_STEP`, `CALM_AND_RESET`, `MOVE_OFF_SCREEN`, `REFLECT_AND_CLOSE`, `PARENT_HANDOFF`.

Mỗi skill có contract version hóa (schema `interaction-skill.schema.json`): `purpose, allowed_stages, input_schema, output_schema, preconditions, forbidden_behaviors, max_uses_per_session, cooldown_turns, requires_parent, telemetry_events, fallback_skill_id`.

Yêu cầu kỹ thuật:
- Thêm skill mới **không** sửa AI Orchestrator.
- Orchestrator chỉ gọi skill trong allowlist của Stage + Quest hiện tại.
- Rule engine có quyền từ chối lựa chọn skill của LLM.
- Mỗi lần gọi ghi: lý do, input tối thiểu, kết quả, mức hỗ trợ. Không ghi dữ liệu nhạy cảm dư thừa.
- Unit tests cho: precondition, forbidden behavior, quota, cooldown, fallback, parent handoff.
- Parent Dashboard chỉ **tóm tắt** skill nào đang giúp trẻ; không hiện transcript riêng tư không cần thiết.

## 5. Rule engine — ví dụ luật (mỗi luật có id, version, giải thích cho phụ huynh, điều kiện, hành động, giới hạn/cooldown, audit, override được)

```text
IF mastery_high AND independence_low
THEN keep_academic_difficulty AND fade_scaffolding AND require_child_choice

IF repeated_errors AND language_load_high
THEN simplify_language WITHOUT simplifying_core_concept

IF repeated_errors AND representation_is_abstract
THEN switch_to_concrete_or_visual_representation

IF presentation_anxiety_observed
THEN reduce_audience_level WITHOUT reducing_reasoning_difficulty

IF success_streak_independent >= configured_threshold
THEN remove_one_hint_layer

IF fatigue_or_overload_observed
THEN shorten_session OR schedule_offline_movement OR stop_session
```

## 6. AI Gateway (packages/ai-gateway)

- System prompt theo tuổi & module.
- Structured output validation + moderation trước và sau generation.
- Retrieval chỉ từ kho nội dung đã duyệt cho tác vụ kiến thức.
- Rate limit, timeout, retry có giới hạn, circuit breaker.
- Cache nội dung **không nhạy cảm** khi an toàn.
- Fallback deterministic khi AI không hoạt động → **phiên học không bị mất** (offline-first).
- Redaction: không gửi tên thật, trường học, vị trí, dữ liệu không cần thiết đến provider. `child_id` pseudonymous.
- Tách telemetry kỹ thuật khỏi nội dung học của trẻ.
- Không lock-in: interface provider-agnostic (`AiProvider` port), adapter cho từng nhà cung cấp.
- Gọi API kèm cờ opt-out training khi provider hỗ trợ.

## 7. Cấm với AI (xem thêm CHILD_SAFETY R1–R13)

- Viết hộ bài luận / làm hộ dự án / giả mạo tiếng nói học sinh.
- Đưa đáp án trước `minimum_attempts_before_solution`.
- Vượt thang trợ giúp do rule engine đặt.
- Chẩn đoán / gắn nhãn trẻ.
- Tiếp tục dẫn dắt khi có `safety_flag` cần phụ huynh.
- Thay artifact gốc của trẻ bằng bản AI "đẹp hơn".

## 8. Tests bắt buộc (Prompt 4)

Adversarial: prompt injection từ ContentPack, child input, uploaded text, retrieved documents.
Bảo đảm: AI không vượt thang trợ giúp; không chẩn đoán; không gắn nhãn; dừng khi có safety flag cần phụ huynh; payload gửi provider không chứa PII; structured output luôn hợp lệ hoặc fallback.

## 9. Trạng thái hiện thực (Giai đoạn 2)

✅ `packages/ai-gateway`:
- `AiGateway.coachTurn` — pipeline đầy đủ mục §3: handoff → pre-moderation (`detectInjection` Anh+Việt trên input trẻ / hint ContentPack / `retrievedContext`) → provider (timeout + retry + `CircuitBreaker`) → `validateCoachResponseShape` → `checkCoachResponseInvariants` (từ `@tiny/domain`) → `moderateCoachMessage` (nhãn/chẩn đoán/áp lực) + không "vọng lại" lệnh → `detectPiiLeak` → `NEEDS_PARENT` ⇒ PARENT_HANDOFF. Mọi lối thoát → `DeterministicProvider` (còn lọc lại lần cuối).
- `MockLlmProvider` cho test đối kháng; `gateway.test.ts` (20) + `apps/api/.../adversarial.test.ts`.
- `apps/api`: `AI_PROVIDER=PLUGGABLE` → chỉ deterministic; `ai_call_log` ghi provider/fell_back/reason/violations/latency.

🟡 Chưa: adapter LLM thật (viết `AiProvider` + đăng ký ở `makeGateway`); RAG thật từ kho nội dung đã duyệt (hiện `retrievedContext` để trống); redaction payload (N/A khi chưa gọi provider ngoài).
