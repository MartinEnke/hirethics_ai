// frontend/src/pages/Evaluation.tsx
import React, { useEffect, useMemo, useState } from "react";
import type { ReportPayload } from "../types/report";
import { loadMockReport } from "../utils/mockStorage";
import AdvancedScoreCard from "../components/AdvancedScoreCard";
import Tooltip from "../components/Tooltip";

export default function EvaluationPage() {
  const [batchId, setBatchId] = useState<string>("");
  const [report, setReport] = useState<ReportPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<"backend" | "local" | null>(null);

  // Auto-fill latest batch id once on mount
  useEffect(() => {
    const latest = localStorage.getItem("latestBatchId") || "";
    if (latest) setBatchId(latest);
  }, []);

  // Auto-fetch whenever batchId changes (and is non-empty)
  useEffect(() => {
    if (batchId) {
      void fetchReport(batchId);
    } else {
      setReport(null);
      setSource(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId]);

  async function fetchReport(id: string) {
    setLoading(true);
    setError(null);
    setReport(null);
    setSource(null);

    try {
      // 1) Try backend first
      const res = await fetch(`/report/${encodeURIComponent(id)}`);
      if (res.ok) {
        const raw = await res.json();
        const normalized = normalizeBackendReport(raw);
        setReport(normalized);
        setSource("backend");
      } else {
        // 2) Fallback to local cached mock
        const local = loadMockReport(id);
        if (local) {
          setReport(local);
          setSource("local");
        } else {
          throw new Error(`No backend report and no local mock found for "${id}".`);
        }
      }
    } catch (e: any) {
      // Network error → fallback to local mock
      const local = loadMockReport(id);
      if (local) {
        setReport(local);
        setSource("local");
      } else {
        setError(e?.message || "Failed to load report.");
      }
    } finally {
      setLoading(false);
    }
  }

  const headerMetrics = useMemo(() => {
    if (!report) return [];
    const items: Array<{ label: string; value: number | string; tooltip?: string; tone?: "good" | "warn" | "bad" | "default" }> = [];

    // Candidates
    items.push({
      label: "Candidates",
      value: report.n_candidates,
      tooltip: "Number of candidates scored in this batch."
    });

    // Rank stability (Spearman ρ)
    if (typeof report.spearman_rho === "number") {
      const v = report.spearman_rho;
      const tone = v >= 0.9 ? "good" : v >= 0.8 ? "warn" : "bad";
      items.push({
        label: "Rank stability (ρ)",
        value: v,
        tone,
        tooltip: "Spearman rank correlation vs. a reference run (e.g., previous or blinded). Higher = more stable ranking."
      });
    }

    // Top-K consistency (overlap)
    if (typeof report.topk_overlap_count === "number") {
      items.push({
        label: "Top-K consistency",
        value: report.topk_overlap_count,
        tooltip: "How many candidates stayed in the Top-K compared to the reference. Higher = more consistent shortlist."
      });
    }

    // Avg. rank shift (Mean |Δ|)
    if (typeof report.mean_abs_delta === "number") {
      const v = report.mean_abs_delta;
      const tone = v <= 1 ? "good" : v <= 3 ? "warn" : "bad";
      items.push({
        label: "Avg. rank shift",
        value: v,
        tone,
        tooltip: "Average absolute change in rank position vs. the reference. Lower = more stable."
      });
    }

    return items;
  }, [report]);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h1 className="text-2xl font-semibold">Evaluation</h1>
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
      </div>

      <div className="flex flex-col sm:flex-row gap-2 mb-5">
        <input
          className="border rounded px-3 py-2 flex-1"
          placeholder="Batch ID"
          value={batchId}
          onChange={(e) => setBatchId(e.target.value)}
        />
        <div className="flex gap-2">
          <button
            className="px-4 py-2 rounded bg-black text-white"
            onClick={() => batchId && fetchReport(batchId)}
          >
            Load
          </button>
          <button
            className="px-4 py-2 rounded border"
            onClick={() => {
              const latest = localStorage.getItem("latestBatchId") || "";
              if (latest) setBatchId(latest);
            }}
          >
            Load last run
          </button>
        </div>
      </div>

      {loading && <p className="text-slate-600">Loading…</p>}
      {error && <p className="text-rose-700">{error}</p>}

      {report && (
        <>
          {/* Metrics row */}
          <section className="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {headerMetrics.map((m) => (
              <Metric
                key={m.label}
                label={m.label}
                value={m.value}
                tone={m.tone ?? "default"}
                tooltip={m.tooltip}
              />
            ))}
          </section>

          {/* Explainer panel */}
          <section className="mb-6 rounded-xl border border-slate-200 p-4 bg-white">
            <div className="text-sm font-semibold text-slate-900">What am I seeing?</div>
            <ul className="mt-2 text-sm text-slate-600 list-disc pl-5 space-y-1">
              <li><strong>Rank stability (ρ):</strong> Similarity of rankings vs. a reference. ≥0.90 is very stable.</li>
              <li><strong>Top-K consistency:</strong> Overlap in the Top-K candidates vs. the reference.</li>
              <li><strong>Avg. rank shift:</strong> Average positions moved up/down; ≤1 is very stable.</li>
              <li><strong>Source:</strong> “Local mock” means demo data cached in your browser.</li>
            </ul>
          </section>

          {/* Candidate cards */}
          <section className="space-y-3">
            {report.candidates.map((c) => (
              <AdvancedScoreCard
                key={c.candidate_id}
                candidateId={c.candidate_id}
                overall={c.score.overall}
                fairness={c.score.fairness}
                transparency={c.score.transparency}
                flags={c.flags}
              />
            ))}
          </section>
        </>
      )}

      {!loading && !error && !report && (
        <div className="mt-10 text-slate-600">
          <p>
            Enter a Batch ID or click <span className="font-medium">Load last run</span> to view your most recent demo.
          </p>
        </div>
      )}
    </div>
  );
}

