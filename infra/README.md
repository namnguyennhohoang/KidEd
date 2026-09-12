# infra/ — (production, để sau)

Dev **không dùng Docker** (ADR 0007): DB là PGlite nhúng, storage là filesystem.

Cho production (Giai đoạn tiền-production):
- Postgres thật (managed hoặc self-host) — CI phải chạy migration + integration test trên Postgres thật để bù rủi ro PGlite.
- S3-compatible object storage cho artifact.
- Redis chỉ thêm khi thực sự cần.
- Runbook: incident response, backup/restore drill.
- Observability: structured logs + audit logs + metrics, redaction secret/PII, không chứa nội dung học của trẻ khi không cần.
