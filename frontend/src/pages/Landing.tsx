// frontend/src/pages/Landing.tsx
import React, { useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";

import { createJob, addCandidates, runScoring, extractFromPdfs } from "../lib/api";
import ViewerToggle from "../components/ViewerToggle";
import type { ViewerMode } from "../lib/viewer";

/** -----------------------
 *  Landing Page
 *  ----------------------*/
export default function HirethicsLanding() {
  const [viewerMode, setViewerMode] = useState<ViewerMode>("recruiter");

  return (
    <div className="min-h-screen bg-gray-50 text-slate-800">
      {/* Nav */}
      <header className="sticky top-0 z-30 backdrop-blur bg-white/70 border-b border-slate-200">
        <div className="mx-auto max-w-7xl px-6 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="text-xl font-semibold tracking-tight">
              Hirethics <span className="text-emerald-600">AI</span>
            </span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm">
            <a href="#how" className="hover:text-slate-900 text-slate-600">How it works</a>
            <a href="#features" className="hover:text-slate-900 text-slate-600">Features</a>
            <a href="#demo" className="hover:text-slate-900 text-slate-600">Demo</a>
            <a href="#trust" className="hover:text-slate-900 text-slate-600">Trust</a>
          </nav>
          <div className="flex items-center gap-3">
            <div className="hidden md:block">
              <ViewerToggle value={viewerMode} onChange={setViewerMode} />
            </div>
            <Link
              to="/evaluation"
              className="hidden sm:inline-flex px-4 py-2 rounded-xl bg-white ring-1 ring-slate-300 text-sm font-medium text-slate-900 hover:bg-slate-50"
            >
              Open Evaluation
            </Link>
            <a href="#demo" className="px-4 py-2 rounded-xl border border-slate-300 text-sm hover:bg-white">
              Try Demo
            </a>
            <a href="#contact" className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm hover:bg-slate-800">
              Get in touch
            </a>
          </div>
        </div>
        <div className="md:hidden mx-auto max-w-7xl px-6 pb-3">
          <ViewerToggle value={viewerMode} onChange={setViewerMode} />
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6">
        {/* Hero */}
        <section className="relative overflow-hidden py-20">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
              <h1 className="text-4xl sm:text-5xl font-bold leading-tight text-slate-900">
                Ethical AI for Transparent Hiring Decisions
              </h1>
              <p className="mt-4 text-lg text-slate-600">
                Hirethics AI ranks candidates on job-relevant evidence — then audits itself for bias —
                so you can hire fairly and confidently.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href="#demo" className="px-5 py-3 rounded-2xl bg-emerald-600 text-white font-medium hover:bg-emerald-700">
                  Try the Live Demo
                </a>
                <a href="#how" className="px-5 py-3 rounded-2xl border border-slate-300 text-slate-700 font-medium hover:bg-white">
                  How it works
                </a>
                <Link
                  to="/evaluation"
                  className="inline-flex md:hidden px-5 py-3 rounded-2xl bg-white ring-1 ring-slate-300 text-slate-900 font-medium hover:bg-slate-50"
                >
                  Open Evaluation
                </Link>
              </div>
              <div className="mt-6 flex items-center gap-4 text-sm text-slate-500">
                <Badge icon={<ShieldIcon />} label="Bias audit built-in" />
                <Badge icon={<EyeIcon />} label="Explainable scoring" />
                <Badge icon={<TrailIcon />} label="Exportable audit trail" />
              </div>
            </motion.div>

            {/* Visual mockup */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }}>
              <div className="relative rounded-3xl shadow-xl ring-1 ring-black/5 overflow-hidden bg-white">
                <div className="grid grid-cols-2 divide-x divide-slate-200">
                  <div className="p-6">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Typical AI</div>
                    <div className="mt-3 text-lg font-semibold">Opaque ranking</div>
                    <ul className="mt-4 space-y-2 text-sm text-slate-600">
                      <li className="flex items-center gap-2"><Dot /> Rank: #1 — ???</li>
                      <li className="flex items-center gap-2"><Dot /> Rank: #2 — ???</li>
                      <li className="flex items-center gap-2"><Dot /> Rank: #3 — ???</li>
                    </ul>
                    <div className="mt-6 rounded-xl bg-slate-100 p-3 text-xs text-slate-500">
                      No rationale. No evidence. No audit.
                    </div>
                  </div>
                  <div className="p-6 bg-emerald-50/60">
                    <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Hirethics AI</div>
                    <div className="mt-3 text-lg font-semibold text-emerald-900">Explainable ranking</div>
                    <ul className="mt-4 space-y-3 text-sm">
                      <li className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">#1 — Alex P.</span>
                          <span className="text-emerald-700 font-semibold">4.6</span>
                        </div>
                        <p className="mt-2 text-slate-600">
                          <span className="font-semibold">Evidence:</span> “Designed multi-tenant service handling 3M req/day…”
                        </p>
                        <p className="mt-1 text-slate-500">Why: Strong system design (+3), prod ownership (+2)</p>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="py-16">
          <div className="text-center max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold text-slate-900">Two AIs. One Goal: Fair, Explainable Hiring.</h2>
            <p className="mt-3 text-slate-600">Score on evidence. Audit for bias. Keep humans in control.</p>
          </div>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            <Card icon={<LensIcon />} title="Score" desc="Scoring AI rates candidates against a role-specific rubric, attaching exact evidence snippets to every point." />
            <Card icon={<ScaleIcon />} title="Audit" desc="Ethics AI runs blinding + counterfactual checks, flags proxy features, and surfaces rank deltas." />
            <Card icon={<HumanIcon />} title="Decide" desc="You review explanations and flags, override if needed, and export the audit trail for compliance." />
          </div>
        </section>

        {/* Features */}
        <section id="features" className="bg-white border-y border-slate-200 -mx-6 px-6 py-16">
          <h3 className="text-2xl font-semibold text-slate-900">What makes Hirethics different</h3>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            <Feature title="Explainable scoring" desc="Every score ties to a quoted evidence span from the CV — no black boxes." icon={<EyeIcon />} />
            <Feature title="Bias detection" desc="Blinding & counterfactual tests highlight unstable rankings and proxy signals." icon={<ShieldIcon />} />
            <Feature title="Audit trail" desc="Immutable logs of scores, flags, and human overrides — exportable for stakeholders." icon={<TrailIcon />} />
          </div>
        </section>

        {/* Demo */}
        <section id="demo" className="py-16">
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            <div>
              <h3 className="text-2xl font-semibold text-slate-900">Try a quick demo</h3>
              <p className="mt-3 text-slate-600">
                Pick a <strong>role context</strong>, upload up to 5 <strong>PDF</strong> CVs or paste text, and run scoring.
              </p>
              <div className="mt-6 flex gap-3 flex-wrap">
                <a href="#demo-box" className="px-5 py-3 rounded-2xl bg-slate-900 text-white font-medium hover:bg-slate-800">
                  Open Interactive Demo
                </a>
                <a
                  href="http://localhost:8000/docs"
                  target="_blank"
                  rel="noreferrer"
                  className="px-5 py-3 rounded-2xl border border-slate-300 text-slate-700 font-medium hover:bg-white"
                >
                  View API Docs
                </a>
                <Link
                  to="/evaluation"
                  className="px-5 py-3 rounded-2xl bg-white ring-1 ring-slate-300 text-slate-900 font-medium hover:bg-slate-50"
                >
                  Open Evaluation
                </Link>
              </div>
            </div>

            <DemoBox viewerMode={viewerMode} setViewerMode={setViewerMode} />
          </div>
        </section>

        {/* Trust */}
        <section id="trust" className="bg-white -mx-6 px-6 py-16">
          <h3 className="text-2xl font-semibold text-slate-900">Compliance & Trust</h3>
          <p className="mt-2 text-slate-600 max-w-3xl">
            Built with transparency-by-design. Hirethics AI supports audit exports and human oversight,
            aligning with GDPR principles and the EU AI Act’s emphasis on explainability and risk management.
          </p>
          <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
            <Pill>GDPR-aware</Pill>
            <Pill>EU AI Act-ready</Pill>
            <Pill>Human-in-the-loop</Pill>
            <Pill>Evidence-bound</Pill>
            <Pill>Audit exports</Pill>
            <Pill>Bias probes</Pill>
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-200">
        <div className="mx-auto max-w-7xl px-6 py-12 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3 text-slate-600">
            <Logo small />
            <span>© {new Date().getFullYear()} Hirethics AI</span>
          </div>
          <div className="flex items-center gap-5 text-sm text-slate-600">
            <a href="#" className="hover:text-slate-900">About</a>
            <a href="#" className="hover:text-slate-900">Docs</a>
            <a href="#" className="hover:text-slate-900">GitHub</a>
            <a href="#" className="hover:text-slate-900">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ---------------- Small components ---------------- */
function Badge({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-white/70 ring-1 ring-slate-200 px-3 py-1 text-xs">
      <span className="h-3.5 w-3.5 text-emerald-600">{icon}</span>
      <span>{label}</span>
    </span>
  );
}

function Card({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4 }}
      className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200"
    >
      <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700">{icon}</div>
      <h4 className="mt-4 text-lg font-semibold text-slate-900">{title}</h4>
      <p className="mt-2 text-slate-600 text-sm">{desc}</p>
    </motion.div>
  );
}

