import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import {
  makeHarness,
  registerParent,
  createChild,
  openChildSession,
  bearer,
  type Harness,
} from '../test-support/harness.js';

let h: Harness;
let childToken: string;
let childId: string;
let parentToken: string;

beforeAll(async () => {
  h = await makeHarness();
  parentToken = (await registerParent(h.app)).token;
  childId = await createChild(h.app, parentToken, { consents: { imageUpload: true } });
  childToken = await openChildSession(h.app, parentToken, childId);
});
afterAll(async () => {
  await h.close();
});

function bundle(cg: string, completed = true) {
  const now = new Date().toISOString();
  return {
    session: {
      clientGeneratedId: cg,
      learningUnitId: 'vi-g1-math-number-bonds-001',
      startedAt: now,
      plan: { text: 'vẽ hai ngôi nhà', choiceIds: ['DRAW'] },
    },
    attempts: [
      { clientGeneratedId: `${cg}-a1`, ordinal: 1, content: { text: '6 và 4' }, submittedAt: now },
      { clientGeneratedId: `${cg}-a2`, ordinal: 2, content: { text: '5 và 5' }, submittedAt: now },
    ],
    hints: [
      {
        helpLadderLevel: 1,
        maxAllowedLevel: 5,
        intent: 'REPHRASE_GOAL',
        childMessage: 'Mình cần chia 10 chú chim thành hai nhóm.',
        requestedAt: now,
        firings: [
          {
            ruleId: 'R-HL-1',
            ruleVersion: '1.0.0',
            parentExplanation: 'Bé chưa thử đủ số lần...',
            decision: 'cap_max_level=5',
            inputsUsed: { attemptsMade: 0 },
          },
        ],
      },
    ],
    events: [
      { type: 'FIRST_ACTION', clientGeneratedId: `${cg}-e1`, occurredAt: now, payload: { kind: 'plan' } },
      { type: 'ATTEMPT_SUBMITTED', clientGeneratedId: `${cg}-e2`, occurredAt: now },
    ],
    reflection: { prompt: 'Bước nào con tự làm được nhất?', responseType: 'IMAGE_CHOICE' as const, responseRef: 'easy' },
    completed,
  };
}

async function count(where: string): Promise<number> {
  const r = await h.db.execute(sql.raw(where));
  return (r.rows[0] as { n: number }).n;
}

