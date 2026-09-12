import { evaluate, type SessionSnapshot } from '@tiny/domain';
import { AiGateway, AnthropicProvider, DeterministicProvider, type UnitHint } from '@tiny/ai-gateway';
import type { Database } from '../db/client.js';
import { ruleFiring, hintInteraction, aiCallLog } from '../db/schema.js';
import { newId } from '../auth/crypto.js';
import type { AppConfig } from '../config.js';
import { buildRetrievalContext } from './retrieval.js';

export interface CoachResult {
  response: {
    intent: string;
    child_message: string;
    hint_level: number;
    expected_action: string;
    wait_seconds: number;
    allowed_next_actions: string[];
    safety_flag: string | null;
    parent_note: string | null;
  };
  maxHelpLadderLevel: number;
  firingCount: number;
  invariantViolations: string[];
  provider: string;
  fellBack: boolean;
}

type GatewayConfig = Pick<
  AppConfig,
  'AI_PROVIDER' | 'ANTHROPIC_API_KEY' | 'AI_MODEL' | 'AI_BASE_URL' | 'AI_TIMEOUT_MS'
>;

/**
 * `AI_PROVIDER=PLUGGABLE|DETERMINISTIC` -> chỉ DeterministicProvider (không LLM).
 * `AI_PROVIDER=ANTHROPIC` -> AnthropicProvider thật + fallback tất định. Cần `ANTHROPIC_API_KEY`.
 * Dù dùng LLM thật, pipeline gateway (chống injection, moderation, kiểm bất biến, PII,
 * circuit breaker, fallback) vẫn bọc mọi phản hồi — LLM chỉ diễn đạt trong giới hạn rule engine.
 */
export function makeGateway(config: GatewayConfig): AiGateway {
  const p = config.AI_PROVIDER.toLowerCase();
  if (p === 'pluggable' || p === 'deterministic' || p === '') {
    return new AiGateway({ provider: new DeterministicProvider() });
  }
  if (p === 'anthropic') {
    if (!config.ANTHROPIC_API_KEY) {
      throw new Error('AI_PROVIDER=ANTHROPIC nhưng thiếu ANTHROPIC_API_KEY.');
    }
    return new AiGateway({
      provider: new AnthropicProvider({
        apiKey: config.ANTHROPIC_API_KEY,
        model: config.AI_MODEL,
        baseUrl: config.AI_BASE_URL,
        timeoutMs: config.AI_TIMEOUT_MS,
      }),
      fallback: new DeterministicProvider(),
    });
  }
  throw new Error(`AI_PROVIDER="${config.AI_PROVIDER}" chưa có adapter.`);
}

/**
 * Một lượt coach: rule engine QUYẾT ĐỊNH -> AI Gateway diễn đạt trong giới hạn
 * (moderation + chống injection + kiểm bất biến + fallback tất định) -> ghi
 * rule_firing + hint_interaction + ai_call_log (AI_BEHAVIOR.md §3).
 */
export async function runCoachTurn(
  db: Database,
  gateway: AiGateway,
  args: {
    sessionId: string;
    childProfileId: string;
    snapshot: SessionSnapshot;
    unitHints: UnitHint[];
    prompts: {
      hook?: string | undefined;
      plan_prompt?: string | undefined;
      explain_prompt?: string | undefined;
      reflection_prompt?: string | undefined;
    };
    childInput?: string;
    retrievedContext?: string[];
    /** Nếu có: tự lấy RAG từ kho đã duyệt (hints ≤ trần + mô tả kỹ năng theo tuổi). */
    learningUnitId?: string;
  },
): Promise<CoachResult> {
  const directive = evaluate(args.snapshot);

  const retrievedContext =
    args.retrievedContext ??
    (args.learningUnitId
      ? await buildRetrievalContext(db, {
          learningUnitId: args.learningUnitId,
          maxHelpLadderLevel: directive.maxHelpLadderLevel,
          childAgeYears: args.snapshot.childAgeYears,
        })
      : undefined);

  for (const f of directive.firings) {
    await db.insert(ruleFiring).values({
      id: newId('rf'),
      ruleId: f.ruleId,
      ruleVersion: f.ruleVersion,
      childProfileId: args.childProfileId,
      sessionId: args.sessionId,
      parentExplanation: f.parentExplanation,
      decision: f.decision,
      inputsUsed: f.inputsUsed,
    });
  }

  const gw = await gateway.coachTurn({
    directive,
    snapshot: args.snapshot,
    unitHints: args.unitHints,
    prompts: args.prompts,
    childRequestedHelp: args.snapshot.childRequestedHelp,
    childAgeYears: args.snapshot.childAgeYears,
    untrusted: {
      ...(args.childInput ? { childInput: args.childInput } : {}),
      ...(retrievedContext && retrievedContext.length ? { retrievedContext } : {}),
    },
  });

  await db.insert(hintInteraction).values({
    id: newId('hi'),
    sessionId: args.sessionId,
    helpLadderLevel: gw.response.hint_level,
    maxAllowedLevel: directive.maxHelpLadderLevel,
    intent: gw.response.intent,
    childMessage: gw.response.child_message,
    coachProvider: gw.provider,
    invariantViolations: gw.violations.length ? gw.violations : null,
  });

  await db.insert(aiCallLog).values({
    id: newId('ail'),
    sessionId: args.sessionId,
    provider: gw.provider,
    fellBack: gw.fellBack,
    reason: gw.reason,
    violations: gw.violations.length ? gw.violations : null,
    latencyMs: gw.latencyMs,
  });

  return {
    response: gw.response,
    maxHelpLadderLevel: directive.maxHelpLadderLevel,
    firingCount: directive.firings.length,
    invariantViolations: gw.violations,
    provider: gw.provider,
    fellBack: gw.fellBack,
  };
}
