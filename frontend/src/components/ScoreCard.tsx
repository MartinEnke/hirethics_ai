// frontend/src/components/ScoreCard.tsx
import React from "react";
import type { ViewerMode } from "../lib/viewer";
import type { FlagObj } from "../lib/format";

type Criterion = { key: string; score: number; evidence_span: string; rationale?: string };

type Props = {
  candidateId: string;
  total: number;
  by: Criterion[];
  flags: FlagObj[];         // already mapped with asFlagObj in the parent
  viewerMode: ViewerMode;   // "recruiter" | "ethics" | "dev"
};

// ---------- helpers ----------
function getDelta(flags: FlagObj[]): number | null {
  // Prefer BLINDING_DELTA/PROXY details.delta; fall back to DEBUG.details.delta
  for (const f of flags) {
    if ((f.type === "BLINDING_DELTA" || f.type === "PROXY_EVIDENCE") && f.details?.delta !== undefined) {
      return Number(f.details.delta);
    }
  }
  const dbg = flags.find(f => f.type === "DEBUG");
  if (dbg?.details?.delta !== undefined) return Number(dbg.details.delta);
  return null;
}

function prestigeSignals(flags: FlagObj[]): { strict: string[]; generic: string[]; removed: boolean | null } {
  const p = flags.find(f => f.type === "PROXY_EVIDENCE");
  if (!p) return { strict: [], generic: [], removed: null };
  const strict = (p.details?.tokens_strict as string[]) || (p.details?.tokens as string[]) || [];
  const generic = (p.details?.tokens_generic as string[]) || [];
  const removed = typeof p.details?.removed_by_blinding === "boolean" ? p.details.removed_by_blinding : null;
  return { strict, generic, removed };
}

function missingEvidence(flags: FlagObj[]): string[] {
  const n = flags.find(f => f.type === "NO_EVIDENCE");
  return (n?.details?.criteria as string[]) || [];
}

function stabilityLabel(delta: number | null, threshold = 0.25) {
  if (delta == null) return { label: "N/A", tone: "muted" as const };
  const a = Math.abs(delta);
  if (a < 0.05) return { label: "Stable", tone: "good" as const };
  if (a < threshold) return { label: "Slight shift", tone: "warn" as const };
  return { label: "Unstable", tone: "bad" as const };
}

function toneClass(tone: "good" | "warn" | "bad" | "muted") {
  switch (tone) {
    case "good": return "bg-emerald-50 ring-emerald-200 text-emerald-900";
    case "warn": return "bg-amber-50 ring-amber-200 text-amber-900";
    case "bad":  return "bg-rose-50 ring-rose-200 text-rose-900";
    default:     return "bg-slate-50 ring-slate-200 text-slate-700";
  }
}

function Chip({ children, tone = "muted" }: { children: React.ReactNode; tone?: "good" | "warn" | "bad" | "muted" }) {
  return <span className={`rounded-full px-2 py-0.5 text-[11px] ring-1 ${toneClass(tone)}`}>{children}</span>;
}

