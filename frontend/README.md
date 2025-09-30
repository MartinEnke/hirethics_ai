# Hirethics AI — Transparent, Audited Candidate Scoring (MVP)

Hirethics AI is a small, end‑to‑end demo that **scores candidates on job‑relevant evidence** and then **audits itself for bias** via blinding checks. It’s designed for two audiences:

- **Recruiters & hiring managers** — get a simple, explainable overview of why a candidate ranks where they do, plus a light‑touch ethics summary.
- **Developers & AI practitioners** — see exactly how scoring, blinding, flagging, and evaluation are implemented, with clear API boundaries and a pluggable LLM scorer.

> ⚠️ **MVP:** This is a prototype for exploration and feedback. Data is in memory only. Use test data—no real PII/HR data.

---

## Table of contents

- [Hirethics AI — Transparent, Audited Candidate Scoring (MVP)](#hirethics-ai--transparent-audited-candidate-scoring-mvp)
  - [Table of contents](#table-of-contents)
  - [Why this project?](#why-this-project)
  - [What’s included (today)](#whats-included-today)
    - [Frontend (Vite + React + Tailwind)](#frontend-vite--react--tailwind)
    - [Backend (FastAPI)](#backend-fastapi)
  - [Screens \& flows](#screens--flows)
    - [1) Landing → Demo box](#1-landing--demo-box)
    - [2) Evaluation page](#2-evaluation-page)
  - [Quick start](#quick-start)
    - [Backend](#backend)
    - [Frontend](#frontend)
  - [Configuration](#configuration)
  - [Architecture](#architecture)
  - [API reference (MVP)](#api-reference-mvp)
    - [Health](#health)
    - [Create job](#create-job)
    - [Add candidates (batch)](#add-candidates-batch)
    - [Run scoring](#run-scoring)
    - [Batch evaluation](#batch-evaluation)
  - [Scoring \& bias audit](#scoring--bias-audit)
    - [1) Scoring](#1-scoring)
    - [2) Blinding](#2-blinding)
    - [3) Ethics flags](#3-ethics-flags)
  - [Evaluation metrics](#evaluation-metrics)
  - [Viewer modes](#viewer-modes)
  - [Roadmap](#roadmap)
    - [Immediate next goals](#immediate-next-goals)
    - [Further goals](#further-goals)
  - [FAQ](#faq)
  - [Contributing](#contributing)
  - [License](#license)
    - [Quick cURL snippet to try the pipeline](#quick-curl-snippet-to-try-the-pipeline)

---

## Why this project?

Hiring tools that just output a score are hard to trust. **Hirethics AI** aims to be *usefully* transparent:

- Each score is **tied to an evidence snippet** from the CV.
- A second pass **blinds** proxies (name, email, phone, school/brand) and re‑scores to detect instability.
- The app surfaces **ethics flags** (e.g., proxy evidence, large deltas) and provides a **batch evaluation report** (Spearman ρ, Top‑K overlap, |Δ|).

This is **not** a replacement for human judgment—it’s a **companion** that makes the AI’s reasoning auditable.

---

## What’s included (today)

### Frontend (Vite + React + Tailwind)
- **Landing page** with a live **demo box**: paste a CV → create job → add candidate → run scoring.
- **ScoreCard** component that shows total score, per‑criterion subscores, evidence, and flags.
- **Evaluation page** for a scoring batch: Spearman ρ (pre vs post blinding), Top‑K overlap, mean deltas, and per‑candidate flags.
- **Viewer Toggle** (top‑right & in the demo results): switch between **Recruiter**, **Ethics**, and **Dev** views.

### Backend (FastAPI)
- **LLM scorer with heuristic fallback**: `score_with_llm(job, cv)` (e.g., OpenAI GPT) → fallback to a tiny heuristic.
- **Blinding pass** that masks names, emails, phones, and school/brand tokens; re‑scores; compares deltas.
- **Ethics flags**: `PROXY_EVIDENCE`, `BLINDING_DELTA`, `NO_EVIDENCE`, plus `DEBUG` info for developers.
- **Batch evaluation**: compute report for a `batch_id` (Spearman ρ, Top‑K overlap, mean |Δ|, etc.).
- **In‑memory stores** (`_JOBS`, `_CANDIDATES`, `_BATCHES`) for quick iteration.

---

## Screens & flows

### 1) Landing → Demo box
Click **Run mock score**. Under the hood the UI calls:
1. `POST /api/v1/jobs` → create a job with a rubric
2. `POST /api/v1/candidates/batch` → add CV(s)
3. `POST /api/v1/score/run` → score + blind + flag

A **Batch** panel shows the `batch_id` and the **Viewer Toggle**; each candidate renders a **ScoreCard** that adapts to viewer mode.

### 2) Evaluation page
Paste a `batch_id` and click **Compute report**. You’ll see:
- Spearman ρ (pre vs post blinding totals)
- Top‑K overlap (how stable the top picks are under blinding)
- Mean |Δ| across candidates
- Flag counts (by type/severity)
- Per‑candidate table (pre/post totals, Δ, and flag chips)

---

## Quick start

### Backend

```bash
# from repo root
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# configure your .env (see below), then:
uvicorn app.main:app --reload --port 8000
# API docs: http://localhost:8000/docs
```

### Frontend

```bash
# from repo root
cd frontend
npm install
npm run dev  # http://localhost:5173
```

---

## Configuration

Create **backend/.env** (the backend loads it explicitly):

```env
# LLM
OPENAI_API_KEY=sk-xxxxx
OPENAI_MODEL=gpt-4o-mini
# Optional tuning
OPENAI_TEMPERATURE=0.1

# CORS/UI
FRONTEND_ORIGIN=http://localhost:5173
```

Key tunables (in `backend/app/main.py`):
- `BLINDING_DELTA_THRESHOLD = 0.25` — raise `BLINDING_DELTA` when |Δ| ≥ threshold
- `PRESTIGE_BONUS = 0.30` (heuristic proxy used only in fallback scorer—aimed to trigger ethics checks)
- Evidence quality check uses **substring OR ≥0.7 token overlap** of 3+ char tokens

---

## Architecture

```
frontend/ (Vite + React + Tailwind)
  src/components/ScoreCard.tsx         # shows per-candidate scores/flags, adapts to viewer mode
  src/components/ViewerToggle.tsx      # recruiter | ethics | dev
  src/pages/Landing.tsx                # hero + demo box wired to backend
  src/pages/Evaluation.tsx             # batch-level metrics & per-candidate table
  src/lib/api.ts                       # REST calls
  src/lib/viewer.ts                    # ViewerMode type & helpers
  src/lib/format.ts                    # flag formatting (AnyFlag -> FlagObj)

backend/ (FastAPI)
  app/main.py                          # endpoints, in-memory stores, blinding & flags
  app/llm.py                           # llm_available(), score_with_llm()
```

**State:** Stored in memory only (clears on restart). No accounts/auth. Intended for local demo.

---

## API reference (MVP)

### Health
```
GET /health
GET /api/v1/ping
```

### Create job
```
POST /api/v1/jobs
{
  "title": "Backend Engineer (Demo)",
  "description": "Scoring demo",
  "rubric": [
    {"key":"sys_design","weight":0.35,"description":"..."},
    {"key":"prod_ownership","weight":0.20,"description":"..."},
    {"key":"lang_stack","weight":0.25,"description":"..."},
    {"key":"code_quality","weight":0.20,"description":"..."}
  ]
}
-> { "job_id": "job_ab12cd34" }
```

### Add candidates (batch)
```
POST /api/v1/candidates/batch
{
  "job_id": "job_ab12cd34",
  "candidates": [
    { "cv_text": "Designed and shipped a microservice...", "artifacts": null }
  ]
}
-> { "candidate_ids": ["cand_71aca568"] }
```

### Run scoring
```
POST /api/v1/score/run
{
  "job_id": "job_ab12cd34",
  "candidate_ids": ["cand_71aca568"],
  "mode": "sync"
}
-> {
  "batch_id": "batch_1234abcd",
  "scores": [
    {
      "candidate_id":"cand_71aca568",
      "total": 4.38,
      "by_criterion":[
        {"key":"sys_design","score":4.5,"evidence_span":"...","rationale":"..."},
        ...
      ]
    }
  ],
  "ethics_flags":[
    {"candidate_id":"cand_71aca568","type":"PROXY_EVIDENCE","severity":"info","message":"...", "details": {...}},
    {"candidate_id":"cand_71aca568","type":"DEBUG","severity":"info","message":"Scoring debug", "details": {...}}
  ]
}
```

### Batch evaluation
```
GET /api/v1/report/{batch_id}?k=5
-> {
  "batch_id":"batch_1234abcd",
  "job_id":"job_ab12cd34",
  "n_candidates": 12,
  "k": 5,
  "spearman_rho": 0.91,
  "topk_overlap_count": 5,
  "topk_overlap_ratio": 1.0,
  "mean_delta": 0.02,
  "mean_abs_delta": 0.11,
  "flags_by_type": {"PROXY_EVIDENCE": 3, "BLINDING_DELTA": 1, "DEBUG": 12},
  "flags_by_severity": {"warning": 1, "info": 14},
  "candidates": [
    {
      "candidate_id":"cand_71aca568",
      "total_before": 4.38,
      "total_after": 4.38,
      "delta": 0.0,
      "flags": ["PROXY_EVIDENCE","DEBUG"]
    }
  ]
}
```

---

## Scoring & bias audit

### 1) Scoring
- **Primary**: `score_with_llm(job, cv)` — summarizes per‑criterion (key, score, evidence_span, rationale).
- **Fallback**: `heuristic_scores_from_cv(cv, job)` — tiny rule set to keep the demo interactive without an LLM.

### 2) Blinding
- **Blind pass** masks names, emails, phones, and education proxies (`MIT`, `Stanford`, generic `* University`) and re‑scores.
- Compute `Δ = total_before - total_after` and raise **BLINDING_DELTA** when `|Δ| >= 0.25` (tunable).

### 3) Ethics flags
- **PROXY_EVIDENCE** — strict tokens (e.g., `MIT`) and generic tokens (`<Name> University`) detected; report if removed by blinding and direction of influence.
- **BLINDING_DELTA** — large movement after blinding.
- **NO_EVIDENCE** — rationale/evidence spans don’t match the CV text (substring or <0.7 token overlap).
- **DEBUG** — developer details (weights, scorer used, tokens before/after, evidence overlap map).

> The UI **Viewer Toggle** suppresses or emphasizes details depending on audience (see below).

---

## Evaluation metrics

Given all candidates in a batch:

- **Spearman ρ** — rank correlation between pre‑ and post‑blinding totals.
- **Top‑K overlap** — stability of top K under blinding.
- **Mean Δ** — average signed change; **Mean |Δ|** — average magnitude of change.
- **Flag counts** — by type and severity.
- **Per‑candidate table** — quick view of totals, Δ, and notable flags.

---

## Viewer modes

Use the **Viewer Toggle** to switch presentation:

- **Recruiter** — clean chips like “Stable after blinding”, “Brand influence”, plus a **Next step** hint (e.g., *Focus interview on recent hands‑on work, not school/brand.*). Deliberately hides raw debug JSON.
- **Ethics** — highlights **Δ** and **proxy removal** (e.g., *removed by blinding*), emphasizes stability and potential risk factors.
- **Dev** — everything: evidence spans, rationales, and the **Debug details** JSON (weights, tokens, scorer before/after, evidence overlap).

This lets the same pipeline serve different stakeholders without separate code paths.

---

## Roadmap

### Immediate next goals
- **Export audit** to **PDF/CSV** (scores, flags, deltas, ρ, Top‑K).
- **Per‑candidate severity chips in `report`** (not only type) for better Evaluation table styling.
- **Rubric editor UI**: create/edit weights and criteria on the frontend.
- **File ingestion**: upload PDFs → extract text → attach artifacts for evidence linking.

### Further goals
- **Persistence** (DB) & **auth**; role‑based views.
- **Counterfactual probes** (e.g., location/gender neutralization where legally permitted).
- **Fairness tests** with cohort metrics and drift alerts.
- **Pluggable LLMs** with guardrails + caching; structured prompting and eval datasets.
- **Async jobs & streaming UI** for long batches.
- **Policy mapping** to regulatory checklists (GDPR/AI‑Act readiness views).

---

## FAQ

**Is this production‑ready?**  
No. It’s a demo meant to spark feedback and guide what to build next.

**Do you store data?**  
Only in memory during the session. Restart clears everything.

**What exactly is “blinding”?**  
We mask obvious proxies (name, email, phone, school/brand tokens) and re‑score. If rankings swing, we surface that risk.

**Can I use a different LLM?**  
Yes—set `OPENAI_MODEL` (and tweak `app/llm.py` if you want to use another provider).

**Why do I see `DEBUG` flags?**  
They’re for developers; viewer modes hide them from recruiters by default.

---

## Contributing

Bug reports, UX ideas, and ethics critiques are welcome. For PRs, aim for:
- Clear commits and small, focused changes
- Tests or manual steps to reproduce/verify
- Screenshots for UI changes

---

## License

MIT (see `LICENSE`).

---

### Quick cURL snippet to try the pipeline

```bash
# 1) Create job
curl -s localhost:8000/api/v1/jobs -H "Content-Type: application/json" -d '{
  "title":"Backend Engineer",
  "description":"Demo",
  "rubric":[
    {"key":"sys_design","weight":0.35,"description":""},
    {"key":"prod_ownership","weight":0.20,"description":""},
    {"key":"lang_stack","weight":0.25,"description":""},
    {"key":"code_quality","weight":0.20,"description":""}
  ]
}' | jq

# 2) Add candidate (replace JOB_ID)
curl -s localhost:8000/api/v1/candidates/batch -H "Content-Type: application/json" -d '{
  "job_id":"JOB_ID",
  "candidates":[{"cv_text":"Designed microservices... on-call SLOs 99.99..."}]
}' | jq

# 3) Run scoring (replace JOB_ID and CAND_ID)
curl -s localhost:8000/api/v1/score/run -H "Content-Type: application/json" -d '{
  "job_id":"JOB_ID",
  "candidate_ids":["CAND_ID"],
  "mode":"sync"
}' | jq

# 4) Get report (replace BATCH_ID)
curl -s "localhost:8000/api/v1/report/BATCH_ID?k=5" | jq
```
