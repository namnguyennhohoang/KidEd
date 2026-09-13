'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, type Me } from '@/lib/api';
import { Button, Card } from '@/components/ui';

interface StudioPack {
  id: string;
  code: string | null;
  title: string;
  stage: string;
  status: string;
  aiGenerated: boolean;
  updatedAt: string;
}

type Finding = { rule_id: string; severity: string; path: string; message: string };

const TEMPLATE = JSON.stringify(
  {
    kind: 'CONTENT_PACK',
    schema_version: '1.0.0',
    content_version: '1.0.0',
    title: 'Gói mới của gia đình',
    locale: 'vi-VN',
    stage: 'BASE_CAMP',
    grades: [1],
    provenance: { author: '', license: 'ORIGINAL_OR_LICENSED' },
    units: [
      {
        id: 'unit-moi-001',
        schema_version: '1.0.0',
        content_version: '1.0.0',
        status: 'DRAFT',
        title: 'Nhiệm vụ mới',
        locale: 'vi-VN',
        stage: 'BASE_CAMP',
        grades: [1],
        domains: ['MATHEMATICS', 'COMMUNICATION'],
        learning_outcomes: [{ framework: 'VN_GDPT', description: 'Mục tiêu học tập' }],
        skills: [
          { skill_id: 'MATH_NUMBER_SENSE', role: 'PRIMARY' },
          { skill_id: 'ORAL_EXPLANATION', role: 'SECONDARY' },
        ],
        duration_minutes: { screen: 5, offline: 15 },
        materials: [],
        choices: [
          { id: 'A', label: 'Cách 1' },
          { id: 'B', label: 'Cách 2' },
        ],
        quest_flow: {
          hook: 'Câu dẫn dắt',
          predict_prompt: 'Con đoán gì?',
          plan_prompt: 'Con định làm gì trước?',
          attempt_requirement: { minimum_attempts_before_solution: 1 },
          explain_prompt: 'Con giải thích cách làm nhé?',
          revision_prompt: 'Con thử cách khác không?',
          reflection_prompt: 'Bước nào con tự làm được nhất?',
        },
        hints: [
          { level: 1, type: 'REPHRASE', content: 'Nhắc lại mục tiêu ngắn gọn.' },
          { level: 2, type: 'QUESTION', content: 'Câu hỏi định hướng.' },
        ],
        evidence: ['VOICE_EXPLANATION', 'PARENT_OBSERVATION', 'CHILD_REFLECTION'],
        adaptations: {},
        safety: { adult_required: false, risk_level: 'LOW' },
        provenance: { author: '', license: 'ORIGINAL_OR_LICENSED' },
      },
    ],
  },
  null,
  2,
);