// ---------- component ----------
export default function ScoreCard({ candidateId, total, by, flags, viewerMode }: Props) {
  const delta = getDelta(flags);
  const { strict, generic, removed } = prestigeSignals(flags);
  const miss = missingEvidence(flags);
  const stab = stabilityLabel(delta); // uses default threshold 0.25

  const warnings = flags.filter(f => f.severity === "warning" && f.type !== "DEBUG");
  const infos    = flags.filter(f => f.severity === "info" && f.type !== "DEBUG");
  const debug    = flags.filter(f => f.type === "DEBUG");

  const hasPrestige = strict.length > 0 || generic.length > 0;

  return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
      {/* header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase text-slate-500">Candidate</div>
          <div className="text-sm font-semibold text-slate-900">{candidateId}</div>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase text-slate-500">Total</div>
          <div className="text-lg font-semibold text-emerald-700">{total}</div>
        </div>
      </div>

      {/* summary chips differ per mode */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {/* Stability */}
        {viewerMode !== "dev" && (
          <Chip tone={stab.tone}>
            {stab.label}{delta != null && (delta > 0 ? ` (+${delta})` : delta < 0 ? ` (${delta})` : "")}
          </Chip>
        )}
        {/* Brand / proxy */}
        {viewerMode !== "dev" && hasPrestige && (
          <Chip tone={removed ? "good" : "warn"}>
            Brand influence {removed === true ? "removed by blinding" : removed === false ? "present after blinding" : ""}
          </Chip>
        )}
        {viewerMode === "ethics" && miss.length > 0 && (
          <Chip tone="warn">Missing evidence: {miss.join(", ")}</Chip>
        )}
        {viewerMode === "dev" && (
          <>
            <Chip tone="muted">warnings: {warnings.length}</Chip>
            <Chip tone="muted">infos: {infos.length}</Chip>
          </>
        )}
      </div>

      {/* criteria list */}
      <ul className="mt-4 grid md:grid-cols-2 gap-2 text-sm text-slate-700">
        {by.map((c) => (
          <li key={c.key} className="rounded-md bg-slate-50 p-3 ring-1 ring-slate-200">
            <div className="text-slate-900 font-medium">
              {c.key} — {c.score}
            </div>
            <div className="mt-1">
              <span className="font-semibold">Evidence:</span>{" "}
              {viewerMode === "recruiter" ? c.evidence_span : c.evidence_span}
            </div>
            {viewerMode !== "recruiter" && c.rationale && (
              <div className="mt-1 text-slate-500">{c.rationale}</div>
            )}
          </li>
        ))}
      </ul>

      {/* mode-specific sections */}
      {viewerMode === "recruiter" && (
        <div className="mt-4 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            {hasPrestige ? "Brand tokens were detected but blinding neutralized them." : "No brand influence detected."}
          </div>
          <div className="text-sm text-slate-800">
            <span className="font-medium">Next step:</span>{" "}
            {hasPrestige ? "Focus interview on recent hands-on work, not school/brand." : "Proceed with structured interview on rubric areas."}
          </div>
        </div>
      )}

      {viewerMode === "ethics" && (
        <div className="mt-4 grid gap-3">
          {/* Delta row */}
          <div className={`rounded-lg p-3 ring-1 ${toneClass(stab.tone)}`}>
            <div className="text-xs uppercase">Blinding delta</div>
            <div className="text-sm font-semibold">
              {delta == null ? "—" : delta > 0 ? `+${delta}` : String(delta)}
            </div>
          </div>

          {/* Prestige details */}
          {hasPrestige && (
            <div className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
              <div className="text-xs uppercase text-slate-600 mb-1">Proxy / prestige tokens</div>
              {strict.length > 0 && (
                <div className="text-sm"><span className="font-medium">Strict:</span> {strict.join(", ")}</div>
              )}
              {generic.length > 0 && (
                <div className="text-sm"><span className="font-medium">Generic:</span> {generic.join(", ")}</div>
              )}
              {removed !== null && (
                <div className="text-xs text-slate-500 mt-1">
                  {removed ? "Removed by blinding." : "Persisted after blinding."}
                </div>
              )}
            </div>
          )}

          {/* Warnings stack (without DEBUG) */}
          {(warnings.length > 0 || infos.length > 0) && (
            <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-900">Flags</div>
              <ul className="mt-2 space-y-2">
                {warnings.concat(infos).map((f, i) => (
                  <li key={i} className={`rounded-md p-2 ring-1 ${f.severity === "warning" ? "bg-amber-50 ring-amber-200 text-amber-900" : "bg-slate-50 ring-slate-200 text-slate-800"}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] uppercase tracking-wide font-semibold">{f.type}</span>
                      {f.details?.delta !== undefined && (
                        <span className="text-xs">Δ {String(f.details.delta)}</span>
                      )}
                    </div>
                    <div className="text-sm mt-0.5">{f.message}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {viewerMode === "dev" && (
        <div className="mt-4">
          <div className="text-xs uppercase text-slate-600">Debug details</div>
          <pre className="mt-2 text-xs bg-slate-50 ring-1 ring-slate-200 rounded p-2 whitespace-pre-wrap">
            {JSON.stringify(flags, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
