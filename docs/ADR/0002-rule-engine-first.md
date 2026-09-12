# ADR 0002 — Rule Engine quyết định, LLM chỉ diễn đạt

- Status: Accepted (Giai đoạn 0)
- Date: 2026-09-07

## Bối cảnh

Rủi ro cốt lõi của sản phẩm: AI làm thay trẻ, over-scaffolding, vượt thang trợ giúp, gắn nhãn, chẩn đoán. LLM không đủ tin cậy để giữ các bất biến sư phạm/an toàn.

## Quyết định

- **Rule engine deterministic** quyết định: mức help-ladder tối đa, InteractionSkill được phép, khi nào PARENT_HANDOFF, khi nào dừng phiên, fade scaffolding.
- **AI Orchestrator** chỉ chọn skill **trong allowlist** rule engine trả về; rule engine có quyền phủ quyết.
- **LLM** chỉ sinh ngôn ngữ theo tuổi + biến thể câu hỏi trong giới hạn skill. Trả **structured output**, validate schema, kiểm bất biến sau khi nhận.
- Mỗi InteractionSkill cốt lõi có **deterministic implementation** làm fallback.
- `minimum_attempts_before_solution` và thang trợ giúp là bất biến cứng.

## Hệ quả

- Cần DSL/luật có id + version + giải thích cho phụ huynh + audit (`personalization_rule`, `rule_firing`).
- Phiên học chạy được **không cần LLM** (hỗ trợ offline-first + fallback).
- Test: adversarial prompt injection; test AI không vượt thang; test fallback.

## Lựa chọn đã cân nhắc

- "LLM tự do với system prompt chặt": loại — không kiểm chứng được bất biến, dễ prompt injection, không offline.
