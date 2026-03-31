from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import engine, Base
from .routers import writing, trends, rules, settings as settings_router
from .seed import seed_rule_sets

# Create all tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="CareYaya GEO Assistant API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(writing.router)
app.include_router(trends.router)
app.include_router(rules.router)
app.include_router(settings_router.router)


@app.on_event("startup")
async def on_startup() -> None:
    seed_rule_sets()


@app.get("/health")
def health_check():
    return {"status": "ok", "version": "0.1.0"}
