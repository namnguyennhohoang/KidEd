# packages/

| Package | Trạng thái | Vai trò |
|---|---|---|
| `content-schema/` | ✅ Giai đoạn 0 | JSON Schema + validate (schema + semantic S1–S10) |
| `domain/` | Giai đoạn 1 | Entity, value object, **rule engine deterministic** (help-ladder, fade scaffolding, fatigue-stop). Không import ORM. Chạy được cả server lẫn client (offline). |
| `ai-gateway/` | Giai đoạn 2 | System prompt theo tuổi/module, structured output validation, moderation, RAG từ approved content, provider abstraction, deterministic fallback, redaction PII |
| `ui/` | Giai đoạn 1 | Component dùng chung (accessible, theme-aware) |
| `analytics/` | Giai đoạn 1 | Event schema, chỉ số học tập (initiation_latency, independent_completion_rate, median_hint_level...) |

Nguyên tắc: `domain/` không phụ thuộc lớp; logic cá nhân hóa quan trọng ở **rule engine**, LLM chỉ diễn đạt (ADR 0002).
