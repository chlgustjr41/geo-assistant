import json
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import job_manager
from ..deps import get_user_db as get_db, get_user_email
from ..models import ActiveJob

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


# ── Persistent active-job flags (survive sign-out + refresh) ──────────────


class CreateActiveJobRequest(BaseModel):
    job_type: str
    job_id: str
    config_json: str | None = None


@router.post("/active")
def create_active_job(
    body: CreateActiveJobRequest,
    db: Session = Depends(get_db),
):
    """Persist a flag that a long-running job is in progress for this user."""
    active = ActiveJob(
        job_type=body.job_type,
        job_id=body.job_id,
        config_json=body.config_json,
    )
    db.add(active)
    db.commit()
    db.refresh(active)
    return {"id": active.id, "job_id": active.job_id}


@router.get("/active/list")
def list_active_jobs(
    db: Session = Depends(get_db),
):
    """Return all active job flags for this user.

    Cross-references with in-memory job_manager:
    - If the in-memory job is still running → return it with current progress
    - If the in-memory job completed → update the DB flag and return result
    - If the in-memory job is gone (server restarted) → mark as stale
    """
    rows = db.query(ActiveJob).filter(ActiveJob.status == "running").all()
    result = []
    for row in rows:
        mem_job = job_manager.get_job(row.job_id)
        if mem_job and mem_job.status == "running":
            result.append({
                "id": row.id,
                "job_type": row.job_type,
                "job_id": row.job_id,
                "status": "running",
                "progress": mem_job.progress,
                "config": json.loads(row.config_json) if row.config_json else None,
                "created_at": row.created_at.isoformat() if row.created_at else None,
            })
        elif mem_job and mem_job.status == "complete":
            row.status = "complete"
            row.result_json = json.dumps(mem_job.result) if mem_job.result else None
            db.commit()
            result.append({
                "id": row.id,
                "job_type": row.job_type,
                "job_id": row.job_id,
                "status": "complete",
                "result": mem_job.result,
                "config": json.loads(row.config_json) if row.config_json else None,
                "created_at": row.created_at.isoformat() if row.created_at else None,
            })
        elif mem_job and mem_job.status == "error":
            row.status = "error"
            row.error = mem_job.error
            db.commit()
            result.append({
                "id": row.id,
                "job_type": row.job_type,
                "job_id": row.job_id,
                "status": "error",
                "error": mem_job.error,
                "config": json.loads(row.config_json) if row.config_json else None,
                "created_at": row.created_at.isoformat() if row.created_at else None,
            })
        else:
            # In-memory job is gone (server restarted) — mark as stale
            row.status = "stale"
            row.error = "Server restarted while job was running"
            db.commit()
            result.append({
                "id": row.id,
                "job_type": row.job_type,
                "job_id": row.job_id,
                "status": "stale",
                "error": "Server restarted while job was running",
                "config": json.loads(row.config_json) if row.config_json else None,
                "created_at": row.created_at.isoformat() if row.created_at else None,
            })
    return {"active_jobs": result}


@router.delete("/active/{active_id}")
def delete_active_job(
    active_id: str,
    db: Session = Depends(get_db),
):
    """Clear a persistent active-job flag (called when job finishes or user dismisses)."""
    row = db.query(ActiveJob).filter(ActiveJob.id == active_id).first()
    if not row:
        raise HTTPException(404, "Active job flag not found")
    db.delete(row)
    db.commit()
    return {"ok": True}