/* ---------- helpers ---------- */
/**
 * Normalize a backend response to ReportPayload.
 * If your backend already returns this exact shape, this acts as a pass-through.
 */
function normalizeBackendReport(x: any): ReportPayload {
  const candidatesSrc = Array.isArray(x?.candidates) ? x.candidates : [];

  const candidates = candidatesSrc.map((c: any) => ({
    candidate_id: c.candidate_id ?? c.id ?? `cand_${Math.random().toString(36).slice(2, 8)}`,
    score: {
      overall: num(c?.score?.overall ?? c?.overall ?? 0, 1),
      fairness: num(
        c?.score?.fairness ??
          c?.fairness ??
          Math.max(50, Math.min(95, (c?.score?.overall ?? c?.overall ?? 60) + 5 + Math.random() * 10)),
        1
      ),
      transparency: num(
        c?.score?.transparency ??
          c?.transparency ??
          Math.max(50, Math.min(95, (c?.score?.overall ?? c?.overall ?? 60) - 2 + Math.random() * 12)),
        1
      ),
    },
    flags: Array.isArray(c?.flags) ? c.flags : Array.isArray(c?.ethics_flags) ? c.ethics_flags : [],
  }));

  return {
    batch_id: x?.batch_id ?? `batch_${Date.now()}`,
    n_candidates: typeof x?.n_candidates === "number" ? x.n_candidates : candidates.length,
    spearman_rho: typeof x?.spearman_rho === "number" ? x.spearman_rho : undefined,
    topk_overlap_count: typeof x?.topk_overlap_count === "number" ? x.topk_overlap_count : undefined,
    mean_abs_delta: typeof x?.mean_abs_delta === "number" ? x.mean_abs_delta : undefined,
    candidates,
  };
}

function num(v: any, digits = 0): number {
  const n = Number(v);
  if (Number.isNaN(n)) return 0;
  return Number(n.toFixed(digits));
}

/* ---------- UI atoms ---------- */
function Metric({
  label,
  value,
  tooltip,
  tone = "default",
}: {
  label: string;
  value: number | string;
  tooltip?: string;
  tone?: "good" | "warn" | "bad" | "default";
}) {
  const toneClass =
    tone === "good" ? "border-emerald-200" :
    tone === "warn" ? "border-amber-200" :
    tone === "bad"  ? "border-rose-200" :
                      "border-slate-200";
  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <div className="text-xs text-slate-500 flex items-center gap-1">
        {tooltip ? (
          <Tooltip text={tooltip}>
            <span className="underline decoration-dotted underline-offset-2 cursor-help">{label}</span>
          </Tooltip>
        ) : (
          <span>{label}</span>
        )}
      </div>
      <div className="text-xl font-semibold mt-1">{value}</div>
    </div>
  );
}
