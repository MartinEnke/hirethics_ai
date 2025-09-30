// frontend/src/components/ScoreCard.tsx
import { useState } from "react";
import type { Criterion, FlagObj } from "../lib/format";
import {
  getDebug,
  getDelta,
  evidenceCoverage,
  topContributors,
  verdict,
  fmtDelta,
  pct,
} from "../lib/format";
import type { ViewerMode } from "../lib/viewer";
import {
  visibleFlags,
  allowDebug,
  showEvidenceCoverage,
  showEvidenceSpans,
  summarizeFlagDetails,
} from "../lib/viewer";

type ScoreCardProps = {
  candidateId: string;
  total: number;
  by: Criterion[];
  flags: FlagObj[];
  viewerMode: ViewerMode; // NEW
};

const titleize = (k: string) =>
  k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const toneClass = (tone: "good" | "mid" | "warn" | "bad") =>
  tone === "good"
    ? "bg-emerald-50 ring-emerald-200 text-emerald-800"
    : tone === "mid"
    ? "bg-sky-50 ring-sky-200 text-sky-800"
    : tone === "warn"
    ? "bg-amber-50 ring-amber-200 text-amber-900"
    : "bg-rose-50 ring-rose-200 text-rose-900";

const sevClass = (s: "info" | "warning") =>
  s === "warning"
    ? "bg-amber-50 text-amber-900 ring-amber-200"
    : "bg-slate-50 text-slate-700 ring-slate-200";

