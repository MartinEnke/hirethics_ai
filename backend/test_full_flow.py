import requests
import json

BASE_URL = "http://127.0.0.1:8000/api/v1"

# --- 1. Create a job ---
job_payload = {
    "title": "Backend Engineer",
    "description": "Test job for scoring candidates",
    "rubric": [
        {"key": "sys_design", "weight": 0.4, "description": "System design skills"},
        {"key": "prod_ownership", "weight": 0.3, "description": "Production ownership"},
        {"key": "lang_stack", "weight": 0.2, "description": "Language stack"},
        {"key": "code_quality", "weight": 0.1, "description": "Code quality"}
    ]
}

resp_job = requests.post(f"{BASE_URL}/jobs", json=job_payload)
resp_job.raise_for_status()
job_id = resp_job.json()["job_id"]
print("Job ID:", job_id)

# --- 2. Add candidates ---
candidates_payload = {
    "job_id": job_id,
    "candidates": [
        {"cv_text": "Alice has 5 years experience in Python, Go, and system design."},
        {"cv_text": "Bob is a backend engineer with CI/CD experience."}
    ]
}

resp_cand = requests.post(f"{BASE_URL}/candidates/batch", json=candidates_payload)
resp_cand.raise_for_status()
candidate_ids = resp_cand.json()["candidate_ids"]
print("Candidate IDs:", candidate_ids)

# --- 3. Run scoring ---
score_payload = {"job_id": job_id, "candidate_ids": candidate_ids}
resp_score = requests.post(f"{BASE_URL}/score/run", json=score_payload)
resp_score.raise_for_status()
score_data = resp_score.json()
batch_id = score_data["batch_id"]
print("Batch ID:", batch_id)

# --- 4. Fetch audit JSON ---
resp_audit_json = requests.get(f"{BASE_URL}/audit/{batch_id}.json")
resp_audit_json.raise_for_status()
audit_json = resp_audit_json.json()
print("Audit JSON:", json.dumps(audit_json, indent=2))

# --- 5. Fetch audit CSV ---
resp_audit_csv = requests.get(f"{BASE_URL}/audit/{batch_id}.csv")
resp_audit_csv.raise_for_status()
print("Audit CSV:\n", resp_audit_csv.text)
