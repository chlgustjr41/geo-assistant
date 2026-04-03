from __future__ import annotations
import json
import uuid as uuid_module
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import QuerySet

router = APIRouter(prefix="/api/query-sets", tags=["query-sets"])


@router.get("")
def list_query_sets(db: Session = Depends(get_db)):
    qs_list = db.query(QuerySet).order_by(QuerySet.created_at.desc()).all()
    return [
        {
            "id": qs.id,
            "name": qs.name,
            "topic": qs.topic,
            "num_queries": qs.num_queries,
            "queries": json.loads(qs.queries_json),
            "created_at": qs.created_at.isoformat(),
        }
        for qs in qs_list
    ]


class CreateQuerySetRequest(BaseModel):
    name: str
    topic: str = ""
    queries: list[str]


@router.post("")
def create_query_set(body: CreateQuerySetRequest, db: Session = Depends(get_db)):
    if not body.name.strip():
        raise HTTPException(400, "Name is required")
    if not body.queries:
        raise HTTPException(400, "At least one query is required")
    qs = QuerySet(
        id=str(uuid_module.uuid4()),
        name=body.name.strip(),
        topic=body.topic.strip(),
        queries_json=json.dumps(body.queries),
        num_queries=len(body.queries),
    )
    db.add(qs)
    db.commit()
    db.refresh(qs)
    return {"id": qs.id, "name": qs.name, "num_queries": qs.num_queries}


@router.get("/{qs_id}")
def get_query_set(qs_id: str, db: Session = Depends(get_db)):
    qs = db.query(QuerySet).filter(QuerySet.id == qs_id).first()
    if not qs:
        raise HTTPException(404, "Query set not found")
    return {
        "id": qs.id,
        "name": qs.name,
        "topic": qs.topic,
        "num_queries": qs.num_queries,
        "queries": json.loads(qs.queries_json),
        "created_at": qs.created_at.isoformat(),
    }


@router.delete("/{qs_id}")
def delete_query_set(qs_id: str, db: Session = Depends(get_db)):
    qs = db.query(QuerySet).filter(QuerySet.id == qs_id).first()
    if not qs:
        raise HTTPException(404, "Query set not found")
    db.delete(qs)
    db.commit()
    return {"ok": True}
