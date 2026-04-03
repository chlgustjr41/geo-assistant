from fastapi import APIRouter, Depends, HTTPException

from .. import job_manager
from ..deps import get_user_email

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.get("")
async def list_jobs(user_email: str | None = Depends(get_user_email)):
    """Return currently running jobs for this user."""
    return {"jobs": job_manager.list_running(user_email or "")}


@router.get("/{job_id}")
async def get_job(job_id: str, user_email: str | None = Depends(get_user_email)):
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found or expired")
    # Ensure user can only see their own jobs
    if user_email and job.user_email and job.user_email != user_email.lower():
        raise HTTPException(404, "Job not found or expired")
    return {
        "id": job.id,
        "type": job.type,
        "status": job.status,
        "progress": job.progress,
        "result": job.result,
        "error": job.error,
    }
