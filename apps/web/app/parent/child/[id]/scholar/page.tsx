'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, type Me } from '@/lib/api';
import { Button, Card, Field } from '@/components/ui';

interface Contribution {
  id: string;
  kind: string;
  summary: string;
  aiAssistanceLevel: string;
  aiAssistanceNote: string | null;
  hoursSpent: number | null;
  occurredOn: string;
}
interface Project {
  id: string;
  title: string;
  drivingQuestion: string;
  pathway: string;
  disciplines: string[];
  targetMonths: number;
  status: 'ACTIVE' | 'COMPLETED' | 'SHELVED';
  reflectionNote: string | null;
  contributions: Contribution[];
}
interface Meta {
  pathways: string[];
  contributionKinds: string[];
  aiAssistanceLevels: string[];
  aiNoteMinLength: number;
}
interface Portfolio {
  projects: Array<{
    id: string;
    title: string;
    contributionCount: number;
    aiAssistanceBreakdown: Record<string, number>;
    humanLedShare: number | null;
    provenanceGaps: number;
  }>;
  tShape: {
    breadthDisciplines: string[];
    breadthCount: number;
    depthSubject: string | null;
    depthSecureOrDeveloping: number;
    hasSpike: boolean;
  };
  pathwayReferences: Array<{ pathway: string; verified: number; draft: number; needsReview: number; institutions: string[] }>;
  aiAssistanceBreakdown: Record<string, number>;
  humanLedShare: number | null;
  disclaimer: string;
}

const PATHWAY_VI: Record<string, string> = {
  US: 'Mỹ', UK: 'Anh', SG: 'Singapore', CA: 'Canada', AU: 'Úc', UNDECIDED: 'Chưa chọn',
};
const KIND_VI: Record<string, string> = {
  RESEARCH: 'Nghiên cứu', BUILD: 'Chế tạo', WRITE: 'Viết', FIELDWORK: 'Thực địa', REVISION: 'Chỉnh sửa', OUTREACH: 'Kết nối cộng đồng',
};
const AI_VI: Record<string, string> = {
  NONE: 'Không dùng AI',
  HINTS_ONLY: 'Chỉ gợi ý',
  CO_CREATED_TOOL: 'Đồng tạo bằng công cụ AI',
  AI_GENERATED_DRAFT: 'AI viết bản nháp',
};
const NOTE_REQUIRED = new Set(['CO_CREATED_TOOL', 'AI_GENERATED_DRAFT']);
const DISCIPLINES = [
  'MATHEMATICS', 'SCIENCE', 'ENGLISH', 'VIETNAMESE_LITERACY', 'SOCIAL_STUDIES',
  'ART_DESIGN', 'MUSIC_PIANO', 'DIGITAL_AI_LITERACY', 'COMMUNICATION',
];
const DISC_VI: Record<string, string> = {
  MATHEMATICS: 'Toán', SCIENCE: 'Khoa học', ENGLISH: 'Tiếng Anh', VIETNAMESE_LITERACY: 'Tiếng Việt',
  SOCIAL_STUDIES: 'Xã hội', ART_DESIGN: 'Mỹ thuật', MUSIC_PIANO: 'Âm nhạc', DIGITAL_AI_LITERACY: 'Công nghệ – AI',
  COMMUNICATION: 'Giao tiếp',
};

