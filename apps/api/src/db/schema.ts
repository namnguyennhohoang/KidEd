import {
  pgTable,
  text,
  integer,
  jsonb,
  timestamp,
  boolean,
  primaryKey,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/**
 * Slice 1: nội dung.  Slice 2: identity / family / child / consent / audit.
 * Các bảng runtime học tập (session, attempt, artifact...) thêm ở Slice 3.
 * Xem docs/DATA_MODEL.md.
 */

/* ─────────────────────────  Content (Slice 1)  ───────────────────────── */

export const contentPack = pgTable(
  'content_pack',
  {
    id: text('id').primaryKey(),
    code: text('code'), // định danh ổn định qua các phiên bản (null cho nội dung seed cũ)
    kind: text('kind').notNull().default('CONTENT_PACK'),
    schemaVersion: text('schema_version').notNull(),
    contentVersion: text('content_version').notNull(),
    status: text('status').notNull(), // DRAFT | IN_REVIEW | PUBLISHED | WITHDRAWN | SUPERSEDED
    title: text('title').notNull(),
    description: text('description'),
    locale: text('locale').notNull(),
    stage: text('stage').notNull(),
    grades: jsonb('grades').notNull().$type<number[]>(),
    targetOverlays: jsonb('target_overlays').$type<string[]>(),
    provenanceAuthor: text('provenance_author').notNull(),
    provenanceReviewer: text('provenance_reviewer'),
    provenanceSourceRefs: jsonb('provenance_source_refs').$type<unknown[]>(),
    license: text('license').notNull(),
    supersededBy: text('superseded_by'),
    sourcePath: text('source_path'),
    /** Nội dung soạn trong Content Studio (không phải seed từ repo). */
    origin: text('origin').notNull().default('REFERENCE'), // REFERENCE | STUDIO
    familyId: text('family_id').references(() => family.id, { onDelete: 'cascade' }), // null = platform
    aiGenerated: boolean('ai_generated').notNull().default(false),
    createdByUserId: text('created_by_user_id'),
    submittedByUserId: text('submitted_by_user_id'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    reviewedByUserId: text('reviewed_by_user_id'),
    reviewNote: text('review_note'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('content_pack_code_idx').on(t.code), index('content_pack_family_idx').on(t.familyId)],
);

export const contentReview = pgTable('content_review', {
  id: text('id').primaryKey(),
  packId: text('pack_id')
    .notNull()
    .references(() => contentPack.id, { onDelete: 'cascade' }),
  reviewerUserId: text('reviewer_user_id')
    .notNull()
    .references(() => user.id),
  decision: text('decision').notNull(), // APPROVE | REJECT
  note: text('note'),
  selfReview: boolean('self_review').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Nhật ký lời gọi AI Gateway (tối thiểu, pseudonymous — AI_BEHAVIOR.md §6). Append-only. */
export const aiCallLog = pgTable(
  'ai_call_log',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id').references(() => session.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    fellBack: boolean('fell_back').notNull(),
    reason: text('reason'),
    violations: jsonb('violations').$type<string[]>(),
    latencyMs: integer('latency_ms').notNull().default(0),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ai_call_log_session_idx').on(t.sessionId)],
);

export const contentImportJob = pgTable('content_import_job', {
  id: text('id').primaryKey(),
  uploadedByUserId: text('uploaded_by_user_id')
    .notNull()
    .references(() => user.id),
  familyId: text('family_id').references(() => family.id, { onDelete: 'cascade' }),
  format: text('format').notNull(), // JSON | CSV | XLSX
  status: text('status').notNull().default('DONE'), // DONE | FAILED
  rowCount: integer('row_count').notNull().default(0),
  validCount: integer('valid_count').notNull().default(0),
  createdPackIds: jsonb('created_pack_ids').$type<string[]>(),
  errorReport: jsonb('error_report').$type<Array<{ row: number; errors: string[] }>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const learningUnit = pgTable(
  'learning_unit',
  {
    id: text('id').primaryKey(),
    packId: text('pack_id')
      .notNull()
      .references(() => contentPack.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    locale: text('locale').notNull(),
    stage: text('stage').notNull(),
    status: text('status').notNull(),
    schemaVersion: text('schema_version').notNull(),
    contentVersion: text('content_version').notNull(),
    grades: jsonb('grades').notNull().$type<number[]>(),
    domains: jsonb('domains').notNull().$type<string[]>(),
    durationScreenMin: integer('duration_screen_min').notNull(),
    durationOfflineMin: integer('duration_offline_min').notNull(),
    materials: jsonb('materials').$type<string[]>(),
    choices: jsonb('choices').notNull().$type<Array<{ id: string; label: string }>>(),
    questFlow: jsonb('quest_flow').notNull().$type<Record<string, unknown>>(),
    hints: jsonb('hints').notNull().$type<Array<Record<string, unknown>>>(),
    evidence: jsonb('evidence').notNull().$type<string[]>(),
    rubricId: text('rubric_id'),
    adaptations: jsonb('adaptations').$type<Record<string, unknown>>(),
    safetyAdultRequired: boolean('safety_adult_required').notNull().default(false),
    safetyRiskLevel: text('safety_risk_level').notNull().default('LOW'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('learning_unit_pack_idx').on(t.packId), index('learning_unit_stage_idx').on(t.stage)],
);

export const learningUnitSkill = pgTable(
  'learning_unit_skill',
  {
    unitId: text('unit_id')
      .notNull()
      .references(() => learningUnit.id, { onDelete: 'cascade' }),
    skillId: text('skill_id')
      .notNull()
      .references(() => skill.code, { onDelete: 'restrict' }),
    role: text('role').notNull(),
  },
  (t) => [primaryKey({ columns: [t.unitId, t.skillId] })],
);

export const learningUnitOutcome = pgTable('learning_unit_outcome', {
  id: text('id').primaryKey(),
  unitId: text('unit_id')
    .notNull()
    .references(() => learningUnit.id, { onDelete: 'cascade' }),
  framework: text('framework').notNull(),
  code: text('code'),
  description: text('description').notNull(),
});

/* ─────────────────────────  Identity & Access (Slice 2)  ───────────────────────── */

export const family = pgTable('family', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  locale: text('locale').notNull().default('vi-VN'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const user = pgTable(
  'app_user',
  {
    id: text('id').primaryKey(),
    familyId: text('family_id').references(() => family.id, { onDelete: 'cascade' }),
    role: text('role').notNull(), // PLATFORM_ADMIN | FAMILY_OWNER | PARENT | TEACHER | MENTOR | CONTENT_AUTHOR | CONTENT_REVIEWER
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    displayName: text('display_name').notNull(),
    pinHash: text('pin_hash'), // PIN mở Parent Dashboard
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('app_user_email_idx').on(t.email)],
);

export const authSession = pgTable(
  'auth_session',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(), // PARENT | CHILD | TEACHER | MENTOR
    /** Với child session: phiên phụ huynh đã mở ra nó. */
    parentSessionId: text('parent_session_id'),
    /** Với child session: hồ sơ trẻ. */
    childProfileId: text('child_profile_id'),
    tokenHash: text('token_hash').notNull(),
    pinVerifiedAt: timestamp('pin_verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('auth_session_token_idx').on(t.tokenHash)],
);

/* ─────────────────────────  Child Profile & Learning Model (Slice 2 phần lõi)  ───────────────────────── */

export const childProfile = pgTable(
  'child_profile',
  {
    id: text('id').primaryKey(),
    familyId: text('family_id')
      .notNull()
      .references(() => family.id, { onDelete: 'cascade' }),
    displayName: text('display_name').notNull(),
    birthMonth: integer('birth_month').notNull(),
    birthYear: integer('birth_year').notNull(),
    locale: text('locale').notNull().default('vi-VN'),
    currentStage: text('current_stage').notNull().default('BASE_CAMP'),
    screenSessionMinutes: integer('screen_session_minutes').notNull().default(10),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('child_profile_family_idx').on(t.familyId)],
);

/** Sở thích do trẻ/phụ huynh cung cấp (KHÔNG suy đoán). */
export const childInterest = pgTable('child_interest', {
  id: text('id').primaryKey(),
  childProfileId: text('child_profile_id')
    .notNull()
    .references(() => childProfile.id, { onDelete: 'cascade' }),
  source: text('source').notNull(), // CHILD | PARENT
  label: text('label').notNull(),
  strength: text('strength').notNull().default('EMERGING'), // EMERGING | STEADY | STRONG
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Mục tiêu do phụ huynh/giáo viên đặt (không hiển thị áp lực cho trẻ). */
export const childGoal = pgTable('child_goal', {
  id: text('id').primaryKey(),
  childProfileId: text('child_profile_id')
    .notNull()
    .references(() => childProfile.id, { onDelete: 'cascade' }),
  setBy: text('set_by').notNull(), // PARENT | TEACHER
  description: text('description').notNull(),
  status: text('status').notNull().default('ACTIVE'), // ACTIVE | PAUSED | DONE
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Điều chỉnh hỗ trợ & khả năng tiếp cận. */
export const childAccommodation = pgTable('child_accommodation', {
  id: text('id').primaryKey(),
  childProfileId: text('child_profile_id')
    .notNull()
    .references(() => childProfile.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  detail: text('detail'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ─────────────────────────  Governance (Slice 2)  ───────────────────────── */

export const consent = pgTable('consent', {
  id: text('id').primaryKey(),
  familyId: text('family_id')
    .notNull()
    .references(() => family.id, { onDelete: 'cascade' }),
  childProfileId: text('child_profile_id').references(() => childProfile.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // DATA_PROCESSING | VOICE_RECORDING | IMAGE_UPLOAD | SHARING_FAMILY | SHARING_TEACHER | SHARING_MENTOR
  grantedByUserId: text('granted_by_user_id')
    .notNull()
    .references(() => user.id),
  grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  scope: jsonb('scope').$type<Record<string, unknown>>(),
});

/** Append-only. KHÔNG chứa nội dung học của trẻ. */
export const auditLog = pgTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    actorUserId: text('actor_user_id'),
    actorRole: text('actor_role'),
    action: text('action').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: text('resource_id'),
    familyId: text('family_id'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  },
  (t) => [index('audit_log_family_idx').on(t.familyId), index('audit_log_occurred_idx').on(t.occurredAt)],
);

/* ─────────────────────────  Runtime học tập (Slice 3)  ───────────────────────── */

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    childProfileId: text('child_profile_id')
      .notNull()
      .references(() => childProfile.id, { onDelete: 'cascade' }),
    learningUnitId: text('learning_unit_id')
      .notNull()
      .references(() => learningUnit.id),
    stage: text('stage').notNull(),
    status: text('status').notNull().default('STARTED'), // STARTED | PAUSED | COMPLETED | ABANDONED
    /** Chế độ luyện tốc độ (§Module C/E). */
    timed: boolean('timed').notNull().default(false),
    timeBudgetSeconds: integer('time_budget_seconds'),
    timeSpentSeconds: integer('time_spent_seconds'),
    plan: jsonb('plan').$type<{ text?: string; choiceIds?: string[]; createdAt: string }>(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    firstActionAt: timestamp('first_action_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    createdOffline: boolean('created_offline').notNull().default(false),
    clientGeneratedId: text('client_generated_id').notNull(),
    syncedAt: timestamp('synced_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('session_cgid_idx').on(t.clientGeneratedId),
    index('session_child_idx').on(t.childProfileId),
  ],
);

/** Append-only. Idempotent theo (session_id, client_generated_id). */
export const sessionEvent = pgTable(
  'session_event',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => session.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    clientGeneratedId: text('client_generated_id').notNull(),
    source: text('source').notNull().default('CHILD_APP'),
  },
  (t) => [uniqueIndex('session_event_idem_idx').on(t.sessionId, t.clientGeneratedId)],
);

export const attempt = pgTable(
  'attempt',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => session.id, { onDelete: 'cascade' }),
    ordinal: integer('ordinal').notNull(),
    content: jsonb('content').$type<Record<string, unknown>>(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
    clientGeneratedId: text('client_generated_id'),
  },
  (t) => [
    index('attempt_session_idx').on(t.sessionId),
    // Idempotent khi đồng bộ offline (nhiều NULL được phép ở đường online).
    uniqueIndex('attempt_idem_idx').on(t.sessionId, t.clientGeneratedId),
  ],
);

/**
 * Phân loại lỗi theo nguyên nhân (spec Module C). Để hiểu & hỗ trợ, KHÔNG chấm điểm.
 * Do phụ huynh/giáo viên xác nhận (hoặc hệ thống gợi ý advisory).
 */
export const attemptError = pgTable(
  'attempt_error',
  {
    id: text('id').primaryKey(),
    attemptId: text('attempt_id').references(() => attempt.id, { onDelete: 'cascade' }),
    sessionId: text('session_id')
      .notNull()
      .references(() => session.id, { onDelete: 'cascade' }),
    childProfileId: text('child_profile_id')
      .notNull()
      .references(() => childProfile.id, { onDelete: 'cascade' }),
    skillId: text('skill_id').references(() => skill.code, { onDelete: 'set null' }),
    cause: text('cause').notNull(), // ErrorCause enum (@tiny/domain)
    note: text('note'),
    classifiedBy: text('classified_by').notNull(), // SYSTEM | PARENT | TEACHER
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('attempt_error_child_idx').on(t.childProfileId), index('attempt_error_skill_idx').on(t.skillId)],
);

/** Append-only — dấu vết luật cá nhân hóa cho phụ huynh xem lại (minh bạch). */
export const ruleFiring = pgTable('rule_firing', {
  id: text('id').primaryKey(),
  ruleId: text('rule_id').notNull(),
  ruleVersion: text('rule_version').notNull(),
  childProfileId: text('child_profile_id'),
  sessionId: text('session_id').references(() => session.id, { onDelete: 'cascade' }),
  parentExplanation: text('parent_explanation').notNull(),
  decision: text('decision').notNull(),
  inputsUsed: jsonb('inputs_used').$type<Record<string, string | number | boolean>>(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
});

export const hintInteraction = pgTable(
  'hint_interaction',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => session.id, { onDelete: 'cascade' }),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    helpLadderLevel: integer('help_ladder_level').notNull(),
    maxAllowedLevel: integer('max_allowed_level').notNull(),
    intent: text('intent').notNull(),
    childMessage: text('child_message').notNull(),
    coachProvider: text('coach_provider').notNull().default('deterministic'),
    invariantViolations: jsonb('invariant_violations').$type<string[]>(),
    shownAt: timestamp('shown_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('hint_interaction_session_idx').on(t.sessionId)],
);

export const reflection = pgTable('reflection', {
  id: text('id').primaryKey(),
  sessionId: text('session_id')
    .notNull()
    .references(() => session.id, { onDelete: 'cascade' }),
  prompt: text('prompt').notNull(),
  responseType: text('response_type').notNull(), // VOICE | TEXT | IMAGE_CHOICE
  responseText: text('response_text'),
  responseRef: text('response_ref'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const artifact = pgTable(
  'artifact',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => session.id, { onDelete: 'cascade' }),
    childProfileId: text('child_profile_id')
      .notNull()
      .references(() => childProfile.id, { onDelete: 'cascade' }),
    type: text('type').notNull(), // PHOTO | VOICE | TEXT
    /** id do client đặt để dedupe khi upload lại (retry / sync offline). */
    clientArtifactId: text('client_artifact_id'),
    storageKey: text('storage_key').notNull(),
    mimeType: text('mime_type').notNull(),
    byteSize: integer('byte_size').notNull(),
    transcriptText: text('transcript_text'),
    transcriptIsVerbatim: boolean('transcript_is_verbatim').notNull().default(true),
    currentVersion: integer('current_version').notNull().default(1),
    parentVisible: boolean('parent_visible').notNull().default(true),
    shareScope: text('share_scope').notNull().default('PRIVATE'), // PRIVATE | FAMILY
    aiAssistanceLevel: text('ai_assistance_level').notNull().default('NONE'), // NONE | HINTS_ONLY | CO_CREATED_TOOL | AI_GENERATED_DRAFT
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('artifact_session_idx').on(t.sessionId),
    uniqueIndex('artifact_client_idx').on(t.sessionId, t.clientArtifactId),
  ],
);

export const artifactVersion = pgTable('artifact_version', {
  id: text('id').primaryKey(),
  artifactId: text('artifact_id')
    .notNull()
    .references(() => artifact.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  storageKey: text('storage_key').notNull(),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ─────────────────────────  Đánh giá & minh chứng + Governance (Slice 4)  ───────────────────────── */

export const parentObservation = pgTable(
  'parent_observation',
  {
    id: text('id').primaryKey(),
    childProfileId: text('child_profile_id')
      .notNull()
      .references(() => childProfile.id, { onDelete: 'cascade' }),
    sessionId: text('session_id').references(() => session.id, { onDelete: 'set null' }),
    authorUserId: text('author_user_id')
      .notNull()
      .references(() => user.id),
    text: text('text').notNull(),
    tags: jsonb('tags').$type<string[]>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('parent_observation_child_idx').on(t.childProfileId)],
);

/** Nhiều minh chứng cho mỗi kỹ năng — KHÔNG dồn thành một điểm tổng hợp (DATA_MODEL.md §1). */
export const skillEvidence = pgTable(
  'skill_evidence',
  {
    id: text('id').primaryKey(),
    childProfileId: text('child_profile_id')
      .notNull()
      .references(() => childProfile.id, { onDelete: 'cascade' }),
    skillId: text('skill_id')
      .notNull()
      .references(() => skill.code, { onDelete: 'restrict' }),
    sessionId: text('session_id').references(() => session.id, { onDelete: 'cascade' }),
    artifactId: text('artifact_id').references(() => artifact.id, { onDelete: 'set null' }),
    source: text('source').notNull(), // SESSION | ARTIFACT | PARENT | TEACHER | CHILD_REFLECTION
    strength: text('strength').notNull(), // EMERGING | DEVELOPING | SECURE
    confidence: text('confidence').notNull(), // LOW | MED | HIGH
    verifier: text('verifier').notNull(), // SYSTEM | PARENT | TEACHER | CHILD_REFLECTION
    recencyAt: timestamp('recency_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('skill_evidence_child_idx').on(t.childProfileId), index('skill_evidence_skill_idx').on(t.skillId)],
);

/**
 * Sự đồng ý của TRẺ (child assent) — bổ sung cho `consent` của phụ huynh (spec §6.1/§12).
 * Phụ huynh ghi lại sau khi hỏi trẻ theo cách phù hợp tuổi. Advisory ở Giai đoạn 1
 * (được lưu + hiển thị + export); chính sách "chặn khi thiếu assent" do rà soát người quyết.
 */
export const childAssent = pgTable(
  'child_assent',
  {
    id: text('id').primaryKey(),
    childProfileId: text('child_profile_id')
      .notNull()
      .references(() => childProfile.id, { onDelete: 'cascade' }),
    type: text('type').notNull(), // DATA_PROCESSING | VOICE_RECORDING | IMAGE_UPLOAD | SHARING_FAMILY | ...
    given: boolean('given').notNull(),
    method: text('method').notNull(), // VERBAL_TO_PARENT | TAP_YES | OBSERVED
    recordedByUserId: text('recorded_by_user_id')
      .notNull()
      .references(() => user.id),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
  },
  (t) => [index('child_assent_child_idx').on(t.childProfileId)],
);

/* ─────────────────────────  Skill Graph (Giai đoạn 3)  ───────────────────────── */

/** DATA_MODEL §6.2. `code` là định danh dùng ở `learning_unit_skill` / `skill_evidence`. */
export const skill = pgTable(
  'skill',
  {
    code: text('code').primaryKey(),
    group: text('group').notNull(), // ACADEMIC | COGNITIVE | METACOGNITIVE | EXECUTIVE_FUNCTION | COMMUNICATION | SOCIAL_EMOTIONAL | ART_DESIGN | MUSIC_PIANO | PHYSICAL | DIGITAL_AI_LITERACY
    titleVi: text('title_vi').notNull(),
    descriptionByAge: jsonb('description_by_age').$type<Record<string, string>>(),
    prerequisites: jsonb('prerequisites').$type<string[]>(),
    acceptedEvidenceTypes: jsonb('accepted_evidence_types').$type<string[]>(),
    stageRelevance: jsonb('stage_relevance').$type<string[]>(),
    /** Mã TargetOverlay mà kỹ năng này là tín hiệu sẵn sàng. */
    overlays: jsonb('overlays').$type<string[]>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('skill_group_idx').on(t.group)],
);

/* ─────────────────────────  Target Overlays & Admissions (Giai đoạn 3)  ───────────────────────── */

export const targetOverlay = pgTable('target_overlay', {
  id: text('id').primaryKey(),
  code: text('code').notNull(), // TDN_GRADE_6 | TDN_SPECIALIZED_GRADE_10 | GLOBAL_TOP_UNIVERSITY
  title: text('title').notNull(),
  description: text('description'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Quy chế tuyển sinh — version hóa theo NĂM. KHÔNG viết cứng số câu/thời lượng/môn/cách
 * tính điểm ở code: tất cả nằm trong các trường jsonb (ADR 0003). KHÔNG trộn với
 * learning objective. Mặc định KHÔNG coi quy chế hiện tại còn hiệu lực trong tương lai.
 */
export const admissionRule = pgTable(
  'admission_rule',
  {
    id: text('id').primaryKey(),
    familyId: text('family_id').references(() => family.id, { onDelete: 'cascade' }), // null = platform
    targetOverlayId: text('target_overlay_id').references(() => targetOverlay.id, { onDelete: 'set null' }),
    institutionCode: text('institution_code').notNull(),
    institutionName: text('institution_name').notNull(),
    /** Lộ trình quốc gia — chỉ dùng với overlay GLOBAL_TOP_UNIVERSITY: US | UK | SG | CA | AU. */
    pathwayCode: text('pathway_code'),
    admissionYear: integer('admission_year').notNull(),
    effectiveDate: timestamp('effective_date', { withTimezone: true }),
    sourceUrl: text('source_url'),
    sourceCheckedDate: timestamp('source_checked_date', { withTimezone: true }),
    reviewByDate: timestamp('review_by_date', { withTimezone: true }),
    eligibility: jsonb('eligibility').$type<Record<string, unknown>>(),
    examOrPortfolioStructure: jsonb('exam_or_portfolio_structure').$type<Record<string, unknown>>(),
    subjects: jsonb('subjects').$type<unknown[]>(),
    durationInfo: jsonb('duration_info').$type<Record<string, unknown>>(),
    scoringMethod: jsonb('scoring_method').$type<Record<string, unknown>>(),
    cutoff: jsonb('cutoff').$type<Record<string, unknown>>(),
    notes: text('notes'),
    status: text('status').notNull().default('DRAFT'), // DRAFT | VERIFIED | SUPERSEDED | ARCHIVED
    supersededById: text('superseded_by_id'),
    verifiedByUserId: text('verified_by_user_id'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    createdByUserId: text('created_by_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('admission_rule_family_idx').on(t.familyId),
    index('admission_rule_inst_idx').on(t.institutionCode, t.admissionYear),
  ],
);

/* ─────────────────────────  Specialisation — chu kỳ trải nghiệm (Giai đoạn 4)  ─────────────────────────
 * PRODUCT.md §5 SPECIALISATION (lớp 6–7): chu kỳ trải nghiệm 8–12 tuần NHIỀU lĩnh vực; theo dõi
 * hứng thú BỀN VỮNG (nhiều tín hiệu theo thời gian, không phải một khảo sát); khuyến khích giao
 * thoa thế mạnh. KHÔNG chốt môn chuyên bằng một bài test → không có trường "môn chuyên đã chọn".
 */
export const explorationCycle = pgTable(
  'exploration_cycle',
  {
    id: text('id').primaryKey(),
    familyId: text('family_id')
      .notNull()
      .references(() => family.id, { onDelete: 'cascade' }),
    childProfileId: text('child_profile_id')
      .notNull()
      .references(() => childProfile.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    /** Các lĩnh vực đang được nếm thử trong chu kỳ (>= 3, thuộc danh mục domain hợp lệ). */
    domains: jsonb('domains').notNull().$type<string[]>(),
    plannedWeeks: integer('planned_weeks').notNull(), // 8–12
    startedOn: timestamp('started_on', { withTimezone: true }).notNull().defaultNow(),
    status: text('status').notNull().default('ACTIVE'), // ACTIVE | COMPLETED | ABANDONED
    reflectionNote: text('reflection_note'),
    createdByUserId: text('created_by_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [index('exploration_cycle_child_idx').on(t.childProfileId)],
);

/** Tín hiệu hứng thú có mốc thời gian — nhiều dòng dồn theo thời gian tạo nên "hứng thú bền vững". */
export const interestSignal = pgTable(
  'interest_signal',
  {
    id: text('id').primaryKey(),
    childProfileId: text('child_profile_id')
      .notNull()
      .references(() => childProfile.id, { onDelete: 'cascade' }),
    cycleId: text('cycle_id').references(() => explorationCycle.id, { onDelete: 'set null' }),
    /** Phiên học sinh ra tín hiệu này (chỉ với source=SESSION_ENGAGEMENT) — dùng để chống trùng + truy vết. */
    sessionId: text('session_id').references(() => session.id, { onDelete: 'cascade' }),
    domain: text('domain').notNull(),
    source: text('source').notNull(), // CHILD_SELF | PARENT_OBSERVED | SESSION_ENGAGEMENT
    strength: text('strength').notNull(), // LOW | MED | HIGH
    note: text('note'),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull().defaultNow(),
    recordedByUserId: text('recorded_by_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('interest_signal_child_idx').on(t.childProfileId),
    index('interest_signal_domain_idx').on(t.childProfileId, t.domain),
  ],
);

/**
 * SPEC_HS_READINESS (PRODUCT.md §5, lớp 8–9): chốt 1 môn chuyên CHÍNH + 1 DỰ PHÒNG — có
 * lý do, version hóa (đổi = supersede, giữ lịch sử), rút lại được. KHÔNG dự báo "chắc đậu/rớt".
 * Chỉ được chốt SAU khi đã hoàn thành ít nhất một chu kỳ trải nghiệm (không chốt bằng một bài test).
 */
export const specialisationChoice = pgTable(
  'specialisation_choice',
  {
    id: text('id').primaryKey(),
    familyId: text('family_id')
      .notNull()
      .references(() => family.id, { onDelete: 'cascade' }),
    childProfileId: text('child_profile_id')
      .notNull()
      .references(() => childProfile.id, { onDelete: 'cascade' }),
    primarySubject: text('primary_subject').notNull(), // ∈ KNOWN_DOMAINS
    backupSubject: text('backup_subject').notNull(), // ∈ KNOWN_DOMAINS, ≠ primary
    rationale: text('rationale').notNull(),
    basedOnCycleId: text('based_on_cycle_id').references(() => explorationCycle.id, { onDelete: 'set null' }),
    status: text('status').notNull().default('ACTIVE'), // ACTIVE | SUPERSEDED | WITHDRAWN
    supersededById: text('superseded_by_id'),
    decidedByUserId: text('decided_by_user_id'),
    decidedAt: timestamp('decided_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  (t) => [index('specialisation_choice_child_idx').on(t.childProfileId)],
);

/* ─────────────────────────  Global Scholar — dự án dài hạn + provenance AI (Giai đoạn 5)  ─────────────────────────
 * PRODUCT.md §5 GLOBAL_SCHOLAR (lớp 9–12): phân biệt lộ trình Mỹ/Anh/Singapore/Canada/Úc; hồ sơ
 * chữ T (rộng + một mũi sâu); dự án dài hạn có VẤN ĐỀ THẬT; **provenance cho AI-assistance** —
 * mỗi đóng góp khai báo mức hỗ trợ của AI, khai báo là mục tiêu (không phải để trừ điểm).
 */
export const scholarProject = pgTable(
  'scholar_project',
  {
    id: text('id').primaryKey(),
    familyId: text('family_id')
      .notNull()
      .references(() => family.id, { onDelete: 'cascade' }),
    childProfileId: text('child_profile_id')
      .notNull()
      .references(() => childProfile.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    /** Câu hỏi dẫn dắt — vấn đề thật, mở. */
    drivingQuestion: text('driving_question').notNull(),
    pathway: text('pathway').notNull().default('UNDECIDED'), // US | UK | SG | CA | AU | UNDECIDED (chỉ là nhãn, KHÔNG viết cứng quy chế)
    disciplines: jsonb('disciplines').notNull().$type<string[]>(),
    targetMonths: integer('target_months').notNull(), // 3–24
    startedOn: timestamp('started_on', { withTimezone: true }).notNull().defaultNow(),
    status: text('status').notNull().default('ACTIVE'), // ACTIVE | COMPLETED | SHELVED
    reflectionNote: text('reflection_note'),
    createdByUserId: text('created_by_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  (t) => [index('scholar_project_child_idx').on(t.childProfileId)],
);

/** Một mốc/đóng góp trong dự án — bắt buộc khai báo mức hỗ trợ của AI. */
export const projectContribution = pgTable(
  'project_contribution',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => scholarProject.id, { onDelete: 'cascade' }),
    childProfileId: text('child_profile_id')
      .notNull()
      .references(() => childProfile.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(), // RESEARCH | BUILD | WRITE | FIELDWORK | REVISION | OUTREACH
    summary: text('summary').notNull(),
    aiAssistanceLevel: text('ai_assistance_level').notNull().default('NONE'), // NONE | HINTS_ONLY | CO_CREATED_TOOL | AI_GENERATED_DRAFT
    /** Bắt buộc khi mức != NONE: mô tả CỤ THỂ AI đã làm gì. */
    aiAssistanceNote: text('ai_assistance_note'),
    hoursSpent: integer('hours_spent'),
    artifactId: text('artifact_id').references(() => artifact.id, { onDelete: 'set null' }),
    occurredOn: timestamp('occurred_on', { withTimezone: true }).notNull().defaultNow(),
    recordedByUserId: text('recorded_by_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('project_contribution_project_idx').on(t.projectId)],
);

/* ─────────────────────────  Chia sẻ cho giáo viên / cố vấn (Giai đoạn 6)  ─────────────────────────
 * DATA_MODEL §Identity: teacher_assignment / mentor_assignment. Hai chế độ:
 *  - LINK: liên kết chỉ-đọc theo phạm vi, KHÔNG cần tài khoản (token băm ở DB).
 *  - ACCOUNT: mời một người dùng educator bằng email + mã; sau khi nhận, `educatorUserId` được gắn.
 * Phạm vi (`scope`) do phụ huynh chọn: mục nào được xem. Mọi truy cập đều chỉ-đọc.
 */
export const educatorShare = pgTable(
  'educator_share',
  {
    id: text('id').primaryKey(),
    familyId: text('family_id')
      .notNull()
      .references(() => family.id, { onDelete: 'cascade' }),
    childProfileId: text('child_profile_id')
      .notNull()
      .references(() => childProfile.id, { onDelete: 'cascade' }),
    role: text('role').notNull(), // TEACHER | MENTOR
    scope: jsonb('scope').notNull().$type<{
      dashboard?: boolean;
      readiness?: boolean;
      specialisation?: boolean;
      scholar?: boolean;
    }>(),
    label: text('label'),
    mode: text('mode').notNull(), // LINK | ACCOUNT
    tokenHash: text('token_hash'), // LINK
    inviteEmail: text('invite_email'), // ACCOUNT
    inviteCodeHash: text('invite_code_hash'), // ACCOUNT
    educatorUserId: text('educator_user_id').references(() => user.id, { onDelete: 'set null' }),
    status: text('status').notNull().default('ACTIVE'), // ACTIVE | REVOKED | PENDING
    createdByUserId: text('created_by_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    lastAccessedAt: timestamp('last_accessed_at', { withTimezone: true }),
  },
  (t) => [
    index('educator_share_child_idx').on(t.childProfileId),
    index('educator_share_token_idx').on(t.tokenHash),
    index('educator_share_educator_idx').on(t.educatorUserId),
  ],
);

export const dataRequest = pgTable('data_request', {
  id: text('id').primaryKey(),
  familyId: text('family_id')
    .notNull()
    .references(() => family.id, { onDelete: 'cascade' }),
  requestedByUserId: text('requested_by_user_id')
    .notNull()
    .references(() => user.id),
  kind: text('kind').notNull(), // EXPORT | DELETE
  scope: jsonb('scope').$type<{ childProfileId?: string }>(),
  status: text('status').notNull().default('PENDING'), // PENDING | PROCESSING | DONE | FAILED
  resultKey: text('result_key'),
  error: text('error'),
  requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});
