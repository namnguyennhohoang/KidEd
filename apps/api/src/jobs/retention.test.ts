import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { runRetention } from './retention.js';
import { createStorage } from '../storage/index.js';
import {
  makeHarness,
  registerParent,
  createChild,
  openChildSession,
  bearer,
  TEST_CONFIG,
  type Harness,
} from '../test-support/harness.js';

let h: Harness;
const UNIT = 'vi-g1-math-number-bonds-001';

beforeAll(async () => {
  h = await makeHarness();
});
afterAll(async () => {
  await h.close();
});

async function completeSession(childToken: string, cg: string): Promise<string> {
  const start = await h.app.inject({
    method: 'POST',
    url: '/sessions',
    headers: bearer(childToken),
    payload: { learningUnitId: UNIT, clientGeneratedId: cg },
  });
  const sid = start.json().id;
  await h.app.inject({ method: 'POST', url: `/sessions/${sid}/attempts`, headers: bearer(childToken), payload: { content: {} } });
  await h.app.inject({ method: 'POST', url: `/sessions/${sid}/complete`, headers: bearer(childToken) });
  return sid;
}
async function count(q: string) {
  const r = await h.db.execute(sql.raw(q));
  return (r.rows[0] as { n: number }).n;
}

describe('runRetention', () => {
  it('xóa phiên đã kết thúc quá hạn (cascade) nhưng giữ phiên mới', async () => {
    const { token } = await registerParent(h.app);
    const childId = await createChild(h.app, token);
    const childToken = await openChildSession(h.app, token, childId);

    const oldSid = await completeSession(childToken, 'cg-ret-old');
    const newSid = await completeSession(childToken, 'cg-ret-new');

    // Lùi ngày kết thúc của phiên "cũ" về 2000 ngày trước.
    await h.db.execute(
      sql.raw(`update session set ended_at = now() - interval '2000 days' where id = '${oldSid}'`),
    );

    const storage = createStorage(TEST_CONFIG);
    const res = await runRetention(h.db, storage, {
      RETENTION_DAYS: 1095,
      AUDIT_RETENTION_DAYS: 1095,
      EXPORT_TTL_DAYS: 7,
    });

    expect(res.sessionsDeleted).toBe(1);
    expect(await count(`select count(*)::int n from session where id='${oldSid}'`)).toBe(0);
    expect(await count(`select count(*)::int n from session where id='${newSid}'`)).toBe(1);
    // cascade: attempt/skill_evidence của phiên cũ cũng biến mất
    expect(await count(`select count(*)::int n from attempt where session_id='${oldSid}'`)).toBe(0);
    expect(await count(`select count(*)::int n from skill_evidence where session_id='${oldSid}'`)).toBe(0);
  });

  it('xóa file export + bản ghi data_request quá EXPORT_TTL_DAYS', async () => {
    const { token, pin } = await registerParent(h.app);
    const me = await h.app.inject({ method: 'GET', url: '/auth/me', headers: bearer(token) });
    const familyId = me.json().familyId;
    void pin;

    const exp = await h.app.inject({
      method: 'POST',
      url: `/families/${familyId}/data-requests`,
      headers: bearer(token),
      payload: { kind: 'EXPORT' },
    });
    const reqId = exp.json().id;
    await h.db.execute(
      sql.raw(`update data_request set completed_at = now() - interval '30 days' where id = '${reqId}'`),
    );

    const storage = createStorage(TEST_CONFIG);
    const res = await runRetention(h.db, storage, { RETENTION_DAYS: 1095, AUDIT_RETENTION_DAYS: 1095, EXPORT_TTL_DAYS: 7 });
    expect(res.exportsDeleted).toBeGreaterThanOrEqual(1);
    expect(await count(`select count(*)::int n from data_request where id='${reqId}'`)).toBe(0);
  });

  it('xóa audit_log quá AUDIT_RETENTION_DAYS', async () => {
    await registerParent(h.app); // tạo vài dòng audit
    await h.db.execute(sql.raw(`update audit_log set occurred_at = now() - interval '5000 days'`));
    const storage = createStorage(TEST_CONFIG);
    const res = await runRetention(h.db, storage, { RETENTION_DAYS: 1095, AUDIT_RETENTION_DAYS: 1095, EXPORT_TTL_DAYS: 7 });
    expect(res.auditRowsDeleted).toBeGreaterThanOrEqual(1);
    expect(await count(`select count(*)::int n from audit_log where occurred_at < now() - interval '1095 days'`)).toBe(0);
  });
});
