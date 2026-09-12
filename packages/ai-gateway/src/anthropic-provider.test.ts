import { describe, it, expect, vi } from 'vitest';
import { evaluate, defaultSnapshot } from '@tiny/domain';
import { AnthropicProvider, AiGateway, DeterministicProvider, type GatewayInput } from './index.js';

function makeInput(): GatewayInput {
  const snapshot = defaultSnapshot({ attemptsMade: 2, childRequestedHelp: true, secondsSincePrompt: 40 });
  return {
    directive: evaluate(snapshot),
    snapshot,
    unitHints: [{ level: 1, type: 'REPHRASE', content: 'Mình chia 10 chú chim thành hai nhóm.' }],
    prompts: { hook: 'Có 10 chú chim.', plan_prompt: 'Con bắt đầu thế nào?' },
    childRequestedHelp: true,
    childAgeYears: 6,
  };
}

/** fetch giả trả về body kiểu Anthropic Messages API. */
function fakeFetch(status: number, body: unknown): typeof fetch {
  return vi.fn(async () =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  ) as unknown as typeof fetch;
}

const GOOD_COACH = {
  intent: 'ASK_SCAFFOLDING_QUESTION',
  child_message: 'Con đang vướng ở bước nào? Con thử kể cho mình nghe nhé.',
  hint_level: 1,
  expected_action: 'TRY_AGAIN',
  wait_seconds: 12,
  allowed_next_actions: ['WAIT', 'TRY_AGAIN'],
  safety_flag: null,
  parent_note: null,
};

describe('AnthropicProvider', () => {
  it('thiếu apiKey hoặc model -> ném khi khởi tạo', () => {
    expect(() => new AnthropicProvider({ apiKey: '', model: 'm' })).toThrow(/apiKey/);
    expect(() => new AnthropicProvider({ apiKey: 'k', model: '' })).toThrow(/model/);
  });

  it('phản hồi hợp lệ -> parse ra AiCoachResponse; gửi đúng endpoint + header', async () => {
    const f = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe('https://api.anthropic.com/v1/messages');
      expect((init.headers as Record<string, string>)['x-api-key']).toBe('sk-test');
      expect((init.headers as Record<string, string>)['anthropic-version']).toBeTruthy();
      const payload = JSON.parse(init.body as string);
      expect(payload.model).toBe('claude-x');
      expect(payload.system).toMatch(/không tiết lộ đáp án/i);
      return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(GOOD_COACH) }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const p = new AnthropicProvider({ apiKey: 'sk-test', model: 'claude-x', fetchImpl: f as unknown as typeof fetch });
    const r = await p.coachTurn(makeInput());
    expect(r.intent).toBe('ASK_SCAFFOLDING_QUESTION');
    expect(r.hint_level).toBe(1);
    expect(r.allowed_next_actions).toEqual(['WAIT', 'TRY_AGAIN']);
    expect(f).toHaveBeenCalledOnce();
  });

  it('retrievedContext -> đưa vào prompt gửi cho model', async () => {
    let sentBody = '';
    const f = vi.fn(async (_url: string, init: RequestInit) => {
      sentBody = init.body as string;
      return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(GOOD_COACH) }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const p = new AnthropicProvider({ apiKey: 'k', model: 'm', fetchImpl: f as unknown as typeof fetch });
    await p.coachTurn({ ...makeInput(), retrievedContext: ['Gợi ý nhiệm vụ (mức 1): chia 10 thành hai nhóm'] });
    const content = JSON.parse(sentBody).messages[0].content as string;
    expect(content).toMatch(/TÀI LIỆU THAM KHẢO/);
    expect(content).toMatch(/chia 10 thành hai nhóm/);
  });

  it('bọc JSON trong văn bản thừa vẫn parse được', async () => {
    const text = `Đây là phản hồi:\n${JSON.stringify(GOOD_COACH)}\nHết.`;
    const p = new AnthropicProvider({
      apiKey: 'k',
      model: 'm',
      fetchImpl: fakeFetch(200, { content: [{ type: 'text', text }] }),
    });
    const r = await p.coachTurn(makeInput());
    expect(r.child_message).toBe(GOOD_COACH.child_message);
  });

  it('HTTP != 2xx -> ném', async () => {
    const p = new AnthropicProvider({ apiKey: 'k', model: 'm', fetchImpl: fakeFetch(500, { error: 'x' }) });
    await expect(p.coachTurn(makeInput())).rejects.toThrow(/HTTP 500/);
  });

  it('phản hồi không có JSON -> ném', async () => {
    const p = new AnthropicProvider({
      apiKey: 'k',
      model: 'm',
      fetchImpl: fakeFetch(200, { content: [{ type: 'text', text: 'xin lỗi mình không hiểu' }] }),
    });
    await expect(p.coachTurn(makeInput())).rejects.toThrow(/JSON/);
  });

  it('quá thời gian -> abort -> ném', async () => {
    const slow: typeof fetch = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      })) as unknown as typeof fetch;
    const p = new AnthropicProvider({ apiKey: 'k', model: 'm', timeoutMs: 20, fetchImpl: slow });
    await expect(p.coachTurn(makeInput())).rejects.toThrow();
  });

  it('qua AiGateway: adapter lỗi -> rơi về DeterministicProvider (không vỡ)', async () => {
    const gateway = new AiGateway({
      provider: new AnthropicProvider({ apiKey: 'k', model: 'm', fetchImpl: fakeFetch(503, {}) }),
      fallback: new DeterministicProvider(),
      maxRetries: 0,
    });
    const input = makeInput();
    const res = await gateway.coachTurn(input);
    expect(res.fellBack).toBe(true);
    expect(res.provider).toBe('deterministic');
    expect(res.response.hint_level).toBeLessThanOrEqual(input.directive.maxHelpLadderLevel);
  });
});
