'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, type Me } from '@/lib/api';
import { Button, Card, Field } from '@/components/ui';
import { SectionView, SHARE_SECTION_LABEL as SECTION_LABEL } from '@/components/section-view';

interface Assigned {
  shareId: string;
  childProfileId: string;
  childDisplayName: string | null;
  role: 'TEACHER' | 'MENTOR';
  label: string | null;
  scope: Record<string, boolean>;
}

export default function EducatorPortal() {
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<'TEACHER' | 'MENTOR'>('TEACHER');
  const [authErr, setAuthErr] = useState<string | null>(null);

  const [code, setCode] = useState('');
  const [codeMsg, setCodeMsg] = useState<string | null>(null);
  const [children, setChildren] = useState<Assigned[]>([]);
  const [sel, setSel] = useState<{ child: Assigned; tab: string } | null>(null);
  const [secData, setSecData] = useState<unknown>(null);

  const loadChildren = useCallback(async () => {
    const r = await api.get<{ children: Assigned[] }>('educator/children');
    setChildren(r.children);
  }, []);

  const refreshMe = useCallback(async () => {
    try {
      const m = await api.get<Me>('auth/me');
      setMe(m);
      if (m.kind === 'TEACHER' || m.kind === 'MENTOR') await loadChildren();
    } catch {
      setMe(null);
    } finally {
      setReady(true);
    }
  }, [loadChildren]);

  useEffect(() => {
    void refreshMe();
  }, [refreshMe]);

  useEffect(() => {
    if (!sel) return;
    setSecData(null);
    api
      .get<unknown>(`educator/children/${sel.child.childProfileId}/${sel.tab}`)
      .then(setSecData)
      .catch(() => setSecData({ error: true }));
  }, [sel]);

  async function submitAuth(e: React.FormEvent) {
    e.preventDefault();
    setAuthErr(null);
    try {
      if (mode === 'register') {
        await api.post('auth/register-educator', { email, password, displayName, role });
      } else {
        await api.post('auth/login', { email, password });
      }
      await refreshMe();
    } catch (err) {
      const b = (err as { body?: { error?: string } }).body;
      setAuthErr(
        b?.error === 'email_taken'
          ? 'Email đã được dùng — hãy đăng nhập.'
          : b?.error === 'invalid_credentials'
            ? 'Email hoặc mật khẩu chưa đúng.'
            : 'Không thực hiện được.',
      );
    }
  }

  async function redeem() {
    setCodeMsg(null);
    try {
      await api.post('educator/invites/accept', { code: code.trim() });
      setCode('');
      setCodeMsg('Đã nhận lời mời.');
      await loadChildren();
    } catch (err) {
      const b = (err as { body?: { error?: string } }).body;
      setCodeMsg(
        b?.error === 'invite_email_mismatch'
          ? 'Mã này dành cho một email khác.'
          : 'Mã không hợp lệ hoặc đã hết hạn.',
      );
    }
  }

  async function logout() {
    await api.post('auth/logout');
    setMe(null);
    setChildren([]);
    setSel(null);
  }

  if (!ready) return <main className="p-6 text-slate-500">Đang tải…</main>;

  const isEducator = me?.kind === 'TEACHER' || me?.kind === 'MENTOR';

  if (!isEducator) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
        <h1 className="text-xl font-bold">Cổng giáo viên / cố vấn</h1>
        {me && <p className="text-sm text-amber-800">Bạn đang đăng nhập bằng tài khoản phụ huynh. Hãy đăng xuất rồi dùng tài khoản giáo viên.</p>}
        <div className="flex gap-2 text-sm">
          <button onClick={() => setMode('login')} className={mode === 'login' ? 'font-semibold underline' : 'text-slate-500'}>
            Đăng nhập
          </button>
          <button onClick={() => setMode('register')} className={mode === 'register' ? 'font-semibold underline' : 'text-slate-500'}>
            Tạo tài khoản
          </button>
        </div>
        {authErr && <p className="text-sm text-red-700">{authErr}</p>}
        <form onSubmit={submitAuth} className="flex flex-col gap-3">
          {mode === 'register' && (
            <>
              <Field id="dn" label="Tên hiển thị" value={displayName} onChange={(e) => setDisplayName(e.target.value)} data-testid="edu-name" />
              <label className="text-sm">
                Vai trò:{' '}
                <select className="rounded border border-slate-300 px-2 py-1" value={role} onChange={(e) => setRole(e.target.value as 'TEACHER' | 'MENTOR')} data-testid="edu-role">
                  <option value="TEACHER">Giáo viên</option>
                  <option value="MENTOR">Cố vấn</option>
                </select>
              </label>
            </>
          )}
          <Field id="em" label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="edu-email" />
          <Field id="pw" label="Mật khẩu (≥ 8 ký tự)" type="password" value={password} onChange={(e) => setPassword(e.target.value)} data-testid="edu-password" />
          <Button type="submit" data-testid="edu-submit">
            {mode === 'register' ? 'Tạo tài khoản' : 'Đăng nhập'}
          </Button>
        </form>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Cổng {me?.kind === 'MENTOR' ? 'cố vấn' : 'giáo viên'}</h1>
        <Button variant="ghost" onClick={logout} data-testid="edu-logout">Đăng xuất</Button>
      </header>

      <Card className="flex flex-col gap-2">
        <p className="text-sm font-medium">Nhận lời mời</p>
        {codeMsg && <p className="text-sm text-slate-600" data-testid="code-msg">{codeMsg}</p>}
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="dán mã mời"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            data-testid="invite-code"
          />
          <Button data-testid="redeem" onClick={redeem}>Nhận</Button>
        </div>
      </Card>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Học sinh được chia sẻ</h2>
        {children.length === 0 && <p className="text-sm text-slate-400">Chưa có. Nhập mã mời ở trên.</p>}
        {children.map((c) => (
          <Card key={c.shareId} className="flex flex-col gap-2" data-testid={`edu-child-${c.childProfileId}`}>
            <p className="font-medium">
              {c.childDisplayName ?? 'Học sinh'}{' '}
              <span className="text-xs text-slate-400">· {c.label ?? (c.role === 'MENTOR' ? 'cố vấn' : 'giáo viên')}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {Object.keys(SECTION_LABEL)
                .filter((k) => c.scope?.[k])
                .map((k) => (
                  <button
                    key={k}
                    onClick={() => setSel({ child: c, tab: k })}
                    data-testid={`edu-tab-${c.childProfileId}-${k}`}
                    className={`rounded-full border px-3 py-1 text-xs ${
                      sel?.child.childProfileId === c.childProfileId && sel?.tab === k
                        ? 'border-sky-500 bg-sky-50 text-sky-800'
                        : 'border-slate-300 text-slate-600'
                    }`}
                  >
                    {SECTION_LABEL[k]}
                  </button>
                ))}
            </div>
            {sel?.child.childProfileId === c.childProfileId && (
              <div className="rounded-lg bg-slate-50 p-3">
                {secData == null ? (
                  <p className="text-sm text-slate-400">Đang tải…</p>
                ) : (secData as { error?: boolean }).error ? (
                  <p className="text-sm text-red-700">Không tải được.</p>
                ) : (
                  <SectionView section={sel.tab} data={secData} />
                )}
              </div>
            )}
          </Card>
        ))}
      </section>
    </main>
  );
}
