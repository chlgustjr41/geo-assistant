from __future__ import annotations
import asyncio
import json
import random
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..deps import get_user_db as get_db, get_user_email
from ..models import Article, RuleSet, CorpusDocument, CorpusSet, ActiveJob
from ..services.article_scraper import scrape_url
from ..services import geo_rewriter, geo_evaluator
from ..database import get_user_session_factory
from .. import job_manager

router = APIRouter(prefix="/api/writing", tags=["writing"])


class ScrapeRequest(BaseModel):
    url: str


@router.post("/scrape-url")
async def scrape_article(body: ScrapeRequest):
    try:
        return await scrape_url(body.url)
    except Exception as e:
        raise HTTPException(400, f"Failed to scrape URL: {str(e)}")


class SaveArticleRequest(BaseModel):
    source_url: str | None = None
    title: str = ""
    original_content: str
    rewritten_content: str | None = None
    rule_set_id: str = ""        # legacy single-ID field (kept for compat)
    rule_set_ids: list[str] = [] # all selected rule set IDs
    model_used: str = ""
    trend_keywords: list[str] = []


@router.post("/save")
def save_article(body: SaveArticleRequest, db: Session = Depends(get_db)):
    all_ids = body.rule_set_ids or ([body.rule_set_id] if body.rule_set_id else [])
    article = Article(
        source_url=body.source_url,
        title=body.title,
        original_content=body.original_content,
        rewritten_content=body.rewritten_content,
        rule_set_id=all_ids[0] if all_ids else "",
        rule_set_ids_json=json.dumps(all_ids) if all_ids else None,
        model_used=body.model_used,
        trend_keywords_json=json.dumps(body.trend_keywords) if body.trend_keywords else None,
    )
    db.add(article)
    db.commit()
    db.refresh(article)
    return {"id": article.id, "created_at": article.created_at.isoformat()}


@router.delete("/history/{article_id}")
def delete_article(article_id: str, db: Session = Depends(get_db)):
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(404, "Article not found")
    db.delete(article)
    db.commit()
    return {"ok": True}


class SaveScoresRequest(BaseModel):
    geo_scores_json: str  # serialized MultiGeoEvalResponse


@router.patch("/history/{article_id}/scores")
def save_article_scores(article_id: str, body: SaveScoresRequest, db: Session = Depends(get_db)):
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(404, "Article not found")
    article.geo_scores_json = body.geo_scores_json
    db.commit()
    return {"ok": True}


def _resolve_rule_set_ids(article: Article) -> list[str]:
    """Return all rule set IDs stored for an article (new multi or legacy single)."""
    if article.rule_set_ids_json:
        try:
            ids = json.loads(article.rule_set_ids_json)
            if isinstance(ids, list) and ids:
                return ids
        except Exception:
            pass
    return [article.rule_set_id] if article.rule_set_id else []


def _rule_sets_payload(rule_set_ids: list[str], rule_sets_map: dict) -> list[dict]:
    """Return a list of {id, name, engine_model} for each ID found in the map."""
    return [
        {"id": rs.id, "name": rs.name, "engine_model": rs.engine_model}
        for rid in rule_set_ids
        if (rs := rule_sets_map.get(rid))
    ]


