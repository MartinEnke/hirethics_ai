// src/lib/format.ts

export type Criterion = {
    key: string;
    score: number;
    evidence_span: string;
    rationale: string;
  };
  
  // What the scoring endpoint returns per-flag
  export type FlagObj = {
    type: string;
    severity: "info" | "warning";
    message?: string;
    details?: any;
  };
  
  // The report endpoint may return just strings for flags; support both.
  export type AnyFlag = FlagObj | string;
  
  export const asFlagObj = (f: AnyFlag): FlagObj =>
    typeof f === "string"
      ? { type: f, severity: f === "DEBUG" ? "info" : "warning" }
      : f;
  
  export function getDebug(flags: FlagObj[]): any {
    const f = flags.find((x) => x.type === "DEBUG");
    return f?.details || {};
  }
  
  export function getDelta(flags: FlagObj[]): number {
    const dbg = getDebug(flags);
    if (typeof dbg.delta === "number") return dbg.delta;
    const d = flags.find((f) => f.type === "BLINDING_DELTA");
    const tb = d?.details?.total_before;
    const ta = d?.details?.total_after;
    return typeof tb === "number" && typeof ta === "number"
      ? Number((tb - ta).toFixed(2))
      : 0;
  }
  
  export function evidenceCoverage(flags: FlagObj[], by: Criterion[]) {
    const dbg = getDebug(flags);
    const overlap: Record<string, number> = dbg.evidence_overlap || {}; // { criterionKey: 0..1 }
    const keys = by.map((c) => c.key);
    const scores = keys.map((k) => Number(overlap[k] ?? 0));
    const strong = scores.filter((s) => s >= 0.7).length;
    const weak = scores.filter((s) => s >= 0.4 && s < 0.7).length;
    const miss = scores.filter((s) => s < 0.4).length;
    const pct = keys.length ? Math.round((strong / keys.length) * 100) : 0;
    return { strong, weak, miss, pct, overlap };
  }
  
  export function topContributors(
    by: Criterion[],
    weights: Record<string, number>,
    k = 2
  ) {
    return [...by]
      .map((c) => ({
        key: c.key,
        score: c.score,
        w: weights?.[c.key] || 0,
        contrib: (weights?.[c.key] || 0) * c.score,
      }))
      .sort((a, b) => b.contrib - a.contrib)
      .slice(0, k);
  }
  
  export function verdict(total: number, hasWarn: boolean) {
    if (hasWarn) return { label: "Needs human review", tone: "warn" as const };
    if (total >= 4.0) return { label: "Strong candidate", tone: "good" as const };
    if (total >= 3.2) return { label: "Consider", tone: "mid" as const };
    return { label: "Below bar", tone: "bad" as const };
  }
  
  export const fmtDelta = (d: number) => (d > 0 ? `+${d.toFixed(2)}` : d.toFixed(2));
  export const pct = (n: number) => `${n}%`;
  