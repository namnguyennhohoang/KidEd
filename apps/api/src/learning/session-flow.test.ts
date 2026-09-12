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
let parentToken: string;
let childToken: string;
let childId: string;
const UNIT = 'vi-g1-math-number-bonds-001';

beforeAll(async () => {
  h = await makeHarness();
  parentToken = (await registerParent(h.app)).token;
  childId = await createChild(h.app, parentToken, { consents: { imageUpload: true } });
  childToken = await openChildSession(h.app, parentToken, childId);
});
afterAll(async () => {
  await h.close();
});

async function startSession(cgid: string) {
  const res = await h.app.inject({
    method: 'POST',
    url: '/sessions',
    headers: bearer(childToken),
    payload: { learningUnitId: UNIT, clientGeneratedId: cgid },
  });
  return res;
}

/** PNG 1x1 hợp lệ (magic bytes + IHDR). */
const PNG_1x1 = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f2f0000000049454e44ae426082',
  'hex',
);

describe('Learning loop runtime (MVP bước 3–8)', () => {
  let sessionId: string;

  it('bắt đầu phiên -> trả unit + choices + minimumAttempts', async () => {
    const res = await startSession('cg-flow-1');
    expect(res.statusCode).toBe(201);
    const b = res.json();
    sessionId = b.id;
    expect(b.unit.choices.length).toBe(2);
    expect(b.minimumAttempts).toBeGreaterThanOrEqual(1);
  });

  it('tạo lại với cùng clientGeneratedId -> idempotent (không tạo phiên mới)', async () => {
    const res = await startSession('cg-flow-1');
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe(sessionId);
  });

  it('gửi kế hoạch -> set first_action + event CHOICE_SELECTED', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: `/sessions/${sessionId}/plan`,
      headers: bearer(childToken),
      payload: { text: 'Con muốn vẽ hai ngôi nhà rồi chia chim', choiceIds: ['DRAW'] },
    });
    expect(res.statusCode).toBe(200);
  });

  it('hint TRƯỚC khi thử -> rule engine chặn tới mức tiết lộ lời giải (level <= 5)', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: `/sessions/${sessionId}/hint`,
      headers: bearer(childToken),
      payload: { signals: { childRequestedHelp: true, secondsSincePrompt: 60 } },
    });
    expect(res.statusCode).toBe(200);
    const b = res.json();
    expect(b.maxHelpLadderLevel).toBeLessThanOrEqual(5);
    expect(b.coach.hint_level).toBeLessThanOrEqual(b.maxHelpLadderLevel);
    expect(b.coach.child_message.length).toBeGreaterThan(0);
    expect(b.rulesFired).toBeGreaterThanOrEqual(1);
    expect(b.provider).toBe('deterministic');
    // ai_call_log được ghi
    const n = await h.db.execute(
      sql.raw(`select count(*)::int n from ai_call_log where session_id = '${sessionId}'`),
    );
    expect((n.rows[0] as { n: number }).n).toBeGreaterThanOrEqual(1);
  });

  it('nộp lần thử -> ordinal tăng, event ATTEMPT_SUBMITTED', async () => {
    const r1 = await h.app.inject({
      method: 'POST',
      url: `/sessions/${sessionId}/attempts`,
      headers: bearer(childToken),
      payload: { content: { split: [6, 4] } },
    });
    expect(r1.json().ordinal).toBe(1);
    const r2 = await h.app.inject({
      method: 'POST',
      url: `/sessions/${sessionId}/attempts`,
      headers: bearer(childToken),
      payload: { content: { split: [5, 5] } },
    });
    expect(r2.json().ordinal).toBe(2);
  });

  it('upload artifact ảnh -> 201, có artifact_version v1', async () => {
    const form = formData({ file: { filename: 'tranh.png', contentType: 'image/png', data: PNG_1x1 } });
    const res = await h.app.inject({
      method: 'POST',
      url: `/sessions/${sessionId}/artifacts`,
      headers: { ...bearer(childToken), ...form.headers },
      payload: form.body,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().type).toBe('PHOTO');
    const av = await h.db.execute(sql.raw(`select count(*)::int n from artifact_version`));
    expect((av.rows[0] as { n: number }).n).toBe(1);
  });

  it('reflection -> event REFLECTION_COMPLETED', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: `/sessions/${sessionId}/reflection`,
      headers: bearer(childToken),
      payload: { prompt: 'Bước nào con tự làm được nhất?', responseType: 'TEXT', responseText: 'Con tự chia được' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('hoàn thành phiên', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: `/sessions/${sessionId}/complete`,
      headers: bearer(childToken),
    });
    expect(res.statusCode).toBe(200);
  });

  it('GET /sessions/:id (child) -> đủ events/attempts/hints/reflection/artifacts', async () => {
    const res = await h.app.inject({
      method: 'GET',
      url: `/sessions/${sessionId}`,
      headers: bearer(childToken),
    });
    const b = res.json();
    expect(b.session.status).toBe('COMPLETED');
    expect(b.attempts.length).toBe(2);
    expect(b.hints.length).toBe(1);
    expect(b.reflection).not.toBeNull();
    expect(b.artifacts.length).toBe(1);
    const types = b.events.map((e: { type: string }) => e.type);
    expect(types).toEqual(expect.arrayContaining(['SESSION_STARTED', 'ATTEMPT_SUBMITTED', 'HINT_SHOWN', 'SESSION_COMPLETED']));
  });

  it('parent cùng family ĐỌC được phiên, nhưng KHÔNG ghi', async () => {
    const read = await h.app.inject({
      method: 'GET',
      url: `/sessions/${sessionId}`,
      headers: bearer(parentToken),
    });
    expect(read.statusCode).toBe(200);
    const write = await h.app.inject({
      method: 'POST',
      url: `/sessions/${sessionId}/attempts`,
      headers: bearer(parentToken),
      payload: { content: {} },
    });
    expect(write.statusCode).toBe(403);
  });

  it('rule_firing được ghi (minh bạch cho phụ huynh)', async () => {
    const r = await h.db.execute(
      sql.raw(`select count(*)::int n from rule_firing where session_id = '${sessionId}'`),
    );
    expect((r.rows[0] as { n: number }).n).toBeGreaterThanOrEqual(1);
  });
});

