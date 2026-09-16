'use client';

/**
 * Trò chơi kéo-thả ghép từ với hình — dùng cho `quest_flow.match_pairs`.
 * Kéo-thả bằng Pointer Events (chạy được cả chuột/chạm/bút, không cần thư viện ngoài).
 * Bấm (không kéo) vào thẻ chữ để "chọn", rồi bấm vào hình để ghép — vẫn hoạt động nếu bé khó kéo giữ.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Illustration } from './illustrations';

export interface MatchPair {
  id: string;
  label: string;
  visual: string;
}

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function MatchGame({
  pairs,
  onComplete,
}: {
  pairs: MatchPair[];
  onComplete: (result: { matchedOnFirstTry: string[] }) => void;
}) {
  const [chipOrder] = useState(() => shuffled(pairs.map((p) => p.id)));
  const [matched, setMatched] = useState<Record<string, boolean>>({});
  const [wrongTries, setWrongTries] = useState<Record<string, number>>({});
  const [selectedChip, setSelectedChip] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const [shakeTarget, setShakeTarget] = useState<string | null>(null);
  const dragMoved = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });
  const completedRef = useRef(false);

  const byId = useCallback((id: string) => pairs.find((p) => p.id === id)!, [pairs]);

  useEffect(() => {
    if (completedRef.current) return;
    if (pairs.every((p) => matched[p.id])) {
      completedRef.current = true;
      const matchedOnFirstTry = pairs.filter((p) => !wrongTries[p.id]).map((p) => p.id);
      onComplete({ matchedOnFirstTry });
    }
  }, [matched, pairs, wrongTries, onComplete]);

  function tryPlace(chipId: string, targetId: string) {
    if (matched[targetId]) return;
    if (chipId === targetId) {
      setMatched((m) => ({ ...m, [targetId]: true }));
    } else {
      setWrongTries((w) => ({ ...w, [targetId]: (w[targetId] ?? 0) + 1 }));
      setShakeTarget(targetId);
      setTimeout(() => setShakeTarget(null), 400);
    }
    setSelectedChip(null);
  }

  function onChipPointerDown(e: React.PointerEvent<HTMLButtonElement>, chipId: string) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragMoved.current = false;
    startPos.current = { x: e.clientX, y: e.clientY };
    setDrag({ id: chipId, x: e.clientX, y: e.clientY });
  }

  function onChipPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (!drag) return;
    const dx = e.clientX - startPos.current.x;
    const dy = e.clientY - startPos.current.y;
    if (Math.hypot(dx, dy) > 6) dragMoved.current = true;
    setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY } : d));
  }

  function onChipPointerUp(e: React.PointerEvent<HTMLButtonElement>, chipId: string) {
    if (dragMoved.current) {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const targetEl = el?.closest<HTMLElement>('[data-match-target]');
      if (targetEl?.dataset.matchTarget) tryPlace(chipId, targetEl.dataset.matchTarget);
    } else {
      setSelectedChip((cur) => (cur === chipId ? null : chipId));
    }
    setDrag(null);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {pairs.map((p) => (
          <div
            key={p.id}
            data-match-target={p.id}
            onClick={() => selectedChip && tryPlace(selectedChip, p.id)}
            className={`flex flex-col items-center gap-2 rounded-2xl border-2 p-3 transition ${
              matched[p.id]
                ? 'border-emerald-400 bg-emerald-50'
                : shakeTarget === p.id
                  ? 'animate-pulse border-amber-400 bg-amber-50'
                  : selectedChip
                    ? 'border-sky-300 bg-sky-50 cursor-pointer'
                    : 'border-slate-200 bg-white'
            }`}
          >
            <div className="h-16 w-16">
              <Illustration id={p.visual} label={p.label} />
            </div>
            <span className={`text-sm font-semibold ${matched[p.id] ? 'text-emerald-700' : 'text-slate-400'}`}>
              {matched[p.id] ? `✅ ${byId(p.id).label}` : '?'}
            </span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        {chipOrder
          .filter((id) => !matched[id])
          .map((id) => {
            const chip = byId(id);
            return (
              <button
                key={id}
                type="button"
                data-testid={`match-chip-${id}`}
                onPointerDown={(e) => onChipPointerDown(e, id)}
                onPointerMove={onChipPointerMove}
                onPointerUp={(e) => onChipPointerUp(e, id)}
                style={{ touchAction: 'none' }}
                className={`rounded-2xl border-2 px-5 py-3 text-lg font-semibold shadow-sm transition ${
                  selectedChip === id
                    ? 'border-sky-500 bg-sky-100 text-sky-900'
                    : 'border-sky-200 bg-white text-slate-800 hover:border-sky-400'
                } ${drag?.id === id ? 'opacity-40' : ''}`}
              >
                {chip.label}
              </button>
            );
          })}
      </div>

      {drag && dragMoved.current && (
        <div
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 rounded-2xl border-2 border-sky-400 bg-white px-5 py-3 text-lg font-semibold text-sky-900 shadow-lg"
          style={{ left: drag.x, top: drag.y }}
        >
          {byId(drag.id).label}
        </div>
      )}

      <p className="text-center text-base text-slate-500">
        🖐️ Kéo thẻ chữ thả vào đúng hình — hoặc bấm chọn thẻ rồi bấm vào hình.
      </p>
    </div>
  );
}