function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="rounded-2xl bg-gray-50 p-6 ring-1 ring-slate-200">
      <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700">{icon}</div>
      <h4 className="mt-4 text-lg font-semibold text-slate-900">{title}</h4>
      <p className="mt-2 text-slate-600 text-sm">{desc}</p>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700 ring-1 ring-slate-200">{children}</span>
  );
}

function Dot() {
  return <span className="h-2.5 w-2.5 rounded-full bg-slate-300 inline-block" />;
}

/* ---------------- DemoBox (role-aware, PDF upload + text) ---------------- */
function DemoBox({
  viewerMode,
  setViewerMode,
}: {
  viewerMode: ViewerMode;
  setViewerMode: (v: ViewerMode) => void;
}) {
  // role context that informs backend keyword overlays
  const [roleContext, setRoleContext] = useState<string>(
    "Backend + GenAI: Python + FastAPI, Postgres/SQL, RAG/LLMs (pgvector, LangChain/LlamaIndex), OpenAPI docs, Pytest + Playwright, CI/CD (GitHub Actions), system design/architecture; React + TypeScript for admin UIs. Emphasis on clean APIs, typed DTOs, retrieval quality, explainability and auditability."
  );

  // pasted entries only
  const [cvs, setCvs] = useState<string[]>([""]);

  // uploaded PDFs (text only; names will be derived)
  const [uploads, setUploads] = useState<Array<{ id: string; filename: string; text: string; size: number }>>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  const CRITERION_LABEL: Record<string, string> = {
    sys_design: "System design",
    prod_ownership: "Production ownership",
    lang_stack: "Language / Stack",
    code_quality: "Code quality",
  };

  /* Quick presets update roleContext */
  const presets = [
    {
      name: "Backend + RAG",
      text: "Backend + GenAI: Python + FastAPI, Postgres/SQL, RAG/LLMs (pgvector, LangChain/LlamaIndex), OpenAPI docs, Pytest + Playwright, CI/CD (GitHub Actions), system design/architecture.",
    },
    {
      name: "Frontend",
      text: "Frontend: React + TypeScript, Next.js, performance/accessibility, Testing Library/Jest/Playwright, CI/CD, Storybook, design systems.",
    },
    {
      name: "Data",
      text: "Data Engineer: Spark/Airflow/DBT, Kafka, Snowflake/BigQuery, strong SQL, data quality/lineage testing, CI/CD.",
    },
    {
      name: "DevOps/Platform",
      text: "DevOps/Platform: Kubernetes, Docker, Terraform, cloud (AWS/GCP/Azure), observability, SRE/SLOs, CI/CD pipelines.",
    },
  ];

  /* ---------- inline MiniViewerToggle ---------- */
  function MiniViewerToggle({
    value,
    onChange,
  }: {
    value: ViewerMode;
    onChange: (v: ViewerMode) => void;
  }) {
    const tabs: ViewerMode[] = ["recruiter", "ethics", "dev"];
    return (
      <div className="inline-flex items-center rounded-xl ring-1 ring-slate-300 bg-white overflow-hidden">
        {tabs.map((t) => {
          const active = value === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => onChange(t)}
              className={`px-3 py-1.5 text-sm ${active ? "bg-slate-900 text-white" : "text-slate-700"}`}
              title={t}
            >
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          );
        })}
      </div>
    );
  }

  /* ---------------- name helper ---------------- */
  function extractName(cv: string) {
    const cand = (cv.split("\n").map((s) => s.trim()).find(Boolean) || "").replace(/^[-–•*#\s]+/, "");
    return cand && cand.length <= 80 ? cand : null;
  }

  /* ---------------- upload handler ---------------- */
  async function onPickPdfs(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []).filter((f) => f.type === "application/pdf");
    if (!files.length) return;

    setLoading(true);
    setError(null);

    try {
      const extractedRaw = await extractFromPdfs(files);
      const extracted = extractedRaw.map((x) => ({
        id: x.id || `pdf_${Date.now()}_${Math.random()}`,
        filename: (x.filename || "unknown.pdf") as string,
        text: x.text || "",
        size: x.size || 0,
      }));
      setUploads((prev) => [...prev, ...extracted].slice(0, 10));
    } catch (err: any) {
      setError(err?.message || "PDF extraction failed.");
    } finally {
      setLoading(false);
      if (e.currentTarget) e.currentTarget.value = "";
    }
  }

  /* ---------------- run scoring ---------------- */
  function uniqKeepOrder(arr: string[]) {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of arr) {
      const key = t.trim();
      if (!key) continue;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(key);
      }
    }
    return out;
  }

  async function handleRun() {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // 1) Create a job in the backend with role_context
      const { job_id } = await createJob(roleContext);

      // 2) Gather texts (PDF first, then pasted)
      const pdfEntries = uploads.filter((u) => (u.text ?? "").trim());
      const textsFromPdfs = pdfEntries.map((u) => u.text.trim());
      const pasted = cvs.map((cv) => cv.trim()).filter(Boolean);

      const combined = uniqKeepOrder([...textsFromPdfs, ...pasted]).slice(0, 5);
      if (!combined.length) throw new Error("Please upload PDF(s) or paste at least one CV.");

      // 3) Build candidates payload with names
      const candidatesPayload = combined.map((cv_text, i) => {
        const isPdf = i < pdfEntries.length;
        const display_name = isPdf
          ? (extractName(cv_text) || (pdfEntries[i].filename || "CV").replace(/\.[Pp][Dd][Ff]$/, ""))
          : (extractName(cv_text) || `Candidate ${i - pdfEntries.length + 1}`);
        return { cv_text, display_name, artifacts: {} };
      });

      // 4) Send to backend
      const { candidate_ids } = await addCandidates(job_id, candidatesPayload);
      let data = await runScoring(job_id, candidate_ids);

      // Ensure display_name is present for UX
      if (Array.isArray(data?.scores)) {
        data.scores = data.scores.map((s: any) => {
          const local = candidatesPayload.find((c) => c.cv_text && s.candidate_id);
          return { ...s, display_name: s.display_name ?? local?.display_name ?? s.candidate_id };
        });
      }

      // 5) Persist for evaluation page
      localStorage.setItem("jobContext", roleContext);
      localStorage.setItem("demoBatch", JSON.stringify(data));
      localStorage.setItem("latestBatchId", data.batch_id);

      setResult(data);
    } catch (e: any) {
      setError(e?.message || "Request failed. Is the backend running on http://localhost:8000?");
    } finally {
      setLoading(false);
    }
  }

  /* ---------------- UI ---------------- */
  return (
    <div id="demo-box" className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      {/* Role context */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm text-slate-700">
            <div className="font-semibold">Role context</div>
            <div className="text-xs text-slate-500">
              Scoring will adapt to this description (e.g., Backend vs. Frontend, RAG, DevOps).
            </div>
          </div>
          <div className="flex gap-2">
            {presets.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => setRoleContext(p.text)}
                className="text-xs rounded-lg px-3 py-1 ring-1 ring-slate-300 hover:bg-slate-50"
                title={p.name}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
        <textarea
          className="w-full h-24 rounded-xl border border-slate-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          value={roleContext}
          onChange={(e) => setRoleContext(e.target.value)}
          placeholder="Describe the role (stack, responsibilities, must-haves)…"
        />
        <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px] text-slate-600">
          <SpecTag name="System design" info="scalability • distributed • throughput/latency • caching/queues" />
          <SpecTag name="Production ownership" info="on-call • incidents • SLOs • observability • postmortems" />
          <SpecTag name="Language / Stack" info="Python/FastAPI • SQL/Postgres • Go • React/TS (if relevant)" />
          <SpecTag name="Code quality" info="tests/pytest • CI/CD • OpenAPI/Pydantic • reviews/docs" />
        </div>
      </div>

      {/* Uploads */}
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-slate-700">
          <div className="font-semibold">Upload CV PDFs</div>
          <div className="text-xs text-slate-500">You can also paste CV text below. Max 5 total.</div>
        </div>
        <label className="cursor-pointer">
          <span className="text-xs rounded-lg px-3 py-1 ring-1 ring-slate-300 hover:bg-slate-50 inline-block">Choose PDFs</span>
          <input type="file" accept="application/pdf" multiple className="hidden" onChange={onPickPdfs} />
        </label>
      </div>

      {uploads.length > 0 && (
        <div className="mt-3 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
          <div className="text-xs font-medium text-slate-700">Selected files:</div>
          <ul className="mt-1 text-xs text-slate-600 list-disc pl-5 space-y-0.5">
            {uploads.map((u) => (
              <li key={u.id}>
                {u.filename} <span className="text-slate-400">({Math.round(u.size / 1024)} KB)</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* CV inputs */}
      <div className="mt-4 flex flex-col gap-4">
        {cvs.map((cv, i) => (
          <div key={i} className="relative">
            <textarea
              className="mt-2 w-full h-24 rounded-xl border border-slate-300 p-3 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder={`CV ${i + 1} text... (optional if you uploaded PDFs)`}
              value={cv}
              onChange={(e) => setCvs((prev) => prev.map((v, idx) => (idx === i ? e.target.value : v)))}
            />
            {cvs.length > 1 && (
              <button
                onClick={() => setCvs((prev) => prev.filter((_, idx) => idx !== i))}
                className="absolute top-1 right-1 text-rose-600 text-sm font-bold hover:text-rose-800"
                title="Remove this CV"
              >
                ✕
              </button>
            )}
          </div>
        ))}
        {cvs.length < 5 && (
          <button
            onClick={() => setCvs((prev) => [...prev, ""])}
            className="px-3 py-1 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 text-sm"
          >
            + Add another CV
          </button>
        )}
      </div>

      {/* Actions */}
      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs text-slate-500">Will create Job (with role) → add Candidate(s) → run Scoring</span>
        <div className="flex items-center gap-3">
          <MiniViewerToggle value={viewerMode} onChange={setViewerMode} />
          <button
            onClick={handleRun}
            disabled={loading}
            className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-60"
          >
            {loading ? "Scoring…" : "Run score"}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mt-4 rounded-lg bg-rose-50 text-rose-800 text-sm p-3 ring-1 ring-rose-200">
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="mt-6 grid gap-4">
          <div className="rounded-xl bg-emerald-50 p-4 ring-1 ring-emerald-200 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Batch</div>
              <div className="mt-1 text-sm text-emerald-900">{result.batch_id}</div>
            </div>
            <MiniViewerToggle value={viewerMode} onChange={setViewerMode} />
          </div>

          {result.scores?.map((s: any) => {
            const firstEvidence =
              (s.by_criterion || []).find((c: any) => (c.evidence_span || "").trim())?.evidence_span || "";

            return (
              <div key={s.candidate_id} className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{s.display_name || s.candidate_id}</div>
                    <div className="mt-0.5 text-xs text-slate-500">{s.candidate_id}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-semibold text-slate-900">{Number(s.total).toFixed(1)}</div>
                    <div className="text-xs text-slate-500">Total (0–5)</div>
                  </div>
                </div>

                {/* criteria bars 0..5 */}
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {s.by_criterion?.map((c: any) => {
                    const pct = Math.min(100, Math.max(0, (Number(c.score) / 5) * 100));
                    const label = CRITERION_LABEL[c.key] || c.key;
                    return (
                      <div key={c.key}>
                        <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
                          <span title={c.rationale || label}>{label}</span>
                          <span className="font-medium text-slate-900">{Number(c.score).toFixed(1)}</span>
                        </div>
                        <div className="h-2 w-full rounded bg-slate-100">
                          <div className="h-2 rounded bg-slate-900" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* evidence snippet */}
                <div className="mt-3 text-xs text-slate-600">
                  {firstEvidence ? (
                    <>
                      <span className="text-slate-500">Evidence:</span> “{firstEvidence}”
                    </>
                  ) : (
                    <>No specific evidence captured for this candidate.</>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------------- Helpers ---------------- */
function SpecTag({ name, info }: { name: string; info: string }) {
  return (
    <div className="rounded-lg bg-white ring-1 ring-slate-200 px-2.5 py-1.5">
      <div className="font-medium text-slate-800">{name}</div>
      <div className="text-[11px] text-slate-500 mt-0.5">{info}</div>
    </div>
  );
}

/* ---------------- Minimal icons & logo ---------------- */
function ShieldIcon({ className = "h-5 w-5" }: { className?: string }) { return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3l7 4v5c0 5-3.5 8-7 9-3.5-1-7-4-7-9V7l7-4z" /><path d="M9 12l2 2 4-4" strokeLinecap="round" /></svg>; }
function EyeIcon({ className = "h-5 w-5" }: { className?: string }) { return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" /><circle cx="12" cy="12" r="3.5" /></svg>; }
function TrailIcon({ className = "h-5 w-5" }: { className?: string }) { return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 19h6M4 15h10M4 11h14M4 7h8" strokeLinecap="round" /><circle cx="19" cy="7" r="2" /></svg>; }
function ScaleIcon() { return <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3v18M6 7l-4 6h8l-4-6zm12 0l-4 6h8l-4-6zM6 19h12" strokeLinecap="round"/></svg>; }
function LensIcon() { return <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5" strokeLinecap="round"/></svg>; }
function HumanIcon() { return <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="7" r="3"/><path d="M5 21c0-4 3-7 7-7s7 3 7 7"/></svg>; }
function Logo({ small = false }: { small?: boolean }) {
  return (
    <div className={`relative ${small ? "h-6 w-6" : "h-8 w-8"}`}>
      <svg viewBox="0 0 48 48" className="h-full w-full">
        <defs>
          <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#10B981"/><stop offset="100%" stopColor="#1E3A8A"/>
          </linearGradient>
        </defs>
        <rect x="6" y="6" width="36" height="36" rx="10" fill="url(#g)" opacity="0.15"/>
        <path d="M12 30c4-8 8-12 12-12s8 4 12 12" fill="none" stroke="url(#g)" strokeWidth="3" strokeLinecap="round"/>
        <circle cx="24" cy="18" r="3" fill="#10B981"/>
      </svg>
    </div>
  );
}
