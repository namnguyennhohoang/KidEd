# apps/ — (scaffold Giai đoạn 1, ADR 0007)

| App | Stack | Vai trò |
|---|---|---|
| `web/` | Next.js (App Router) + React + TS + Tailwind + shadcn/ui + PWA + IndexedDB (Dexie) | Child shell (voice-first, 1 nhiệm vụ/màn hình, tối ưu desktop/laptop) + Parent shell (PIN gate) |
| `api/` | Fastify + TypeScript + Zod + Drizzle ORM | REST API, host rule engine, gọi AI Gateway (deterministic ở GĐ1), authz family-scoped |

DB dev: PGlite nhúng (`./data/pglite`). Storage dev: filesystem (`./data/uploads`). Không Docker.

Xem [../docs/API_OUTLINE.md](../docs/API_OUTLINE.md) và [../docs/BACKLOG.md](../docs/BACKLOG.md) §Giai đoạn 1 (4 slice).
