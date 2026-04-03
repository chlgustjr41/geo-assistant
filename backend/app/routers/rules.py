from __future__ import annotations
import asyncio
import json
import logging
import uuid as uuid_module
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sse_starlette.sse import EventSourceResponse
from ..deps import get_user_db as get_db, get_user_email
from ..models import RuleSet, CorpusDocument, CorpusSet, QuerySet, ActiveJob
from .. import job_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/rules", tags=["rules"])


@router.get("")
def list_rule_sets(db: Session = Depends(get_db)):
    rule_sets = db.query(RuleSet).order_by(RuleSet.created_at).all()
    existing_cs_ids = {row.id for row in db.query(CorpusSet.id).all()}
    existing_qs_ids = {row.id for row in db.query(QuerySet.id).all()}
    result = []
    for rs in rule_sets:
        is_deprecated = False
        if rs.extraction_metadata_json:
            try:
                meta = json.loads(rs.extraction_metadata_json)
                # Deprecated if any referenced corpus set is gone
                corpus_set_ids = meta.get("corpus_set_ids") or []
                if corpus_set_ids and any(cid not in existing_cs_ids for cid in corpus_set_ids):
                    is_deprecated = True
                # Deprecated if the query set it was built from is gone
                qs_id = meta.get("query_set_id")
                if qs_id and qs_id not in existing_qs_ids:
                    is_deprecated = True
            except Exception:
                pass
        result.append({
            "id": rs.id,
            "name": rs.name,
            "engine_model": rs.engine_model,
            "topic_domain": rs.topic_domain,
            "num_rules": rs.num_rules,
            "is_builtin": rs.is_builtin,
            "created_at": rs.created_at.isoformat(),
            "is_deprecated": is_deprecated,
        })
    return result


@router.get("/{rule_set_id}")
def get_rule_set(rule_set_id: str, db: Session = Depends(get_db)):
    rs = db.query(RuleSet).filter(RuleSet.id == rule_set_id).first()
    if not rs:
        raise HTTPException(404, "Rule set not found")
    return {
        "id": rs.id,
        "name": rs.name,
        "engine_model": rs.engine_model,
        "topic_domain": rs.topic_domain,
        "rules": json.loads(rs.rules_json),
        "num_rules": rs.num_rules,
        "is_builtin": rs.is_builtin,
        "created_at": rs.created_at.isoformat(),
        "extraction_metadata": json.loads(rs.extraction_metadata_json) if rs.extraction_metadata_json else None,
    }


class RuleSetUpdate(BaseModel):
    name: str | None = None
    rules: dict | None = None  # {"filtered_rules": [...]}


@router.put("/{rule_set_id}")
def update_rule_set(rule_set_id: str, body: RuleSetUpdate, db: Session = Depends(get_db)):
    rs = db.query(RuleSet).filter(RuleSet.id == rule_set_id).first()
    if not rs:
        raise HTTPException(404, "Rule set not found")
    if body.name is not None:
        rs.name = body.name
    if body.rules is not None:
        rules_list = body.rules.get("filtered_rules", [])
        rs.rules_json = json.dumps({"filtered_rules": rules_list})
        rs.num_rules = len(rules_list)
    db.commit()
    return {"ok": True}


@router.delete("/{rule_set_id}")
def delete_rule_set(rule_set_id: str, db: Session = Depends(get_db)):
    rs = db.query(RuleSet).filter(RuleSet.id == rule_set_id).first()
    if not rs:
        raise HTTPException(404, "Rule set not found")
    if rs.is_builtin:
        raise HTTPException(400, "Cannot delete built-in rule sets")
    db.delete(rs)
    db.commit()
    return {"ok": True}


@router.get("/{rule_set_id}/export")
def export_rule_set(rule_set_id: str, db: Session = Depends(get_db)):
    rs = db.query(RuleSet).filter(RuleSet.id == rule_set_id).first()
    if not rs:
        raise HTTPException(404, "Rule set not found")
    from fastapi.responses import JSONResponse
    return JSONResponse(
        content={
            "name": rs.name,
            "engine_model": rs.engine_model,
            "topic_domain": rs.topic_domain,
            **json.loads(rs.rules_json),
        },
        headers={"Content-Disposition": f'attachment; filename="{rs.name}.json"'},
    )


