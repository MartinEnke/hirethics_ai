// frontend/src/utils/mockScoring.ts
import type { ReportPayload, Candidate } from "../types/report";

export function buildMockReport(batch_id: string, candidate_ids: string[]): ReportPayload {
  const candidates: Candidate[] = candidate_ids.map((id, i) => ({
    candidate_id: id,
    score: {
      overall: Math.round((70 + Math.random() * 25) * 10) / 10,
      fairness: Math.round((60 + Math.random() * 35) * 10) / 10,
      transparency: Math.round((55 + Math.random() * 40) * 10) / 10,
    },
    flags: (i % 2 === 0) ? ["minor_gap", "low_experience"] : ["keyword_mismatch"],
  }));

  return {
    batch_id,
    n_candidates: candidates.length,
    spearman_rho: Number((0.4 + Math.random() * 0.5).toFixed(2)),
    topk_overlap_count: Math.floor(1 + Math.random() * candidates.length),
    mean_abs_delta: Number((Math.random() * 5).toFixed(2)),
    candidates,
  };
}
