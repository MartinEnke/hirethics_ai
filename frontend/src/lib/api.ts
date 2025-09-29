// src/lib/api.ts
const BASE = "http://127.0.0.1:8000";   // absolute URL, bypass Vite proxy
const API_PREFIX = `${BASE}/api/v1`;

async function fetchJSON(url: string, init: RequestInit) {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${res.statusText} @ ${url}\n${body}`);
  }
  return res.json();
}

export async function createJob() {
  return fetchJSON(`${API_PREFIX}/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Senior Backend Engineer",
      description: "Score on clear rubric only.",
      rubric: [
        { key: "sys_design", weight: 0.35, description: "Design scalable services" },
        { key: "prod_ownership", weight: 0.2, description: "Incidents, SLOs, on-call" },
        { key: "lang_stack", weight: 0.25, description: "Depth in Python/Go" },
        { key: "code_quality", weight: 0.2, description: "Readable, tested code" }
      ]
    })
  }) as Promise<{ job_id: string }>;
}

export async function addCandidates(job_id: string, cvText: string) {
  return fetchJSON(`${API_PREFIX}/candidates/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ job_id, candidates: [{ cv_text: cvText, artifacts: {} }] })
  }) as Promise<{ candidate_ids: string[] }>;
}

export async function runScoring(job_id: string, candidate_ids: string[]) {
  return fetchJSON(`${API_PREFIX}/score/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ job_id, candidate_ids, mode: "sync" })
  }) as Promise<{ batch_id: string; scores: any[]; ethics_flags: any[] }>;
}
