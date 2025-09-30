// frontend/src/pages/Evaluation.tsx
import { useState } from "react";
import { getReport } from "../lib/api";
import ViewerToggle from "../components/ViewerToggle";
import type { ViewerMode } from "../lib/viewer";

import { asFlagObj } from "../lib/format";
import type { AnyFlag, FlagObj } from "../lib/format";

export default function Evaluation() {
  const [batchId, setBatchId] = useState("");
  const [k, setK] = useState<number | undefined>(undefined);
  const [viewerMode, setViewerMode] = useState<ViewerMode>("recruiter");

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await getReport(batchId.trim(), k);
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
      <div className="mx-auto max-w-5xl p-6 space-y-6">
        {/* Title + viewer mode */}
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Evaluation</h1>
          <ViewerToggle value={viewerMode} onChange={setViewerMode} />
        </div>

        {/* Controls */}
        <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
          <label className="block text-sm font-medium text-slate-700">Batch ID</label>
          <input
            value={batchId}
            onChange={(e) => setBatchId(e.target.value)}
            placeholder="e.g., batch_1234abcd"
            className="mt-1 w-full rounded-md border-slate-300 shadow-sm focus:border-slate-400 focus:ring-slate-400"
          />
          <div className="mt-3 flex gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700">Top-K</label>
              <input
                type="number"
                min={1}
                value={k ?? ""}
                onChange={(e) => setK(e.target.value ? Number(e.target.value) : undefined)}
                placeholder="default 5"
                className="mt-1 w-28 rounded-md border-slate-300 shadow-sm focus:border-slate-400 focus:ring-slate-400"
              />
            </div>
            <button
              onClick={run}
              disabled={!batchId || loading}
              className="self-end rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {loading ? "Computing…" : "Compute report"}
            </button>
          </div>
          {err && <p className="mt-3 text-sm text-rose-600">{err}</p>}
        </div>

        {/* Results */}
        {data && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <Stat label="Candidates" value={data.n_candidates} />
              <Stat label="Spearman ρ (pre vs post blinding)" value={data.spearman_rho ?? "—"} />
              <Stat
                label={`Top-${data.k} overlap`}
                value={`${data.topk_overlap_count} (${(data.topk_overlap_ratio * 100).toFixed(0)}%)`}
              />
              <Stat label="Mean |Δ|" value={data.mean_abs_delta} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
                <div className="text-sm font-semibold text-slate-900">Flags by type</div>
                <ul className="mt-2 text-sm text-slate-700 space-y-1">
                  {Object.entries(data.flags_by_type || {}).map(([k, v]: any) => (
                    <li key={k} className="flex justify-between">
                      <span>{k}</span>
                      <span className="font-medium">{v}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
                <div className="text-sm font-semibold text-slate-900">Flags by severity</div>
                <ul className="mt-2 text-sm text-slate-700 space-y-1">
                  {Object.entries(data.flags_by_severity || {}).map(([k, v]: any) => (
                    <li key={k} className="flex justify-between">
                      <span className="uppercase">{k}</span>
                      <span className="font-medium">{v}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-900">Per-candidate</div>
              <div className="mt-2 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-slate-600">
                    <tr>
                      <th className="py-2 pr-4">Candidate</th>
                      <th className="py-2 pr-4">Total (pre)</th>
                      <th className="py-2 pr-4">Total (post)</th>
                      <th className="py-2 pr-4">Δ</th>
                      <th className="py-2 pr-4">Flags</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.candidates?.map((c: any) => {
                      // Map stored flag types -> richer objects
                      const flagsObj: FlagObj[] = (c.flags as AnyFlag[]).map(asFlagObj);

                      // Slice per viewer mode
                      const warnings = flagsObj.filter(
                        (f) => f.severity === "warning" && f.type !== "DEBUG"
                      );
                      const infos = flagsObj.filter(
                        (f) => f.severity === "info" && f.type !== "DEBUG"
                      );
                      const debug = flagsObj.filter((f) => f.type === "DEBUG");

                      let flagsToShow: FlagObj[] = [];
                      if (viewerMode === "recruiter") {
                        flagsToShow = warnings; // keep it focused
                      } else if (viewerMode === "ethics") {
                        flagsToShow = [...warnings, ...infos];
                      } else {
                        flagsToShow = [...warnings, ...infos, ...debug]; // dev
                      }

                      return (
                        <tr key={c.candidate_id}>
                          <td className="py-2 pr-4 font-medium text-slate-900">{c.candidate_id}</td>
                          <td className="py-2 pr-4">{c.total_before}</td>
                          <td className="py-2 pr-4">{c.total_after}</td>
                          <td
                            className={`py-2 pr-4 ${
                              c.delta < 0
                                ? "text-emerald-700"
                                : c.delta > 0
                                ? "text-rose-700"
                                : ""
                            }`}
                          >
                            {c.delta > 0 ? `+${c.delta}` : c.delta}
                          </td>
                          <td className="py-2 pr-4">
                            <div className="flex flex-wrap gap-1">
                              {flagsToShow.map((f, i) => (
                                <span
                                  key={i}
                                  className={`rounded-full px-2 py-0.5 text-[11px] ring-1 ${
                                    f.severity === "warning"
                                      ? "bg-amber-50 ring-amber-200 text-amber-900"
                                      : f.type === "DEBUG"
                                      ? "bg-slate-50 ring-slate-200 text-slate-700"
                                      : "bg-sky-50 ring-sky-200 text-sky-900"
                                  }`}
                                  title={f.message || ""}
                                >
                                  {f.type}
                                </span>
                              ))}
                              {flagsToShow.length === 0 && (
                                <span className="text-xs text-slate-500">—</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
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