describe('idempotent events + cô lập giữa trẻ', () => {
  it('POST /sessions/:id/events lặp cùng clientGeneratedId -> dedupe', async () => {
    const start = await startSession('cg-ev-1');
    const sid = start.json().id;
    const ev = {
      events: [
        { type: 'FIRST_ACTION', clientGeneratedId: 'e1', occurredAt: new Date().toISOString() },
        { type: 'ATTEMPT_SUBMITTED', clientGeneratedId: 'e2', occurredAt: new Date().toISOString() },
      ],
    };
    const r1 = await h.app.inject({ method: 'POST', url: `/sessions/${sid}/events`, headers: bearer(childToken), payload: ev });
    expect(r1.json().inserted).toBe(2);
    const r2 = await h.app.inject({ method: 'POST', url: `/sessions/${sid}/events`, headers: bearer(childToken), payload: ev });
    expect(r2.json().inserted).toBe(0);
    expect(r2.json().deduped).toBe(2);
  });

  it('trẻ khác family KHÔNG đọc được phiên -> 404', async () => {
    const other = await registerParent(h.app);
    const otherChild = await createChild(h.app, other.token);
    const otherChildToken = await openChildSession(h.app, other.token, otherChild);
    const start = await startSession('cg-iso-1');
    const sid = start.json().id;
    const res = await h.app.inject({
      method: 'GET',
      url: `/sessions/${sid}`,
      headers: bearer(otherChildToken),
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('luyện có tính giờ (timed practice)', () => {
  async function errorCauses(sid: string): Promise<string[]> {
    const r = await h.db.execute(
      sql.raw(`select cause from attempt_error where session_id = '${sid}' order by created_at`),
    );
    return (r.rows as { cause: string }[]).map((x) => x.cause);
  }

  it('POST /sessions với timed -> phản hồi kèm timeBudgetSeconds', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/sessions',
      headers: bearer(childToken),
      payload: { learningUnitId: UNIT, clientGeneratedId: 'cg-timed-1', timed: true, timeBudgetSeconds: 120 },
    });
    expect(res.statusCode).toBe(201);
    const b = res.json();
    expect(b.timed).toBe(true);
    expect(b.timeBudgetSeconds).toBe(120);
  });

  it('vượt quỹ thời gian khi complete -> ghi time_spent_seconds + attempt_error TIME_PRESSURE (SYSTEM)', async () => {
    const start = await h.app.inject({
      method: 'POST',
      url: '/sessions',
      headers: bearer(childToken),
      payload: { learningUnitId: UNIT, clientGeneratedId: 'cg-timed-2', timed: true, timeBudgetSeconds: 60 },
    });
    const sid = start.json().id;
    // Giả lập đã ngồi làm 5 phút.
    await h.db.execute(
      sql.raw(`update session set started_at = now() - interval '300 seconds' where id = '${sid}'`),
    );
    const done = await h.app.inject({
      method: 'POST',
      url: `/sessions/${sid}/complete`,
      headers: bearer(childToken),
    });
    expect(done.statusCode).toBe(200);

    const read = await h.app.inject({ method: 'GET', url: `/sessions/${sid}`, headers: bearer(childToken) });
    expect(read.json().session.timeSpentSeconds).toBeGreaterThanOrEqual(60);
    expect(await errorCauses(sid)).toContain('TIME_PRESSURE');

    const row = await h.db.execute(
      sql.raw(`select classified_by, attempt_id from attempt_error where session_id = '${sid}' and cause = 'TIME_PRESSURE'`),
    );
    expect((row.rows[0] as { classified_by: string }).classified_by).toBe('SYSTEM');
    expect((row.rows[0] as { attempt_id: string | null }).attempt_id).toBeNull();
  });

  it('trong quỹ thời gian -> KHÔNG ghi TIME_PRESSURE', async () => {
    const start = await h.app.inject({
      method: 'POST',
      url: '/sessions',
      headers: bearer(childToken),
      payload: { learningUnitId: UNIT, clientGeneratedId: 'cg-timed-3', timed: true, timeBudgetSeconds: 600 },
    });
    const sid = start.json().id;
    await h.db.execute(
      sql.raw(`update session set started_at = now() - interval '30 seconds' where id = '${sid}'`),
    );
    await h.app.inject({ method: 'POST', url: `/sessions/${sid}/complete`, headers: bearer(childToken) });
    expect(await errorCauses(sid)).not.toContain('TIME_PRESSURE');
  });

  it('phiên KHÔNG tính giờ nhưng ngồi lâu -> KHÔNG ghi TIME_PRESSURE', async () => {
    const start = await startSession('cg-timed-4');
    const sid = start.json().id;
    await h.db.execute(
      sql.raw(`update session set started_at = now() - interval '3600 seconds' where id = '${sid}'`),
    );
    await h.app.inject({ method: 'POST', url: `/sessions/${sid}/complete`, headers: bearer(childToken) });
    expect(await errorCauses(sid)).not.toContain('TIME_PRESSURE');
  });

  it('sync offline: phiên tính giờ hoàn thành vượt quỹ -> TIME_PRESSURE', async () => {
    const startedAt = new Date(Date.now() - 400_000).toISOString();
    const res = await h.app.inject({
      method: 'POST',
      url: '/sessions/sync',
      headers: bearer(childToken),
      payload: {
        session: {
          clientGeneratedId: 'cg-timed-sync-1',
          learningUnitId: UNIT,
          startedAt,
          timed: true,
          timeBudgetSeconds: 120,
        },
        completed: true,
      },
    });
    expect(res.statusCode).toBe(201);
    const sid = res.json().sessionId;
    const read = await h.app.inject({ method: 'GET', url: `/sessions/${sid}`, headers: bearer(childToken) });
    expect(read.json().session.status).toBe('COMPLETED');
    expect(read.json().session.timeSpentSeconds).toBeGreaterThanOrEqual(120);
    expect(await errorCauses(sid)).toContain('TIME_PRESSURE');
  });
});

describe('upload — chặn file & consent', () => {
  it('từ chối file không phải whitelist (magic bytes sai)', async () => {
    const start = await startSession('cg-up-1');
    const sid = start.json().id;
    const form = formData({
      file: { filename: 'x.png', contentType: 'image/png', data: Buffer.from('not a real png') },
    });
    const res = await h.app.inject({
      method: 'POST',
      url: `/sessions/${sid}/artifacts`,
      headers: { ...bearer(childToken), ...form.headers },
      payload: form.body,
    });
    expect(res.statusCode).toBe(400);
  });

  it('từ chối upload giọng khi chưa có consent VOICE_RECORDING', async () => {
    const start = await startSession('cg-up-2');
    const sid = start.json().id;
    // WebM magic bytes
    const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(64)]);
    const form = formData({ file: { filename: 'a.webm', contentType: 'audio/webm', data: webm } });
    const res = await h.app.inject({
      method: 'POST',
      url: `/sessions/${sid}/artifacts`,
      headers: { ...bearer(childToken), ...form.headers },
      payload: form.body,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().consent).toBe('VOICE_RECORDING');
  });
});

/** Multipart/form-data thủ công cho app.inject. */
function formData(parts: { file: { filename: string; contentType: string; data: Buffer } }) {
  const boundary = `----tiny${Math.random().toString(16).slice(2)}`;
  const pre = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${parts.file.filename}"\r\n` +
      `Content-Type: ${parts.file.contentType}\r\n\r\n`,
  );
  const post = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    body: Buffer.concat([pre, parts.file.data, post]),
  };
}
