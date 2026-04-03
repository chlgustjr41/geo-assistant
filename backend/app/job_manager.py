"""In-memory job tracker for long-running tasks.

Each job has:
- id: str (UUID)
- type: "extraction" | "corpus_import"
- status: "running" | "complete" | "error"
- progress: dict (stage, completed, total, etc.)
- result: any (final result when done)
- created_at: float (time.time())

Jobs are kept in memory and cleaned up after 1 hour.
"""

import time
import uuid
from dataclasses import dataclass, field
from typing import Any


@dataclass
class Job:
    id: str
    type: str
    user_email: str = ""
    status: str = "running"
    progress: dict = field(default_factory=dict)
    result: Any = None
    error: str | None = None
    created_at: float = field(default_factory=time.time)


_jobs: dict[str, Job] = {}

MAX_AGE = 3600  # 1 hour


def _cleanup() -> None:
    now = time.time()
    stale = [jid for jid, j in _jobs.items() if now - j.created_at > MAX_AGE]
    for jid in stale:
        del _jobs[jid]


def create_job(job_type: str, user_email: str = "") -> Job:
    _cleanup()
    job = Job(id=str(uuid.uuid4()), type=job_type, user_email=user_email.lower())
    _jobs[job.id] = job
    return job


def get_job(job_id: str) -> Job | None:
    return _jobs.get(job_id)


def update_progress(job_id: str, progress: dict) -> None:
    job = _jobs.get(job_id)
    if job:
        job.progress = progress


def complete_job(job_id: str, result: Any = None) -> None:
    job = _jobs.get(job_id)
    if job:
        job.status = "complete"
        job.result = result


def fail_job(job_id: str, error: str) -> None:
    job = _jobs.get(job_id)
    if job:
        job.status = "error"
        job.error = error


def list_running(user_email: str = "") -> list[dict]:
    _cleanup()
    email = user_email.lower()
    return [
        {"id": j.id, "type": j.type, "status": j.status, "progress": j.progress}
        for j in _jobs.values()
        if j.status == "running" and (not email or j.user_email == email)
    ]
