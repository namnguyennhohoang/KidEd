import { pathToFileURL } from 'node:url';
import { lt, and, inArray, isNotNull, eq } from 'drizzle-orm';
import { loadConfig, type AppConfig } from '../config.js';
import { createDatabase, type Database } from '../db/client.js';
import { createStorage, type StoragePort } from '../storage/index.js';
import { session, artifact, dataRequest, auditLog } from '../db/schema.js';

export interface RetentionResult {
  sessionsDeleted: number;
  artifactFilesDeleted: number;
  exportsDeleted: number;
  auditRowsDeleted: number;
}

/**
 * Dọn dữ liệu quá hạn (SECURITY.md §1, AUDIT_PHASE1 PRV-1/PRV-2).
 * - Phiên đã kết thúc > RETENTION_DAYS  -> xóa (cascade sang events/attempts/hints/artifacts/evidence).
 * - File export > EXPORT_TTL_DAYS       -> xóa file + bản ghi data_request.
 * - audit_log > AUDIT_RETENTION_DAYS    -> xóa.
 * Chạy: `npm run job:retention` (đặt cron ở hạ tầng).
 */
export async function runRetention(
  db: Database,
  storage: StoragePort,
  cfg: Pick<AppConfig, 'RETENTION_DAYS' | 'AUDIT_RETENTION_DAYS' | 'EXPORT_TTL_DAYS'>,
  now: Date = new Date(),
): Promise<RetentionResult> {
  const cutoff = (days: number) => new Date(now.getTime() - days * 86_400_000);

  // 1) Phiên đã kết thúc quá hạn.
  const oldSessions = await db
    .select({ id: session.id })
    .from(session)
    .where(
      and(
        isNotNull(session.endedAt),
        lt(session.endedAt, cutoff(cfg.RETENTION_DAYS)),
        inArray(session.status, ['COMPLETED', 'ABANDONED']),
      ),
    );
  let artifactFilesDeleted = 0;
  if (oldSessions.length) {
    const ids = oldSessions.map((s) => s.id);
    const arts = await db.select({ key: artifact.storageKey }).from(artifact).where(inArray(artifact.sessionId, ids));
    for (const a of arts) {
      await storage.delete(a.key).catch(() => undefined);
      artifactFilesDeleted += 1;
    }
    await db.delete(session).where(inArray(session.id, ids)); // cascade
  }

  // 2) File export quá hạn.
  const oldExports = await db
    .select()
    .from(dataRequest)
    .where(
      and(
        eq(dataRequest.kind, 'EXPORT'),
        isNotNull(dataRequest.completedAt),
        lt(dataRequest.completedAt, cutoff(cfg.EXPORT_TTL_DAYS)),
      ),
    );
  for (const e of oldExports) {
    if (e.resultKey) await storage.delete(e.resultKey).catch(() => undefined);
  }
  if (oldExports.length) {
    await db.delete(dataRequest).where(
      inArray(
        dataRequest.id,
        oldExports.map((e) => e.id),
      ),
    );
  }

  // 3) audit_log quá hạn.
  const oldAudit = await db
    .select({ id: auditLog.id })
    .from(auditLog)
    .where(lt(auditLog.occurredAt, cutoff(cfg.AUDIT_RETENTION_DAYS)));
  if (oldAudit.length) {
    await db.delete(auditLog).where(
      inArray(
        auditLog.id,
        oldAudit.map((a) => a.id),
      ),
    );
  }

  return {
    sessionsDeleted: oldSessions.length,
    artifactFilesDeleted,
    exportsDeleted: oldExports.length,
    auditRowsDeleted: oldAudit.length,
  };
}

async function main() {
  const config = loadConfig();
  const db = await createDatabase(config);
  const storage = createStorage(config);
  const r = await runRetention(db, storage, config);
  console.log(
    `Retention: xóa ${r.sessionsDeleted} phiên, ${r.artifactFilesDeleted} file artifact, ${r.exportsDeleted} export, ${r.auditRowsDeleted} audit.`,
  );
  await db.$client.close();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
