# backend/test_audit.py
import requests

BASE_URL = "http://127.0.0.1:8000/api/v1"

# 1️⃣ Create a job
job_payload = {
    "title": "Backend Engineer",
    "description": "Test job for scoring candidates",
    "rubric": [
        {"key": "sys_design", "weight": 0.4, "description": "System design skills"},
        {"key": "prod_ownership", "weight": 0.3, "description": "Production experience"},
        {"key": "lang_stack", "weight": 0.2, "description": "Programming languages"},
        {"key": "code_quality", "weight": 0.1, "description": "Testing and quality"}
    ]
}

job_resp = requests.post(f"{BASE_URL}/jobs", json=job_payload)
job_id = job_resp.json()["job_id"]
print("Job ID:", job_id)

# 2️⃣ Add candidates
candidates_payload = {
    "job_id": job_id,
    "candidates": [
        {"cv_text": "Alice has 5 years experience in Python, Go, and system design."},
        {"cv_text": "Bob is a backend engineer with CI/CD experience."}
    ]
}

cand_resp = requests.post(f"{BASE_URL}/candidates/batch", json=candidates_payload)
candidate_ids = cand_resp.json()["candidate_ids"]
print("Candidate IDs:", candidate_ids)

# 3️⃣ Run scoring
score_payload = {"job_id": job_id, "candidate_ids": candidate_ids}
score_resp = requests.post(f"{BASE_URL}/score/run", json=score_payload)
batch_id = score_resp.json()["batch_id"]
print("Batch ID:", batch_id)
print("Scores:", score_resp.json()["scores"])
print("Ethics flags:", score_resp.json()["ethics_flags"])

# 4️⃣ Fetch audit JSON
audit_resp = requests.get(f"{BASE_URL}/audit/{batch_id}.json")
print("Audit JSON:", audit_resp.json())
