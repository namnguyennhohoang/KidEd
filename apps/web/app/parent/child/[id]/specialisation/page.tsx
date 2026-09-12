'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, type Me } from '@/lib/api';
import { Button, Card, Field } from '@/components/ui';

interface Cycle {
  id: string;
  title: string;
  domains: string[];
  plannedWeeks: number;
  status: 'ACTIVE' | 'COMPLETED' | 'ABANDONED';
  reflectionNote: string | null;
  startedOn: string;
}
interface DomainInterest {
  domain: string;
  signalCount: number;
  distinctWeeks: number;
  spanDays: number;
  latestStrength: string | null;
  sources: string[];
  trend: 'RISING' | 'STEADY' | 'FADING' | 'SPARSE';
  sustained: boolean;
}
interface InterestProfile {
  byDomain: DomainInterest[];
  crossoverHints: Array<{ domains: [string, string]; sharedUnits: number }>;
  summary: { domainsWithSignal: number; sustainedDomains: number; totalSignals: number };
  disclaimer: string;
}
interface ChoiceRow {
  id: string;
  primarySubject: string;
  backupSubject: string;
  rationale: string;
  status: 'ACTIVE' | 'SUPERSEDED' | 'WITHDRAWN';
  decidedAt: string;
}
interface DepthItem {
  skillId: string;
  title: string | null;
  forSubject: 'PRIMARY' | 'BACKUP' | 'BOTH';
  band: string;
  notStarted: boolean;
}
interface ChoiceView {
  current: ChoiceRow | null;
  history: ChoiceRow[];
  depthPlan: { items: DepthItem[]; disclaimer: string } | null;
  disclaimer: string;
}
const SUBJECTS = ['MATHEMATICS', 'SCIENCE', 'VIETNAMESE_LITERACY', 'ENGLISH', 'SOCIAL_STUDIES', 'DIGITAL_AI_LITERACY'];

const DOMAIN_VI: Record<string, string> = {
  VIETNAMESE_LITERACY: 'Tiếng Việt',
  MATHEMATICS: 'Toán',
  ENGLISH: 'Tiếng Anh',
  SCIENCE: 'Khoa học',
  SOCIAL_STUDIES: 'Xã hội',
  ART_DESIGN: 'Mỹ thuật – thiết kế',
  MUSIC_PIANO: 'Âm nhạc – piano',
  PHYSICAL_WELLBEING: 'Vận động – thể chất',
  COMMUNICATION: 'Giao tiếp',
  SOCIAL_EMOTIONAL: 'Cảm xúc – xã hội',
  EXECUTIVE_FUNCTION: 'Điều hành nhận thức',
  DIGITAL_AI_LITERACY: 'Công nghệ – AI',
};
const dv = (d: string) => DOMAIN_VI[d] ?? d;

const TREND_VI: Record<string, { label: string; cls: string }> = {
  RISING: { label: 'đang lên', cls: 'bg-emerald-100 text-emerald-800' },
  STEADY: { label: 'ổn định', cls: 'bg-sky-100 text-sky-800' },
  FADING: { label: 'đang phai', cls: 'bg-amber-100 text-amber-900' },
  SPARSE: { label: 'còn ít dữ liệu', cls: 'bg-slate-100 text-slate-600' },
};

