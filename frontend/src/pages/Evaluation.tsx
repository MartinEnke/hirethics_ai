// frontend/src/pages/Evaluation.tsx
import { useState, useEffect } from "react";
import { getReport } from "../lib/api";
import type { ViewerMode } from "../lib/viewer";
import AdvancedScoreCard from "../components/AdvancedScoreCard";

export default function Evaluation() {
  const [batchId, setBatchId] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [viewerMode, setViewerMode] = useState<ViewerMode>("recruiter");

  // Load demo batch from localStorage if exists
  useEffect(() => {
    const demoData = localStorage.getItem("demoBatch");
    if (demoData) {
      const parsed = JSON.parse(demoData);
      setData(parsed);
      setBatchId(parsed.batch_id || "");
    }
  }, []);

  const run = async () => {
    const trimmedId = batchId.trim();
    if (!trimmedId) return;

    // Check if batchId matches demo batch
    const demoData = localStorage.getItem("demoBatch");
    if (demoData) {
      const parsed = JSON.parse(demoData);
      if (parsed.batch_id === trimmedId) {
        setData(parsed);
        return;
      }
    }

    // Otherwise fetch from backend
    setLoading(true);
    setErr(null);
    try {
      const r = await getReport(trimmedId);
      setData(r);
    } catch (e: any) {
      setErr(e?.message || "Failed to fetch report");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Candidate Evaluation</h1>
          <ViewerToggle value={viewerMode} onChange={setViewerMode} />
        </div>

        {/* Batch input */}
        <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
          <label className="block text-sm font-medium text-slate-700">Batch ID</label>
          <input
            value={batchId}
            onChange={(e) => setBatchId(e.target.value)}
            placeholder="e.g., batch_1234abcd or demo batch"
            className="mt-1 w-full rounded-md border-slate-300 shadow-sm focus:border-slate-400 focus:ring-slate-400"
          />
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={run}
              disabled={!batchId || loading}
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {loading ? "Loading…" : "Fetch Report"}
            </button>
          </div>
          {err && <p className="mt-3 text-sm text-rose-600">{err}</p>}
        </div>

        {data && (
          <>
            {/* Summary stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <Stat label="Candidates" value={data.n_candidates} />
              <Stat label="Spearman ρ" value={data.spearman_rho ?? "—"} />
              <Stat label="Top-K overlap" value={`${data.topk_overlap_count} (${(data.topk_overlap_ratio*100).toFixed(0)}%)`} />
              <Stat label="Mean |Δ|" value={data.mean_abs_delta} />
            </div>

            {/* Candidate cards */}
            <div className="mt-6 grid grid-cols-1 gap-4">
              {data.scores?.map((c: any) => (
                <AdvancedScoreCard
                  key={c.candidate_id}
                  candidate={c}
                  viewerMode={viewerMode}
                />
              ))}
            </div>

            {/* Optional download buttons */}
            <div className="mt-6 flex gap-2">
              <a
                href={`http://localhost:8000/api/v1/audit/${data.batch_id}.json`}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-slate-900 ring-1 ring-slate-300 hover:bg-slate-50"
              >
                Export JSON
              </a>
              <a
                href={`http://localhost:8000/api/v1/audit/${data.batch_id}.csv`}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-slate-900 ring-1 ring-slate-300 hover:bg-slate-50"
              >
                Export CSV
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-900">{String(value)}</div>
    </div>
  );
}

// --- minimal viewer toggle component ---
function ViewerToggle({ value, onChange }: { value: ViewerMode; onChange: (v: ViewerMode) => void }) {
  return (
    <div className="flex items-center gap-2">
      <button
        className={`px-2 py-1 rounded-md text-sm font-medium ${value === "recruiter" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-700"}`}
        onClick={() => onChange("recruiter")}
      >
        Recruiter
      </button>
      <button
        className={`px-2 py-1 rounded-md text-sm font-medium ${value === "simple" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-700"}`}
        onClick={() => onChange("simple")}
      >
        Simple
      </button>
    </div>
  );
}
