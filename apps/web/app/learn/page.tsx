'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { api, type ChildContext, type LearningUnit, type Me } from '@/lib/api';
import {
  addAttempt,
  checkFatigue,
  computeHint,
  createLocalSession,
  installSyncOnReconnect,
  persist,
  resolveServerSessionId,
  syncSession,
  type LocalSession,
} from '@/lib/learn-store';
import { flushArtifacts, queueArtifact } from '@/lib/artifact-store';
import { Button } from '@/components/ui';

type Phase = 'loading' | 'choose' | 'plan' | 'try' | 'make' | 'reflect' | 'done';

const REFLECT_OPTIONS = [
  { id: 'easy', label: '😀 Con tự làm được' },
  { id: 'tried', label: '🙂 Con có cố gắng' },
  // Cố ý dùng 🤔 (đang-suy-nghĩ) thay vì mặt buồn/thất vọng — để "khó" đọc như một nỗ lực
  // bình thường, không phải một lỗi hay điều đáng xấu hổ (tư duy phát triển — growth mindset).
  { id: 'hard', label: '🤔 Phần này cần cố gắng thêm' },
];

/** "Bạn đồng hành" lặp lại xuyên suốt — tạo cảm giác quen thuộc, không phải giao diện lạnh lùng. */
function Companion({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-2xl bg-violet-50 p-3 text-violet-900">
      <span className="text-2xl leading-none" aria-hidden="true">
        🦉
      </span>
      <div className="pt-0.5">{children}</div>
    </div>
  );
}

/**
 * Local-first: mọi bước ghi vào IndexedDB, đồng bộ khi có mạng. Hint tính tại client
 * bằng rule engine + coach tất định nên chạy được cả khi mất mạng (ADR 0005).
 */
