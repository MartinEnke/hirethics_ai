// src/lib/api.ts


// Prefer env; fallback to local dev backend
const API_BASE: string = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000/api/v1";

/* ------------------ helpers ------------------ */
async function fetchJSON<T = any>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let body = "";
    try { body = await res.text(); } catch {}
    throw new Error(`${res.status} ${res.statusText} @ ${url}\n${body}`);
  }
  return res.json() as Promise<T>;
}

/* ----------------- uploads ------------------- */
export type ExtractedPdf = {
  id: string;
  filename: string;
  text: string;
  size: number;
};

// src/lib/api.ts
export async function extractFromPdfs(files: File[]) {
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
  return r.json() as Promise<Array<{ id: string; filename: string | null; text: string; size: number }>>;
}

/* --------------- scoring flow ---------------- */

export type CreateJobResponse = { job_id: string };

// Create a job with a simple rubric (adjust as needed)
export async function createJob(): Promise<CreateJobResponse> {
  return fetchJSON<CreateJobResponse>(`${API_BASE}/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Backend/GenAI Engineer",
      description: "Score on clear rubric only.",
      rubric: [
        { key: "sys_design", weight: 0.35, description: "Design scalable services" },
        { key: "prod_ownership", weight: 0.2, description: "Incidents, SLOs, on-call" },
        { key: "lang_stack", weight: 0.25, description: "Depth in Python/Go" },
        { key: "code_quality", weight: 0.2, description: "Readable, tested code" }
      ]
    })
  });
}

// Accepts many candidates at once
export type CandidateInput = {
  cv_text: string;
  artifacts?: Record<string, any>;
  display_name?: string; // optional, if you want to pass filename-derived labels
};

export type AddCandidatesResponse = { candidate_ids: string[] };

export async function addCandidates(
  job_id: string,
  candidates: CandidateInput[]
): Promise<AddCandidatesResponse> {
  return fetchJSON<AddCandidatesResponse>(`${API_BASE}/candidates/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ job_id, candidates })
  });
}

export type RunScoringResponse = {
  batch_id: string;
  scores: any[];
  ethics_flags: any[];
};

export async function runScoring(
  job_id: string,
  candidate_ids: string[],
  mode: "sync" | "async" = "sync"
): Promise<RunScoringResponse> {
  return fetchJSON<RunScoringResponse>(`${API_BASE}/score/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ job_id, candidate_ids, mode })
  });
}

/* ---------------- reporting ------------------ */

export async function getReport(batchId: string, k?: number) {
  const url = `${API_BASE}/report/${encodeURIComponent(batchId)}${k ? `?k=${k}` : ""}`;
  return fetchJSON(url, { method: "GET" });
}