describe('POST /sessions/sync — đồng bộ phiên tạo offline', () => {
  it('lần đầu -> tạo phiên (201), gộp đủ attempts/events/hints/rule_firing/reflection, COMPLETED', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/sessions/sync',
      headers: bearer(childToken),
      payload: bundle('cg-sync-1'),
    });
    expect(res.statusCode).toBe(201);
    const b = res.json();
    expect(b.created).toBe(true);
    expect(b.attemptsInserted).toBe(2);
    expect(b.status).toBe('COMPLETED');
    const sid = b.sessionId;

    expect(await count(`select count(*)::int n from attempt where session_id='${sid}'`)).toBe(2);
    expect(await count(`select count(*)::int n from hint_interaction where session_id='${sid}'`)).toBe(1);
    expect(await count(`select count(*)::int n from rule_firing where session_id='${sid}'`)).toBe(1);
    expect(await count(`select count(*)::int n from reflection where session_id='${sid}'`)).toBe(1);
    // skill_evidence sinh khi hoàn thành
    expect(await count(`select count(*)::int n from skill_evidence where session_id='${sid}'`)).toBeGreaterThanOrEqual(3);
    // đánh dấu tạo offline
    expect(await count(`select count(*)::int n from session where id='${sid}' and created_offline=true`)).toBe(1);
  });

  it('sync lại cùng bundle -> 200, không nhân đôi', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/sessions/sync',
      headers: bearer(childToken),
      payload: bundle('cg-sync-1'),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().created).toBe(false);
    expect(res.json().attemptsInserted).toBe(0);
    const sid = res.json().sessionId;
    expect(await count(`select count(*)::int n from attempt where session_id='${sid}'`)).toBe(2);
    expect(await count(`select count(*)::int n from hint_interaction where session_id='${sid}'`)).toBe(1);
  });

  it('audit.session.synced được ghi', async () => {
    const log = await h.app.inject({
      method: 'GET',
      url: `/families/${(await h.app.inject({ method: 'GET', url: '/auth/me', headers: bearer(parentToken) })).json().familyId}/audit-log`,
      headers: bearer(parentToken),
    });
    expect(log.json().entries.map((e: { action: string }) => e.action)).toContain('session.synced');
  });

  it('bundle với clientGeneratedId của trẻ khác -> 404', async () => {
    const other = await registerParent(h.app);
    const otherChild = await createChild(h.app, other.token);
    const otherChildToken = await openChildSession(h.app, other.token, otherChild);
    // trẻ A tạo phiên cg-sync-x
    await h.app.inject({ method: 'POST', url: '/sessions/sync', headers: bearer(childToken), payload: bundle('cg-sync-x') });
    // trẻ B cố sync cùng cg
    const res = await h.app.inject({
      method: 'POST',
      url: '/sessions/sync',
      headers: bearer(otherChildToken),
      payload: bundle('cg-sync-x'),
    });
    expect(res.statusCode).toBe(404);
  });

  it('sync chưa completed -> sau đó completed -> chỉ 1 lần sinh skill_evidence', async () => {
    const first = await h.app.inject({
      method: 'POST',
      url: '/sessions/sync',
      headers: bearer(childToken),
      payload: bundle('cg-sync-2', false),
    });
    const sid = first.json().sessionId;
    expect(first.json().status).toBe('STARTED');
    expect(await count(`select count(*)::int n from skill_evidence where session_id='${sid}'`)).toBe(0);

    await h.app.inject({ method: 'POST', url: '/sessions/sync', headers: bearer(childToken), payload: bundle('cg-sync-2', true) });
    const n1 = await count(`select count(*)::int n from skill_evidence where session_id='${sid}'`);
    await h.app.inject({ method: 'POST', url: '/sessions/sync', headers: bearer(childToken), payload: bundle('cg-sync-2', true) });
    const n2 = await count(`select count(*)::int n from skill_evidence where session_id='${sid}'`);
    expect(n1).toBeGreaterThanOrEqual(3);
    expect(n2).toBe(n1); // không sinh thêm
  });
});

describe('artifact — dedupe theo clientArtifactId (retry / sync offline)', () => {
  const PNG = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f2f0000000049454e44ae426082',
    'hex',
  );
  function form(clientArtifactId: string) {
    const boundary = `----tiny${Math.random().toString(16).slice(2)}`;
    const parts = [
      `--${boundary}\r\nContent-Disposition: form-data; name="clientArtifactId"\r\n\r\n${clientArtifactId}\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="t.png"\r\nContent-Type: image/png\r\n\r\n`,
    ];
    return {
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      body: Buffer.concat([Buffer.from(parts[0]! + parts[1]!), PNG, Buffer.from(`\r\n--${boundary}--\r\n`)]),
    };
  }

  it('upload lại cùng clientArtifactId -> 200 idempotent, không tạo artifact thứ 2', async () => {
    const start = await h.app.inject({
      method: 'POST',
      url: '/sessions',
      headers: bearer(childToken),
      payload: { learningUnitId: 'vi-g1-math-number-bonds-001', clientGeneratedId: 'cg-art-1' },
    });
    const sid = start.json().id;
    const f1 = form('client-art-abc');
    const r1 = await h.app.inject({ method: 'POST', url: `/sessions/${sid}/artifacts`, headers: { ...bearer(childToken), ...f1.headers }, payload: f1.body });
    expect(r1.statusCode).toBe(201);
    const f2 = form('client-art-abc');
    const r2 = await h.app.inject({ method: 'POST', url: `/sessions/${sid}/artifacts`, headers: { ...bearer(childToken), ...f2.headers }, payload: f2.body });
    expect(r2.statusCode).toBe(200);
    expect(r2.json().idempotent).toBe(true);
    expect(r2.json().id).toBe(r1.json().id);
    expect(await count(`select count(*)::int n from artifact where session_id='${sid}'`)).toBe(1);
    expect(await count(`select count(*)::int n from artifact_version where artifact_id='${r1.json().id}'`)).toBe(1);
  });
});
