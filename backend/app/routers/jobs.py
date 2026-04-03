from fastapi import APIRouter, HTTPException

from .. import job_manager

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.get("")
async def list_jobs():
    """Return all currently running jobs."""
    return {"jobs": job_manager.list_running()}


@router.get("/{job_id}")
async def get_job(job_id: str):
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found or expired")
    return {
        "id": job.id,
        "type": job.type,
        "status": job.status,
        "progress": job.progress,
        "result": job.result,
        "error": job.error,
    }
