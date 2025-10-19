// frontend/src/pages/Evaluation.tsx
import React, { useEffect, useMemo, useState } from "react";
import { getReport } from "../lib/api";
import type { ViewerMode } from "../lib/viewer";
import type { CandidateScore, AnyFlag } from "../lib/format";
import AdvancedScoreCard from "../components/AdvancedScoreCard";
import Tooltip from "../components/Tooltip";

import type { ReportPayload } from "../types/report";
import { loadMockReport } from "../utils/mockStorage";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000/api/v1";

export default function Evaluation() {
  const [batchId, setBatchId] = useState("");
  const [topK, setTopK] = useState<number | undefined>(undefined);
  const [viewerMode, setViewerMode] = useState<ViewerMode | "simple">("recruiter");

  // unified "data" the page renders (matches your original Evaluation layout)
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [source, setSource] = useState<"backend" | "local" | null>(null);

  // Auto-fill latest batch ID from localStorage on mount
  useEffect(() => {
    const latest = localStorage.getItem("latestBatchId");
    if (latest) setBatchId(latest);
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
      // 1) Try backend report first
      const r = await getReport(id, topK);
      const normalized = normalizeBackendToEvaluation(r);
      setData(normalized);
      setSource("backend");
    } catch (e: any) {
      // 2) Fallback to locally cached canonical report (from Landing)
      const local = loadMockReport(id); // ReportPayload | null
      if (local) {
        const asEval = fromLocalCanonicalToEvaluation(local, topK);
        setData(asEval);
        setSource("local");
      } else {
        setErr(e?.message || "Failed to fetch report. Is the backend running?");
      }
    } finally {
      setLoading(false);
    }
  };

  // Sorted candidates (your original sort)
  const sortedCandidates: CandidateScore[] =
    data?.candidates?.slice().sort((a: CandidateScore, b: CandidateScore) => (b.total_after ?? 0) - (a.total_after ?? 0)) || [];

  // Recruiter-friendly header metrics (labels, tones, tooltips)
  const headerMetrics = useMemo(() => {
    if (!data) return [];
    const items: Array<{ label: string; value: string | number; tooltip?: string; tone?: "good" | "warn" | "bad" | "default" }> = [];

    items.push({
      label: "Candidates",
      value: data.n_candidates ?? data.candidates?.length ?? 0,
      tooltip: "Number of candidates scored in this batch.",
    });

    if (typeof data.spearman_rho === "number") {
      const v = data.spearman_rho;
      items.push({
        label: "Rank stability (ρ)",
        value: v,
        tone: v >= 0.9 ? "good" : v >= 0.8 ? "warn" : "bad",
        tooltip: "Spearman rank correlation vs. a reference (previous or blinded). Higher = more stable ranking.",
      });
    }

    if (typeof data.topk_overlap_count === "number") {
      const k = data.k ?? 5;
      const ratioPct =
        typeof data.topk_overlap_ratio === "number" ? ` (${Math.round(data.topk_overlap_ratio * 100)}%)` : "";
      items.push({
        label: `Top-${k} consistency`,
        value: `${data.topk_overlap_count}${ratioPct}`,
        tooltip: "How many candidates stayed in the Top-K compared to the reference. Higher = more consistent shortlist.",
      });
    }

    if (typeof data.mean_abs_delta === "number") {
      const v = data.mean_abs_delta;
      items.push({
        label: "Avg. rank shift",
        value: v,
        tone: v <= 1 ? "good" : v <= 3 ? "warn" : "bad",
        tooltip: "Average absolute change in rank position vs. the reference. Lower = more stable.",
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
            <div className="hidden sm:block">
              <ViewerToggle value={viewerMode} onChange={setViewerMode} />
            </div>
          </div>
        </div>
        <div className="sm:hidden">
          <ViewerToggle value={viewerMode} onChange={setViewerMode} />
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
              <Tooltip text="Top-K is used when computing overlap vs. a reference. If left blank, the server/default is used.">
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

        {/* Stats */}
        {data && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {headerMetrics.map((m) => (
                <Stat key={m.label} label={m.label} value={m.value} tone={m.tone} tooltip={m.tooltip} />
              ))}
            </div>

            {/* Flags overview */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <FlagSummary title="Flags by type" flags={data.flags_by_type} />
              <FlagSummary title="Flags by severity" flags={data.flags_by_severity} />
            </div>

            {/* Candidate comparison */}
            <div className="grid grid-cols-1 gap-4 mt-4">
              {sortedCandidates.map((cand: CandidateScore) => {
                // Your original logic: flags collected from top-level ethics_flags
                const candFlags: AnyFlag[] = (data.ethics_flags || []).filter(
                  (f: any) => f.candidate_id === (cand as any).candidate_id
                );
                return (
                  <AdvancedScoreCard
                    key={(cand as any).candidate_id}
                    candidate={cand}
                    flags={candFlags}
                    viewerMode={viewerMode}
                  />
                );
              })}
            </div>
          </>
        )}

        {err && <p className="text-sm text-rose-600">{err}</p>}

        {!loading && !err && !data && (
          <div className="text-slate-600">
            <p>
              Enter a Batch ID or use your most recent run (try the demo on the Landing page first).
            </p>
          </div>
        )}

        {/* Explainer panel */}
        <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
          <div className="text-sm font-semibold text-slate-900">What am I seeing?</div>
          <ul className="mt-2 text-sm text-slate-600 list-disc pl-5 space-y-1">
            <li><strong>Rank stability (ρ):</strong> Similarity of rankings vs. a reference. ≥0.90 is very stable.</li>
            <li><strong>Top-K consistency:</strong> Overlap in the Top-K candidates vs. the reference.</li>
            <li><strong>Avg. rank shift:</strong> Average positions moved up/down; ≤1 is very stable.</li>
            <li><strong>Source:</strong> “Local mock” means demo data cached in your browser (from the Landing run).</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

/* ---------- helpers: normalization & fallbacks ---------- */

/**
 * Your backend may already return exactly what the Evaluation page expects.
 * This function ensures we have the fields the UI needs. If they already exist,
 * it acts mostly as a pass-through.
 */
function normalizeBackendToEvaluation(x: any) {
  // Ensure required top-level fields exist
  const batch_id = x?.batch_id ?? `batch_${Date.now()}`;
  const k = x?.k ?? 5;
  const n_candidates = x?.n_candidates ?? (Array.isArray(x?.candidates) ? x.candidates.length : undefined);

  // candidates: prefer as-is (they likely carry total_after used by AdvancedScoreCard)
  const candidates: CandidateScore[] = Array.isArray(x?.candidates) ? x.candidates : [];

  // ethics flags pass-through
  const ethics_flags = Array.isArray(x?.ethics_flags) ? x.ethics_flags : [];

  // optional summaries
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

/**
 * Transform the locally cached canonical ReportPayload (from Landing.tsx)
 * into the shape this Evaluation page expects (including CandidateScore).
 */
function fromLocalCanonicalToEvaluation(report: ReportPayload, topK?: number) {
  const k = topK ?? 5;

  // Build CandidateScore objects from the canonical candidate shape
  const candidates: CandidateScore[] = report.candidates.map((c) => {
    // total_after is what your page sorts by → map from overall
    const total_after = round1(c.score.overall);

    // fabricate a lightweight "by_criterion" from fairness/transparency so AdvancedScoreCard has substance
    const by_criterion = [
      { criterion: "Fairness", score: round1(c.score.fairness) },
      { criterion: "Transparency", score: round1(c.score.transparency) },
    ];

    // you can extend with more synthetic fields if AdvancedScoreCard uses them
    return {
      // type assertion because CandidateScore is app-specific
      ...( {} as CandidateScore ),
      candidate_id: c.candidate_id,
      total_after,
      total_before: total_after, // no pre/post in local mock → reuse
      by_criterion,
    };
  });

  // Build flags list similar to backend shape used by your UI
  const ethics_flags = report.candidates.map((c) => ({
    candidate_id: c.candidate_id,
    flags: c.flags ?? [],
  }));

  // Optional summaries (simple counts by flag string)
  const allFlags = ethics_flags.flatMap((f) => f.flags || []);
  const flags_by_type = allFlags.reduce((acc: Record<string, number>, f: string) => {
    acc[f] = (acc[f] || 0) + 1;
    return acc;
  }, {});
  const flags_by_severity = undefined; // not tracked in local mock

  // Mock overlap/shift metrics if missing in local canonical
  const spearman_rho = typeof report.spearman_rho === "number" ? report.spearman_rho : round2(0.8 + Math.random() * 0.15);
  const topk_overlap_count = Math.min(k, candidates.length, 3);
  const topk_overlap_ratio = candidates.length ? topk_overlap_count / Math.min(k, candidates.length) : 0;
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
  };
}

/* ---------- small UI atoms ---------- */
function Stat({
  label,
  value,
  tone,
  tooltip,
}: {
  label: string;
  value: any;
  tone?: "good" | "warn" | "bad" | "default";
  tooltip?: string;
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
function round1(n: number) {
  return Number((+n || 0).toFixed(1));
}
function round2(n: number) {
  return Number((+n || 0).toFixed(2));
}