class CreateRuleSetRequest(BaseModel):
    name: str
    engine_model: str
    topic_domain: str = "custom"
    rules: list[str] = []


@router.post("")
def create_rule_set(body: CreateRuleSetRequest, db: Session = Depends(get_db)):
    if not body.name.strip():
        raise HTTPException(400, "Name is required")
    new_rs = RuleSet(
        id=str(uuid_module.uuid4()),
        name=body.name.strip(),
        engine_model=body.engine_model,
        topic_domain=body.topic_domain,
        rules_json=json.dumps({"filtered_rules": body.rules}),
        num_rules=len(body.rules),
        is_builtin=False,
    )
    db.add(new_rs)
    db.commit()
    db.refresh(new_rs)
    return {"id": new_rs.id, "name": new_rs.name}


# ── New Phase 5 endpoints ───────────────────────────────────────────────────

class GenerateQueriesRequest(BaseModel):
    topic: str = ""
    num_queries: int = 20
    article_content: str | None = None  # when provided, queries are grounded in the article


@router.post("/generate-queries")
async def generate_queries_endpoint(body: GenerateQueriesRequest):
    from ..services.query_generator import generate_queries, generate_queries_from_article
    try:
        if body.article_content and body.article_content.strip():
            queries, suggested_topic = await generate_queries_from_article(
                body.article_content.strip(), body.num_queries
            )
            return {"queries": queries, "suggested_topic": suggested_topic}
        else:
            if not body.topic.strip():
                raise HTTPException(400, "Provide either a topic or article_content")
            queries, suggested_name = await generate_queries(body.topic.strip(), body.num_queries)
            return {"queries": queries, "suggested_topic": suggested_name}
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.exception("Query generation failed")
        raise HTTPException(500, str(e))


class ExtractRulesRequest(BaseModel):
    queries: list[str]
    engine_models: list[str]
    rule_set_name: str
    query_set_id: str                # used to auto-select matching corpus sets
    corpus_set_ids: list[str] = []   # explicit override; empty = use corpus sets linked to query_set_id


