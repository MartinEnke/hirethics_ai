// frontend/src/pages/Landing.tsx
import React, { useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";

import { createJob, addCandidates, runScoring } from "../lib/api";
import ScoreCard from "../components/ScoreCard";
import ViewerToggle from "../components/ViewerToggle";
import type { ViewerMode } from "../lib/viewer";
import { asFlagObj } from "../lib/format";
import type { AnyFlag } from "../lib/format";

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
                Paste up to 5 sample CVs to see a mock score with evidence and ethics flags.
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

/* ---------------- DemoBox ---------------- */
/* ---------------- DemoBox (seeded mock + name-aware) ---------------- */
function DemoBox({
  viewerMode,
  setViewerMode,
}: {
  viewerMode: ViewerMode;
  setViewerMode: (v: ViewerMode) => void;
}) {
  const [cvs, setCvs] = useState<string[]>([""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  /* ---- tiny seeded RNG utils (deterministic per inputs) ---- */
  function xmur3(str: string) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return (h ^= h >>> 16) >>> 0;
    };
  }
  function mulberry32(a: number) {
    return function () {
      let t = (a += 0x6D2B79F5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const randInt = (rng: () => number, lo: number, hi: number) =>
    Math.floor(rng() * (hi - lo + 1)) + lo;
  const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

  /* ---- name + signals helpers ---- */
  function extractName(cv: string) {
    const cand = (cv.split("\n").map((s) => s.trim()).find(Boolean) || "").replace(/^[-–•*#\s]+/, "");
    return cand && cand.length <= 80 ? cand : null;
  }

  // very simple keyword detector used for fit bonus
  function detectSignals(text: string) {
    const t = text.toLowerCase();
    return {
      python: +/python/.test(t),
      fastapi: +/fastapi/.test(t),
      flask: +/flask/.test(t),
      sql: +/(postgres|sql|sqlalchemy)/.test(t),
      rag: +/(rag|pgvector|langchain|llamaindex|retrieval)/.test(t),
      react: +/react/.test(t),
      ts: +/(typescript|ts)/.test(t),
      testing: +/(pytest|playwright|unit test|e2e|testing)/.test(t),
      ci: +/(github actions|ci\/cd|pipeline)/.test(t),
      docs: +/(openapi|pydantic|schema|typed dto)/.test(t),
      design: +/(system design|architecture|scalab|design)/.test(t),
    };
  }

  // role-weighted bonus (core weighted double, extras single), capped
  function fitBonus(cvText: string, roleContext: string) {
    const t = `${cvText}\n${roleContext}`;
    const s = detectSignals(t);
    const coreHits = s.python + (s.fastapi || s.flask ? 1 : 0) + s.sql + s.rag + s.react + s.ts;
    const extras = s.testing + s.ci + s.docs + s.design;
    const raw = coreHits * 2 + extras * 1;
    return Math.min(Math.round(raw), 12);
  }

  type MockFlag = { label: string; severity: "minor" | "moderate" | "major" };
  const FLAG_CATALOG: MockFlag[] = [
    { label: "Minor bias detected", severity: "minor" },
    { label: "Proxy signal suspected: brand", severity: "moderate" },
    { label: "Instability under blinding", severity: "moderate" },
    { label: "Large rank shift under counterfactual", severity: "major" },
  ];

  function sampleFlags(rng: () => number): MockFlag[] {
    const r = rng();
    const n = r < 0.55 ? 0 : r < 0.88 ? 1 : 2; // mostly none/one
    // shuffle deterministically-ish using rng
    const arr = [...FLAG_CATALOG];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.slice(0, n);
  }

  /* ---- seeded, role-aware mock scoring ---- */
  function mockScoring(
    cands: { id: string; cv_text: string; display_name: string }[],
    roleCtx: string,
    seedInput: string
  ) {
    const seedFn = xmur3(seedInput);
    const rng = mulberry32(seedFn());

    const raw = cands.map(({ id, cv_text, display_name }, idx) => {
      const base = randInt(rng, 60, 85); // keep base reasonable
      const bonus = fitBonus(cv_text, roleCtx); // 0..12
      let total = clamp(base + bonus, 40, 99); // cap at 99 (no “perfect 100”)

      const picks = sampleFlags(rng);
      if (picks.some((p) => p.severity === "major")) total = Math.max(total - 4, 0);

      return {
        candidate_id: id,
        display_name,
        total,
        by_criterion: [
          { criterion: "System Design", score: randInt(rng, 20, 30) },
          { criterion: "Experience", score: randInt(rng, 20, 30) },
          { criterion: "Skills", score: randInt(rng, 20, 30) },
        ],
        flags: picks,
      };
    });

    // summaries
    const flags_by_type: Record<string, number> = {};
    const flags_by_severity: Record<string, number> = { minor: 0, moderate: 0, major: 0 };
    raw.forEach((r) =>
      r.flags.forEach((f) => {
        flags_by_type[f.label] = (flags_by_type[f.label] || 0) + 1;
        flags_by_severity[f.severity] = (flags_by_severity[f.severity] || 0) + 1;
      })
    );

    // stability-esque numbers (seeded)
    const n_candidates = cands.length;
    const spearman_rho = +(0.82 + rng() * 0.12).toFixed(2);
    const k = 5;
    const overlap = Math.min(randInt(rng, 2, Math.min(3, n_candidates)), n_candidates);
    const topk_overlap_count = overlap;
    const topk_overlap_ratio = +(overlap / Math.min(k, n_candidates || 1)).toFixed(2);
    const mean_abs_delta = +(rng() * 1.5 + 0.4).toFixed(2);

    return {
      batch_id: `batch_mock_${Date.now()}`,
      scores: raw.map((r) => ({
        candidate_id: r.candidate_id,
        display_name: r.display_name,
        total: r.total,
        by_criterion: r.by_criterion,
      })),
      ethics_flags: raw.map((r) => ({
        candidate_id: r.candidate_id,
        flags: r.flags.map((f) => f.label),
      })),
      flags_by_type,
      flags_by_severity,
      n_candidates,
      spearman_rho,
      topk_overlap_count,
      topk_overlap_ratio,
      mean_abs_delta,
      // store seed so Evaluation could reproduce if needed
      _seed: seedInput,
    };
  }

  function toCanonicalReport(mock: any) {
    // derive fairness/transparency from total (seeded feel not needed here)
    const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
    const candidates = (mock.scores || []).map((s: any) => {
      const fairness = clamp(Math.round(s.total - 5 + Math.random() * 8), 55, 95);
      const transparency = clamp(Math.round(s.total - 8 + Math.random() * 10), 55, 95);
      const candidate_id = s.candidate_id;
      const found = (mock.ethics_flags || []).find((f: any) => f.candidate_id === candidate_id);
      return {
        candidate_id,
        display_name: s.display_name || undefined,
        score: { overall: s.total, fairness, transparency },
        flags: found?.flags || [],
      };
    });

    return {
      batch_id: mock.batch_id,
      n_candidates: mock.n_candidates ?? candidates.length,
      spearman_rho: mock.spearman_rho,
      topk_overlap_count: mock.topk_overlap_count,
      topk_overlap_ratio: mock.topk_overlap_ratio,
      mean_abs_delta: mock.mean_abs_delta,
      candidates,
      flags_by_type: mock.flags_by_type,
      flags_by_severity: mock.flags_by_severity,
      _seed: mock._seed,
    };
  }

  const handleRun = async () => {
    setLoading(true);
    setError(null);

    try {
      const { job_id } = await createJob();
      const cvsToSend = cvs.filter((cv) => cv.trim()).slice(0, 5);
      if (!cvsToSend.length) {
        setError("Please enter at least one CV.");
        setLoading(false);
        return;
      }

      let data: any;
      try {
        const candidatesPayload = cvsToSend.map((cv_text) => ({ cv_text }));
        const { candidate_ids } = await addCandidates(job_id, candidatesPayload);
        data = await runScoring(job_id, candidate_ids);
      } catch {
        const roleCtx = localStorage.getItem("jobContext") || "";
        const candObjs = cvsToSend.map((cv, i) => ({
          id: `cand_mock_${i}`,
          cv_text: cv,
          display_name: extractName(cv) || `Candidate ${i + 1}`,
        }));
        const seedInput = `${roleCtx}||${cvsToSend.join("||")}`; // reproducible per same inputs
        data = mockScoring(candObjs, roleCtx, seedInput);
      }

      localStorage.setItem("demoBatch", JSON.stringify(data));
      localStorage.setItem("latestBatchId", data.batch_id);

      // canonical for Evaluation fallback
      try {
        const canonical = toCanonicalReport(data);
        localStorage.setItem(`report:${data.batch_id}`, JSON.stringify(canonical));
      } catch (e) {
        console.warn("Failed to persist canonical report", e);
      }

      setResult(data);
    } catch (e: any) {
      setError(e?.message || "Request failed. Is the backend running on http://localhost:8000?");
    } finally {
      setLoading(false);
    }
  };

  const updateCv = (index: number, value: string) => {
    setCvs((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const addCvField = () => {
    if (cvs.length < 5) setCvs((prev) => [...prev, ""]);
  };

  const removeCvField = (index: number) => {
    setCvs((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div id="demo-box" className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      {/* CV inputs */}
      <div className="flex flex-col gap-4">
        {cvs.map((cv, i) => (
          <div key={i} className="relative">
            <textarea
              className="mt-2 w-full h-24 rounded-xl border border-slate-300 p-3 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder={`CV ${i + 1} text...`}
              value={cv}
              onChange={(e) => updateCv(i, e.target.value)}
            />
            {cvs.length > 1 && (
              <button
                onClick={() => removeCvField(i)}
                className="absolute top-1 right-1 text-rose-600 text-sm font-bold hover:text-rose-800"
                title="Remove this CV"
              >
                ✕
              </button>
            )}
          </div>
        ))}
        {cvs.length < 5 && (
          <button onClick={addCvField} className="px-3 py-1 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 text-sm">
            + Add another CV
          </button>
        )}
      </div>

      {/* Actions */}
      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs text-slate-500">Will create Job → add Candidate(s) → run Scoring</span>
        <button
          onClick={handleRun}
          disabled={loading}
          className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-60"
        >
          {loading ? "Scoring…" : "Run mock score"}
        </button>
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
            <ViewerToggle value={viewerMode} onChange={setViewerMode} />
          </div>

          {result.scores?.map((s: any) => {
            const perCandFlags = (result.ethics_flags || [])
              .filter((f: any) => f.candidate_id === s.candidate_id)
              .map(asFlagObj) as AnyFlag[];
            return (
              <ScoreCard
                key={s.candidate_id}
                candidateId={s.display_name || s.candidate_id}
                total={s.total >= 99 ? 99 : s.total}
                by={s.by_criterion}
                flags={perCandFlags}
                viewerMode={viewerMode}
              />
            );
          })}
        </div>
      )}
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
