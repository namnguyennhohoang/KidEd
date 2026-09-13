'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, type ChildProfile, type Me } from '@/lib/api';
import { Button, Card } from '@/components/ui';

export default function ParentHome() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [children, setChildren] = useState<ChildProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [timed, setTimed] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const m = await api.get<Me>('auth/me');
        if (m.kind === 'CHILD') {
          router.replace('/learn');
          return;
        }
        setMe(m);
        const list = await api.get<{ children: ChildProfile[] }>('children');
        setChildren(list.children);
      } catch {
        router.replace('/onboarding');
        return;
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  async function startForChild(id: string) {
    setStartingId(id);
    setError(null);
    try {
      const res = await api.post<{ childContext?: unknown }>(`children/${id}/child-session`);
      try {
        if (res.childContext)
          sessionStorage.setItem('tiny_child_ctx', JSON.stringify(res.childContext));
        sessionStorage.setItem('tiny_timed', timed ? '1' : '0');
      } catch {
        /* sessionStorage có thể bị chặn */
      }
      router.push('/learn');
    } catch {
      setError('Không mở được phiên học cho bé.');
      setStartingId(null);
    }
  }

  if (loading) return <main className="p-6 text-slate-500">Đang tải…</main>;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-sky-50">
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-6 sm:p-10">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-slate-900">
            Nhà của {me?.role === 'FAMILY_OWNER' ? 'bạn' : 'gia đình'}
          </h1>
          <span className="flex gap-4 text-sm">
            <Link href="/studio" className="text-sky-700 underline" data-testid="studio-link">
              Xưởng nội dung
            </Link>
            <Link
              href="/parent/admissions"
              className="text-sky-700 underline"
              data-testid="admissions-link"
            >
              Quy chế tuyển sinh
            </Link>
          </span>
          <Link href="/api/auth/logout" prefetch={false}>
            <Button
              variant="ghost"
              onClick={async (e) => {
                e.preventDefault();
                await api.post('auth/logout');
                router.replace('/');
              }}
            >
              Đăng xuất
            </Button>
          </Link>
        </header>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-base text-red-700">
            {error}
          </p>
        )}

        {children.length === 0 ? (
          <Card>
            <p className="mb-3 text-slate-600">Chưa có hồ sơ bé nào.</p>
            <Link href="/onboarding">
              <Button>Tạo hồ sơ cho bé</Button>
            </Link>
          </Card>
        ) : (
          <ul className="flex flex-col gap-4">
            <li>
              <label
                className="flex items-center gap-2 text-sm text-slate-600"
                data-testid="timed-toggle"
              >
                <input
                  type="checkbox"
                  checked={timed}
                  onChange={(e) => setTimed(e.target.checked)}
                />
                Luyện có tính giờ (đồng hồ đếm ngược theo thời lượng phiên; hết giờ chỉ nhắc nhẹ,
                không chấm điểm)
              </label>
            </li>
            {children.map((c) => (
              <li key={c.id}>
                <Card className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-lg font-medium">{c.displayName}</p>
                    <p className="text-sm text-slate-500">
                      Phiên {c.screenSessionMinutes} phút · {c.currentStage}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Link href={`/parent/child/${c.id}`}>
                      <Button variant="ghost" data-testid={`progress-${c.id}`}>
                        Xem tiến trình
                      </Button>
                    </Link>
                    <Button
                      data-testid={`start-${c.id}`}
                      disabled={startingId === c.id}
                      onClick={() => startForChild(c.id)}
                    >
                      {startingId === c.id ? 'Đang mở…' : 'Bắt đầu cho bé'}
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
