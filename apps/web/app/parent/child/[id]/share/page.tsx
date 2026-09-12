'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, type Me } from '@/lib/api';
import { Button, Card, Field } from '@/components/ui';

interface Share {
  id: string;
  role: 'TEACHER' | 'MENTOR';
  scope: Record<string, boolean>;
  label: string | null;
  mode: 'LINK' | 'ACCOUNT';
  status: 'ACTIVE' | 'REVOKED' | 'PENDING';
  createdAt: string;
  expiresAt: string | null;
  lastAccessedAt: string | null;
}

const SECTIONS: Array<{ key: string; label: string }> = [
  { key: 'dashboard', label: 'Bảng tiến trình' },
  { key: 'readiness', label: 'Mức sẵn sàng theo kỹ năng' },
  { key: 'specialisation', label: 'Hứng thú & chu kỳ trải nghiệm' },
  { key: 'scholar', label: 'Dự án học giả' },
];
const ROLE_VI = { TEACHER: 'Giáo viên', MENTOR: 'Cố vấn' } as const;

export default function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [needPin, setNeedPin] = useState(false);
  const [pin, setPin] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [shares, setShares] = useState<Share[]>([]);

  const [role, setRole] = useState<'TEACHER' | 'MENTOR'>('TEACHER');
  const [scope, setScope] = useState<Record<string, boolean>>({ readiness: true });
  const [label, setLabel] = useState('');
  const [expiry, setExpiry] = useState('30');
  const [email, setEmail] = useState('');
  const [formErr, setFormErr] = useState<string | null>(null);
  const [freshLink, setFreshLink] = useState<string | null>(null);
  const [freshCode, setFreshCode] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await api.get<{ shares: Share[] }>(`children/${id}/shares`);
    setShares(r.shares);
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

  function toggleScope(k: string) {
    setScope((s) => ({ ...s, [k]: !s[k] }));
  }
  const scopePayload = () => Object.fromEntries(SECTIONS.map((s) => [s.key, !!scope[s.key]]));
  const anyScope = SECTIONS.some((s) => scope[s.key]);
  const expiresDays = expiry === '0' ? undefined : Number(expiry);

  async function createLink() {
    setFormErr(null);
    setFreshLink(null);
    if (!anyScope) return setFormErr('Chọn ít nhất một mục để chia sẻ.');
    try {
      const r = await api.post<{ token: string }>(`children/${id}/shares`, {
        role,
        scope: scopePayload(),
        label: label.trim() || undefined,
        expiresDays,
      });
      setFreshLink(`${window.location.origin}/shared#${r.token}`);
      setLabel('');
      await load();
    } catch {
      setFormErr('Không tạo được liên kết.');
    }
  }

  async function inviteEducator() {
    setFormErr(null);
    setFreshCode(null);
    if (!anyScope) return setFormErr('Chọn ít nhất một mục để chia sẻ.');
    if (!/.+@.+\..+/.test(email)) return setFormErr('Nhập email hợp lệ.');
    try {
      const r = await api.post<{ inviteCode: string }>(`children/${id}/educators`, {
        email: email.trim(),
        role,
        scope: scopePayload(),
        label: label.trim() || undefined,
        expiresDays,
      });
      setFreshCode(r.inviteCode);
      setEmail('');
      await load();
    } catch {
      setFormErr('Không gửi được lời mời.');
    }
  }

  async function revoke(sid: string) {
    await api.post(`shares/${sid}/revoke`, {});
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

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Chia sẻ cho giáo viên / cố vấn</h1>
        <Link href={`/parent/child/${id}`}>
          <Button variant="ghost">← Tiến trình</Button>
        </Link>
      </header>

      <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
        Người được chia sẻ chỉ XEM được đúng các mục bạn chọn — không sửa được gì, không thấy dữ liệu ngoài phạm vi.
        Bạn có thể thu hồi bất kỳ lúc nào.
      </p>

      <Card className="flex flex-col gap-3">
        <p className="text-sm font-medium">Phạm vi & vai trò</p>
        {formErr && <p className="text-sm text-red-700">{formErr}</p>}
        <label className="text-sm">
          Vai trò:{' '}
          <select className="rounded border border-slate-300 px-2 py-1" value={role} onChange={(e) => setRole(e.target.value as 'TEACHER' | 'MENTOR')} data-testid="share-role">
            <option value="TEACHER">Giáo viên</option>
            <option value="MENTOR">Cố vấn</option>
          </select>
        </label>
        <div className="flex flex-col gap-1">
          {SECTIONS.map((s) => (
            <label key={s.key} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!scope[s.key]} onChange={() => toggleScope(s.key)} data-testid={`scope-${s.key}`} />
              {s.label}
            </label>
          ))}
        </div>
        <Field id="share-label" label="Ghi chú (vd: Cô Lan – GVCN)" value={label} onChange={(e) => setLabel(e.target.value)} data-testid="share-label" />
        <label className="text-sm">
          Hết hạn sau:{' '}
          <select className="rounded border border-slate-300 px-2 py-1" value={expiry} onChange={(e) => setExpiry(e.target.value)} data-testid="share-expiry">
            <option value="7">7 ngày</option>
            <option value="30">30 ngày</option>
            <option value="90">90 ngày</option>
            <option value="0">Không hết hạn</option>
          </select>
        </label>

        <div className="flex flex-wrap gap-2">
          <Button data-testid="create-link" onClick={createLink}>Tạo liên kết chỉ-đọc</Button>
          <span className="flex items-center gap-2">
            <input
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="email giáo viên"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              data-testid="invite-email"
            />
            <Button variant="ghost" data-testid="invite-educator" onClick={inviteEducator}>Mời bằng tài khoản</Button>
          </span>
        </div>

        {freshLink && (
          <div className="rounded-lg bg-emerald-50 p-3 text-sm" data-testid="fresh-link">
            <p className="font-medium text-emerald-900">Liên kết (chỉ hiện một lần — hãy sao chép ngay):</p>
            <p className="mt-1 break-all font-mono text-xs">{freshLink}</p>
          </div>
        )}
        {freshCode && (
          <div className="rounded-lg bg-emerald-50 p-3 text-sm" data-testid="fresh-code">
            <p className="font-medium text-emerald-900">Mã mời (gửi cho giáo viên, chỉ hiện một lần):</p>
            <p className="mt-1 font-mono">{freshCode}</p>
          </div>
        )}
      </Card>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Đang chia sẻ</h2>
        {shares.length === 0 && <p className="text-sm text-slate-400">Chưa chia sẻ cho ai.</p>}
        {shares.map((s) => (
          <Card key={s.id} className="flex items-center justify-between gap-2" data-testid={`share-${s.id}`}>
            <div className="text-sm">
              <p className="font-medium">
                {s.label ?? ROLE_VI[s.role]}{' '}
                <span className="text-xs text-slate-400">
                  · {ROLE_VI[s.role]} · {s.mode === 'LINK' ? 'liên kết' : 'tài khoản'}
                </span>
              </p>
              <p className="text-xs text-slate-500">
                {SECTIONS.filter((x) => s.scope?.[x.key]).map((x) => x.label).join(', ') || '—'}
                {s.expiresAt ? ` · hết hạn ${new Date(s.expiresAt).toLocaleDateString('vi-VN')}` : ' · không hết hạn'}
              </p>
              <p className="text-xs text-slate-400">
                trạng thái: {s.status === 'ACTIVE' ? 'đang hiệu lực' : s.status === 'PENDING' ? 'chờ nhận lời' : 'đã thu hồi'}
                {s.lastAccessedAt ? ` · xem gần nhất ${new Date(s.lastAccessedAt).toLocaleDateString('vi-VN')}` : ''}
              </p>
            </div>
            {s.status !== 'REVOKED' && (
              <Button variant="ghost" data-testid={`revoke-${s.id}`} onClick={() => revoke(s.id)}>
                Thu hồi
              </Button>
            )}
          </Card>
        ))}
      </section>
    </main>
  );
}
