import { checkCoachResponseInvariants, type CoachDirective, type SessionSnapshot } from '@tiny/domain';
import type { AiCoachResponse, AiProvider, CoachTurnInput } from './types.js';
import { DeterministicProvider } from './providers.js';
import { detectInjection, scanAll } from './injection.js';
import { moderateCoachMessage, detectPiiLeak } from './moderation.js';
import { CircuitBreaker } from './circuit-breaker.js';

const INTENTS = new Set([
  'INVITE_TO_START',
  'ASK_SCAFFOLDING_QUESTION',
  'OFFER_LIMITED_CHOICE',
  'REPHRASE_GOAL',
  'OFFER_VISUAL_HINT',
  'ASK_FOR_REASONING',
  'NORMALIZE_ERROR',
  'SUGGEST_STRATEGY_SWITCH',
  'ENCOURAGE_CREATIVE_DIVERGENCE',
  'BILINGUAL_BRIDGE',
  'GUIDE_BRAVE_STEP',
  'CALM_AND_RESET',
  'MOVE_OFF_SCREEN',
  'REFLECT_AND_CLOSE',
  'PARENT_HANDOFF',
]);

/** Kiểm hình dạng structured output (không cần ajv). */
export function validateCoachResponseShape(v: unknown): { ok: boolean; errors: string[] } {
  const e: string[] = [];
  if (typeof v !== 'object' || v === null) return { ok: false, errors: ['không phải object'] };
  const o = v as Record<string, unknown>;
  if (typeof o.intent !== 'string' || !INTENTS.has(o.intent)) e.push('intent không hợp lệ');
  if (typeof o.child_message !== 'string' || o.child_message.length < 1 || o.child_message.length > 400)
    e.push('child_message không hợp lệ');
  if (typeof o.hint_level !== 'number' || o.hint_level < 0 || o.hint_level > 6 || !Number.isInteger(o.hint_level))
    e.push('hint_level không hợp lệ');
  if (typeof o.expected_action !== 'string' || o.expected_action.length < 1) e.push('expected_action thiếu');
  if (typeof o.wait_seconds !== 'number' || o.wait_seconds < 0 || o.wait_seconds > 120) e.push('wait_seconds không hợp lệ');
  if (!Array.isArray(o.allowed_next_actions) || o.allowed_next_actions.length < 1) e.push('allowed_next_actions thiếu');
  if (o.safety_flag != null && typeof o.safety_flag !== 'string') e.push('safety_flag sai kiểu');
  return { ok: e.length === 0, errors: e };
}

const INTENT_TO_SKILL: Record<string, string> = {
  INVITE_TO_START: 'WAIT_AND_INVITE',
  ASK_SCAFFOLDING_QUESTION: 'ASK_FOR_REASONING',
  OFFER_LIMITED_CHOICE: 'LIMITED_CHOICE',
  REPHRASE_GOAL: 'AGE_REPHRASE',
  OFFER_VISUAL_HINT: 'VISUAL_SCAFFOLD',
  ASK_FOR_REASONING: 'ASK_FOR_REASONING',
  NORMALIZE_ERROR: 'NORMALIZE_ERROR',
  SUGGEST_STRATEGY_SWITCH: 'STRATEGY_SWITCH',
  ENCOURAGE_CREATIVE_DIVERGENCE: 'CREATIVE_DIVERGENCE',
  BILINGUAL_BRIDGE: 'BILINGUAL_BRIDGE',
  GUIDE_BRAVE_STEP: 'BRAVE_STEP',
  CALM_AND_RESET: 'CALM_AND_RESET',
  MOVE_OFF_SCREEN: 'MOVE_OFF_SCREEN',
  REFLECT_AND_CLOSE: 'REFLECT_AND_CLOSE',
  PARENT_HANDOFF: 'PARENT_HANDOFF',
};

export interface GatewayOptions {
  provider: AiProvider;
  fallback?: AiProvider;
  timeoutMs?: number;
  maxRetries?: number;
  breaker?: CircuitBreaker;
}

export interface GatewayInput extends CoachTurnInput {
  directive: CoachDirective;
  snapshot: SessionSnapshot;
  /** Văn bản KHÔNG tin cậy đi kèm (input trẻ, tài liệu retrieval từ kho đã duyệt). */
  untrusted?: {
    childInput?: string;
    retrievedContext?: string[];
  };
  /** Token định danh không được xuất hiện trong phản hồi (tên trẻ, tên trường...). */
  knownNames?: string[];
}

export interface GatewayResult {
  response: AiCoachResponse;
  provider: string;
  fellBack: boolean;
  reason: string | null;
  violations: string[];
  latencyMs: number;
}

/**
 * Cổng AI: rule engine đã quyết định giới hạn; ở đây LLM chỉ diễn đạt trong giới hạn đó.
 * Mọi lối thoát đều dẫn về coach tất định (không bao giờ để trẻ kẹt hay nhận phản hồi hại).
 */
export class AiGateway {
  private readonly provider: AiProvider;
  private readonly fallback: AiProvider;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly breaker: CircuitBreaker;

