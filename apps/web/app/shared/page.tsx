'use client';

import { useCallback, useEffect, useState } from 'react';
import { shared } from '@/lib/api';
import { Button, Card, Field } from '@/components/ui';
import { SectionView, SHARE_SECTION_LABEL as SECTION_LABEL } from '@/components/section-view';

interface Resolved {
  childDisplayName: string | null;
  role: 'TEACHER' | 'MENTOR';
  label: string | null;
  scope: Record<string, boolean>;
  expiresAt: string | null;
}

export default function SharedViewer() {
  const [token, setToken] = useState('');
  const [input, setInput] = useState('');
  const [info, setInfo] = useState<Resolved | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<string>('');
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let t = '';
    try {
      t = window.location.hash.replace(/^#/, '') || sessionStorage.getItem('tiny_share_token') || '';
    } catch {
      /* ignore */
    }
    if (t) setToken(t);
  }, []);

  const connect = useCallback(async (t: string) => {
    setErr(null);
    try {
      const r = await shared.get<Resolved>('shared/resolve', t);
      setInfo(r);
      try {
        sessionStorage.setItem('tiny_share_token', t);
      } catch {
        /* ignore */
      }
      const first = Object.keys(SECTION_LABEL).find((k) => r.scope?.[k]) ?? '';
      setTab(first);
    } catch {
      setErr('Liên kết không hợp lệ hoặc đã hết hạn.');
      setInfo(null);
    }
  }, []);

  useEffect(() => {
    if (token) void connect(token);
  }, [token, connect]);

  useEffect(() => {
    if (!token || !tab) return;
    setLoading(true);
    setData(null);
    shared
      .get<unknown>(`shared/${tab}`, token)
      .then(setData)
      .catch(() => setErr('Không tải được mục này.'))
      .finally(() => setLoading(false));
  }, [token, tab]);

  if (!info) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
        <h1 className="text-xl font-bold">Xem tiến trình được chia sẻ</h1>
        <p className="text-sm text-slate-500">Dán liên kết hoặc mã token mà phụ huynh gửi cho bạn.</p>
        {err && <p className="text-sm text-red-700">{err}</p>}
        <Field id="tok" label="Liên kết hoặc token" value={input} onChange={(e) => setInput(e.target.value)} data-testid="token-input" />
        <Button
          data-testid="token-connect"
          onClick={() => {
            const t = input.includes('#') ? input.split('#')[1]! : input.trim();
            setToken(t);
          }}
        >
          Mở
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 p-6">
      <header>
        <h1 className="text-xl font-bold" data-testid="shared-heading">
          {info.childDisplayName ?? 'Học sinh'}
        </h1>
        <p className="text-sm text-slate-500">
          Chia sẻ cho {info.role === 'TEACHER' ? 'giáo viên' : 'cố vấn'}
          {info.label ? ` · ${info.label}` : ''} · chỉ xem
          {info.expiresAt ? ` · hết hạn ${new Date(info.expiresAt).toLocaleDateString('vi-VN')}` : ''}
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {Object.keys(SECTION_LABEL)
          .filter((k) => info.scope?.[k])
          .map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              data-testid={`tab-${k}`}
              className={`rounded-full border px-3 py-1 text-sm ${tab === k ? 'border-sky-500 bg-sky-50 text-sky-800' : 'border-slate-300 text-slate-600'}`}
            >
              {SECTION_LABEL[k]}
            </button>
          ))}
      </div>

      {loading && <p className="text-sm text-slate-400">Đang tải…</p>}
      {!loading && data != null && (
        <Card>
          <SectionView section={tab} data={data} />
        </Card>
      )}
      {err && <p className="text-sm text-red-700">{err}</p>}
    </main>
  );
}
