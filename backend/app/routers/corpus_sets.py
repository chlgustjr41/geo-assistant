from __future__ import annotations
from datetime import datetime, timezone
import uuid as uuid_module
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import CorpusSet, CorpusDocument, QuerySet

router = APIRouter(prefix="/api/corpus-sets", tags=["corpus-sets"])


def _serialize(cs: CorpusSet, doc_count: int, is_deprecated: bool = False) -> dict:
    return {
        "id": cs.id,
        "name": cs.name,
        "query_set_id": cs.query_set_id,
        "num_docs": doc_count,
        "created_at": cs.created_at.isoformat() if cs.created_at else None,
        "is_deprecated": is_deprecated,
    }


@router.get("")
def list_corpus_sets(db: Session = Depends(get_db)):
    sets = db.query(CorpusSet).order_by(CorpusSet.created_at.desc()).all()
    # Fetch existing query set IDs for deprecation check
    existing_qs_ids = {row.id for row in db.query(QuerySet.id).all()}
    result = []
    for cs in sets:
        count = db.query(CorpusDocument).filter(CorpusDocument.corpus_set_id == cs.id).count()
        # Deprecated if it was linked to a query set that no longer exists
        deprecated = bool(cs.query_set_id and cs.query_set_id not in existing_qs_ids)
        result.append(_serialize(cs, count, deprecated))
    return result


class CreateCorpusSetRequest(BaseModel):
    name: str
    query_set_id: str | None = None


@router.post("")
def create_corpus_set(body: CreateCorpusSetRequest, db: Session = Depends(get_db)):
    if not body.name.strip():
        raise HTTPException(400, "Name is required")
    cs = CorpusSet(
        id=str(uuid_module.uuid4()),
        name=body.name.strip(),
        query_set_id=body.query_set_id,
        created_at=datetime.now(timezone.utc),
    )
    db.add(cs)
    db.commit()
    db.refresh(cs)
    return _serialize(cs, 0)


class RenameCorpusSetRequest(BaseModel):
    name: str


@router.put("/{cs_id}")
def rename_corpus_set(cs_id: str, body: RenameCorpusSetRequest, db: Session = Depends(get_db)):
    cs = db.query(CorpusSet).filter(CorpusSet.id == cs_id).first()
    if not cs:
        raise HTTPException(404, "Corpus set not found")
    if not body.name.strip():
        raise HTTPException(400, "Name is required")
    cs.name = body.name.strip()
    db.commit()
    return {"ok": True}


@router.delete("/{cs_id}")
def delete_corpus_set(cs_id: str, db: Session = Depends(get_db)):
    cs = db.query(CorpusSet).filter(CorpusSet.id == cs_id).first()
    if not cs:
        raise HTTPException(404, "Corpus set not found")
    # Delete all documents belonging to this corpus set
    db.query(CorpusDocument).filter(CorpusDocument.corpus_set_id == cs_id).delete(
        synchronize_session=False
    )
    db.delete(cs)
    db.commit()
    return {"ok": True}


@router.get("/{cs_id}/documents")
def list_corpus_set_documents(cs_id: str, db: Session = Depends(get_db)):
    cs = db.query(CorpusSet).filter(CorpusSet.id == cs_id).first()
    if not cs:
        raise HTTPException(404, "Corpus set not found")
    docs = (
        db.query(CorpusDocument)
        .filter(CorpusDocument.corpus_set_id == cs_id)
        .order_by(CorpusDocument.created_at.desc())
        .all()
    )
    return [
        {
            "id": d.id,
            "title": d.title,
            "source_url": d.source_url,
            "word_count": d.word_count,
            "snippet": d.content[:200],
        }
        for d in docs
    ]
