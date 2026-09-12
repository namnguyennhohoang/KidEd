'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, type Me } from '@/lib/api';
import { Button, Card, Field } from '@/components/ui';

interface Rule {
  id: string;
  institutionCode: string;
  institutionName: string;
  admissionYear: number;
  status: string;
  sourceUrl: string | null;
  staleness?: { stale: boolean; reasons: string[]; daysUntilReview: number | null };
}

const OVERLAYS = [
  { code: '', label: '— không gắn —' },
  { code: 'TDN_GRADE_6', label: 'Lớp 6 Trần Đại Nghĩa' },
  { code: 'TDN_SPECIALIZED_GRADE_10', label: 'Lớp 10 trường chuyên' },
  { code: 'GLOBAL_TOP_UNIVERSITY', label: 'Đại học quốc tế' },
];

function toIso(d: string): string | undefined {
  return d ? `${d}T00:00:00.000Z` : undefined;
}

export default function AdmissionsPage() {
  const router = useRouter();
  const [rules, setRules] = useState<Rule[]>([]);
  const [expiring, setExpiring] = useState(0);
  const [pin, setPin] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [r, e] = await Promise.all([
      api.get<{ rules: Rule[] }>('admissions/rules'),
      api.get<{ count: number }>('admissions/expiring?withinDays=120'),
    ]);
    setRules(r.rules);
    setExpiring(e.count);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const me = await api.get<Me>('auth/me');
        if (me.kind !== 'PARENT') return router.replace('/parent');
        await load();
      } catch {
        router.replace('/onboarding');
      }
    })();
  }, [router, load]);

  async function create(form: FormData) {
    setMsg(null);
    try {
      await api.post('admissions/rules', {
        institutionCode: String(form.get('institutionCode')).trim(),
        institutionName: String(form.get('institutionName')).trim(),
        admissionYear: Number(form.get('admissionYear')),
        targetOverlayCode: String(form.get('overlay')) || undefined,
        sourceUrl: String(form.get('sourceUrl')).trim() || undefined,
        sourceCheckedDate: toIso(String(form.get('sourceCheckedDate'))),
        reviewByDate: toIso(String(form.get('reviewByDate'))),
        notes: String(form.get('notes')).trim() || undefined,
      });
      setMsg('Đã tạo bản nháp quy chế.');
      await load();
    } catch (e) {
      setMsg((e as Error).message || 'Không tạo được.');
    }
  }

  async function act(id: string, path: string, needPin = false) {
    setMsg(null);
    try {
      if (needPin) {
        try {
          await api.post('auth/parent-pin/verify', { pin });
        } catch {
          setMsg('Mã PIN chưa đúng.');
          return;
        }
      }
      await api.post(`admissions/rules/${id}/${path}`);
      await load();
    } catch (e) {
      const body = (e as { body?: { error?: string; detail?: string } }).body;
      setMsg(body?.detail ?? body?.error ?? 'Thao tác lỗi.');
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Quy chế tuyển sinh</h1>
        <Link href="/parent">
          <Button variant="ghost">← Về</Button>
        </Link>
      </header>

      <p className="text-xs text-slate-500">
        Quy chế được lưu theo năm. Không mặc định quy chế hiện tại còn hiệu lực trong tương lai — luôn kiểm tra nguồn
        chính thức và ghi ngày xác minh.
      </p>

      {expiring > 0 && (
        <p data-testid="expiring-warning" className="rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900">
          {expiring} quy chế cần rà soát (sắp/đã lỗi thời).
        </p>
      )}
      {msg && <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm">{msg}</p>}

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="flex flex-col gap-2">
          <h2 className="font-semibold">Danh sách</h2>
          {rules.length === 0 && <p className="text-sm text-slate-400">Chưa có quy chế nào.</p>}
          <ul className="flex flex-col gap-2">
            {rules.map((r) => (
              <li key={r.id} className="rounded-lg border border-slate-200 p-3" data-testid={`rule-${r.id}`}>
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {r.institutionName} · {r.admissionYear}
                  </span>
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs" data-testid={`rule-status-${r.id}`}>
                    {r.status}
                  </span>
                </div>
                {r.staleness?.stale && (
                  <p className="mt-1 text-xs text-amber-700">⚠ {r.staleness.reasons.join('; ')}</p>
                )}
                <div className="mt-2 flex gap-2">
                  {r.status === 'DRAFT' && (
                    <Button variant="ghost" data-testid={`verify-${r.id}`} onClick={() => act(r.id, 'verify', true)}>
                      Xác minh (cần PIN)
                    </Button>
                  )}
                  {(r.status === 'VERIFIED' || r.status === 'DRAFT') && (
                    <Button variant="ghost" data-testid={`archive-${r.id}`} onClick={() => act(r.id, 'archive')}>
                      Lưu trữ
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <label className="mt-2 text-sm text-slate-600">
            Mã PIN (để xác minh)
            <input
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              data-testid="adm-pin"
            />
          </label>
        </Card>

        <Card>
          <h2 className="mb-2 font-semibold">Thêm quy chế</h2>
          <form action={create} className="flex flex-col gap-2">
            <Field id="institutionName" name="institutionName" label="Tên cơ sở" required />
            <Field id="institutionCode" name="institutionCode" label="Mã cơ sở (viết tắt)" required defaultValue="TDN" />
            <Field
              id="admissionYear"
              name="admissionYear"
              type="number"
              label="Năm tuyển sinh"
              required
              defaultValue={new Date().getFullYear() + 1}
            />
            <label className="text-sm">
              Overlay
              <select name="overlay" className="mt-1 w-full rounded border border-slate-300 px-2 py-1">
                {OVERLAYS.map((o) => (
                  <option key={o.code} value={o.code}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <Field id="sourceUrl" name="sourceUrl" label="URL nguồn chính thức" type="url" />
            <Field id="sourceCheckedDate" name="sourceCheckedDate" label="Ngày kiểm tra nguồn" type="date" />
            <Field id="reviewByDate" name="reviewByDate" label="Rà soát lại trước ngày" type="date" />
            <Field id="notes" name="notes" label="Ghi chú" />
            <Button type="submit" data-testid="adm-create">
              Tạo bản nháp
            </Button>
          </form>
        </Card>
      </div>
    </main>
  );
}
