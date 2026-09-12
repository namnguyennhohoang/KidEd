/** Loại event tối thiểu (spec mục 8, đồng bộ với content-schema/schemas/event.schema.json). */
export const SESSION_EVENT_TYPES = [
  'SESSION_STARTED',
  'CHOICE_PRESENTED',
  'CHOICE_SELECTED',
  'FIRST_ACTION',
  'ATTEMPT_SUBMITTED',
  'HINT_REQUESTED',
  'HINT_SHOWN',
  'STRATEGY_CHANGED',
  'ARTIFACT_CREATED',
  'EXPLANATION_RECORDED',
  'REVISION_CREATED',
  'REFLECTION_COMPLETED',
  'SESSION_PAUSED',
  'SESSION_COMPLETED',
  'PARENT_OBSERVATION_ADDED',
  'TEACHER_EVIDENCE_VERIFIED',
] as const;

export type SessionEventType = (typeof SESSION_EVENT_TYPES)[number];

export type EventSource = 'CHILD_APP' | 'SERVER' | 'PARENT_APP' | 'TEACHER_APP';

export interface SessionEvent {
  type: SessionEventType;
  sessionId: string;
  occurredAt: string; // ISO 8601
  clientGeneratedId: string; // idempotency
  source: EventSource;
  /** Payload tối thiểu — KHÔNG PII, không nội dung học dư thừa. */
  payload?: Record<string, unknown>;
}

export function isSessionEventType(v: string): v is SessionEventType {
  return (SESSION_EVENT_TYPES as readonly string[]).includes(v);
}