export default function ScoreCard({ candidateId, total, by, flags, viewerMode }: ScoreCardProps) {
  const [showInfo, setShowInfo] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  // Respect viewer mode
  const displayFlags = visibleFlags(flags, viewerMode);
  const dbg = getDebug(flags); // keep full debug for internal calcs
  const weights: Record<string, number> = (dbg?.weights as Record<string, number>) || {};
  const delta = getDelta(flags);
  const hasWarn = displayFlags.some((f) => f.severity === "warning");
  const v = verdict(total, hasWarn);
  const cov = evidenceCoverage(flags, by);
  const contribs = topContributors(by, weights, 2);

  const proxy = flags.find((f) => f.type === "PROXY_EVIDENCE");
  const blindingNote =
    delta === 0
      ? proxy
        ? proxy.severity === "warning"
          ? "Prestige signals detected (review), but did not change the total."
          : "Generic institution mention; no change to score."
        : "No change under blinding."
      : delta > 0
      ? "Total decreased after blinding (possible prestige boost before)."
      : "Total increased after blinding (prestige removal increased score).";

  // Group after filtering
  const warnings = displayFlags.filter((f) => f.severity === "warning");
  const infos = displayFlags.filter((f) => f.severity === "info");
  const debugFlags = allowDebug(viewerMode) ? flags.filter((f) => f.type === "DEBUG") : [];

  return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-slate-500">Candidate</div>
          <div className="font-semibold text-slate-900">{candidateId}</div>
        </div>
        <span className={`text-xs rounded-full px-2 py-0.5 ring-1 ${toneClass(v.tone)}`}>
          {v.label}
        </span>
      </div>

      <div className="mt-2 text-3xl font-bold tracking-tight">{total.toFixed(2)}</div>

      {/* BLINDING IMPACT */}
      <div className="mt-3 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
        <div className="text-xs uppercase tracking-wide text-slate-500">Blinding impact</div>
        <div className="mt-1 text-sm text-slate-800">
          Δ {fmtDelta(delta)} — {blindingNote}
        </div>
        {!!proxy?.details?.tokens_strict?.length && viewerMode !== "recruiter" && (
          <div className="mt-1 text-xs text-slate-600">
            Tokens: {proxy.details.tokens_strict.join(", ")}
          </div>
        )}
      </div>

      {/* EVIDENCE COVERAGE (hidden for recruiter) */}
      {showEvidenceCoverage(viewerMode) && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-500">
            <span>Evidence coverage</span>
            <span className="text-slate-700">{pct(cov.pct)}</span>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded bg-slate-100">
            <div className="h-2 bg-slate-900" style={{ width: `${cov.pct}%` }} />
          </div>
          <div className="mt-1 text-xs text-slate-600">
            <span className="mr-3">Strong: {cov.strong}</span>
            <span className="mr-3">Weak: {cov.weak}</span>
            <span>Missing: {cov.miss}</span>
          </div>
        </div>
      )}

      {/* TOP CONTRIBUTORS */}
      <div className="mt-3">
        <div className="text-xs uppercase tracking-wide text-slate-500">Top contributors</div>
        <div className="mt-1 flex flex-wrap gap-1">
          {contribs.map((c) => (
            <span
              key={c.key}
              className="rounded-full bg-slate-50 px-2 py-0.5 text-[11px] ring-1 ring-slate-200"
              title={`weight ${c.w} × score ${c.score}`}
            >
              {titleize(c.key)} · {(c.w * c.score).toFixed(2)}
            </span>
          ))}
          {contribs.length === 0 && (
            <span className="text-xs text-slate-500">No weighted rubric provided.</span>
          )}
        </div>
      </div>

      {/* PER-CRITERION DETAIL */}
      <div className="mt-4 space-y-3">
        {by.map((c) => (
          <div key={c.key} className="rounded-lg border border-slate-200 p-3">
            <div className="flex items-center justify-between">
              <div className="font-medium text-slate-900">{titleize(c.key)}</div>
              <div className="text-sm font-semibold">{c.score.toFixed(1)}</div>
            </div>
            <div className="mt-1 text-sm text-slate-700">
              <span className="font-medium">Evidence: </span>
              {showEvidenceSpans(viewerMode) ? (
                c.evidence_span || <span className="italic text-slate-500">—</span>
              ) : (
                <span className="italic text-slate-500">Hidden in recruiter mode</span>
              )}
            </div>
            {viewerMode !== "recruiter" && (
              <div className="mt-1 text-xs text-slate-600">{c.rationale}</div>
            )}
          </div>
        ))}
      </div>

      {/* FLAGS */}
      <div className="mt-4">
        <div className="text-xs uppercase tracking-wide text-slate-500">Ethics flags</div>

        {/* Warnings expanded */}
        <div className="mt-2 space-y-2">
          {warnings.map((f, idx) => {
            const details = summarizeFlagDetails(f, viewerMode);
            return (
              <div key={`warn-${idx}`} className="rounded-md border border-amber-200 bg-amber-50 p-2">
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ring-1 ${sevClass("warning")}`}>
                    {f.type}
                  </span>
                  <span className="text-xs font-medium text-amber-900">{f.message}</span>
                </div>
                {details && (
                  <pre className="mt-1 max-h-40 overflow-auto rounded bg-white p-2 text-xs ring-1 ring-amber-200">
                    {JSON.stringify(details, null, 2)}
                  </pre>
                )}
              </div>
            );
          })}
          {warnings.length === 0 && (
            <div className="text-xs text-slate-500">No warnings.</div>
          )}
        </div>

        {/* Info collapsible */}
        {infos.length > 0 && (
          <div className="mt-3">
            <button
              onClick={() => setShowInfo((s) => !s)}
              className="text-xs underline underline-offset-2"
            >
              {showInfo ? "Hide info" : `Show info (${infos.length})`}
            </button>
            {showInfo && (
              <div className="mt-2 space-y-2">
                {infos.map((f, idx) => {
                  const details = summarizeFlagDetails(f, viewerMode);
                  return (
                    <div key={`info-${idx}`} className="rounded-md border border-slate-200 bg-slate-50 p-2">
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] ring-1 ${sevClass("info")}`}>
                          {f.type}
                        </span>
                        <span className="text-xs text-slate-700">{f.message}</span>
                      </div>
                      {details && (
                        <pre className="mt-1 max-h-40 overflow-auto rounded bg-white p-2 text-xs ring-1 ring-slate-200">
                          {JSON.stringify(details, null, 2)}
                        </pre>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Debug collapsible (Dev only) */}
        {debugFlags.length > 0 && allowDebug(viewerMode) && (
          <div className="mt-3">
            <button
              onClick={() => setShowDebug((s) => !s)}
              className="text-xs underline underline-offset-2"
            >
              {showDebug ? "Hide debug" : `Show debug (${debugFlags.length})`}
            </button>
            {showDebug && (
              <div className="mt-2 space-y-2">
                {debugFlags.map((f, idx) => (
                  <div key={`dbg-${idx}`} className="rounded-md border border-slate-200 bg-slate-50 p-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] ring-1 ring-slate-200">
                        DEBUG
                      </span>
                      <span className="text-xs text-slate-700">{f.message}</span>
                    </div>
                    {f.details && (
                      <pre className="mt-1 max-h-60 overflow-auto rounded bg-white p-2 text-xs ring-1 ring-slate-200">
                        {JSON.stringify(f.details, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
