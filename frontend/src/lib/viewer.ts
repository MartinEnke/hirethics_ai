// frontend/src/lib/viewer.ts
import type { FlagObj } from "./format";

export type ViewerMode = "recruiter" | "ethics" | "dev";
export const modeLabel: Record<ViewerMode, string> = {
  recruiter: "Recruiter",
  ethics: "Ethics",
  dev: "Dev",
};

export function visibleFlags(flags: FlagObj[], mode: ViewerMode): FlagObj[] {
  if (mode === "recruiter") return flags.filter(f => f.severity === "warning" && f.type !== "DEBUG");
  if (mode === "ethics") return flags.filter(f => f.type !== "DEBUG");
  return flags; // dev
}

export const allowDebug = (mode: ViewerMode) => mode === "dev";
export const showEvidenceCoverage = (mode: ViewerMode) => mode !== "recruiter";
export const showEvidenceSpans = (mode: ViewerMode) => mode !== "recruiter";

export function summarizeFlagDetails(flag: FlagObj, mode: ViewerMode) {
  if (mode !== "recruiter") return flag.details ?? null;
  if (!flag.details) return null;

  // Recruiter gets a safer summary
  const d = flag.details as any;
  if (flag.type === "PROXY_EVIDENCE") {
    const cnt =
      (Array.isArray(d.tokens_strict) ? d.tokens_strict.length : 0) +
      (Array.isArray(d.tokens_generic) ? d.tokens_generic.length : 0);
    return { tokens_detected: cnt, delta: d.delta };
  }
  if (flag.type === "BLINDING_DELTA") {
    return { total_before: d.total_before, total_after: d.total_after };
  }
  return null;
}



export const VIEWER_LABELS: Record<ViewerMode, string> = {
  recruiter: "Recruiter",
  ethics: "Ethics",
  dev: "Dev",
};
