// frontend/src/pages/Evaluation.tsx
import React, { useEffect, useMemo, useState } from "react";
import { getReport } from "../lib/api";
import type { ViewerMode } from "../lib/viewer";
import type { CandidateScore, AnyFlag } from "../lib/format";
import AdvancedScoreCard from "../components/AdvancedScoreCard";

import type { ReportPayload } from "../types/report";
import { loadMockReport } from "../utils/mockStorage";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000/api/v1";

/* ---------- tiny inline Tooltip (no external import needed) ---------- */
function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="relative inline-flex items-center"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {children}
      {open && (
        <div className="absolute z-20 top-full mt-2 max-w-xs rounded-lg border bg-white p-3 text-xs text-slate-700 shadow-lg">
          {text}
        </div>
      )}
    </span>
  );
}

/* ---------- tiny inline ViewerToggle (avoid external import issues) ---------- */
function MiniViewerToggle({
  value,
  onChange,
}: {
  value: ViewerMode | "simple";
  onChange: (v: ViewerMode | "simple") => void;
}) {
  const isRecruiter = value === "recruiter";
  return (
    <div className="inline-flex items-center rounded-xl ring-1 ring-slate-300 bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => onChange("recruiter")}
        className={`px-3 py-1.5 text-sm ${isRecruiter ? "bg-slate-900 text-white" : "text-slate-700"}`}
      >
        Recruiter
      </button>
      <button
        type="button"
        onClick={() => onChange("simple")}
        className={`px-3 py-1.5 text-sm ${!isRecruiter ? "bg-slate-900 text-white" : "text-slate-700"}`}
      >
        Simple
      </button>
    </div>
  );
}

/* ---------- flag knowledge base for rationale + action ---------- */
const FLAG_KB: Record<
  string,
  { title: string; rationale: string; action: string; severity?: "minor" | "moderate" | "major" }
> = {
  "Minor bias detected": {
    title: "Minor bias detected",
    rationale: "Small, non-deterministic rank wobble observed under blinding/counterfactual checks.",
    action: "Proceed, but double-check evidence quotes; prioritize structured interview to validate.",
    severity: "minor",
  },
  "Proxy signal suspected: brand": {
    title: "Proxy signal suspected: brand",
    rationale: "Brand names (schools/companies) appear correlated with score deltas independent of evidence.",
    action: "Temporarily mask brand names and re-run; emphasize concrete achievements in screening.",
    severity: "moderate",
  },
  "Instability under blinding": {
    title: "Instability under blinding",
    rationale: "Notable rank shift when sensitive tokens (e.g., names) are blinded — suggests fragile features.",
    action: "Blind sensitive tokens in reviewer workflow; seek more task-relevant evidence.",
    severity: "moderate",
  },
  "Large rank shift under counterfactual": {
    title: "Large rank shift under counterfactual",
    rationale: "Candidate rank changes significantly under plausible attribute swaps (counterfactual stress).",
    action: "Require human review and a second signal (work sample) before proceeding.",
    severity: "major",
  },
};

