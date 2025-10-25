
# Hirethics AI
![Banner](path/to/banner.png)

**Ethical AI for Transparent Hiring Decisions** — Hirethics AI ranks candidates on job-relevant evidence, audits itself for bias, and generates explainable scoring for recruiters, ethics officers, and developers.

## Table of Contents
- [Overview](#overview)
- [Key Features](#key-features)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Usage](#usage)
- [Project Structure](#project-structure)
- [License](#license)

## Overview
Hirethics AI is a **full-stack AI application** for transparent and bias-aware hiring. Integrates **LLM-powered analysis**, rule-based scoring, and counterfactual auditing into an interactive dashboard.

## Key Features
- **Candidate Scoring**: Evidence-based ranking aligned to rubrics.
- **Bias Auditing**: Detect proxy signals and blinding instability.
- **Multi-Role Views**: Interfaces for recruiter, ethics reviewer, and developer.
- **Exportable Audit Trail**: PDF reports for compliance.
- **Interactive Demo**: Upload PDFs or paste CV text to see scoring.
- **LLM Integration**: Structured explanations and follow-ups.
- **Mock & Real Mode**: Fallback scoring for testing or live evaluation.

## Tech Stack
**Backend**: Python, FastAPI, Flask, Pydantic, SQLAlchemy, OpenAI API  
**Frontend**: React, Vite, TypeScript, Tailwind CSS, Framer Motion  
**Other**: Git, Swagger/OpenAPI, Docker (optional)

## Getting Started
### Prerequisites
- Python 3.10+
- Node.js & npm/yarn
- SQLite/PostgreSQL
- OpenAI API key

### Installation
```bash
git clone https://github.com/yourusername/hirethics-ai.git
cd hirethics-ai

# Backend
cd backend
python -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# Frontend
cd ../frontend
npm install
npm run dev
```

### Environment Variables
Create `.env` in `backend/`:
```
OPENAI_API_KEY=your_openai_api_key
DATABASE_URL=sqlite:///hirethics.db
```

### Run
```bash
# Backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Frontend (separate terminal)
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) for web UI  
API docs at [http://localhost:8000/docs](http://localhost:8000/docs)

## Usage
1. Upload CV PDFs or paste text.
2. Select **Job Context** and **Viewer Mode**.
3. Run scoring: total scores, per-criterion, flags, explanations.
4. Export PDF reports and audit trails.
5. Optional: multi-candidate comparison and follow-up questions.

## Project Structure
```
hirethics-ai/
├─ backend/
│  ├─ app/
│  │  ├─ main.py
│  │  ├─ routers/
│  │  ├─ models.py
│  │  ├─ utils.py
│  │  ├─ services/
│  │  └─ database.py
│  └─ .env
├─ frontend/
│  ├─ src/
│  │  ├─ pages/
│  │  ├─ components/
│  │  └─ lib/
│  ├─ index.html
│  └─ package.json
└─ README.md
```

## License
Currently **unlicensed** — all rights reserved. Contact author for collaboration.

**Built by Martin Enke – Full-Stack & GenAI Engineer**
