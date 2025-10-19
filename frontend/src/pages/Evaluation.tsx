// src/pages/Evaluation.tsx
import React, { useEffect, useMemo, useState } from "react";
import type { ReportPayload } from "../types/report";
import { loadMockReport } from "../utils/mockStorage";
// If your path differs, adjust this import:
import AdvancedScoreCard from "../components/AdvancedScoreCard";

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
    const items: Array<{ label: string; value: number | string }> = [
      { label: "Candidates", value: report.n_candidates },
    ];
    if (typeof report.spearman_rho === "number") {
      items.push({ label: "Spearman ρ", value: report.spearman_rho });
    }
    if (typeof report.topk_overlap_count === "number") {
      items.push({ label: "Top-K overlap", value: report.topk_overlap_count });
    }
    if (typeof report.mean_abs_delta === "number") {
      items.push({ label: "Mean |Δ|", value: report.mean_abs_delta });
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
            title={source === "backend" ? "Data from API" : "Data from local cache"}
          >
            Source: {source === "backend" ? "Backend" : "Local mock"}
          </span>
        )}
      </div>

      <div className="flex gap-2 mb-5">
        <input
          className="border rounded px-3 py-2 flex-1"
          placeholder="Batch ID"
          value={batchId}
          onChange={(e) => setBatchId(e.target.value)}
        />
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

      {loading && <p className="text-slate-600">Loading…</p>}
      {error && <p className="text-rose-700">{error}</p>}

      {report && (
        <>
          {/* Metrics row */}
          <section className="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {headerMetrics.map((m) => (
              <Metric key={m.label} label={m.label} value={m.value} />
            ))}
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
 * If your backend already returns this exact shape, this is a no-op pass-through.
 */
function normalizeBackendReport(x: any): ReportPayload {
  const candidatesSrc = Array.isArray(x?.candidates) ? x.candidates : [];

  const candidates = candidatesSrc.map((c: any) => ({
    candidate_id: c.candidate_id ?? c.id ?? `cand_${Math.random().toString(36).slice(2, 8)}`,
    score: {
      overall: num(c?.score?.overall ?? c?.overall ?? 0, 1),
      fairness: num(
        c?.score?.fairness ?? c?.fairness ?? Math.max(50, Math.min(95, (c?.score?.overall ?? c?.overall ?? 60) + 5 + Math.random() * 10)),
        1
      ),
      transparency: num(
        c?.score?.transparency ?? c?.transparency ?? Math.max(50, Math.min(95, (c?.score?.overall ?? c?.overall ?? 60) - 2 + Math.random() * 12)),
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

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border p-4">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}