@router.get("/history/{article_id}")
def get_history_item(article_id: str, db: Session = Depends(get_db)):
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(404, "Article not found")
    rule_sets_map = {rs.id: rs for rs in db.query(RuleSet).all()}
    rs_ids = _resolve_rule_set_ids(article)
    rs_list = _rule_sets_payload(rs_ids, rule_sets_map)
    primary_rs = rule_sets_map.get(article.rule_set_id) if article.rule_set_id else None
    corpus_sets = {cs.id: cs.name for cs in db.query(CorpusSet).all()}
    corpus_set_names: list[str] = []
    for rid in rs_ids:
        rs = rule_sets_map.get(rid)
        if rs and rs.extraction_metadata_json:
            try:
                meta = json.loads(rs.extraction_metadata_json)
                for cid in meta.get("corpus_set_ids", []):
                    name = corpus_sets.get(cid)
                    if name and name not in corpus_set_names:
                        corpus_set_names.append(name)
            except Exception:
                pass
    return {
        "id": article.id,
        "title": article.title,
        "source_url": article.source_url,
        "original_content": article.original_content,
        "rewritten_content": article.rewritten_content,
        "geo_scores": json.loads(article.geo_scores_json) if article.geo_scores_json else None,
        "rule_set_id": article.rule_set_id,
        "rule_set_name": primary_rs.name if primary_rs else None,
        "rule_sets": rs_list,
        "corpus_set_names": corpus_set_names,
        "model_used": article.model_used,
        "trend_keywords": json.loads(article.trend_keywords_json) if article.trend_keywords_json else [],
        "created_at": article.created_at.isoformat(),
    }


@router.get("/history")
def get_history(db: Session = Depends(get_db)):
    articles = db.query(Article).order_by(Article.created_at.desc()).limit(50).all()
    # Pre-load rule sets and corpus sets to avoid N+1 queries
    rule_sets_map = {rs.id: rs for rs in db.query(RuleSet).all()}
    corpus_sets = {cs.id: cs.name for cs in db.query(CorpusSet).all()}

    rows = []
    for a in articles:
        rs_ids = _resolve_rule_set_ids(a)
        rs_list = _rule_sets_payload(rs_ids, rule_sets_map)
        primary_rs = rule_sets_map.get(a.rule_set_id) if a.rule_set_id else None
        # Corpus set names across all rule sets
        corpus_set_names: list[str] = []
        for rid in rs_ids:
            rs = rule_sets_map.get(rid)
            if rs and rs.extraction_metadata_json:
                try:
                    meta = json.loads(rs.extraction_metadata_json)
                    for cid in meta.get("corpus_set_ids", []):
                        name = corpus_sets.get(cid)
                        if name and name not in corpus_set_names:
                            corpus_set_names.append(name)
                except Exception:
                    pass
        # Corpus doc count from saved eval scores (only present after evaluation)
        corpus_doc_count: int | None = None
        corpus_used: bool | None = None
        if a.geo_scores_json:
            try:
                sc = json.loads(a.geo_scores_json)
                corpus_used = sc.get("corpus_used")
                corpus_doc_count = sc.get("corpus_doc_count")
            except Exception:
                pass
        rows.append({
            "id": a.id,
            "title": a.title,
            "source_url": a.source_url,
            "model_used": a.model_used,
            "rule_set_id": a.rule_set_id,
            "rule_set_name": primary_rs.name if primary_rs else None,
            "rule_sets": rs_list,
            "corpus_set_names": corpus_set_names,
            "corpus_used": corpus_used,
            "corpus_doc_count": corpus_doc_count,
            "has_rewrite": a.rewritten_content is not None,
            "has_scores": a.geo_scores_json is not None,
            "created_at": a.created_at.isoformat(),
        })
    return rows


class RewriteRequest(BaseModel):
    content: str
    model: str
    rule_set_ids: list[str]
    trend_keywords: list[str] = []


