// src/lib/api.ts

// Prefer env; fallback to local dev backend
const API_BASE: string =
  (import.meta as any).env?.VITE_API_BASE || "http://127.0.0.1:8000/api/v1";

/* ------------------ helpers ------------------ */
async function fetchJSON<T = any>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let body = "";
    try {
      body = await res.text();
    } catch {}
    throw new Error(`${res.status} ${res.statusText} @ ${url}\n${body}`);
  }
  return res.json() as Promise<T>;
}

/* ----------------- uploads ------------------- */
export type ExtractedPdf = {
  id: string;
  filename: string | null;
  text: string;
  size: number;
  display_name?: string | null;
  email?: string | null;
  phone?: string | null;
};

export async function extractFromPdfs(files: File[]): Promise<ExtractedPdf[]> {
  const fd = new FormData();
  files.forEach((f) => fd.append("files", f));
  const r = await fetch(`${API_BASE}/uploads/extract`, {
    method: "POST",
    body: fd,
  });
  if (!r.ok) {
    const msg = await r.text().catch(() => "");
    throw new Error(`Upload/Extract failed (${r.status}): ${msg}`);
  }
  return r.json() as Promise<ExtractedPdf[]>;
}

/* --------------- scoring flow ---------------- */

export type CreateJobResponse = { job_id: string };

// Create a job with a simple rubric (adjust as needed)

export async function createJob(roleContext: string): Promise<CreateJobResponse> {
  return fetchJSON<CreateJobResponse>(`${API_BASE}/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Role scoring",
      description: "Score on clear rubric only.",
      role_context: roleContext,
      rubric: [
        { key: "sys_design",      weight: 0.35, description: "Design scalable services" },
        { key: "prod_ownership",  weight: 0.20, description: "Incidents, SLOs, on-call" },
        { key: "lang_stack",      weight: 0.25, description: "Stack fit" },
        { key: "code_quality",    weight: 0.20, description: "Tests, docs, CI/CD" }
      ]
    })
  });
}



// Accepts many candidates at once
export type CandidateInput = {
  cv_text: string;
  artifacts?: Record<string, any>;
  display_name?: string; // name from PDF extraction or UI
};

export type AddCandidatesResponse = { candidate_ids: string[] };

export async function addCandidates(
  job_id: string,
  candidates: CandidateInput[]
): Promise<AddCandidatesResponse> {
  return fetchJSON<AddCandidatesResponse>(`${API_BASE}/candidates/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ job_id, candidates }),
  });
}

/* ---------------- scoring types ---------------- */
export type CriterionScore = {
  key: string;                // e.g., "sys_design"
  score: number;              // 0..5
  evidence_span?: string;     // short quote around first hit
  rationale?: string;         // e.g., "Found: fastapi, openapi"
};

export type CandidateScore = {
  candidate_id: string;
  total: number;              // 0..5 weighted total
  by_criterion: CriterionScore[];
  display_name?: string | null;
};

export type EthicsFlag = {
  candidate_id: string;
  type: string;               // e.g., "BLINDING_DELTA"
  severity: string;           // "warning" | "info" (backend is free-form)
  message: string;
  details?: Record<string, any> | null;
};

export type RunScoringResponse = {
  batch_id: string;
  scores: CandidateScore[];
  ethics_flags: EthicsFlag[];
};

export async function runScoring(
  job_id: string,
  candidate_ids: string[],
  mode: "sync" | "async" = "sync"
): Promise<RunScoringResponse> {
  return fetchJSON<RunScoringResponse>(`${API_BASE}/score/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ job_id, candidate_ids, mode }),
  });
}

/* ---------------- reporting ------------------ */

export type CandidateReport = {
  candidate_id: string;
  total_before: number;
  total_after: number;
  delta: number;
  flags: string[];
};

export type ReportResponse = {
  batch_id: string;
  job_id: string;
  n_candidates: number;
  k: number;
  spearman_rho: number | null;
  topk_overlap_count: number;
  topk_overlap_ratio: number;
  mean_delta: number;
  mean_abs_delta: number;
  flags_by_type: Record<string, number>;
  flags_by_severity: Record<string, number>;
  candidates: CandidateReport[];
};

export async function getReport(batchId: string, k?: number): Promise<ReportResponse> {
  const url = `${API_BASE}/report/${encodeURIComponent(batchId)}${k ? `?k=${k}` : ""}`;
  return fetchJSON<ReportResponse>(url, { method: "GET" });
}