export default function Evaluation() {
  const [batchId, setBatchId] = useState("");
  const [topK, setTopK] = useState<number | undefined>(undefined);
  const [viewerMode, setViewerMode] = useState<ViewerMode | "simple">("recruiter");

  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [source, setSource] = useState<"backend" | "local" | null>(null);

  // Role context used for recommendation copy (persisted locally)
  const [jobContext, setJobContext] = useState<string>("");

  // Auto-fill latest batch id + role context
  useEffect(() => {
    const latest = localStorage.getItem("latestBatchId");
    if (latest) setBatchId(latest);
    const jc = localStorage.getItem("jobContext") || "";
    setJobContext(jc);
  }, []);

  // Auto-fetch when batchId changes
  useEffect(() => {
    if (batchId) void fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId]);

  const fetchReport = async () => {
    setLoading(true);
    setErr(null);
    setData(null);
    setSource(null);

    const id = batchId.trim();
    if (!id) {
      setLoading(false);
      return;
    }

    try {
      // 1) Try backend first
      const r = await getReport(id, topK);
      const normalized = normalizeBackendToEvaluation(r);
      setData(normalized);
      setSource("backend");
    } catch (e: any) {
      // 2) Fallback to locally cached canonical report from Landing
      const local = loadMockReport(id);
      if (local) {
        const asEval = fromLocalCanonicalToEvaluation(local, topK, jobContext);
        setData(asEval);
        setSource("local");
      } else {
        setErr(e?.message || "Failed to fetch report. Is the backend running?");
      }
    } finally {
      setLoading(false);
    }
  };

  // Sorted candidates (desc by total_after like your original)
  const sortedCandidates: CandidateScore[] =
    data?.candidates?.slice().sort((a: CandidateScore, b: CandidateScore) => (b.total_after ?? 0) - (a.total_after ?? 0)) || [];

  // Recommendation (top candidate + natural-language “why” + name)
  const recommendation = useMemo(() => {
    if (!sortedCandidates.length) return null;
    const top: any = sortedCandidates[0];
    const flagsForTop: AnyFlag[] = (data?.ethics_flags || []).filter(
      (f: any) => f.candidate_id === top.candidate_id
    );

    // choose 2 strongest criteria by score
    const strongest = (top.by_criterion || [])
      .slice()
      .sort((a: any, b: any) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, 2);

    const reasons: string[] = strongest.map((r: any) => `${r.criterion} (${fmt1(r.score)})`);
    if (!flagsForTop?.length || !flagsForTop[0]?.flags?.length) {
      reasons.push("no adverse flags");
    } else {
      reasons.push(`review flags: ${flagsForTop[0].flags.join(", ")}`);
    }

    const name = top.display_name || top.candidate_id;
    return {
      candidateLabel: name,
      overall: fmt1(top.total_after ?? 0),
      reasons,
    };
  }, [sortedCandidates, data]);

  // Recruiter-friendly metric labels, tones, tooltips, short italic hints, and one-line desc
  const headerMetrics = useMemo(() => {
    if (!data) return [];
    const items: Array<{
      label: string;
      value: string | number;
      tooltip?: string;
      tone?: "good" | "warn" | "bad" | "default";
      hint?: string; // italic parenthetical
      desc?: string; // one-line explanation
    }> = [];

    items.push({
      label: "Candidates",
      value: data.n_candidates ?? data.candidates?.length ?? 0,
      tooltip: "Number of candidates scored in this batch.",
      hint: "(count in this batch)",
      desc: "How many profiles were scored in this run.",
    });

    if (typeof data.spearman_rho === "number") {
      const v = data.spearman_rho;
      items.push({
        label: "Rank stability (ρ)",
        value: v,
        tone: v >= 0.9 ? "good" : v >= 0.8 ? "warn" : "bad",
        tooltip: "Spearman rank correlation vs. a reference (previous or blinded). Higher = more stable ranking.",
        hint: "(higher is better)",
        desc: "Similarity between this ranking and a reference run; shows how stable the shortlist is.",
      });
    }

    if (typeof data.topk_overlap_count === "number") {
      const k = data.k ?? 5;
      const value =
        typeof data.topk_overlap_ratio === "number"
          ? `${data.topk_overlap_count} (${Math.round(data.topk_overlap_ratio * 100)}%)`
          : `${data.topk_overlap_count}`;
      items.push({
        label: `Top-${k} consistency`,
        value,
        tooltip: "How many candidates stayed in the Top-K compared to the reference.",
        hint: "(higher is better)",
        desc: `How many of the Top-${k} stayed the same vs. the reference; stability of your shortlist.`,
      });
    }

    if (typeof data.mean_abs_delta === "number") {
      const v = data.mean_abs_delta;
      items.push({
        label: "Avg. rank shift",
        value: v,
        tone: v <= 1 ? "good" : v <= 3 ? "warn" : "bad",
        tooltip: "Average absolute change in rank position vs. the reference.",
        hint: "(lower is better)",
        desc: "On average, how many places candidates moved up/down compared to the reference.",
      });
    }

    return items;
  }, [data]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl p-6 space-y-6">
        {/* Header with toggle + source pill */}
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Evaluation Dashboard</h1>
          <div className="flex items-center gap-3">
            {source && (
              <span
                className={`text-xs px-2 py-1 rounded-full ring-1 ${
                  source === "backend"
                    ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                    : "bg-slate-100 text-slate-700 ring-slate-300"
                }`}
                title={source === "backend" ? "Data from API" : "Data from local cache (mock)"}
              >
                Source: {source === "backend" ? "Backend" : "Local mock"}
              </span>
            )}
            <MiniViewerToggle value={viewerMode} onChange={setViewerMode} />
          </div>
        </div>

        {/* Role context (used to justify recommendation) */}
        <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">Role context</div>
              <p className="text-sm text-slate-600">
                Add a short description of the position (key criteria, stack, must-haves).
              </p>
            </div>
            <button
              className="text-xs rounded-lg px-3 py-1 ring-1 ring-slate-300 hover:bg-slate-50"
              onClick={() => {
                localStorage.setItem("jobContext", jobContext);
              }}
              title="Save to browser"
            >
              Save
            </button>
          </div>
          <textarea
            className="mt-2 w-full min-h-[90px] rounded-md border border-slate-300 p-3 shadow-sm focus:ring-emerald-500 focus:border-emerald-500"
            placeholder="e.g., Python + FastAPI, Postgres, GenAI (RAG); emphasis on API quality, system design, and explainability."
            value={jobContext}
            onChange={(e) => setJobContext(e.target.value)}
          />
        </div>

        {/* Controls */}
        <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200 flex flex-col sm:flex-row gap-3 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-700">Batch ID</label>
            <input
              className="mt-1 w-full rounded-md border border-slate-300 shadow-sm focus:ring-emerald-500 focus:border-emerald-500"
              placeholder="e.g., batch_1234abcd"
              value={batchId}
              onChange={(e) => setBatchId(e.target.value)}
            />
          </div>
          <div className="w-28">
            <label className="block text-sm font-medium text-slate-700">
              <Tooltip text="Top-K is used when computing the overlap vs. a reference. Leave blank to use server/default.">
                <span className="underline decoration-dotted underline-offset-2 cursor-help">Top-K</span>
              </Tooltip>
            </label>
            <input
              type="number"
              min={1}
              value={topK ?? ""}
              onChange={(e) => setTopK(e.target.value ? Number(e.target.value) : undefined)}
              placeholder="default 5"
              className="mt-1 w-full rounded-md border border-slate-300 shadow-sm focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>
          <button
            onClick={fetchReport}
            disabled={!batchId || loading}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {loading ? "Fetching…" : "Compute report"}
          </button>

          {data?.batch_id && (
            <div className="ms-auto flex items-center gap-2">
              <a
                href={`${API_BASE}/audit/${data.batch_id}.json`}
                className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-slate-900 ring-1 ring-slate-300 hover:bg-slate-50"
                target="_blank"
                rel="noreferrer"
              >
                Export JSON
              </a>
              <a
                href={`${API_BASE}/audit/${data.batch_id}.csv`}
                className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-slate-900 ring-1 ring-slate-300 hover:bg-slate-50"
                target="_blank"
                rel="noreferrer"
              >
                Export CSV
              </a>
            </div>
          )}
        </div>

        {/* Recommendation */}
        {recommendation && (
          <div className="rounded-xl bg-emerald-50 ring-1 ring-emerald-200 p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-emerald-900">Recommendation</div>
              <span className="text-xs text-emerald-700">
                {(jobContext || "").trim()
                  ? "Based on role context and current scoring"
                  : "Based on current scoring"}
              </span>
            </div>
            <div className="mt-2 text-slate-900">
              Candidate <span className="font-semibold">{recommendation.candidateLabel}</span>{" "}
              appears to be the best fit (overall {recommendation.overall}).
            </div>
            <ul className="mt-1 text-sm text-emerald-900 list-disc pl-5">
              {recommendation.reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Metrics */}
        {data && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {headerMetrics.map((m) => (
                <Stat
                  key={m.label}
                  label={m.label}
                  value={m.value}
                  tone={m.tone}
                  tooltip={m.tooltip}
                  hint={m.hint}
                  desc={m.desc}
                />
              ))}
            </div>

            {/* Flags overview with helper lines */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div>
                <div className="mb-1 text-xs text-slate-500">
                  Grouped by category (e.g., proxy signals, instability, brand influence).
                </div>
                <FlagSummary title="Flags by type" flags={data?.flags_by_type} />
              </div>

              <div>
                <div className="mb-1 text-xs text-slate-500">Grouped by severity (if provided by backend).</div>
                {data?.flags_by_severity && Object.keys(data.flags_by_severity).length > 0 ? (
                  <FlagSummary title="Flags by severity" flags={data.flags_by_severity} />
                ) : (
                  <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200 text-sm text-slate-500">
                    No severity data provided.
                  </div>
                )}
              </div>
            </div>

            {/* Candidates + ethics review helper */}
            <div className="grid grid-cols-1 gap-4 mt-4">
              {sortedCandidates.map((cand: CandidateScore) => {
                const candFlagsRaw: AnyFlag[] = (data.ethics_flags || []).filter(
                  (f: any) => f.candidate_id === (cand as any).candidate_id
                );
                const labels: string[] = (candFlagsRaw?.[0]?.flags as string[]) || [];
                const enriched = labels
                  .map((label) => FLAG_KB[label])
                  .filter(Boolean) as Array<{ title: string; rationale: string; action: string; severity?: string }>;

                return (
                  <div key={(cand as any).candidate_id} className="grid gap-2">
                    <AdvancedScoreCard
                      candidate={cand}
                      flags={candFlagsRaw}
                      viewerMode={viewerMode}
                    />

                    {labels.length > 0 && (
                      <div className="rounded-lg bg-white p-4 ring-1 ring-slate-200">
                        <div className="text-sm font-semibold text-slate-900">Ethics review helper</div>
                        <ul className="mt-2 space-y-2">
                          {enriched.length > 0 ? (
                            enriched.map((f, idx) => (
                              <li key={idx} className="text-sm text-slate-700">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ring-1 ${
                                      f.severity === "major"
                                        ? "bg-rose-50 text-rose-700 ring-rose-200"
                                        : f.severity === "moderate"
                                        ? "bg-amber-50 text-amber-700 ring-amber-200"
                                        : "bg-slate-100 text-slate-700 ring-slate-200"
                                    }`}
                                  >
                                    {f.severity ?? "info"}
                                  </span>
                                  <span className="font-medium">{f.title}</span>
                                </div>
                                <div className="mt-1 text-xs text-slate-600">
                                  <em>Why:</em> {f.rationale}
                                </div>
                                <div className="text-xs text-slate-600">
                                  <em>Suggested action:</em> {f.action}
                                </div>
                              </li>
                            ))
                          ) : (
                            <li className="text-sm text-slate-500">No standardized rationale available for these flags.</li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {err && <p className="text-sm text-rose-600">{err}</p>}

        {!loading && !err && !data && (
          <div className="text-slate-600">
            <p>
              Enter a Batch ID or click “Compute report” after pasting one. To generate one, run the demo on the
              Landing page first.
            </p>
          </div>
        )}

        {/* Explainer panel */}
        <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
          <div className="text-sm font-semibold text-slate-900">What am I seeing?</div>
          <ul className="mt-2 text-sm text-slate-600 list-disc pl-5 space-y-1">
            <li><strong>Rank stability (ρ):</strong> Similarity of rankings vs. a reference (previous or blinded run). ≥0.90 is very stable.</li>
            <li><strong>Top-K consistency:</strong> How many candidates remain in the Top-K compared to the reference (shortlist robustness).</li>
            <li><strong>Avg. rank shift:</strong> Average positions moved up/down vs. the reference; ≤1 is very stable.</li>
            <li><strong>Fairness score:</strong> Robustness of the ranking to <em>sensitive attributes</em> via blinding/counterfactual tests. Higher = less influence from non-job signals.</li>
            <li><strong>Transparency score:</strong> How well decisions are supported by <em>quoted evidence</em> and clear rationales. Higher = more explainable decisions.</li>
            <li><strong>Source:</strong> “Local mock” means demo data cached in your browser (from the Landing run).</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

/* ---------- helpers: normalization & fallbacks ---------- */
function normalizeBackendToEvaluation(x: any) {
  const batch_id = x?.batch_id ?? `batch_${Date.now()}`;
  const k = x?.k ?? 5;
  const n_candidates = x?.n_candidates ?? (Array.isArray(x?.candidates) ? x.candidates.length : undefined);

  const candidates: CandidateScore[] = Array.isArray(x?.candidates) ? x.candidates : [];
  const ethics_flags = Array.isArray(x?.ethics_flags) ? x.ethics_flags : [];

  const flags_by_type = x?.flags_by_type ?? undefined;
  const flags_by_severity = x?.flags_by_severity ?? undefined;

  return {
    batch_id,
    k,
    n_candidates,
    spearman_rho: typeof x?.spearman_rho === "number" ? x.spearman_rho : undefined,
    topk_overlap_count: typeof x?.topk_overlap_count === "number" ? x.topk_overlap_count : undefined,
    topk_overlap_ratio: typeof x?.topk_overlap_ratio === "number" ? x.topk_overlap_ratio : undefined,
    mean_abs_delta: typeof x?.mean_abs_delta === "number" ? x.mean_abs_delta : undefined,
    flags_by_type,
    flags_by_severity,
    ethics_flags,
    candidates,
  };
}

function fromLocalCanonicalToEvaluation(report: ReportPayload, topK?: number, jobContext?: string) {
  const k = topK ?? 5;

  // Build CandidateScore-like objects from canonical shape
  const candidates: CandidateScore[] = report.candidates.map((c: any) => {
    const total_after = round1(c.score.overall);
    const by_criterion = [
      { criterion: "Fairness", score: round1(c.score.fairness) },
      { criterion: "Transparency", score: round1(c.score.transparency) },
    ];
    return {
      ...( {} as CandidateScore ),
      candidate_id: c.candidate_id,
      display_name: c.display_name, // keep name if present
      total_after,
      total_before: total_after, // no pre/post delta in mock
      by_criterion,
    };
  });

  // flags list similar to backend shape used by UI
  const ethics_flags = report.candidates.map((c: any) => ({
    candidate_id: c.candidate_id,
    flags: c.flags ?? [],
  }));

  // summaries
  const allFlags = ethics_flags.flatMap((f) => f.flags || []);
  const flags_by_type = allFlags.reduce((acc: Record<string, number>, f: string) => {
    acc[f] = (acc[f] || 0) + 1;
    return acc;
  }, {});
  const flags_by_severity = report.flags_by_severity ?? undefined;

  // mock overlap/shift metrics if missing
  const spearman_rho = typeof report.spearman_rho === "number" ? report.spearman_rho : round2(0.8 + Math.random() * 0.15);
  const topk_overlap_count = typeof report.topk_overlap_count === "number" ? report.topk_overlap_count : Math.min(k, candidates.length, 3);
  const topk_overlap_ratio = typeof report.topk_overlap_ratio === "number"
    ? report.topk_overlap_ratio
    : (candidates.length ? topk_overlap_count / Math.min(k, candidates.length) : 0);
  const mean_abs_delta = typeof report.mean_abs_delta === "number" ? report.mean_abs_delta : round2(Math.random() * 2 + 1);

  return {
    batch_id: report.batch_id,
    k,
    n_candidates: report.n_candidates ?? candidates.length,
    spearman_rho,
    topk_overlap_count,
    topk_overlap_ratio,
    mean_abs_delta,
    flags_by_type,
    flags_by_severity,
    ethics_flags,
    candidates,
    job_context: jobContext || undefined,
  };
}

/* ---------- small UI atoms ---------- */
function Stat({
  label,
  value,
  tone,
  tooltip,
  hint,
  desc,
}: {
  label: string;
  value: any;
  tone?: "good" | "warn" | "bad" | "default";
  tooltip?: string;
  hint?: string;
  desc?: string;
}) {
  const toneClass =
    tone === "good" ? "ring-emerald-200" :
    tone === "warn" ? "ring-amber-200" :
    tone === "bad"  ? "ring-rose-200" :
                      "ring-slate-200";
  return (
    <div className={`rounded-xl bg-white p-4 ring-1 ${toneClass}`}>
      <div className="text-xs uppercase tracking-wide text-slate-500">
        {tooltip ? (
          <Tooltip text={tooltip}>
            <span className="underline decoration-dotted underline-offset-2 cursor-help">{label}</span>
          </Tooltip>
        ) : (
          <span>{label}</span>
        )}
      </div>
      <div className="mt-1 text-lg font-semibold text-slate-900">{String(value)}</div>
      {hint && <div className="mt-0.5 text-xs italic text-slate-500">{hint}</div>}
      {desc && <div className="mt-1 text-xs text-slate-500">{desc}</div>}
    </div>
  );
}

function FlagSummary({ title, flags }: { title: string; flags: Record<string, number> | undefined }) {
  return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <ul className="mt-2 text-sm text-slate-700 space-y-1">
        {flags && Object.keys(flags).length > 0 ? (
          Object.entries(flags).map(([k, v]) => (
            <li key={k} className="flex justify-between">
              <span>{k}</span>
              <span className="font-medium">{v}</span>
            </li>
          ))
        ) : (
          <li className="text-slate-400">None</li>
        )}
      </ul>
    </div>
  );
}

/* ---------- tiny utils ---------- */
function round1(n: number) { return Number((+n || 0).toFixed(1)); }
function round2(n: number) { return Number((+n || 0).toFixed(2)); }
function fmt1(n: number) { return round1(n).toFixed(1); }
