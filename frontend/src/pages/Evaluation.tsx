import { useMemo, useState } from "react";
import { getReport } from "../lib/api";
import ViewerToggle from "../components/ViewerToggle";
import type { ViewerMode } from "../lib/viewer";

// keep in sync with backend
const BLINDING_DELTA_THRESHOLD = 0.25;

export default function Evaluation() {
  const [viewerMode, setViewerMode] = useState<ViewerMode>("recruiter");
  const [batchId, setBatchId] = useState("");
  const [k, setK] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setLoading(true); setErr(null);
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

  // --- derived summaries ---------------------------------------------------
  const summary = useMemo(() => {
    if (!data) {
      return {
        n: 0,
        meanAbsDelta: 0,
        meanDelta: 0,
        rho: null as number | null,
        shiftedCount: 0,
        shiftedPct: 0,
        needsProof: 0,
        brandInfluence: 0,
        warnTotal: 0,
        infoTotal: 0,
      };
    }
    const n = Number(data.n_candidates || 0);
    const meanAbsDelta = Number(data.mean_abs_delta || 0);
    const meanDelta = Number(data.mean_delta || 0);
    const rho = data.spearman_rho ?? null;

    const cands = (data.candidates || []) as Array<{ delta: number; flags: string[] }>;
    const shiftedCount = cands.filter(c => Math.abs(Number(c.delta)) >= BLINDING_DELTA_THRESHOLD).length;
    const shiftedPct = n ? Math.round((shiftedCount / n) * 100) : 0;

    const needsProof = Number(data.flags_by_type?.NO_EVIDENCE || 0);
    const brandInfluence = Number(data.flags_by_type?.PROXY_EVIDENCE || 0);

    const warnTotal = Number(data.flags_by_severity?.warning || 0);
    const infoTotal = Number(data.flags_by_severity?.info || 0);

    return { n, meanAbsDelta, meanDelta, rho, shiftedCount, shiftedPct, needsProof, brandInfluence, warnTotal, infoTotal };
  }, [data]);

  // rows sorted per viewer mode
  const rows = useMemo(() => {
    const list = [...(data?.candidates || [])];
    if (viewerMode === "ethics" || viewerMode === "dev") {
      return list.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)); // riskiest first
    }
    return list.sort((a, b) => b.total_before - a.total_before); // strongest first
  }, [data, viewerMode]);

  // which flag chips to show
  const visibleFlags = (flags: string[]) => {
    if (viewerMode === "recruiter") return flags.filter(t => t !== "DEBUG");
    if (viewerMode === "ethics")    return flags.filter(t => t !== "DEBUG");
    return flags; // dev -> everything
  };

  // recruiter-friendly labels
  const chipLabel = (t: string): string => {
    if (viewerMode !== "recruiter") return t;
    if (t === "BLINDING_DELTA")  return "Shifted under blinding";
    if (t === "PROXY_EVIDENCE")  return "Brand influence";
    if (t === "NO_EVIDENCE")     return "Needs proof";
    if (t === "DEBUG")           return "Debug"; // shouldn’t appear in recruiter mode
    return t;
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Evaluation</h1>
          <ViewerToggle value={viewerMode} onChange={setViewerMode} />
        </div>

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

        {data && (
          <>
            {/* headline stats differ by viewer */}
            {viewerMode === "recruiter" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <Stat label="Mean |Δ|" value={summary.meanAbsDelta} />
                <Stat label="At risk after blinding" value={summary.shiftedCount} />
                <Stat label="Needs proof" value={summary.needsProof} />
                <Stat label="Brand influence" value={summary.brandInfluence} />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <Stat label="Mean Δ (signed)" value={summary.meanDelta} />
                <Stat label="Spearman ρ" value={summary.rho ?? "—"} />
                <Stat label="% shifted ≥ 0.25" value={`${summary.shiftedPct}%`} />
                <Stat label="Proxy flags" value={summary.brandInfluence} />
              </div>
            )}

            {/* flag summaries */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
                <div className="text-sm font-semibold text-slate-900">
                  {viewerMode === "recruiter" ? "Issues flagged (by type)" : "Flags by type"}
                </div>
                <ul className="mt-2 text-sm text-slate-700 space-y-1">
                  {Object.entries(data.flags_by_type || {}).map(([k, v]: any) => (
                    <li key={k} className="flex justify-between"><span>{k}</span><span className="font-medium">{v}</span></li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
                <div className="text-sm font-semibold text-slate-900">Flags by severity</div>
                <ul className="mt-2 text-sm text-slate-700 space-y-1">
                  {Object.entries(data.flags_by_severity || {}).map(([k, v]: any) => (
                    <li key={k} className="flex justify-between"><span className="uppercase">{k}</span><span className="font-medium">{v}</span></li>
                  ))}
                </ul>
              </div>
            </div>

            {/* table */}
            <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-900">
                {viewerMode === "recruiter" ? "Per-candidate (summary view)" : "Per-candidate (risk-ordered)"}
              </div>
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
                    {rows.map((c: any) => {
                      const chipTypes: string[] = visibleFlags(c.flags || []);
                      return (
                        <tr key={c.candidate_id}>
                          <td className="py-2 pr-4 font-medium text-slate-900">{c.candidate_id}</td>
                          <td className="py-2 pr-4">{c.total_before}</td>
                          <td className="py-2 pr-4">{c.total_after}</td>
                          <td className={`py-2 pr-4 ${c.delta < 0 ? "text-emerald-700" : c.delta > 0 ? "text-rose-700" : ""}`}>
                            {viewerMode !== "recruiter" ? (c.delta > 0 ? `+${c.delta}` : c.delta) : Math.abs(c.delta).toFixed(2)}
                          </td>
                          <td className="py-2 pr-4">
                            <div className="flex flex-wrap gap-1">
                              {chipTypes.map((t: string, i: number) => (
                                <span
                                  key={i}
                                  className={`rounded-full px-2 py-0.5 text-[11px] ring-1 ${
                                    t === "DEBUG" ? "bg-slate-50 ring-slate-200 text-slate-700" : "bg-amber-50 ring-amber-200 text-amber-900"
                                  }`}
                                  title={
                                    t === "PROXY_EVIDENCE" ? "Brand mentions affected the score." :
                                    t === "BLINDING_DELTA" ? "Score changed when identity was hidden." :
                                    t === "NO_EVIDENCE" ? "Some claims could not be verified in the CV." : t
                                  }
                                >
                                  {chipLabel(t)}
                                </span>
                              ))}
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
