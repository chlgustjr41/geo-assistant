from __future__ import annotations
import json
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Article, RuleSet
from ..services.article_scraper import scrape_url
from ..services import geo_rewriter

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
    rule_set_id: str = ""
    model_used: str = ""
    trend_keywords: list[str] = []


@router.post("/save")
def save_article(body: SaveArticleRequest, db: Session = Depends(get_db)):
    article = Article(
        source_url=body.source_url,
        title=body.title,
        original_content=body.original_content,
        rewritten_content=body.rewritten_content,
        rule_set_id=body.rule_set_id,
        model_used=body.model_used,
        trend_keywords_json=json.dumps(body.trend_keywords) if body.trend_keywords else None,
    )
    db.add(article)
    db.commit()
    db.refresh(article)
    return {"id": article.id, "created_at": article.created_at.isoformat()}


@router.get("/history")
def get_history(db: Session = Depends(get_db)):
    articles = db.query(Article).order_by(Article.created_at.desc()).limit(50).all()
    return [
        {
            "id": a.id,
            "title": a.title,
            "source_url": a.source_url,
            "model_used": a.model_used,
            "rule_set_id": a.rule_set_id,
            "has_rewrite": a.rewritten_content is not None,
            "has_scores": a.geo_scores_json is not None,
            "created_at": a.created_at.isoformat(),
        }
        for a in articles
    ]


class RewriteRequest(BaseModel):
    content: str
    model: str
    rule_set_id: str
    trend_keywords: list[str] = []


@router.post("/rewrite")
async def rewrite_article(body: RewriteRequest, db: Session = Depends(get_db)):
    rule_set = db.query(RuleSet).filter(RuleSet.id == body.rule_set_id).first()
    if rule_set is None:
        raise HTTPException(404, f"Rule set '{body.rule_set_id}' not found")

    rules_data = json.loads(rule_set.rules_json)
    filtered_rules: list[str] = rules_data.get("filtered_rules", [])

    try:
        rewritten = await geo_rewriter.rewrite_article(
            content=body.content,
            model=body.model,
            rule_set_rules=filtered_rules,
            trend_keywords=body.trend_keywords,
        )
    except Exception as e:
        raise HTTPException(400, f"LLM rewrite failed: {str(e)}")

    return {
        "original_content": body.content,
        "rewritten_content": rewritten,
        "model_used": body.model,
        "rules_applied": filtered_rules,
        "trend_keywords_injected": body.trend_keywords,
    }
