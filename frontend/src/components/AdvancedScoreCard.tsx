// src/pages/Evaluation.tsx
import React, { useState, useEffect } from "react";
import { getReport } from "../lib/api";
import type { ViewerMode } from "../lib/viewer";
import type { CandidateScore, AnyFlag } from "../lib/format";
import { asFlagObj } from "../lib/format";
import ViewerToggle from "../components/ViewerToggle";
import AdvancedScoreCard from "../components/AdvancedScoreCard";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000/api/v1";

export default function Evaluation() {
  const [batchId, setBatchId] = useState("");
  const [topK, setTopK] = useState<number | undefined>(undefined);
  const [viewerMode, setViewerMode] = useState<ViewerMode | "simple">("recruiter");
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const fetchReport = async () => {
    setLoading(true);
    setErr(null);
    setData(null);
    try {
      const r = await getReport(batchId.trim(), topK);
      setData(r);
    } catch (e: any) {
      setErr(e?.message || "Failed to fetch report. Is the backend running?");
    } finally {
      setLoading(false);
    }
  };

  const sortedCandidates: CandidateScore[] = data?.candidates?.slice().sort((a, b) => b.total_after - a.total_after) || [];

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl p-6 space-y-6">

        {/* Header with toggle */}
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Evaluation Dashboard</h1>
          <div className="hidden sm:block">
            <ViewerToggle value={viewerMode} onChange={setViewerMode} />
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
            <label className="block text-sm font-medium text-slate-700">Top-K</label>
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
              <Stat label="Candidates" value={data.n_candidates} />
              <Stat label="Spearman ρ (pre vs post blinding)" value={data.spearman_rho ?? "—"} />
              <Stat label={`Top-${data.k} overlap`} value={`${data.topk_overlap_count} (${(data.topk_overlap_ratio * 100).toFixed(0)}%)`} />
              <Stat label="Mean |Δ|" value={data.mean_abs_delta} />
            </div>

            {/* Flags overview */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <FlagSummary title="Flags by type" flags={data.flags_by_type} />
              <FlagSummary title="Flags by severity" flags={data.flags_by_severity} />
            </div>

            {/* Candidate comparison */}
            <div className="grid grid-cols-1 gap-4 mt-4">
              {sortedCandidates.map((cand: CandidateScore) => {
                const candFlags: AnyFlag[] = (data.ethics_flags || []).filter((f: any) => f.candidate_id === cand.candidate_id);
                return (
                  <AdvancedScoreCard
                    key={cand.candidate_id}
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
      </div>
    </div>
  );
}

/* ---------- Small reusable components ---------- */
function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-900">{String(value)}</div>
    </div>
  );
}

function FlagSummary({ title, flags }: { title: string; flags: Record<string, number> | undefined; }) {
  return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <ul className="mt-2 text-sm text-slate-700 space-y-1">
        {flags
          ? Object.entries(flags).map(([k, v]) => (
              <li key={k} className="flex justify-between">
                <span>{k}</span>
                <span className="font-medium">{v}</span>
              </li>
            ))
          : <li className="text-slate-400">None</li>}
      </ul>
    </div>
  );
}
