from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..database import get_db
from ..services.trend_service import discover_trends

router = APIRouter(prefix="/api/trends", tags=["trends"])


class TrendRequest(BaseModel):
    topic: str
    timeframe: str = "today 12-m"
    geo: str = "US"


@router.post("/discover")
async def discover(body: TrendRequest, db: Session = Depends(get_db)):
    try:
        return await discover_trends(body.topic, body.timeframe, body.geo, db)
    except Exception as e:
        raise HTTPException(400, f"Trends fetch failed: {str(e)}")
