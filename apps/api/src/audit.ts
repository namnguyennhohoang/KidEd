import type { Database } from './db/client.js';
import { auditLog } from './db/schema.js';
import { newId } from './auth/crypto.js';

export interface AuditEntry {
  actorUserId?: string | null;
  actorRole?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  familyId?: string | null;
  metadata?: Record<string, unknown>;
}

/** Ghi audit_log (append-only). KHÔNG đưa nội dung học / PII dư thừa vào metadata. */
export async function writeAudit(db: Database, entry: AuditEntry): Promise<void> {
  await db.insert(auditLog).values({
    id: newId('aud'),
    actorUserId: entry.actorUserId ?? null,
    actorRole: entry.actorRole ?? null,
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId ?? null,
    familyId: entry.familyId ?? null,
    metadata: entry.metadata ?? null,
  });
}