@router.post("/rewrite")
async def rewrite_article(
    body: RewriteRequest,
    db: Session = Depends(get_db),
    user_email: str | None = Depends(get_user_email),
):
    if not body.rule_set_ids:
        raise HTTPException(400, "At least one rule set ID is required")

    # Load rule sets synchronously before spawning background task
    loaded: list[tuple[str, list[str]]] = []
    for rsid in body.rule_set_ids:
        rs = db.query(RuleSet).filter(RuleSet.id == rsid).first()
        if rs is None:
            raise HTTPException(404, f"Rule set '{rsid}' not found")
        rules_data = json.loads(rs.rules_json)
        loaded.append((rs.name, rules_data.get("filtered_rules", [])))

    job = job_manager.create_job("rewrite", user_email or "")
    job_manager.update_progress(job.id, {"stage": "starting"})

    # Persist active-job flag
    active_flag = ActiveJob(
        job_type="rewrite", job_id=job.id,
        config_json=json.dumps({"model": body.model, "rule_set_ids": body.rule_set_ids}),
    )
    db.add(active_flag)
    db.commit()
    active_flag_id = active_flag.id

    async def _run_rewrite():
        try:
            if len(loaded) == 1:
                filtered_rules = loaded[0][1]
            else:
                job_manager.update_progress(job.id, {"stage": "merging_rules"})
                filtered_rules = await geo_rewriter.merge_rules(loaded)

            job_manager.update_progress(job.id, {"stage": "rewriting"})
            rewritten = await geo_rewriter.rewrite_article(
                content=body.content,
                model=body.model,
                rule_set_rules=filtered_rules,
                trend_keywords=body.trend_keywords,
            )
            result = {
                "original_content": body.content,
                "rewritten_content": rewritten,
                "model_used": body.model,
                "rules_applied": filtered_rules,
                "trend_keywords_injected": body.trend_keywords,
                "rule_set_ids": body.rule_set_ids,
            }
            job_manager.complete_job(job.id, result)
            # Update persistent flag
            from ..database import get_user_session_factory
            _fdb = get_user_session_factory(user_email)()
            flag = _fdb.query(ActiveJob).filter(ActiveJob.id == active_flag_id).first()
            if flag:
                flag.status = "complete"
                flag.result_json = json.dumps(result)
                _fdb.commit()
            _fdb.close()
        except Exception as e:
            job_manager.fail_job(job.id, str(e))
            from ..database import get_user_session_factory
            _fdb = get_user_session_factory(user_email)()
            flag = _fdb.query(ActiveJob).filter(ActiveJob.id == active_flag_id).first()
            if flag:
                flag.status = "error"
                flag.error = str(e)
                _fdb.commit()
            _fdb.close()

    asyncio.create_task(_run_rewrite())
    return {"job_id": job.id}


class EvaluateGeoRequest(BaseModel):
    original_content: str
    rewritten_content: str
    test_query: str | None = None
    num_competing_docs: int = 4
    rules_applied: list[str] = []
    rule_set_ids: list[str] = []
    batch_mode: bool = False
    batch_query_count: int | None = None  # if set, randomly sample this many from the query set
    batch_queries: list[str] | None = None  # explicit list of queries (manual selection)
    corpus_set_ids: list[str] | None = None  # explicit corpus set override; None = derive from rule sets


