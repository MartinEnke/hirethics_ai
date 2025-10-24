import React, { useMemo, useState } from "react";

/** Who the card is rendered for */
export type ViewerMode = "recruiter" | "ethics" | "dev";

/** Optional breakdown rows */
export type ScoreBreakdown = { criterion: string; score: number };

/** Minimal candidate shape the card needs */
export type CandidateScore = {
  candidate_id: string;
  display_name?: string;
  total_after?: number;
  total_before?: number;
  by_criterion?: ScoreBreakdown[];

  /** mock/local-only extras (safe to be absent in backend runs) */
  core_coverage?: number; // 0..6 ticks
  why?: string[];         // highlight bullets
  missing?: string[];     // gaps bullets
  cap_applied?: boolean;  // “cap applied” note
};

/** Flags row (same shape used in the page) */
export type EthicsFlagsRow = { candidate_id: string; flags: string[] };

type Props = {
  candidate: CandidateScore;
  flags: EthicsFlagsRow[];
  viewerMode: ViewerMode;
};

/* ---------- tiny UI atoms ---------- */
function Pill({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  const map = {
    default: "bg-slate-100 text-slate-700 ring-slate-200",
    good: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    warn: "bg-amber-50 text-amber-700 ring-amber-200",
    bad: "bg-rose-50 text-rose-700 ring-rose-200",
  } as const;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ring-1 ${map[tone]}`}>
      {children}
    </span>
  );
}

function Bar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="h-2 w-full rounded bg-slate-100">
      <div className="h-2 rounded bg-slate-900" style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ---------- main card ---------- */
export default function AdvancedScoreCard({ candidate, flags, viewerMode }: Props) {
  const total = candidate.total_after ?? 0;
  const before = candidate.total_before ?? candidate.total_after ?? 0;
  const delta = Math.round((total - before) * 10) / 10;
  const name = candidate.display_name || candidate.candidate_id;

  const top2 = useMemo(() => {
    const rows = (candidate.by_criterion || []).slice().sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    return rows.slice(0, 2);
  }, [candidate.by_criterion]);

  const flagLabels = (flags?.[0]?.flags as string[]) || [];

  const qualitySignals = (candidate.why || []).filter((s) =>
    /Testing|CI\/CD|Typing|OpenAPI/i.test(s)
  );
  const gaps = candidate.missing || [];
  const core = Math.max(0, Math.min(6, candidate.core_coverage ?? 0)); // 0..6

  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">{name}</div>
          <div className="mt-0.5 text-xs text-slate-500">{candidate.candidate_id}</div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold text-slate-900">{total.toFixed(1)}</div>
          <div className="text-xs text-slate-500">
            {candidate.cap_applied ? <Pill tone="warn">cap applied</Pill> : null}{" "}
            {delta !== 0 ? <span className="ml-1">Δ {delta > 0 ? "+" : ""}{delta.toFixed(1)}</span> : null}
          </div>
        </div>
      </div>

      {/* Criteria bars */}
      {top2.length > 0 && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {top2.map((c) => (
            <div key={c.criterion}>
              <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
                <span>{c.criterion}</span>
                <span className="font-medium text-slate-900">{c.score.toFixed(1)}</span>
              </div>
              <Bar value={c.score} />
            </div>
          ))}
        </div>
      )}

      {/* Core coverage ticks */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">Core coverage:</span>
        {Array.from({ length: 6 }).map((_, i) => (
          <span
            key={i}
            className={`h-2 w-5 rounded ${i < core ? "bg-slate-900" : "bg-slate-200"}`}
            title={`${core}/6`}
          />
        ))}
      </div>

      {/* Signals / gaps / flags */}
      <div className="mt-3 flex flex-wrap gap-2">
        {qualitySignals.map((q, i) => (
          <Pill key={`q-${i}`} tone="good">{q}</Pill>
        ))}
        {gaps.map((g, i) => (
          <Pill key={`g-${i}`} tone="bad">{g}</Pill>
        ))}
        {flagLabels.map((fl, i) => (
          <Pill
            key={`f-${i}`}
            tone={/large|major/i.test(fl) ? "bad" : /instability|proxy|moderate/i.test(fl) ? "warn" : "default"}
          >
            {fl}
          </Pill>
        ))}
      </div>

      {/* Evidence drawer (viewer dependent label) */}
      <div className="mt-3">
        <button
          className="text-xs rounded-lg px-2 py-1 ring-1 ring-slate-300 hover:bg-slate-50"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Hide" : "Show"} {viewerMode === "recruiter" ? "evidence highlights" : "details"}
        </button>

        {open && (
          <div className="mt-2 text-sm text-slate-700 space-y-1">
            {candidate.why && candidate.why.length > 0 ? (
              candidate.why.slice(0, 4).map((w, i) => <div key={i}>• {w}</div>)
            ) : (
              <div className="text-slate-500">No extra highlights provided.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