export default function StudioPage() {
  const router = useRouter();
  const [packs, setPacks] = useState<StudioPack[]>([]);
  const [draft, setDraft] = useState(TEMPLATE);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [importText, setImportText] = useState('');
  const [importFormat, setImportFormat] = useState<'JSON' | 'CSV'>('JSON');
  const [importReport, setImportReport] = useState<Array<{ row: number; errors: string[] }> | null>(null);

  const load = useCallback(async () => {
    const res = await api.get<{ packs: StudioPack[] }>('studio/packs');
    setPacks(res.packs);
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

  async function createPack() {
    setFindings([]);
    setMsg(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(draft);
    } catch {
      setMsg('JSON chưa hợp lệ.');
      return;
    }
    try {
      const r = await api.post<{ id: string; warnings: Finding[] }>('studio/packs', { pack: parsed });
      setMsg(`Đã tạo bản nháp. ${r.warnings.length ? `${r.warnings.length} cảnh báo.` : ''}`);
      setFindings(r.warnings);
      await load();
    } catch (e) {
      const body = (e as { body?: { findings?: Finding[] } }).body;
      if (body?.findings) {
        setFindings(body.findings);
        setMsg('Nội dung chưa đạt — xem lỗi bên dưới.');
      } else {
        setMsg('Không tạo được.');
      }
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
      await api.post(`studio/packs/${id}/${path}`, {});
      await load();
    } catch (e) {
      setMsg((e as Error).message || 'Thao tác lỗi.');
    }
  }

  async function runImport() {
    setImportReport(null);
    setMsg(null);
    try {
      const r = await api.post<{ validCount: number; errorReport: Array<{ row: number; errors: string[] }> }>(
        'studio/imports',
        { format: importFormat, content: importText },
      );
      setMsg(`Import xong: ${r.validCount} pack hợp lệ, ${r.errorReport.length} lỗi.`);
      setImportReport(r.errorReport);
      await load();
    } catch (e) {
      setMsg((e as Error).message || 'Import lỗi.');
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-4 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Xưởng nội dung</h1>
        <Link href="/parent">
          <Button variant="ghost">← Về</Button>
        </Link>
      </header>

      {msg && <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm">{msg}</p>}

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="flex flex-col gap-2">
          <h2 className="font-semibold">Gói của gia đình</h2>
          {packs.length === 0 && <p className="text-sm text-slate-400">Chưa có gói nào.</p>}
          <ul className="flex flex-col gap-2">
            {packs.map((p) => (
              <li key={p.id} className="rounded-lg border border-slate-200 p-3" data-testid={`pack-${p.id}`}>
                <div className="flex items-center justify-between">
                  <span className="font-medium">{p.title}</span>
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs" data-testid={`status-${p.id}`}>
                    {p.status}
                    {p.aiGenerated ? ' · AI' : ''}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {p.status === 'DRAFT' && (
                    <Button variant="ghost" data-testid={`submit-${p.id}`} onClick={() => act(p.id, 'submit')}>
                      Gửi duyệt
                    </Button>
                  )}
                  {p.status === 'IN_REVIEW' && (
                    <Button data-testid={`approve-${p.id}`} onClick={() => act(p.id, 'approve', true)}>
                      Duyệt & xuất bản (cần PIN)
                    </Button>
                  )}
                  {p.status === 'PUBLISHED' && (
                    <Button variant="ghost" data-testid={`withdraw-${p.id}`} onClick={() => act(p.id, 'withdraw', true)}>
                      Thu hồi (cần PIN)
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <label className="mt-2 text-sm text-slate-600">
            Mã PIN (để duyệt/thu hồi)
            <input
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 focus:border-sky-500 focus:outline-none focus:ring-4 focus:ring-sky-100"
              inputMode="numeric"
              placeholder="Nhập mã PIN đã đặt lúc tạo tài khoản"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              data-testid="studio-pin"
            />
          </label>
        </Card>

        <Card className="flex flex-col gap-2">
          <h2 className="font-semibold">Tạo gói mới (JSON)</h2>
          <p className="text-sm text-slate-500">
            Bên dưới đã có sẵn một mẫu chỉnh sửa được — cứ sửa trực tiếp các giá trị (tiêu đề, câu hỏi,
            gợi ý...) theo nhiệm vụ bạn muốn tạo, không cần gõ lại từ đầu.
          </p>
          <textarea
            data-testid="pack-json"
            className="min-h-64 rounded-lg border border-slate-300 p-2 font-mono text-xs focus:border-sky-500 focus:outline-none focus:ring-4 focus:ring-sky-100"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <Button data-testid="create-pack" onClick={createPack}>
            Tạo bản nháp
          </Button>
          {findings.length > 0 && (
            <ul className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900" data-testid="findings">
              {findings.map((f, i) => (
                <li key={i}>
                  [{f.severity}] {f.rule_id} @ {f.path}: {f.message}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="flex flex-col gap-2">
        <h2 className="font-semibold">Import nhiều gói</h2>
        <div className="flex items-center gap-2">
          <select
            className="rounded border border-slate-300 px-2 py-1 text-sm"
            value={importFormat}
            onChange={(e) => setImportFormat(e.target.value as 'JSON' | 'CSV')}
          >
            <option value="JSON">JSON</option>
            <option value="CSV">CSV</option>
          </select>
          <Button variant="ghost" data-testid="run-import" onClick={runImport}>
            Chạy import
          </Button>
        </div>
        <textarea
          data-testid="import-text"
          className="min-h-24 rounded-lg border border-slate-300 p-2 font-mono text-xs"
          placeholder={importFormat === 'JSON' ? '[ { ...pack... } ]' : 'pack_code,pack_title,...'}
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
        />
        {importReport && importReport.length > 0 && (
          <ul className="rounded-lg bg-red-50 p-2 text-xs text-red-800">
            {importReport.map((r, i) => (
              <li key={i}>
                dòng {r.row}: {r.errors.join('; ')}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  );
}
