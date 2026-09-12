import type { SessionEvent } from './events.js';

/**
 * Chỉ số học tập (spec mục 8). KHÔNG có điểm tổng hợp "năng lực/thông minh".
 * KHÔNG tối ưu để trẻ ở app lâu hơn.
 */

export interface HintInteractionRecord {
  sessionId: string;
  helpLadderLevel: number;
  requestedAt: string;
}

export interface SessionSummary {
  sessionId: string;
  completed: boolean;
  hintCount: number;
}

/** Giây từ SESSION_STARTED đến FIRST_ACTION trong cùng phiên. null nếu thiếu mốc. */
export function initiationLatencySeconds(events: SessionEvent[]): number | null {
  const started = events.find((e) => e.type === 'SESSION_STARTED');
  const first = events.find((e) => e.type === 'FIRST_ACTION');
  if (!started || !first) return null;
  const dt = (Date.parse(first.occurredAt) - Date.parse(started.occurredAt)) / 1000;
  return Number.isFinite(dt) && dt >= 0 ? dt : null;
}

/** Trung vị mức thang trợ giúp đã hiển thị. null nếu chưa có hint nào. */
export function medianHintLevel(hints: HintInteractionRecord[]): number | null {
  if (hints.length === 0) return null;
  const sorted = hints.map((h) => h.helpLadderLevel).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/** Số lần thử trước lần đầu xin trợ giúp. Nếu không xin trợ giúp -> tổng số lần thử. */
export function attemptsBeforeHelp(events: SessionEvent[]): number {
  let attempts = 0;
  for (const e of events) {
    if (e.type === 'ATTEMPT_SUBMITTED') attempts++;
    if (e.type === 'HINT_REQUESTED') return attempts;
  }
  return attempts;
}

/** Số chiến lược đã thử = số lần STRATEGY_CHANGED + 1 (nếu có ít nhất một hành động). */
export function strategyCount(events: SessionEvent[]): number {
  const changes = events.filter((e) => e.type === 'STRATEGY_CHANGED').length;
  const hasAction = events.some((e) => e.type === 'FIRST_ACTION' || e.type === 'ATTEMPT_SUBMITTED');
  return hasAction ? changes + 1 : changes;
}

/** Tỷ lệ hoàn thành độc lập = phiên hoàn thành với 0 hint / tổng phiên hoàn thành. */
export function independentCompletionRate(sessions: SessionSummary[]): number | null {
  const completed = sessions.filter((s) => s.completed);
  if (completed.length === 0) return null;
  const independent = completed.filter((s) => s.hintCount === 0).length;
  return independent / completed.length;
}

/** Tỷ lệ thời gian ngoài màn hình / màn hình. > 1 là tốt cho Base Camp. */
export function screenToOfflineRatio(screenMinutes: number, offlineMinutes: number): number | null {
  if (screenMinutes <= 0) return null;
  return offlineMinutes / screenMinutes;
}
