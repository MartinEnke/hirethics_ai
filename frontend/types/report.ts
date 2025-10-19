// frontend/src/types/report.ts
export interface Candidate {
    candidate_id: string;
    score: {
      overall: number;
      fairness: number;
      transparency: number;
    };
    flags: string[];
  }
  
  export interface ReportPayload {
    batch_id: string;
    n_candidates: number;
    spearman_rho?: number;
    topk_overlap_count?: number;
    mean_abs_delta?: number;
    candidates: Candidate[];
  }
  