@router.post("/extract")
async def extract_rules_endpoint(body: ExtractRulesRequest, db: Session = Depends(get_db), user_email: str | None = Depends(get_user_email)):
    from ..services.rule_extractor import extract_rules_stream, MIN_CORPUS_DOCS
    from ..database import get_user_session_factory
    from ..models import CorpusSet

    if not body.engine_models:
        raise HTTPException(400, "At least one engine model is required")

    # Resolve which corpus sets to use:
    # explicit override > corpus sets linked to this query set > all corpus docs
    if body.corpus_set_ids:
        resolved_set_ids = body.corpus_set_ids
    else:
        linked = (
            db.query(CorpusSet)
            .filter(CorpusSet.query_set_id == body.query_set_id)
            .all()
        )
        resolved_set_ids = [cs.id for cs in linked]

    # Fetch corpus documents
    q = db.query(CorpusDocument)
    if resolved_set_ids:
        q = q.filter(CorpusDocument.corpus_set_id.in_(resolved_set_ids))
    corpus_rows = q.order_by(CorpusDocument.created_at.desc()).all()

    if len(corpus_rows) < MIN_CORPUS_DOCS:
        raise HTTPException(
            400,
            f"Only {len(corpus_rows)} corpus document(s) found for this query set. "
            f"At least {MIN_CORPUS_DOCS} are required. "
            "Build a corpus first in the Build Corpus tab."
        )

    corpus_contents = [row.content for row in corpus_rows]
    corpus_meta = [
        {"id": row.id, "title": row.title, "source_url": row.source_url,
         "corpus_set_id": row.corpus_set_id}
        for row in corpus_rows
    ]

    def _save_rule_set(model: str, rules: list, ge_log: list) -> dict:
        model_total = len(body.engine_models)
        name = body.rule_set_name if model_total == 1 else f"{body.rule_set_name} [{model.split('/')[-1]}]"
        metadata = {
            "queries": body.queries,
            "query_set_id": body.query_set_id,
            "corpus_set_ids": resolved_set_ids,
            "corpus_doc_count": len(corpus_rows),
            "source_urls": [m["source_url"] for m in corpus_meta if m.get("source_url")],
            "ge_responses": ge_log,
        }
        user_sf = get_user_session_factory(user_email)
        db2 = user_sf()
        try:
            new_rs = RuleSet(
                id=str(uuid_module.uuid4()),
                name=name,
                engine_model=model,
                topic_domain="custom",
                rules_json=json.dumps({"filtered_rules": rules}),
                num_rules=len(rules),
                is_builtin=False,
                extraction_metadata_json=json.dumps(metadata),
            )
            db2.add(new_rs)
            db2.commit()
            db2.refresh(new_rs)
            return {"model": model, "rule_set_id": new_rs.id, "num_rules": len(rules)}
        finally:
            db2.close()

    job = job_manager.create_job("extraction", user_email or "")

    # Persist active-job flag in user's DB (survives sign-out + refresh)
    active_job_id: str | None = None
    try:
        user_sf = get_user_session_factory(user_email)
        _adb = user_sf()
        active = ActiveJob(
            job_type="extraction",
            job_id=job.id,
            config_json=json.dumps({
                "rule_set_name": body.rule_set_name,
                "engine_models": body.engine_models,
                "query_set_id": body.query_set_id,
                "corpus_set_ids": resolved_set_ids,
                "query_count": len(body.queries),
                "corpus_doc_count": len(corpus_rows),
            }),
        )
        _adb.add(active)
        _adb.commit()
        active_job_id = active.id
        _adb.close()
    except Exception:
        pass

    async def event_generator():
        queue: asyncio.Queue = asyncio.Queue()
        model_total = len(body.engine_models)

        # Emit job ID + corpus info immediately
        yield {"data": json.dumps({
            "status": "corpus_info",
            "job_id": job.id,
            "corpus_doc_count": len(corpus_rows),
            "corpus_set_ids": resolved_set_ids,
        })}

        async def _run():
            for model_index, engine_model in enumerate(body.engine_models):
                try:
                    def _cb(data: dict, mi: int = model_index, mt: int = model_total, em: str = engine_model) -> None:
                        progress = {**data, "model": em, "model_index": mi, "model_total": mt}
                        queue.put_nowait({"progress": progress})
                        job_manager.update_progress(job.id, progress)

                    rules, ge_log = await extract_rules_stream(
                        body.queries,
                        engine_model,
                        body.rule_set_name,
                        _cb,
                        corpus_docs=corpus_contents,
                    )
                    saved = _save_rule_set(engine_model, rules, ge_log)
                    queue.put_nowait({"saved": saved})
                except Exception as e:
                    logger.exception("Rule extraction failed for model %s", engine_model)
                    queue.put_nowait({"saved": {"model": engine_model, "error": str(e)}})
            await queue.put({"done": True})

        task = asyncio.create_task(_run())
        all_saved: list[dict] = []

        while True:
            try:
                item = await asyncio.wait_for(queue.get(), timeout=900)
            except asyncio.TimeoutError:
                job_manager.fail_job(job.id, "Timeout")
                if active_job_id:
                    try:
                        _tdb = get_user_session_factory(user_email)()
                        flag = _tdb.query(ActiveJob).filter(ActiveJob.id == active_job_id).first()
                        if flag:
                            flag.status = "error"
                            flag.error = "Timeout"
                            _tdb.commit()
                        _tdb.close()
                    except Exception:
                        pass
                yield {"data": json.dumps({"status": "error", "message": "Timeout"})}
                task.cancel()
                return

            if "progress" in item:
                d = item["progress"]
                yield {"data": json.dumps({
                    "stage": d.get("stage"),
                    "completed": d.get("completed"),
                    "total": d.get("total"),
                    "model": d.get("model"),
                    "model_index": d.get("model_index"),
                    "model_total": d.get("model_total"),
                })}
            elif "saved" in item:
                all_saved.append(item["saved"])
                yield {"data": json.dumps({"status": "model_complete", "result": item["saved"]})}
            elif "done" in item:
                job_manager.complete_job(job.id, all_saved)
                # Clear persistent active-job flag
                if active_job_id:
                    try:
                        _cdb = get_user_session_factory(user_email)()
                        flag = _cdb.query(ActiveJob).filter(ActiveJob.id == active_job_id).first()
                        if flag:
                            flag.status = "complete"
                            flag.result_json = json.dumps(all_saved)
                            _cdb.commit()
                        _cdb.close()
                    except Exception:
                        pass
                yield {"data": json.dumps({"status": "complete", "results": all_saved})}
                return

    return EventSourceResponse(event_generator())


