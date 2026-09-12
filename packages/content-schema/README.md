# @tiny/content-schema

Nguồn sự thật cho cấu trúc nội dung. JSON Schema 2020-12 + trình validate ngữ nghĩa.

## Schemas

| File | Mô tả |
|---|---|
| `schemas/common.schema.json` | Định nghĩa dùng chung (semver, stage, domain, provenance...) |
| `schemas/learning-unit.schema.json` | Một `LearningUnit` (theo spec mục 7) |
| `schemas/content-pack.schema.json` | `ContentPack` bọc nhiều `LearningUnit` + metadata + provenance |
| `schemas/interaction-skill.schema.json` | Contract version hóa cho InteractionSkill (spec 6.17) |
| `schemas/event.schema.json` | Envelope cho SessionEvent (spec mục 8) |
| `schemas/ai-coach-response.schema.json` | Structured output bắt buộc của LLM (spec 6.3 / AI_BEHAVIOR.md) |

## Chạy

```bash
npm install      # để bật kiểm tra schema (ajv)
npm run validate # kiểm tra ../../content ; semantic S1–S10 chạy kể cả khi chưa cài ajv
```

Exit code 1 nếu có `ERROR`. Luật ngữ nghĩa S1–S10: xem [../../docs/CONTENT_AUTHORING.md](../../docs/CONTENT_AUTHORING.md).

## Lưu ý

- Đây là scaffold tối thiểu của Giai đoạn 0 để **kiểm chứng schema**, chưa phải Content Studio (Giai đoạn 2).
- Không commit `node_modules/`.