export default function ScholarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [needPin, setNeedPin] = useState(false);
  const [pin, setPin] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const [meta, setMeta] = useState<Meta | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);

  const [pTitle, setPTitle] = useState('');
  const [pQuestion, setPQuestion] = useState('');
  const [pPathway, setPPathway] = useState('UNDECIDED');
  const [pDisc, setPDisc] = useState<string[]>([]);
  const [pMonths, setPMonths] = useState(6);
  const [pErr, setPErr] = useState<string | null>(null);

  const [cKind, setCKind] = useState('RESEARCH');
  const [cSummary, setCSummary] = useState('');
  const [cAi, setCAi] = useState('NONE');
  const [cNote, setCNote] = useState('');
  const [cErr, setCErr] = useState<string | null>(null);
  const [reflect, setReflect] = useState('');

  const load = useCallback(async () => {
    const [m, pr, pf] = await Promise.all([
      api.get<Meta>('scholar/meta'),
      api.get<{ projects: Project[] }>(`scholar/projects?childId=${id}`),
      api.get<Portfolio>(`children/${id}/scholar-portfolio`),
    ]);
    setMeta(m);
    setProjects(pr.projects);
    setPortfolio(pf);
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

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    setPErr(null);
    if (pDisc.length < 1) return setPErr('Chọn ít nhất một lĩnh vực.');
    if (!pTitle.trim() || !pQuestion.trim()) return setPErr('Điền tên và câu hỏi dẫn dắt.');
    try {
      await api.post('scholar/projects', {
        childId: id,
        title: pTitle.trim(),
        drivingQuestion: pQuestion.trim(),
        pathway: pPathway,
        disciplines: pDisc,
        targetMonths: pMonths,
      });
      setPTitle(''); setPQuestion(''); setPDisc([]); setPMonths(6); setPPathway('UNDECIDED');
      await load();
    } catch (e) {
      const b = (e as { body?: { error?: string } }).body;
      setPErr(b?.error === 'too_many_active_projects' ? 'Đang có 2 dự án chạy — hoàn thành bớt trước.' : 'Không tạo được dự án.');
    }
  }

  async function addContribution(projectId: string) {
    setCErr(null);
    if (!cSummary.trim()) return setCErr('Mô tả việc con đã làm.');
    if (NOTE_REQUIRED.has(cAi) && cNote.trim().length < (meta?.aiNoteMinLength ?? 12)) {
      return setCErr(`Khai báo cụ thể AI đã làm gì (≥ ${meta?.aiNoteMinLength ?? 12} ký tự).`);
    }
    try {
      await api.post(`scholar/projects/${projectId}/contributions`, {
        kind: cKind,
        summary: cSummary.trim(),
        aiAssistanceLevel: cAi,
        aiAssistanceNote: cNote.trim() || undefined,
      });
      setCSummary(''); setCNote(''); setCAi('NONE'); setCKind('RESEARCH');
      await load();
    } catch (e) {
      const b = (e as { body?: { error?: string } }).body;
      setCErr(b?.error === 'ai_note_required' ? 'Cần khai báo cụ thể phần AI hỗ trợ.' : 'Không ghi được đóng góp.');
    }
  }

  async function complete(projectId: string) {
    if (!reflect.trim()) return;
    await api.post(`scholar/projects/${projectId}/complete`, { reflectionNote: reflect.trim() });
    setReflect('');
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
  if (!portfolio || !meta) return <main className="p-6 text-slate-500">Đang tải…</main>;

  const active = projects.filter((p) => p.status === 'ACTIVE');
  const ts = portfolio.tShape;

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Dự án học giả</h1>
        <Link href={`/parent/child/${id}`}>
          <Button variant="ghost">← Tiến trình</Button>
        </Link>
      </header>

      <p data-testid="scholar-disclaimer" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
        {portfolio.disclaimer}
      </p>

      {/* Hồ sơ chữ T + kê khai AI */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card className="flex flex-col gap-1">
          <p className="text-sm font-medium">Hồ sơ chữ T</p>
          <p className="text-xs text-slate-600" data-testid="tshape-breadth">
            Bề rộng: {ts.breadthCount} lĩnh vực
          </p>
          <p className="text-xs text-slate-600" data-testid="tshape-depth">
            Chiều sâu: {ts.depthSubject ? `${DISC_VI[ts.depthSubject] ?? ts.depthSubject} · ${ts.depthSecureOrDeveloping} kỹ năng vững/đang lên` : 'chưa chốt môn chuyên'}
          </p>
          <p className="text-xs text-slate-500">{ts.hasSpike ? 'Đã có một mũi nhọn.' : 'Chưa hình thành mũi nhọn rõ.'}</p>
        </Card>
        <Card className="flex flex-col gap-1">
          <p className="text-sm font-medium">Kê khai hỗ trợ của AI</p>
          {Object.entries(portfolio.aiAssistanceBreakdown).map(([lvl, n]) => (
            <p key={lvl} className="text-xs text-slate-600">
              {AI_VI[lvl] ?? lvl}: <strong>{n}</strong>
            </p>
          ))}
          <p className="text-xs text-slate-500" data-testid="human-led-share">
            Do con dẫn dắt: {portfolio.humanLedShare === null ? '—' : `${Math.round(portfolio.humanLedShare * 100)}%`}
          </p>
        </Card>
      </section>

      {portfolio.pathwayReferences.length > 0 && (
        <Card className="flex flex-col gap-1">
          <p className="text-sm font-medium">Quy chế đã theo dõi theo lộ trình</p>
          {portfolio.pathwayReferences.map((r) => (
            <p key={r.pathway} className="text-xs text-slate-600" data-testid={`pathway-ref-${r.pathway}`}>
              {PATHWAY_VI[r.pathway] ?? r.pathway}: {r.verified} đã xác minh
              {r.draft ? ` · ${r.draft} bản nháp` : ''}
              {r.needsReview ? ` · ${r.needsReview} cần rà soát` : ''}
              {r.institutions.length ? ` (${r.institutions.join(', ')})` : ''}
            </p>
          ))}
          <p className="text-xs text-slate-400">
            <Link href="/parent/admissions" className="underline">Quản lý quy chế tuyển sinh</Link> — đây là tư liệu tham chiếu, không phải dự báo.
          </p>
        </Card>
      )}

      {/* Danh sách dự án */}
      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Dự án</h2>
        {projects.length === 0 && <p className="text-sm text-slate-400">Chưa có dự án nào.</p>}
        {projects.map((p) => (
          <Card key={p.id} className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="font-medium">{p.title}</span>
              <span
                data-testid={`project-status-${p.id}`}
                className={`rounded px-2 py-0.5 text-xs ${
                  p.status === 'ACTIVE' ? 'bg-sky-100 text-sky-800' : p.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {p.status === 'ACTIVE' ? 'đang làm' : p.status === 'COMPLETED' ? 'hoàn thành' : 'tạm gác'}
              </span>
            </div>
            <p className="text-xs text-slate-600">“{p.drivingQuestion}”</p>
            <p className="text-xs text-slate-400">
              Lộ trình {PATHWAY_VI[p.pathway] ?? p.pathway} · {p.targetMonths} tháng · {p.disciplines.map((d) => DISC_VI[d] ?? d).join(', ')}
            </p>

            <ul className="flex flex-col gap-1 border-l-2 border-slate-100 pl-3 text-xs text-slate-700">
              {p.contributions.length === 0 && <li className="text-slate-400">Chưa có mốc nào.</li>}
              {p.contributions.map((c) => (
                <li key={c.id}>
                  <span className="font-medium">{KIND_VI[c.kind] ?? c.kind}:</span> {c.summary}
                  <span className="ml-1 text-slate-400">[{AI_VI[c.aiAssistanceLevel] ?? c.aiAssistanceLevel}]</span>
                  {c.aiAssistanceNote && <span className="block text-slate-500">↳ {c.aiAssistanceNote}</span>}
                </li>
              ))}
            </ul>

            {p.status === 'ACTIVE' && (
              <div className="flex flex-col gap-2 rounded-lg bg-slate-50 p-3">
                <p className="text-xs font-medium">Ghi một mốc</p>
                {cErr && <p className="text-xs text-red-700">{cErr}</p>}
                <div className="flex flex-wrap gap-2">
                  <select className="rounded border border-slate-300 px-2 py-1 text-sm" value={cKind} onChange={(e) => setCKind(e.target.value)} data-testid="contrib-kind">
                    {meta.contributionKinds.map((k) => (
                      <option key={k} value={k}>{KIND_VI[k] ?? k}</option>
                    ))}
                  </select>
                  <select className="rounded border border-slate-300 px-2 py-1 text-sm" value={cAi} onChange={(e) => setCAi(e.target.value)} data-testid="contrib-ai">
                    {meta.aiAssistanceLevels.map((l) => (
                      <option key={l} value={l}>{AI_VI[l] ?? l}</option>
                    ))}
                  </select>
                </div>
                <input
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Con đã làm gì?"
                  value={cSummary}
                  onChange={(e) => setCSummary(e.target.value)}
                  data-testid="contrib-summary"
                />
                {NOTE_REQUIRED.has(cAi) && (
                  <textarea
                    className="min-h-16 rounded-lg border border-amber-300 p-2 text-sm"
                    placeholder={`AI đã làm CỤ THỂ những gì? (≥ ${meta.aiNoteMinLength} ký tự — bắt buộc)`}
                    value={cNote}
                    onChange={(e) => setCNote(e.target.value)}
                    data-testid="contrib-note"
                  />
                )}
                <Button data-testid="contrib-add" onClick={() => addContribution(p.id)}>Ghi mốc</Button>

                <p className="mt-2 text-xs font-medium">Hoàn thành dự án</p>
                <textarea
                  className="min-h-16 rounded-lg border border-slate-300 p-2 text-sm"
                  placeholder="Kết quả & điều học được…"
                  value={reflect}
                  onChange={(e) => setReflect(e.target.value)}
                  data-testid="project-reflect"
                />
                <Button variant="ghost" data-testid="project-complete" disabled={!reflect.trim()} onClick={() => complete(p.id)}>
                  Đánh dấu hoàn thành
                </Button>
              </div>
            )}
          </Card>
        ))}
      </section>

      {/* Tạo dự án */}
      {active.length < 2 && (
        <Card>
          <form onSubmit={createProject} className="flex flex-col gap-3">
            <p className="text-sm font-medium">Dự án mới (vấn đề thật, dài 3–24 tháng)</p>
            {pErr && <p className="text-sm text-red-700">{pErr}</p>}
            <Field id="p-title" label="Tên dự án" value={pTitle} onChange={(e) => setPTitle(e.target.value)} data-testid="project-title" />
            <Field id="p-q" label="Câu hỏi dẫn dắt" value={pQuestion} onChange={(e) => setPQuestion(e.target.value)} data-testid="project-question" />
            <label className="text-sm">
              Lộ trình:{' '}
              <select className="rounded border border-slate-300 px-2 py-1" value={pPathway} onChange={(e) => setPPathway(e.target.value)} data-testid="project-pathway">
                {meta.pathways.map((p) => (
                  <option key={p} value={p}>{PATHWAY_VI[p] ?? p}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Thời lượng dự kiến: <strong>{pMonths} tháng</strong>
              <input type="range" min={3} max={24} value={pMonths} onChange={(e) => setPMonths(Number(e.target.value))} className="ml-2 align-middle" data-testid="project-months" />
            </label>
            <div className="flex flex-wrap gap-2">
              {DISCIPLINES.map((d) => (
                <button
                  type="button"
                  key={d}
                  onClick={() => setPDisc((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d]))}
                  data-testid={`disc-${d}`}
                  className={`rounded-full border px-3 py-1 text-xs ${pDisc.includes(d) ? 'border-sky-500 bg-sky-50 text-sky-800' : 'border-slate-300 text-slate-600'}`}
                >
                  {DISC_VI[d] ?? d}
                </button>
              ))}
            </div>
            <Button type="submit" data-testid="project-create">Tạo dự án</Button>
          </form>
        </Card>
      )}
    </main>
  );
}