export default function LearnPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('loading');
  const [unit, setUnit] = useState<LearningUnit | null>(null);
  const sessionRef = useRef<LocalSession | null>(null);

  const [planText, setPlanText] = useState('');
  const [attemptText, setAttemptText] = useState('');
  const [attemptCount, setAttemptCount] = useState(0);
  const [coachMsg, setCoachMsg] = useState<string | null>(null);
  const [hintCoolingDown, setHintCoolingDown] = useState(false);
  const [photoQueued, setPhotoQueued] = useState(false);
  const [restNudge, setRestNudge] = useState<null | 'shorten' | 'stop'>(null);
  const [online, setOnline] = useState(true);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const timedRef = useRef(false);
  const ctxRef = useRef<ChildContext | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const promptShownAt = useRef<number>(Date.now());

  useEffect(() => {
    installSyncOnReconnect();
    try {
      const raw = sessionStorage.getItem('tiny_child_ctx');
      if (raw) ctxRef.current = JSON.parse(raw) as ChildContext;
      timedRef.current = sessionStorage.getItem('tiny_timed') === '1';
    } catch {
      /* bỏ qua */
    }
    const upd = () => setOnline(navigator.onLine);
    upd();
    const onReconnect = async () => {
      setOnline(true);
      const s = sessionRef.current;
      if (s) await syncSession(s);
      await flushArtifacts(resolveServerSessionId);
    };
    window.addEventListener('online', onReconnect);
    window.addEventListener('online', upd);
    window.addEventListener('offline', upd);
    return () => {
      window.removeEventListener('online', onReconnect);
      window.removeEventListener('online', upd);
      window.removeEventListener('offline', upd);
    };
  }, []);

  // EDU-2: kiểm tra sức khỏe học tập ngay cả khi trẻ không thao tác.
  useEffect(() => {
    if (phase !== 'try' && phase !== 'plan') return;
    const iv = setInterval(() => {
      const s = sessionRef.current;
      if (!s) return;
      const fa = checkFatigue(s, ctxRef.current);
      if (fa === 'STOP_SESSION' || fa === 'OFFLINE_MOVEMENT') setRestNudge('stop');
      else if (fa === 'SHORTEN_SESSION') setRestNudge((r) => r ?? 'shorten');
    }, 20_000);
    return () => clearInterval(iv);
  }, [phase]);

  // Luyện có tính giờ: đồng hồ đếm ngược, tính lại từ startedAt để không lệch khi re-render.
  useEffect(() => {
    if (phase === 'loading' || phase === 'choose' || phase === 'done') return;
    const s = sessionRef.current;
    if (!s?.timed || !s.timeBudgetSeconds) return;
    const budget = s.timeBudgetSeconds;
    const tick = () => {
      const elapsed = Math.round((Date.now() - Date.parse(s.startedAt)) / 1000);
      setTimeLeft(Math.max(0, budget - elapsed));
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [phase]);

  useEffect(() => {
    (async () => {
      try {
        const m = await api.get<Me>('auth/me');
        if (m.kind !== 'CHILD') return router.replace('/parent');
        const packs = await api.get<{ packs: Array<{ id: string; stage: string }> }>('content/packs?stage=BASE_CAMP');
        const first = packs.packs[0];
        if (!first) return setError('Chưa có nội dung học.');
        const detail = await api.get<{ units: LearningUnit[] }>(`content/packs/${first.id}`);
        const u = detail.units[0] ?? null;
        setUnit(u);
        setPhase('choose');
        promptShownAt.current = Date.now();
      } catch {
        router.replace('/parent');
      }
    })();
  }, [router]);

  async function save() {
    const s = sessionRef.current;
    if (!s) return;
    await persist(s);
    if (navigator.onLine) void syncSession(s);
  }

  async function pickChoice(choiceId: string) {
    if (!unit) return;
    const budget = Math.max(1, ctxRef.current?.screenSessionMinutes ?? 10) * 60;
    const s = createLocalSession(unit, unit.stage ?? 'BASE_CAMP', {
      timed: timedRef.current,
      timeBudgetSeconds: budget,
    });
    s.plan = { choiceIds: [choiceId] };
    sessionRef.current = s;
    if (s.timed && s.timeBudgetSeconds) setTimeLeft(s.timeBudgetSeconds);
    await save();
    setPhase('plan');
    promptShownAt.current = Date.now();
  }

  async function submitPlan() {
    const s = sessionRef.current;
    if (!s) return;
    s.plan = { ...(s.plan ?? {}), text: planText || undefined };
    s.events.push({ type: 'FIRST_ACTION', cgid: `ev_${Date.now()}`, occurredAt: new Date().toISOString(), payload: { kind: 'plan' } });
    await save();
    setPhase('try');
    promptShownAt.current = Date.now();
  }

  async function submitAttempt() {
    const s = sessionRef.current;
    if (!s) return;
    const ord = addAttempt(s, { text: attemptText });
    setAttemptCount(ord);
    setAttemptText('');
    setCoachMsg(null);
    await save();
    promptShownAt.current = Date.now();

    // EDU-2: bảo vệ thời lượng phiên.
    const fa = checkFatigue(s, ctxRef.current);
    if (fa === 'STOP_SESSION' || fa === 'OFFLINE_MOVEMENT') setRestNudge('stop');
    else if (fa === 'SHORTEN_SESSION') setRestNudge('shorten');
  }

  function askHint() {
    const s = sessionRef.current;
    if (!s || hintCoolingDown) return;
    const secondsSincePrompt = Math.round((Date.now() - promptShownAt.current) / 1000);
    const coach = computeHint(s, secondsSincePrompt, ctxRef.current);
    setCoachMsg(coach.child_message);
    void save();
    // Nghỉ ngắn giữa các lần xin gợi ý — bé có thời gian thử theo gợi ý trước đó.
    setHintCoolingDown(true);
    setTimeout(() => setHintCoolingDown(false), 3000);
  }

  async function capturePhoto(file: File) {
    const s = sessionRef.current;
    if (!s) return;
    setBusy(true);
    try {
      await queueArtifact(s.cgid, file); // mã hóa + xếp hàng (hoạt động cả khi offline)
      setPhotoQueued(true);
      if (navigator.onLine) void flushArtifacts(resolveServerSessionId);
    } catch {
      setError('Chưa lưu được ảnh, con thử lại nhé.');
    } finally {
      setBusy(false);
    }
  }

  async function submitReflection(optionId: string) {
    const s = sessionRef.current;
    if (!s || !unit) return;
    setBusy(true);
    s.reflection = {
      prompt: unit.questFlow.reflection_prompt ?? 'Hôm nay con thấy thế nào?',
      responseType: 'IMAGE_CHOICE',
      responseRef: optionId,
    };
    s.completed = true;
    s.events.push({ type: 'REFLECTION_COMPLETED', cgid: `ev_${Date.now()}`, occurredAt: new Date().toISOString() });
    await persist(s);
    if (navigator.onLine) {
      await syncSession(s);
      await flushArtifacts(resolveServerSessionId);
    }
    setBusy(false);
    setPhase('done');
  }

  async function rest() {
    const s = sessionRef.current;
    try {
      if (s && !s.completed) {
        await persist(s);
        if (navigator.onLine) await syncSession(s);
      }
      await api.post('child-session/end');
    } catch {
      /* rời trang dù lỗi */
    }
    router.replace('/parent');
  }

  if (phase === 'loading') return <main className="p-6 text-slate-500">Đang chuẩn bị…</main>;
  if (error && !unit) return <main className="p-6 text-slate-600">{error}</main>;
  if (!unit) return <main className="p-6 text-slate-500">Đang chuẩn bị…</main>;

  const minAttempts = unit.questFlow.attempt_requirement?.minimum_attempts_before_solution ?? 1;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 bg-gradient-to-b from-sky-50 via-white to-amber-50 p-6">
      {!online && (
        <p data-testid="offline-banner" className="rounded-2xl bg-amber-100 px-3 py-2 text-center text-sm text-amber-900">
          📴 Đang ngoại tuyến — con vẫn học được, mình sẽ lưu lại và đồng bộ sau.
        </p>
      )}

      <div className="text-center">
        <span className="inline-block rounded-full bg-violet-100 px-3 py-1 text-sm font-semibold text-violet-700">
          ✨ Nhiệm vụ hôm nay
        </span>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">{unit.title}</h1>
        {timeLeft !== null && phase !== 'done' && (
          <p
            data-testid="countdown"
            className={`mt-2 inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold ${
              timeLeft === 0 ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-800'
            }`}
          >
            ⏰ {String(Math.floor(timeLeft / 60)).padStart(2, '0')}:{String(timeLeft % 60).padStart(2, '0')}
          </p>
        )}
      </div>

      {timeLeft === 0 && phase !== 'done' && (
        <p data-testid="time-up-nudge" className="rounded-2xl bg-amber-50 px-3 py-2 text-center text-sm text-amber-900">
          ⏳ Hết giờ dự tính rồi — con cứ làm nốt cho xong, không sao cả. Mình ghi lại là lần này cần thêm thời gian thôi.
        </p>
      )}

      {phase === 'choose' && (
        <section className="flex flex-col gap-4">
          {unit.questFlow.hook && <Companion>{unit.questFlow.hook}</Companion>}
          <p className="text-center text-lg font-medium">Con muốn bắt đầu thế nào?</p>
          {unit.choices.map((c) => (
            <Button key={c.id} variant="big" data-testid={`choice-${c.id}`} onClick={() => pickChoice(c.id)}>
              {c.label}
            </Button>
          ))}
        </section>
      )}

      {phase === 'plan' && (
        <section className="flex flex-col gap-3">
          <Companion>
            <label className="text-lg font-medium" htmlFor="plan">
              {unit.questFlow.plan_prompt ?? 'Con định làm gì trước?'}
            </label>
          </Companion>
          <textarea
            id="plan"
            data-testid="plan-input"
            className="min-h-24 rounded-2xl border-2 border-sky-200 p-3 text-base placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-4 focus:ring-sky-100"
            placeholder="✏️ (Không bắt buộc) Con gõ hoặc nhờ ba/mẹ gõ giúp ý định của con vào đây — hoặc cứ kể miệng cũng được!"
            value={planText}
            onChange={(e) => setPlanText(e.target.value)}
          />
          <Button variant="success" data-testid="plan-next" onClick={submitPlan}>
            🚀 Bắt đầu làm
          </Button>
        </section>
      )}

      {restNudge && (phase === 'try' || phase === 'plan') && (
        <div data-testid="rest-nudge" className="flex items-start gap-2 rounded-2xl bg-emerald-50 px-3 py-2 text-emerald-900">
          <span className="text-xl leading-none" aria-hidden="true">
            🌿
          </span>
          <p>
            {restNudge === 'stop'
              ? 'Mình học kha khá rồi. Con làm nốt điều đang nghĩ rồi mình đứng dậy vận động nhé.'
              : 'Sắp hết giờ học màn hình rồi — con làm nốt bước này rồi mình nghỉ nhé.'}
          </p>
        </div>
      )}

      {phase === 'try' && (
        <section className="flex flex-col gap-3">
          <Companion>
            <p className="text-lg font-medium">Con thử làm và kể lại cách làm nhé</p>
          </Companion>
          <textarea
            data-testid="attempt-input"
            className="min-h-24 rounded-2xl border-2 border-sky-200 p-3 text-base placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-4 focus:ring-sky-100"
            placeholder="📝 Ví dụ: Con đã làm... rồi con thấy... — gõ hoặc nhờ ba/mẹ gõ giúp câu trả lời của con vào đây."
            value={attemptText}
            onChange={(e) => setAttemptText(e.target.value)}
          />
          <p className="text-sm text-slate-500">
            💡 Không cần viết dài hay đúng chính tả đâu — kể đúng ý con nghĩ là được rồi!
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="success" data-testid="attempt-submit" disabled={!attemptText.trim()} onClick={submitAttempt}>
              ✅ Con làm xong bước này
            </Button>
            <Button variant="warm" data-testid="hint-btn" disabled={hintCoolingDown} onClick={askHint}>
              {hintCoolingDown ? '⏳ Con thử theo gợi ý nhé…' : '💡 Con cần gợi ý'}
            </Button>
          </div>
          {coachMsg && <Companion><p data-testid="coach-message">{coachMsg}</p></Companion>}
          <p className="text-sm text-slate-500">🔢 Số lần con đã thử: {attemptCount}</p>
          <Button
            variant="calm"
            data-testid="to-make"
            disabled={attemptCount < minAttempts}
            onClick={() => {
              setPhase('make');
              promptShownAt.current = Date.now();
            }}
          >
            {attemptCount < minAttempts ? `🔁 Thử ít nhất ${minAttempts} lần` : '👉 Con làm xong rồi'}
          </Button>
        </section>
      )}

      {phase === 'make' && (
        <section className="flex flex-col gap-3">
          <Companion>
            <p className="text-lg font-medium">Con chụp ảnh bài làm (nếu muốn)</p>
          </Companion>
          <label
            htmlFor="photo-input"
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-sky-300 bg-sky-50 px-4 py-8 text-center text-sky-800 transition hover:bg-sky-100"
          >
            <span className="text-4xl" aria-hidden="true">
              📷
            </span>
            <span className="font-medium">{photoQueued ? 'Chụp lại ảnh khác' : 'Bấm để chụp hoặc chọn ảnh'}</span>
          </label>
          <input
            id="photo-input"
            data-testid="photo-input"
            type="file"
            accept="image/png,image/jpeg"
            disabled={busy}
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void capturePhoto(f);
            }}
          />
          <p className="text-xs text-slate-400">
            {photoQueued
              ? '✅ Đã lưu ảnh của con (mã hóa trên máy) — sẽ tự gửi khi có mạng.'
              : online
                ? 'Ảnh sẽ được lưu; nếu ba/mẹ chưa bật quyền tải ảnh thì để dành gửi sau.'
                : '📴 Ngoại tuyến — ảnh vẫn được lưu an toàn trên máy và gửi sau.'}
          </p>
          <Button
            variant="calm"
            data-testid="skip-make"
            onClick={() => {
              setPhase('reflect');
              promptShownAt.current = Date.now();
            }}
          >
            {photoQueued ? '👉 Đi tiếp' : '⏭️ Bỏ qua, đi tiếp'}
          </Button>
        </section>
      )}

      {phase === 'reflect' && (
        <section className="flex flex-col gap-3">
          <Companion>
            <p className="text-lg font-medium">{unit.questFlow.reflection_prompt ?? 'Hôm nay con thấy thế nào?'}</p>
          </Companion>
          {REFLECT_OPTIONS.map((o) => (
            <Button key={o.id} variant="big" data-testid={`reflect-${o.id}`} disabled={busy} onClick={() => submitReflection(o.id)}>
              {o.label}
            </Button>
          ))}
        </section>
      )}

      {phase === 'done' && (
        <section className="flex flex-col gap-4 text-center">
          <p className="text-5xl" aria-hidden="true">
            🎉🌟🎉
          </p>
          <p data-testid="done-message" className="text-xl font-semibold text-emerald-700">
            Hôm nay con tự làm được rồi!
          </p>
          <p className="text-slate-600">Mình cùng vận động một chút rồi nghỉ nhé. 🤸</p>
        </section>
      )}

      <Button type="button" variant="ghost" data-testid="rest-btn" onClick={rest} className="mx-auto mt-2">
        🌿 Con muốn nghỉ
      </Button>
    </main>
  );
}