  constructor(opts: GatewayOptions) {
    this.provider = opts.provider;
    this.fallback = opts.fallback ?? new DeterministicProvider();
    this.timeoutMs = opts.timeoutMs ?? 8000;
    this.maxRetries = opts.maxRetries ?? 1;
    this.breaker = opts.breaker ?? new CircuitBreaker({ failureThreshold: 3, openMs: 30_000 });
  }

  /** Tên provider chính đang cấu hình (dùng cho chẩn đoán/log; phản hồi thực tế có thể fallback). */
  get primaryProvider(): string {
    return this.provider.name;
  }
  /** Tên provider dự phòng. */
  get fallbackProvider(): string {
    return this.fallback.name;
  }

  async coachTurn(input: GatewayInput): Promise<GatewayResult> {
    const started = Date.now();
    const done = (
      response: AiCoachResponse,
      provider: string,
      fellBack: boolean,
      reason: string | null,
      violations: string[] = [],
    ): GatewayResult => ({ response, provider, fellBack, reason, violations, latencyMs: Date.now() - started });

    const useFallback = async (reason: string, violations: string[] = [], forceHandoff = false) => {
      const fbInput = forceHandoff
        ? { ...input, directive: { ...input.directive, mustHandoffToParent: true } }
        : input;
      let r = await this.fallback.coachTurn(fbInput);
      // Ngay cả fallback cũng dựng câu từ hints của ContentPack -> lọc lại lần cuối.
      if (
        detectInjection(r.child_message).flagged ||
        !moderateCoachMessage(r.child_message, r.parent_note).ok ||
        looksLikeSolution(r.child_message)
      ) {
        r = {
          ...r,
          intent: 'REPHRASE_GOAL',
          child_message: 'Con thử nói lại mình đang cần làm gì, rồi mình cùng làm từng bước nhé.',
          hint_level: Math.min(1, input.directive.maxHelpLadderLevel),
        };
      }
      return done(r, this.fallback.name, true, reason, violations);
    };

    // 1) Rule engine yêu cầu chuyển phụ huynh -> KHÔNG gọi LLM.
    if (input.directive.mustHandoffToParent) {
      const r = await this.fallback.coachTurn(input);
      return done(r, this.fallback.name, false, 'handoff');
    }

    // 2) Pre-moderation: quét injection trong dữ liệu không tin cậy.
    const scan = scanAll([
      input.untrusted?.childInput,
      ...(input.untrusted?.retrievedContext ?? []),
      input.prompts.hook,
      ...input.unitHints.map((h) => h.content),
    ]);
    if (scan.flagged) {
      return useFallback('injection_detected', scan.reasons);
    }

    // 3) Gọi provider (timeout + retry + breaker).
    if (this.breaker.isOpen) return useFallback('circuit_open');

    // Chỉ truyền tài liệu tham chiếu ĐÃ QUÉT injection ở bước 2.
    const providerInput: CoachTurnInput = { ...input, retrievedContext: input.untrusted?.retrievedContext };

    let raw: unknown = null;
    let providerErr: string | null = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        raw = await withTimeout(this.provider.coachTurn(providerInput), this.timeoutMs);
        providerErr = null;
        break;
      } catch (err) {
        providerErr = (err as Error).message;
      }
    }
    if (providerErr !== null) {
      this.breaker.recordFailure();
      return useFallback('provider_error');
    }

    // 4) Structured output hợp lệ?
    const shape = validateCoachResponseShape(raw);
    if (!shape.ok) {
      this.breaker.recordFailure();
      return useFallback('invalid_schema', shape.errors);
    }
    const resp = raw as AiCoachResponse;

    // 5) Bất biến rule engine.
    const inv = checkCoachResponseInvariants(
      input.directive,
      {
        hintLevel: resp.hint_level,
        interactionSkill: INTENT_TO_SKILL[resp.intent] ?? 'AGE_REPHRASE',
        revealsSolution: looksLikeSolution(resp.child_message),
      },
      input.snapshot,
    );
    if (inv.length > 0) {
      this.breaker.recordSuccess(); // provider trả lời được, chỉ là vi phạm nội dung
      return useFallback('invariant_violation', inv);
    }

    // 6) Moderation đầu ra: nhãn/chẩn đoán/áp lực + không "vọng lại" lệnh nhồi.
    const mod = moderateCoachMessage(resp.child_message, resp.parent_note);
    if (!mod.ok) return useFallback('moderation_block', mod.violations);
    const outScan = detectInjection(resp.child_message);
    if (outScan.flagged) return useFallback('output_injection', outScan.reasons);

    // 7) Rò rỉ PII.
    const pii = detectPiiLeak(resp.child_message, input.knownNames ?? []);
    if (pii.length > 0) return useFallback('pii_leak', pii);

    // 8) LLM tự báo cần phụ huynh -> chuyển handoff tất định.
    if (resp.safety_flag === 'NEEDS_PARENT') {
      return useFallback('llm_safety_flag', [], true);
    }

    this.breaker.recordSuccess();
    return done(resp, this.provider.name, false, null);
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

function looksLikeSolution(msg: string): boolean {
  return (
    /(đáp\s*án|lời\s*giải|kết\s*quả)\s*(là|:)/i.test(msg) ||
    /\bthe answer is\b/i.test(msg) ||
    /=\s*\d+\s*(và|,)\s*\d+/i.test(msg)
  );
}
