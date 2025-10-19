import requests

url = "http://127.0.0.1:8000/api/v1/candidates/batch"

payload = {
    "job_id": "job_test123",
    "candidates": [
        {"cv_text": "Alice has 5 years experience in Python, Go, and system design."},
        {"cv_text": "Bob is a backend engineer with CI/CD experience."}
    ]
}

try:
    response = requests.post(url, json=payload)
    print("Status code:", response.status_code)
    print("Response JSON:", response.json())
except Exception as e:
    print("Failed to connect or error occurred:", e)