export default function SpecialisationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [needPin, setNeedPin] = useState(false);
  const [pin, setPin] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const [allDomains, setAllDomains] = useState<string[]>([]);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [profile, setProfile] = useState<InterestProfile | null>(null);
  const [choice, setChoice] = useState<ChoiceView | null>(null);

  const [title, setTitle] = useState('');
  const [weeks, setWeeks] = useState(10);
  const [picked, setPicked] = useState<string[]>([]);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [reflect, setReflect] = useState('');

  const [cPrimary, setCPrimary] = useState('MATHEMATICS');
  const [cBackup, setCBackup] = useState('SCIENCE');
  const [cRationale, setCRationale] = useState('');
  const [cErr, setCErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    const [d, c, p, ch] = await Promise.all([
      api.get<{ domains: string[] }>('specialisation/domains'),
      api.get<{ cycles: Cycle[] }>(`specialisation/cycles?childId=${id}`),
      api.get<InterestProfile>(`children/${id}/interest-profile`),
      api.get<ChoiceView>(`children/${id}/specialisation-choice`),
    ]);
    setAllDomains(d.domains);
    setCycles(c.cycles);
    setProfile(p);
    setChoice(ch);
    setNeedPin(false);
  }, [id]);

  useEffect(() => {
    (async () => {
      try {
        const me = await api.get<Me>('auth/me');
        if (me.kind !== 'PARENT') return router.replace('/learn');
        if (me.pinVerified) await load();
        else setNeedPin(true);
      } catch {
        router.replace('/onboarding');
      }
    })();
  }, [router, load]);

  async function submitPin(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await api.post('auth/parent-pin/verify', { pin });
      await load();
    } catch {
      setErr('Mã PIN chưa đúng.');
    }
  }

  function toggle(d: string) {
    setPicked((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d]));
  }

  async function createCycle(e: React.FormEvent) {
    e.preventDefault();
    setFormErr(null);
    if (picked.length < 3) return setFormErr('Chọn ít nhất 3 lĩnh vực để trải nghiệm nhiều hướng.');
    if (!title.trim()) return setFormErr('Đặt tên cho chu kỳ.');
    try {
      await api.post('specialisation/cycles', {
        childId: id,
        title: title.trim(),
        domains: picked,
        plannedWeeks: weeks,
      });
      setTitle('');
      setPicked([]);
      setWeeks(10);
      await load();
    } catch {
      setFormErr('Không tạo được. Có thể đã có một chu kỳ đang chạy.');
    }
  }

  async function completeCycle(cid: string) {
    if (!reflect.trim()) return;
    await api.post(`specialisation/cycles/${cid}/complete`, { reflectionNote: reflect.trim() });
    setReflect('');
    await load();
  }

  async function saveChoice() {
    setCErr(null);
    if (cPrimary === cBackup) return setCErr('Môn chính và môn dự phòng phải khác nhau.');
    if (cRationale.trim().length < 4) return setCErr('Viết vài dòng lý do dựa trên trải nghiệm của con.');
    const body = { primarySubject: cPrimary, backupSubject: cBackup, rationale: cRationale.trim() };
    try {
      if (editing && choice?.current) {
        await api.put(`specialisation/choices/${choice.current.id}`, body);
      } else {
        await api.post('specialisation/choices', { childId: id, ...body });
      }
      setCRationale('');
      setEditing(false);
      await load();
    } catch (e) {
      const err = (e as { body?: { error?: string } }).body;
      setCErr(
        err?.error === 'need_completed_cycle'
          ? 'Cần hoàn thành ít nhất một chu kỳ trải nghiệm trước khi chốt.'
          : 'Không lưu được lựa chọn.',
      );
    }
  }

  async function withdrawChoice() {
    if (!choice?.current) return;
    await api.post(`specialisation/choices/${choice.current.id}/withdraw`, {});
    await load();
  }

  if (needPin) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
        <h1 className="text-xl font-bold">Nhập mã PIN</h1>
        {err && <p className="text-sm text-red-700">{err}</p>}
        <form onSubmit={submitPin} className="flex flex-col gap-3">
          <Field id="pin" label="Mã PIN" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} autoFocus />
          <Button type="submit">Mở</Button>
        </form>
      </main>
    );
  }
  if (!profile) return <main className="p-6 text-slate-500">Đang tải…</main>;

  const active = cycles.find((c) => c.status === 'ACTIVE') ?? null;

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Chu kỳ trải nghiệm & hứng thú</h1>
        <Link href={`/parent/child/${id}`}>
          <Button variant="ghost">← Tiến trình</Button>
        </Link>
      </header>

      <p data-testid="spec-disclaimer" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
        {profile.disclaimer}
      </p>

      {/* Chu kỳ trải nghiệm */}
      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Chu kỳ trải nghiệm (8–12 tuần, nhiều lĩnh vực)</h2>
        {cycles.length === 0 && <p className="text-sm text-slate-400">Chưa có chu kỳ nào.</p>}
        <ul className="flex flex-col gap-2">
          {cycles.map((c) => (
            <li key={c.id}>
              <Card className="flex flex-col gap-1" >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{c.title}</span>
                  <span
                    data-testid={`cycle-status-${c.id}`}
                    className={`rounded px-2 py-0.5 text-xs ${
                      c.status === 'ACTIVE'
                        ? 'bg-sky-100 text-sky-800'
                        : c.status === 'COMPLETED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {c.status === 'ACTIVE' ? 'đang chạy' : c.status === 'COMPLETED' ? 'đã khép lại' : 'đã dừng'}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  {c.plannedWeeks} tuần · {c.domains.map(dv).join(', ')}
                </p>
                {c.reflectionNote && <p className="text-xs text-slate-600">Ghi chú: {c.reflectionNote}</p>}
              </Card>
            </li>
          ))}
        </ul>

        {active ? (
          <Card className="flex flex-col gap-2">
            <p className="text-sm font-medium">Khép lại chu kỳ đang chạy</p>
            <textarea
              data-testid="cycle-reflect"
              className="min-h-20 rounded-lg border border-slate-300 p-2 text-sm"
              placeholder="Con thích nhất phần nào? Điều gì bất ngờ? (đây là tư liệu trải nghiệm, không phải kết luận môn chuyên)"
              value={reflect}
              onChange={(e) => setReflect(e.target.value)}
            />
            <Button data-testid="cycle-complete" disabled={!reflect.trim()} onClick={() => completeCycle(active.id)}>
              Khép lại chu kỳ
            </Button>
          </Card>
        ) : (
          <Card>
            <form onSubmit={createCycle} className="flex flex-col gap-3">
              <p className="text-sm font-medium">Tạo chu kỳ mới</p>
              {formErr && <p className="text-sm text-red-700">{formErr}</p>}
              <Field
                id="cycle-title"
                label="Tên chu kỳ"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                data-testid="cycle-title"
              />
              <label className="text-sm">
                Số tuần dự kiến: <strong>{weeks}</strong>
                <input
                  type="range"
                  min={8}
                  max={12}
                  value={weeks}
                  onChange={(e) => setWeeks(Number(e.target.value))}
                  className="ml-2 align-middle"
                  data-testid="cycle-weeks"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                {allDomains.map((d) => (
                  <button
                    type="button"
                    key={d}
                    onClick={() => toggle(d)}
                    data-testid={`domain-${d}`}
                    className={`rounded-full border px-3 py-1 text-xs ${
                      picked.includes(d)
                        ? 'border-sky-500 bg-sky-50 text-sky-800'
                        : 'border-slate-300 text-slate-600'
                    }`}
                  >
                    {dv(d)}
                  </button>
                ))}
              </div>
              <Button type="submit" data-testid="cycle-create">
                Tạo chu kỳ
              </Button>
            </form>
          </Card>
        )}
      </section>

      {/* Hồ sơ hứng thú */}
      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Hứng thú theo thời gian</h2>
        <div className="grid grid-cols-3 gap-2 text-center text-sm">
          <div className="rounded-lg border border-slate-200 p-2">
            <div className="text-lg font-semibold">{profile.summary.domainsWithSignal}</div>
            lĩnh vực có tín hiệu
          </div>
          <div className="rounded-lg border border-slate-200 p-2">
            <div className="text-lg font-semibold">{profile.summary.sustainedDomains}</div>
            hứng thú bền vững
          </div>
          <div className="rounded-lg border border-slate-200 p-2">
            <div className="text-lg font-semibold">{profile.summary.totalSignals}</div>
            tổng tín hiệu
          </div>
        </div>

        {profile.byDomain.length === 0 && (
          <p className="text-sm text-slate-400">Chưa có tín hiệu nào — bé làm vài nhiệm vụ hoặc ba/mẹ ghi lại quan sát.</p>
        )}
        <ul className="flex flex-col gap-2">
          {profile.byDomain.map((d) => (
            <li key={d.domain}>
              <Card className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{dv(d.domain)}</span>
                  <span className="flex items-center gap-1">
                    {d.sustained && (
                      <span
                        data-testid={`sustained-${d.domain}`}
                        className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800"
                      >
                        bền vững
                      </span>
                    )}
                    <span
                      data-testid={`trend-${d.domain}`}
                      className={`rounded px-2 py-0.5 text-xs ${TREND_VI[d.trend].cls}`}
                    >
                      {TREND_VI[d.trend].label}
                    </span>
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  {d.signalCount} tín hiệu · {d.distinctWeeks} tuần khác nhau
                  {d.latestStrength ? ` · gần nhất: ${d.latestStrength}` : ''}
                </p>
                <p className="text-xs text-slate-400">Nguồn: {d.sources.join(', ')}</p>
              </Card>
            </li>
          ))}
        </ul>

        {profile.crossoverHints.length > 0 && (
          <Card>
            <p className="text-sm font-medium">Giao thoa thế mạnh (bé đã kết hợp trong nhiệm vụ)</p>
            <ul className="mt-1 flex flex-col gap-1 text-sm text-slate-700">
              {profile.crossoverHints.slice(0, 6).map((c) => (
                <li key={c.domains.join('+')}>
                  • {dv(c.domains[0])} × {dv(c.domains[1])} <span className="text-slate-400">({c.sharedUnits} nhiệm vụ)</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      {/* Chốt môn chuyên (GĐ4b) */}
      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Chốt môn chuyên (chính + dự phòng)</h2>
        {choice && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900" data-testid="choice-disclaimer">
            {choice.disclaimer}
          </p>
        )}

        {choice?.current && !editing ? (
          <Card className="flex flex-col gap-2">
            <p className="text-sm" data-testid="choice-current">
              Môn chính: <strong>{dv(choice.current.primarySubject)}</strong> · Dự phòng:{' '}
              <strong>{dv(choice.current.backupSubject)}</strong>
            </p>
            <p className="text-xs text-slate-600">Lý do: {choice.current.rationale}</p>
            {choice.depthPlan && choice.depthPlan.items.length > 0 && (
              <div>
                <p className="text-xs font-medium">Kế hoạch chiều sâu</p>
                <ul className="mt-1 flex flex-col gap-1 text-xs text-slate-700">
                  {choice.depthPlan.items.map((it) => (
                    <li key={it.skillId} data-testid={`depth-${it.skillId}`}>
                      • {it.title ?? it.skillId}{' '}
                      <span className="text-slate-400">
                        [{it.forSubject === 'BOTH' ? 'cả hai' : it.forSubject === 'PRIMARY' ? 'chính' : 'dự phòng'}] ·{' '}
                        {it.notStarted ? 'chưa bắt đầu' : it.band}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex gap-2">
              <Button
                variant="ghost"
                data-testid="choice-edit"
                onClick={() => {
                  setEditing(true);
                  setCPrimary(choice.current!.primarySubject);
                  setCBackup(choice.current!.backupSubject);
                }}
              >
                Đổi lựa chọn
              </Button>
              <Button variant="ghost" data-testid="choice-withdraw" onClick={withdrawChoice}>
                Rút lại
              </Button>
            </div>
            {choice.history.length > 1 && (
              <p className="text-xs text-slate-400">Đã đổi {choice.history.length - 1} lần — lịch sử được lưu.</p>
            )}
          </Card>
        ) : (
          <Card className="flex flex-col gap-3">
            <p className="text-sm font-medium">{editing ? 'Đổi lựa chọn' : 'Chốt lần đầu'}</p>
            {cErr && <p className="text-sm text-red-700">{cErr}</p>}
            {!cycles.some((c) => c.status === 'COMPLETED') && !editing && (
              <p className="text-xs text-amber-800">
                Cần hoàn thành ít nhất một chu kỳ trải nghiệm trước — không chốt bằng một bài test.
              </p>
            )}
            <label className="text-sm">
              Môn chính:{' '}
              <select className="rounded border border-slate-300 px-2 py-1" value={cPrimary} onChange={(e) => setCPrimary(e.target.value)} data-testid="choice-primary">
                {SUBJECTS.map((s) => (
                  <option key={s} value={s}>{dv(s)}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Môn dự phòng:{' '}
              <select className="rounded border border-slate-300 px-2 py-1" value={cBackup} onChange={(e) => setCBackup(e.target.value)} data-testid="choice-backup">
                {SUBJECTS.map((s) => (
                  <option key={s} value={s}>{dv(s)}</option>
                ))}
              </select>
            </label>
            <textarea
              className="min-h-16 rounded-lg border border-slate-300 p-2 text-sm"
              placeholder="Lý do dựa trên trải nghiệm của con qua các chu kỳ…"
              value={cRationale}
              onChange={(e) => setCRationale(e.target.value)}
              data-testid="choice-rationale"
            />
            <div className="flex gap-2">
              <Button data-testid="choice-save" onClick={saveChoice}>
                {editing ? 'Lưu thay đổi' : 'Chốt'}
              </Button>
              {editing && (
                <Button variant="ghost" onClick={() => setEditing(false)}>
                  Huỷ
                </Button>
              )}
            </div>
          </Card>
        )}
      </section>
    </main>
  );
}