@router.post("/evaluate-geo")
async def evaluate_geo(
    body: EvaluateGeoRequest,
    db: Session = Depends(get_db),
    user_email: str | None = Depends(get_user_email),
):
    # Resolve engine models from rule sets
    engine_models: list[str] = []
    for rsid in body.rule_set_ids:
        rs = db.query(RuleSet).filter(RuleSet.id == rsid).first()
        if rs and rs.engine_model:
            engine_models.append(rs.engine_model)

    # Resolve corpus sets: explicit override > derive from rule set metadata
    if body.corpus_set_ids is not None:
        corpus_set_ids = list(dict.fromkeys(body.corpus_set_ids))
    else:
        corpus_set_ids = []
        for rsid in body.rule_set_ids:
            rs = db.query(RuleSet).filter(RuleSet.id == rsid).first()
            if rs and rs.extraction_metadata_json:
                meta = json.loads(rs.extraction_metadata_json)
                corpus_set_ids.extend(meta.get("corpus_set_ids", []))
        corpus_set_ids = list(dict.fromkeys(corpus_set_ids))

    q = db.query(CorpusDocument)
    if corpus_set_ids:
        q = q.filter(CorpusDocument.corpus_set_id.in_(corpus_set_ids))
    corpus_rows_raw = q.order_by(CorpusDocument.created_at.desc()).limit(200).all()

    # Deduplicate by source_url when multiple corpus sets overlap
    seen_urls: set[str] = set()
    corpus_rows: list = []
    for row in corpus_rows_raw:
        key = row.source_url or row.id
        if key not in seen_urls:
            seen_urls.add(key)
            corpus_rows.append(row)

    corpus_docs = [row.content for row in corpus_rows]
    corpus_doc_metadata = [{"source_url": row.source_url} for row in corpus_rows]

    # Collect queries for batch mode
    batch_queries: list[str] | None = None
    if body.batch_mode:
        if body.batch_queries and len(body.batch_queries) > 0:
            # Explicit manual selection from frontend
            batch_queries = body.batch_queries[:30]
        else:
            # Random selection from linked query sets
            query_set_ids: list[str] = []
            for rsid in body.rule_set_ids:
                rs = db.query(RuleSet).filter(RuleSet.id == rsid).first()
                if rs and rs.extraction_metadata_json:
                    meta = json.loads(rs.extraction_metadata_json)
                    if meta.get("query_set_id"):
                        query_set_ids.append(meta["query_set_id"])
            query_set_ids = list(dict.fromkeys(query_set_ids))
            if query_set_ids:
                from ..models import QuerySet as QuerySetModel
                all_queries: list[str] = []
                for qsid in query_set_ids:
                    qs = db.query(QuerySetModel).filter(QuerySetModel.id == qsid).first()
                    if qs:
                        try:
                            all_queries.extend(json.loads(qs.queries_json))
                        except Exception:
                            pass
                # Deduplicate preserving order
                seen: set[str] = set()
                deduped: list[str] = []
                for q_str in all_queries:
                    if q_str not in seen:
                        seen.add(q_str)
                        deduped.append(q_str)
                if deduped:
                    if body.batch_query_count and 0 < body.batch_query_count < len(deduped):
                        batch_queries = random.sample(deduped, body.batch_query_count)
                    else:
                        batch_queries = deduped[:30]

    job = job_manager.create_job("geo_evaluation", user_email or "")
    total_queries = len(batch_queries) if batch_queries else 1
    job_manager.update_progress(job.id, {"stage": "starting", "completed": 0, "total": total_queries})

    # Persist active-job flag
    active_flag = ActiveJob(
        job_type="geo_evaluation", job_id=job.id,
        config_json=json.dumps({
            "batch_mode": body.batch_mode,
            "query_count": total_queries,
            "batch_query_count": body.batch_query_count,
            "test_query": body.test_query,
            "rule_set_ids": body.rule_set_ids,
        }),
    )
    db.add(active_flag)
    db.commit()
    active_flag_id = active_flag.id

    async def _run_evaluation():
        try:
            def on_query_progress(completed: int, total: int, current_query: str | None = None):
                job_manager.update_progress(job.id, {
                    "stage": "evaluating",
                    "completed": completed,
                    "total": total,
                    "current_query": current_query,
                })

            result = await geo_evaluator.evaluate_geo_multi(
                original_content=body.original_content,
                rewritten_content=body.rewritten_content,
                test_query=body.test_query,
                num_competing_docs=body.num_competing_docs,
                rules_applied=body.rules_applied,
                corpus_docs=corpus_docs,
                corpus_doc_metadata=corpus_doc_metadata,
                engine_models=engine_models,
                queries=batch_queries,
                on_progress=on_query_progress,
            )
            job_manager.complete_job(job.id, result)
            from ..database import get_user_session_factory
            _fdb = get_user_session_factory(user_email)()
            flag = _fdb.query(ActiveJob).filter(ActiveJob.id == active_flag_id).first()
            if flag:
                flag.status = "complete"
                _fdb.commit()
            _fdb.close()
        except Exception as e:
            job_manager.fail_job(job.id, str(e))
            from ..database import get_user_session_factory
            _fdb = get_user_session_factory(user_email)()
            flag = _fdb.query(ActiveJob).filter(ActiveJob.id == active_flag_id).first()
            if flag:
                flag.status = "error"
                flag.error = str(e)
                _fdb.commit()
            _fdb.close()

    asyncio.create_task(_run_evaluation())
    return {"job_id": job.id}
