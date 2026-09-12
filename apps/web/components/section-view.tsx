/* Hiển thị gọn, chỉ-đọc cho các mục được chia sẻ (dùng ở /shared và /educator). */
/* eslint-disable @typescript-eslint/no-explicit-any */

export const SHARE_SECTION_LABEL: Record<string, string> = {
  dashboard: 'Tiến trình',
  readiness: 'Mức sẵn sàng',
  specialisation: 'Hứng thú',
  scholar: 'Dự án',
};

export function SectionView({ section, data }: { section: string; data: any }) {
  if (section === 'readiness') {
    return (
      <div className="flex flex-col gap-2 text-sm">
        <p className="text-xs text-slate-500">{data.disclaimer}</p>
        <ul className="flex flex-col gap-1">
          {(data.bySkill ?? []).map((s: any) => (
            <li key={s.skillId} className="flex justify-between">
              <span>{s.title ?? s.skillId}</span>
              <span className="text-slate-500">{s.notStarted ? 'chưa bắt đầu' : `${s.band} · ${s.confidence}`}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (section === 'specialisation') {
    return (
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-xs text-slate-500">{data.interestProfile?.disclaimer}</p>
        <div>
          <p className="font-medium">Hứng thú theo lĩnh vực</p>
          <ul className="mt-1 flex flex-col gap-1">
            {(data.interestProfile?.byDomain ?? []).map((d: any) => (
              <li key={d.domain} className="flex justify-between">
                <span>{d.domain}</span>
                <span className="text-slate-500">
                  {d.trend}
                  {d.sustained ? ' · bền vững' : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="font-medium">Chu kỳ trải nghiệm</p>
          <ul className="mt-1 flex flex-col gap-1 text-slate-600">
            {(data.cycles ?? []).map((c: any) => (
              <li key={c.id}>
                {c.title} — {c.status} ({c.plannedWeeks} tuần)
              </li>
            ))}
            {(data.cycles ?? []).length === 0 && <li className="text-slate-400">Chưa có.</li>}
          </ul>
        </div>
      </div>
    );
  }
  if (section === 'scholar') {
    return (
      <div className="flex flex-col gap-2 text-sm">
        <p className="text-xs text-slate-500">{data.disclaimer}</p>
        <p>
          Hồ sơ chữ T: bề rộng {data.tShape?.breadthCount} lĩnh vực ·{' '}
          {data.tShape?.depthSubject ? `chiều sâu ${data.tShape.depthSubject}` : 'chưa có mũi nhọn'}
        </p>
        <p className="text-slate-600">
          Do học sinh dẫn dắt: {data.humanLedShare == null ? '—' : `${Math.round(data.humanLedShare * 100)}%`}
        </p>
        <ul className="flex flex-col gap-1">
          {(data.projects ?? []).map((p: any) => (
            <li key={p.id}>
              {p.title} — {p.status} · {p.contributionCount} mốc
            </li>
          ))}
        </ul>
      </div>
    );
  }
  // dashboard
  return (
    <div className="flex flex-col gap-1 text-sm">
      <p>Phiên đã hoàn thành: {data.independence?.completedSessions}</p>
      <p>Mức gợi ý trung vị: {data.hints?.medianLevel ?? '—'}</p>
      <p>Lần tự nhìn lại: {data.explanation?.reflectionsCompleted}</p>
      <p>Minh chứng kỹ năng: {data.skillEvidence?.count}</p>
      <p className="text-xs text-slate-400">Bảng này không xếp hạng và không dự đoán kết quả thi cử.</p>
    </div>
  );
}
