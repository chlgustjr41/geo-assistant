import os
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .auth import get_current_user
from .routers import writing, rules, settings as settings_router, corpus as corpus_router, query_sets as query_sets_router, corpus_sets as corpus_sets_router, admin as admin_router, jobs as jobs_router

app = FastAPI(title="GEO Rewrite Assistant API", version="0.1.0")

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
app.include_router(admin_router.router, dependencies=_auth)
app.include_router(jobs_router.router, dependencies=_auth)


@app.on_event("startup")
async def on_startup() -> None:
    from .config import _set_env_file_permissions, reload_env
    reload_env()
    _set_env_file_permissions()


@app.get("/health")
def health_check():
    return {"status": "ok", "version": "0.1.0"}
