'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, type Dashboard, type Me } from '@/lib/api';
import { Button, Card, Field } from '@/components/ui';

export default function ChildDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [needPin, setNeedPin] = useState(false);
  const [pin, setPin] = useState('');
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [obsText, setObsText] = useState('');
  const [exportUrl, setExportUrl] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    const res = await api.get<{ displayName: string; dashboard: Dashboard }>(`children/${id}/dashboard`);
    setDisplayName(res.displayName);
    setDash(res.dashboard);
    setNeedPin(false);
  }, [id]);

  useEffect(() => {
    (async () => {
      try {
        const m = await api.get<Me>('auth/me');
        if (m.kind !== 'PARENT') return router.replace('/learn');
        setMe(m);
        if (m.pinVerified) await loadDashboard();
        else setNeedPin(true);
      } catch {
        router.replace('/onboarding');
      }
    })();
  }, [router, loadDashboard]);

  async function submitPin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post('auth/parent-pin/verify', { pin });
      await loadDashboard();
    } catch {
      setError('Mã PIN chưa đúng.');
    }
  }

  async function addObservation(e: React.FormEvent) {
    e.preventDefault();
    if (!obsText.trim()) return;
    await api.post(`children/${id}/observations`, { text: obsText.trim() });
    setObsText('');
    await loadDashboard();
  }

  async function requestExport() {
    if (!me?.familyId) return;
    const res = await api.post<{ downloadPath: string }>(`families/${me.familyId}/data-requests`, {
      kind: 'EXPORT',
    });
    setExportUrl(`/api${res.downloadPath}`);
  }

  if (needPin) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
        <h1 className="text-xl font-bold">Nhập mã PIN để xem tiến trình</h1>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <form onSubmit={submitPin} className="flex flex-col gap-3">
          <Field
            id="pin"
            label="Mã PIN"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            autoFocus
          />
          <Button type="submit">Mở</Button>
        </form>
      </main>
    );
  }

  if (!dash) return <main className="p-6 text-slate-500">Đang tải…</main>;

  const pct = (n: number | null) => (n === null ? '—' : `${Math.round(n * 100)}%`);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Tiến trình của {displayName}</h1>
        <span className="flex gap-2">
          <Link href={`/parent/child/${id}/readiness`}>
            <Button variant="ghost" data-testid="readiness-link">
              Mức sẵn sàng
            </Button>
          </Link>
          <Link href={`/parent/child/${id}/specialisation`}>
            <Button variant="ghost" data-testid="specialisation-link">
              Hứng thú
            </Button>
          </Link>
          <Link href={`/parent/child/${id}/scholar`}>
            <Button variant="ghost" data-testid="scholar-link">
              Dự án
            </Button>
          </Link>
          <Link href={`/parent/child/${id}/share`}>
            <Button variant="ghost" data-testid="share-link">
              Chia sẻ
            </Button>
          </Link>
          <Link href="/parent">
            <Button variant="ghost">← Về</Button>
          </Link>
        </span>
      </header>

      <Card>
        <p className="text-sm font-medium text-slate-500">Gợi ý cho tuần này</p>
        <p className="mt-1" data-testid="suggested-action">
          {dash.suggestedNextAction}
        </p>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Phiên đã hoàn thành" value={String(dash.independence.completedSessions)} testid="completed-sessions" />
        <Stat label="Tự hoàn thành (không xin gợi ý)" value={pct(dash.independence.independentCompletionRate)} />
        <Stat
          label="Mức gợi ý trung vị"
          value={dash.hints.medianLevel === null ? '—' : String(dash.hints.medianLevel)}
          hint={dash.hints.trend ? { down: 'đang giảm', flat: 'ổn định', up: 'đang tăng' }[dash.hints.trend] : undefined}
        />
        <Stat label="Số chiến lược / phiên" value={dash.strategies.averagePerSession === null ? '—' : String(dash.strategies.averagePerSession)} />
        <Stat label="Lần tự nhìn lại (reflection)" value={String(dash.explanation.reflectionsCompleted)} />
        <Stat label="Minh chứng kỹ năng" value={`${dash.skillEvidence.count} (${dash.skillEvidence.distinctSkills} kỹ năng)`} />
      </div>

      <Card>
        <h2 className="font-semibold">Quan sát của ba/mẹ</h2>
        <ul className="mt-2 flex flex-col gap-1 text-sm text-slate-700">
          {dash.recentObservations.length === 0 && <li className="text-slate-400">Chưa có ghi chú.</li>}
          {dash.recentObservations.map((o, i) => (
            <li key={i}>• {o.text}</li>
          ))}
        </ul>
        <form onSubmit={addObservation} className="mt-3 flex gap-2">
          <input
            data-testid="obs-input"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Ghi lại một điều con làm được…"
            value={obsText}
            onChange={(e) => setObsText(e.target.value)}
          />
          <Button type="submit" data-testid="obs-submit">
            Lưu
          </Button>
        </form>
      </Card>

      <Card className="flex items-center justify-between">
        <div>
          <p className="font-semibold">Dữ liệu của gia đình</p>
          <p className="text-sm text-slate-500">Bạn có thể tải toàn bộ dữ liệu bất kỳ lúc nào.</p>
        </div>
        {exportUrl ? (
          <a href={exportUrl} className="text-sky-700 underline" data-testid="export-link">
            Tải tệp
          </a>
        ) : (
          <Button variant="ghost" data-testid="export-btn" onClick={requestExport}>
            Tạo bản export
          </Button>
        )}
      </Card>

      <p className="text-center text-xs text-slate-400">
        Bảng này không xếp hạng và không dự đoán kết quả thi cử.
      </p>
    </main>
  );
}

function Stat({
  label,
  value,
  hint,
  testid,
}: {
  label: string;
  value: string;
  hint?: string | undefined;
  testid?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold" data-testid={testid}>
        {value}
      </p>
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  );
}
