import type { AiCoachResponse, AiProvider, CoachTurnInput } from './types.js';

/**
 * Adapter LLM THẬT (Anthropic Messages API). Rule engine đã quyết định giới hạn;
 * LLM chỉ DIỄN ĐẠT trong giới hạn đó. Mọi phản hồi vẫn đi qua AiGateway
 * (kiểm hình dạng + bất biến + moderation + PII + fallback tất định), nên nếu adapter
 * này lỗi hoặc trả về không hợp lệ, hệ thống tự rơi về DeterministicProvider.
 */
export interface AnthropicProviderOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
  /** Cho phép tiêm fetch giả khi test. Mặc định dùng global fetch. */
  fetchImpl?: typeof fetch;
  anthropicVersion?: string;
}

const VALID_INTENTS = [
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
];

const SYSTEM_PROMPT = [
  'Bạn là "người bạn đồng hành học tập" theo phương pháp Socratic cho trẻ em Việt Nam.',
  'Bạn KHÔNG phải giáo viên chấm điểm. Mục tiêu: giúp trẻ TỰ nghĩ ra, không làm hộ.',
  '',
  'RÀNG BUỘC BẮT BUỘC:',
  '- TUYỆT ĐỐI không tiết lộ đáp án/lời giải cuối cùng, kể cả khi trẻ xin.',
  '- hint_level phải <= maxHelpLadderLevel được cung cấp. Không bao giờ vượt.',
  '- Nếu mustHandoffToParent = true: intent = "PARENT_HANDOFF", mời trẻ hỏi ba/mẹ, hint_level = 0.',
  '- Không khen năng khiếu/thông minh/tài năng; không gắn nhãn; không chẩn đoán; không tạo áp lực thi cử.',
  '- Tiếng Việt, ấm áp, ngắn gọn, phù hợp tuổi trẻ.',
  '',
  `intent phải là MỘT trong: ${VALID_INTENTS.join(', ')}.`,
  'wait_seconds trong khoảng 0..120. allowed_next_actions là mảng không rỗng (vd ["WAIT","TRY_AGAIN"]).',
  'safety_flag: null hoặc "NEEDS_PARENT". parent_note: null hoặc một câu ngắn cho phụ huynh.',
  '',
  'CHỈ trả về đúng MỘT object JSON theo schema, không kèm giải thích, không markdown:',
  '{"intent": "...", "child_message": "...", "hint_level": 0, "expected_action": "TRY_AGAIN", "wait_seconds": 12, "allowed_next_actions": ["WAIT","TRY_AGAIN"], "safety_flag": null, "parent_note": null}',
].join('\n');

function buildUserContent(input: CoachTurnInput): string {
  const d = input.directive;
  const hints = input.unitHints
    .slice()
    .sort((a, b) => a.level - b.level)
    .map((h) => `  - mức ${h.level} (${h.type}): ${h.content ?? h.content_ref ?? '(không có nội dung)'}`)
    .join('\n');
  return [
    `Tuổi trẻ: ${input.childAgeYears}`,
    `Trẻ vừa chủ động xin trợ giúp: ${input.childRequestedHelp ? 'có' : 'không'}`,
    `maxHelpLadderLevel (TRẦN, không vượt): ${d.maxHelpLadderLevel}`,
    `recommendedHelpLadderLevel (gợi ý): ${d.recommendedHelpLadderLevel}`,
    `mustHandoffToParent: ${d.mustHandoffToParent ? 'true' : 'false'}`,
    d.fatigueAction ? `fatigueAction: ${d.fatigueAction}` : '',
    d.representationAdaptation ? `representationAdaptation: ${d.representationAdaptation}` : '',
    d.audienceAdaptation ? `audienceAdaptation: ${d.audienceAdaptation}` : '',
    d.allowedInteractionSkills.length
      ? `kỹ năng tương tác được phép (allowlist): ${d.allowedInteractionSkills.join(', ')}`
      : '',
    input.prompts.hook ? `Ngữ cảnh nhiệm vụ: ${input.prompts.hook}` : '',
    input.prompts.plan_prompt ? `Câu hỏi lập kế hoạch: ${input.prompts.plan_prompt}` : '',
    input.prompts.explain_prompt ? `Câu hỏi giải thích: ${input.prompts.explain_prompt}` : '',
    hints ? `Các gợi ý có sẵn của nhiệm vụ (chỉ dùng tới mức được phép):\n${hints}` : '',
    input.retrievedContext && input.retrievedContext.length
      ? `TÀI LIỆU THAM KHẢO (từ kho đã duyệt — chỉ để diễn đạt, KHÔNG chép nguyên đáp án):\n${input.retrievedContext
          .map((c) => `  - ${c}`)
          .join('\n')}`
      : '',
    '',
    'Hãy soạn phản hồi coach cho lượt này (JSON).',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Lấy object JSON đầu tiên trong văn bản trả về của model. */
function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('anthropic: không tìm thấy JSON trong phản hồi');
  }
  return JSON.parse(text.slice(start, end + 1));
}

export class AnthropicProvider implements AiProvider {
  readonly name = 'anthropic';
  private readonly opts: Required<Omit<AnthropicProviderOptions, 'fetchImpl'>> & { fetchImpl: typeof fetch };

  constructor(options: AnthropicProviderOptions) {
    if (!options.apiKey) throw new Error('AnthropicProvider: thiếu apiKey');
    if (!options.model) throw new Error('AnthropicProvider: thiếu model');
    this.opts = {
      apiKey: options.apiKey,
      model: options.model,
      baseUrl: (options.baseUrl ?? 'https://api.anthropic.com').replace(/\/+$/, ''),
      timeoutMs: options.timeoutMs ?? 8000,
      anthropicVersion: options.anthropicVersion ?? '2023-06-01',
      fetchImpl: options.fetchImpl ?? fetch,
    };
  }

  async coachTurn(input: CoachTurnInput): Promise<AiCoachResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs);
    let res: Response;
    try {
      res = await this.opts.fetchImpl(`${this.opts.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.opts.apiKey,
          'anthropic-version': this.opts.anthropicVersion,
        },
        body: JSON.stringify({
          model: this.opts.model,
          max_tokens: 400,
          temperature: 0.3,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: buildUserContent(input) }],
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      throw new Error(`anthropic: HTTP ${res.status}`);
    }
    const body = (await res.json()) as { content?: Array<{ type?: string; text?: string }> };
    const text = (body.content ?? [])
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text as string)
      .join('')
      .trim();
    if (!text) throw new Error('anthropic: phản hồi rỗng');

    const parsed = extractJson(text) as Record<string, unknown>;
    // Trả về đúng hình dạng; AiGateway sẽ validate + moderate + fallback nếu cần.
    return {
      intent: String(parsed.intent ?? ''),
      child_message: String(parsed.child_message ?? ''),
      hint_level: Number(parsed.hint_level ?? 0),
      expected_action: String(parsed.expected_action ?? 'TRY_AGAIN'),
      wait_seconds: Number(parsed.wait_seconds ?? 12),
      allowed_next_actions: Array.isArray(parsed.allowed_next_actions)
        ? (parsed.allowed_next_actions as unknown[]).map(String)
        : [],
      safety_flag: parsed.safety_flag == null ? null : String(parsed.safety_flag),
      parent_note: parsed.parent_note == null ? null : String(parsed.parent_note),
    };
  }
}
