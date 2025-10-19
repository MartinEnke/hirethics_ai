// frontend/src/pages/EvaluationComparison.tsx
import { useState } from "react";
import { getReport } from "../lib/api";
import type { AnyFlag } from "../lib/format";
import { asFlagObj } from "../lib/format";

export default function EvaluationComparison() {
  const [batchId, setBatchId] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await getReport(batchId.trim());
      setData(r);
    } catch (e: any) {
      setErr(e?.message || "Failed to fetch report");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  if (!data) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-4xl mx-auto">
          <label className="block text-sm font-medium text-slate-700">Batch ID</label>
          <input
            value={batchId}
            onChange={(e) => setBatchId(e.target.value)}
            placeholder="e.g., batch_1234abcd"
            className="mt-1 w-full rounded-md border-slate-300 shadow-sm focus:border-slate-400 focus:ring-slate-400"
          />
          <button
            onClick={run}
            disabled={!batchId || loading}
            className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {loading ? "Loading…" : "Fetch Report"}
          </button>
          {err && <p className="mt-3 text-sm text-rose-600">{err}</p>}
        </div>
      </div>
    );
  }

  // Get all criterion keys
  const criteria = data.candidates[0]?.by_criterion.map((c: any) => c.key) || [];

  return (
    <div className="min-h-screen bg-slate-50 p-6 overflow-x-auto">
      <h1 className="text-2xl font-bold mb-4">Candidate Comparison</h1>
      <div className="inline-block min-w-full">
        <table className="min-w-full table-auto border-collapse">
          <thead>
            <tr className="bg-slate-200">
              <th className="p-2 sticky left-0 bg-slate-200 z-10">Criterion / Candidate</th>
              {data.candidates.map((c: any) => (
                <th key={c.candidate_id} className="p-2 text-center">{c.candidate_id}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Scores per criterion */}
            {criteria.map((crit) => {
              const maxScore = Math.max(...data.candidates.map((c: any) => c.by_criterion.find((b: any) => b.key === crit).score));
              return (
                <tr key={crit}>
                  <td className="p-2 font-semibold">{crit}</td>
                  {data.candidates.map((c: any) => {
                    const scoreObj = c.by_criterion.find((b: any) => b.key === crit);
                    return (
                      <td
                        key={c.candidate_id + crit}
                        className={`p-2 text-center ${scoreObj.score === maxScore ? "bg-emerald-50" : ""}`}
                      >
                        <div className="relative h-3 w-20 bg-slate-100 rounded-full overflow-hidden mx-auto">
                          <div
                            className="h-3 bg-emerald-600 rounded-full"
                            style={{ width: `${(scoreObj.score / 5) * 100}%` }}
                            title={`Score: ${scoreObj.score}\nEvidence: ${scoreObj.evidence_span}`}
                          />
                        </div>
                        <div className="text-xs mt-1">{scoreObj.score}</div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}

            {/* Δ row */}
            <tr className="border-t border-slate-300">
              <td className="p-2 font-semibold">Δ (pre vs post)</td>
              {data.candidates.map((c: any) => (
                <td key={c.candidate_id + "_delta"} className="p-2 text-center font-medium">
                  {c.delta > 0 ? `+${c.delta}` : c.delta}
                </td>
              ))}
            </tr>

            {/* Flags row */}
            <tr>
              <td className="p-2 font-semibold">Ethics Flags</td>
              {data.candidates.map((c: any) => {
                const flags: AnyFlag[] = c.flags || [];
                const flagObjs = flags.map(asFlagObj);
                return (
                  <td key={c.candidate_id + "_flags"} className="p-2 text-center flex flex-wrap justify-center gap-1">
                    {flagObjs.map((f, idx) => (
                      <span
                        key={idx}
                        className={`rounded-full px-2 py-0.5 text-[11px] ring-1 ${
                          f.severity === "warning"
                            ? "bg-amber-50 ring-amber-200 text-amber-900"
                            : "bg-slate-50 ring-slate-200 text-slate-700"
                        }`}
                        title={f.message || ""}
                      >
                        {f.type}
                      </span>
                    ))}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
