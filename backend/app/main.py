import os
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import engine, Base
from .auth import get_current_user
from .routers import writing, rules, settings as settings_router, corpus as corpus_router, query_sets as query_sets_router, corpus_sets as corpus_sets_router, admin as admin_router
from .seed import seed_rule_sets

# Create all tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="GEO Assistant API", version="0.1.0")

_cors_origins = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_auth = [Depends(get_current_user)]
app.include_router(writing.router, dependencies=_auth)
app.include_router(rules.router, dependencies=_auth)
app.include_router(settings_router.router, dependencies=_auth)
app.include_router(corpus_router.router, dependencies=_auth)
app.include_router(query_sets_router.router, dependencies=_auth)
app.include_router(corpus_sets_router.router, dependencies=_auth)
app.include_router(admin_router.router, dependencies=_auth)  # admin endpoints have additional require_admin checks


@app.on_event("startup")
async def on_startup() -> None:
    from .config import _set_env_file_permissions, reload_env
    from sqlalchemy import text
    # Re-read .env now that all modules are initialized.  This is the
    # authoritative load — any keys present in .env at startup time will
    # be available to every request handler and service function.
    reload_env()
    _set_env_file_permissions()

    # Add new columns that didn't exist in earlier schema versions
    with engine.connect() as conn:
        for stmt in [
            "ALTER TABLE rule_sets ADD COLUMN extraction_metadata_json TEXT",
            "ALTER TABLE corpus_documents ADD COLUMN query_set_id VARCHAR",
            "ALTER TABLE corpus_documents ADD COLUMN corpus_set_id VARCHAR",
            "ALTER TABLE articles ADD COLUMN rule_set_ids_json TEXT",
            """CREATE TABLE IF NOT EXISTS corpus_sets (
                id VARCHAR PRIMARY KEY,
                name VARCHAR NOT NULL,
                query_set_id VARCHAR,
                created_at DATETIME
            )""",
        ]:
            try:
                conn.execute(text(stmt))
                conn.commit()
            except Exception:
                pass  # column already exists

    seed_rule_sets()


@app.get("/health")
def health_check():
    return {"status": "ok", "version": "0.1.0"}
