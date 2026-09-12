'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, type Me } from '@/lib/api';
import { Button, Card, Field } from '@/components/ui';

interface SkillReadiness {
  skillId: string;
  title: string | null;
  group: string | null;
  evidenceCount: number;
  latestStrength: string | null;
  band: 'EMERGING' | 'DEVELOPING' | 'SECURE';
  confidence: 'LOW' | 'MED' | 'HIGH';
  errorCauses: Record<string, number>;
  notStarted: boolean;
}
interface Readiness {
  overlay: string | null;
  bySkill: SkillReadiness[];
  summary: { skillsTracked: number; secure: number; developing: number; emerging: number; notStarted: number };
  disclaimer: string;
}

const OVERLAYS = [
  { code: '', label: 'Tất cả kỹ năng' },
  { code: 'TDN_GRADE_6', label: 'Lớp 6 Trần Đại Nghĩa' },
  { code: 'TDN_SPECIALIZED_GRADE_10', label: 'Lớp 10 trường chuyên' },
  { code: 'GLOBAL_TOP_UNIVERSITY', label: 'Đại học quốc tế' },
];

const BAND_COLOR: Record<string, string> = {
  EMERGING: 'bg-slate-100 text-slate-700',
  DEVELOPING: 'bg-sky-100 text-sky-800',
  SECURE: 'bg-emerald-100 text-emerald-800',
};

export default function ReadinessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [needPin, setNeedPin] = useState(false);
  const [pin, setPin] = useState('');
  const [data, setData] = useState<Readiness | null>(null);
  const [overlay, setOverlay] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const loadReadiness = useCallback(
    async (ovl = overlay) => {
      const qs = ovl ? `?overlay=${ovl}` : '';
      const r = await api.get<Readiness>(`children/${id}/readiness${qs}`);
      setData(r);
      setNeedPin(false);
    },
    [id, overlay],
  );

  useEffect(() => {
    (async () => {
      try {
        const me = await api.get<Me>('auth/me');
        if (me.kind !== 'PARENT') return router.replace('/learn');
        if (me.pinVerified) await loadReadiness();
        else setNeedPin(true);
      } catch {
        router.replace('/onboarding');
      }
    })();
  }, [router, loadReadiness]);

  async function submitPin(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await api.post('auth/parent-pin/verify', { pin });
      await loadReadiness();
    } catch {
      setErr('Mã PIN chưa đúng.');
    }
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
  if (!data) return <main className="p-6 text-slate-500">Đang tải…</main>;

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Mức sẵn sàng theo kỹ năng</h1>
        <Link href={`/parent/child/${id}`}>
          <Button variant="ghost">← Tiến trình</Button>
        </Link>
      </header>

      <p data-testid="readiness-disclaimer" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
        {data.disclaimer}
      </p>

      <label className="text-sm">
        Xem theo mục tiêu:{' '}
        <select
          className="rounded border border-slate-300 px-2 py-1"
          value={overlay}
          onChange={(e) => {
            setOverlay(e.target.value);
            void loadReadiness(e.target.value);
          }}
        >
          {OVERLAYS.map((o) => (
            <option key={o.code} value={o.code}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-5 gap-2 text-center text-sm">
        <div className="rounded-lg border border-slate-200 p-2">
          <div className="text-lg font-semibold">{data.summary.skillsTracked}</div>
          kỹ năng theo dõi
        </div>
        <div className="rounded-lg border border-slate-200 p-2">
          <div className="text-lg font-semibold">{data.summary.secure}</div>
          vững
        </div>
        <div className="rounded-lg border border-slate-200 p-2">
          <div className="text-lg font-semibold">{data.summary.developing}</div>
          đang phát triển
        </div>
        <div className="rounded-lg border border-slate-200 p-2">
          <div className="text-lg font-semibold">{data.summary.emerging}</div>
          mới bắt đầu
        </div>
        <div className="rounded-lg border border-slate-200 p-2">
          <div className="text-lg font-semibold">{data.summary.notStarted}</div>
          chưa đụng tới
        </div>
      </div>

      {data.bySkill.length === 0 && (
        <p className="text-sm text-slate-400">Chưa có minh chứng nào — bé làm vài nhiệm vụ rồi quay lại nhé.</p>
      )}
      <ul className="flex flex-col gap-2">
        {data.bySkill.map((s) => (
          <li key={s.skillId}>
            <Card className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="font-medium">
                  {s.title ?? s.skillId}
                  {s.group && <span className="ml-2 text-xs text-slate-400">{s.group}</span>}
                </span>
                {s.notStarted ? (
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500" data-testid={`band-${s.skillId}`}>
                    chưa bắt đầu
                  </span>
                ) : (
                  <span className={`rounded px-2 py-0.5 text-xs ${BAND_COLOR[s.band]}`} data-testid={`band-${s.skillId}`}>
                    {s.band} · độ tin cậy {s.confidence}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                {s.evidenceCount} minh chứng{s.latestStrength ? ` · gần nhất: ${s.latestStrength}` : ''}
              </p>
              {Object.keys(s.errorCauses).length > 0 && (
                <p className="text-xs text-slate-600">
                  Nguyên nhân lỗi ghi nhận:{' '}
                  {Object.entries(s.errorCauses)
                    .map(([c, n]) => `${c}×${n}`)
                    .join(', ')}
                </p>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </main>
  );
}
