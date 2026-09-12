import type { FatigueAction, RuleFiring } from '../types.js';
import type { SessionSnapshot } from './snapshot.js';

export interface FatigueDecision {
  action: FatigueAction;
  /** Cần chuyển cho phụ huynh (distress kéo dài / an toàn tâm lý). */
  handoffToParent: boolean;
  firings: RuleFiring[];
}

/**
 * Bảo vệ sức khỏe học tập (PEDAGOGY.md §7, CHILD_SAFETY.md §4).
 * KHÔNG chẩn đoán, KHÔNG đưa lời khuyên y khoa — chỉ điều tiết phiên ở mức giáo dục phổ thông.
 */
export function decideFatigue(s: SessionSnapshot): FatigueDecision {
  const f = s.fatigue;
  const firings: RuleFiring[] = [];

  if (f.distressObserved) {
    firings.push({
      ruleId: 'R-FT-1',
      ruleVersion: '1.0.0',
      parentExplanation: 'Bé có dấu hiệu căng thẳng, hệ thống dừng phần dẫn dắt và mời ba/mẹ vào cùng.',
      decision: 'stop_session + handoff',
      inputsUsed: { distressObserved: true },
    });
    return { action: 'STOP_SESSION', handoffToParent: true, firings };
  }

  if (f.overloadObserved) {
    firings.push({
      ruleId: 'R-FT-2',
      ruleVersion: '1.0.0',
      parentExplanation: 'Bé có vẻ quá tải, hệ thống chuyển sang một hoạt động vận động ngắn ngoài màn hình.',
      decision: 'offline_movement',
      inputsUsed: { overloadObserved: true },
    });
    return { action: 'OFFLINE_MOVEMENT', handoffToParent: false, firings };
  }

  if (f.sessionMinutes >= f.configuredSessionMinutesCap) {
    firings.push({
      ruleId: 'R-FT-3',
      ruleVersion: '1.0.0',
      parentExplanation:
        `Phiên đã đạt ${f.configuredSessionMinutesCap} phút theo cấu hình, hệ thống rút ngắn để kết thúc đúng giờ.`,
      decision: 'shorten_session',
      inputsUsed: {
        sessionMinutes: f.sessionMinutes,
        configuredSessionMinutesCap: f.configuredSessionMinutesCap,
      },
    });
    return { action: 'SHORTEN_SESSION', handoffToParent: false, firings };
  }

  return { action: 'CONTINUE', handoffToParent: false, firings };
}
