from __future__ import annotations
import asyncio
import io
import json
import uuid as uuid_module
import zipfile
import yaml
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sse_starlette.sse import EventSourceResponse
from ..database import get_db
from ..models import RuleSet

router = APIRouter(prefix="/api/rules", tags=["rules"])


@router.get("")
def list_rule_sets(db: Session = Depends(get_db)):
    rule_sets = db.query(RuleSet).order_by(RuleSet.created_at).all()
    return [
        {
            "id": rs.id,
            "name": rs.name,
            "engine_model": rs.engine_model,
            "topic_domain": rs.topic_domain,
            "num_rules": rs.num_rules,
            "is_builtin": rs.is_builtin,
            "created_at": rs.created_at.isoformat(),
        }
        for rs in rule_sets
    ]


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
    topic: str
    num_queries: int = 20


@router.post("/generate-queries")
async def generate_queries_endpoint(body: GenerateQueriesRequest):
    from ..services.query_generator import generate_queries
    queries = await generate_queries(body.topic, body.num_queries)
    return {"queries": queries}


class ExtractRulesRequest(BaseModel):
    queries: list[str]
    engine_model: str = "gemini-2.5-flash-lite"
    rule_set_name: str


@router.post("/extract")
async def extract_rules_endpoint(body: ExtractRulesRequest, db: Session = Depends(get_db)):
    from ..services.rule_extractor import extract_rules_stream

    async def event_generator_v2():
        queue: asyncio.Queue = asyncio.Queue()

        async def _run():
            try:
                rules = await extract_rules_stream(
                    body.queries,
                    body.engine_model,
                    body.rule_set_name,
                    lambda data: queue.put_nowait({"progress": data}),
                )
                await queue.put({"done": True, "rules": rules})
            except Exception as e:
                await queue.put({"done": True, "error": str(e)})

        task = asyncio.create_task(_run())

        while True:
            try:
                item = await asyncio.wait_for(queue.get(), timeout=600)
            except asyncio.TimeoutError:
                yield {"data": json.dumps({"status": "error", "message": "Timeout"})}
                task.cancel()
                return

            if "progress" in item:
                d = item["progress"]
                yield {"data": json.dumps({"stage": d.get("stage"), "completed": d.get("completed"), "total": d.get("total")})}
            elif "done" in item:
                if "error" in item:
                    yield {"data": json.dumps({"status": "error", "message": item["error"]})}
                else:
                    rules = item["rules"]
                    # Save to DB
                    new_rs = RuleSet(
                        id=str(uuid_module.uuid4()),
                        name=body.rule_set_name,
                        engine_model=body.engine_model,
                        topic_domain="custom",
                        rules_json=json.dumps({"filtered_rules": rules}),
                        num_rules=len(rules),
                        is_builtin=False,
                    )
                    db.add(new_rs)
                    db.commit()
                    db.refresh(new_rs)
                    yield {"data": json.dumps({"status": "complete", "rule_set_id": new_rs.id, "num_rules": len(rules)})}
                return

    return EventSourceResponse(event_generator_v2())


class TrainingExportRequest(BaseModel):
    rule_set_id: str
    base_model: str = "Qwen/Qwen3-1.7B"
    teacher_model: str = "gemini-2.5-flash"
    cold_start_config: dict = {"lr": 2e-5, "epochs": 3, "batch_size": 4}
    grpo_config: dict = {"group_size": 4, "clip_epsilon": 0.2, "kl_beta": 0.04}


@router.post("/export-training-package")
def export_training_package(body: TrainingExportRequest, db: Session = Depends(get_db)):
    rs = db.query(RuleSet).filter(RuleSet.id == body.rule_set_id).first()
    if not rs:
        raise HTTPException(404, "Rule set not found")

    rules_data = json.loads(rs.rules_json)

    # Build all files
    finetune_data = {
        "base_model": body.base_model,
        "teacher_model": body.teacher_model,
        "rule_set": rs.name,
        "num_rules": rs.num_rules,
        "training_type": "cold_start_then_grpo",
    }

    cold_start_config = {
        "model": body.base_model,
        "teacher_model": body.teacher_model,
        "learning_rate": body.cold_start_config.get("lr", 2e-5),
        "num_epochs": body.cold_start_config.get("epochs", 3),
        "batch_size": body.cold_start_config.get("batch_size", 4),
        "training_type": "sft",
        "dataset": "finetune.json",
    }

    grpo_config = {
        "model": body.base_model,
        "group_size": body.grpo_config.get("group_size", 4),
        "clip_epsilon": body.grpo_config.get("clip_epsilon", 0.2),
        "kl_beta": body.grpo_config.get("kl_beta", 0.04),
        "training_type": "grpo",
        "reward_model": body.teacher_model,
    }

    readme = f"""# AutoGEOMini Training Package

Rule Set: {rs.name}
Engine Model: {rs.engine_model}
Base Model: {body.base_model}
Teacher Model: {body.teacher_model}
Number of Rules: {rs.num_rules}

## Training Steps

### Step 1: Cold Start (SFT) -- ~4 hours on 2x A100
```bash
python train.py --config config_cold_start.yaml
```

### Step 2: GRPO Reinforcement Learning -- ~48 hours on 2x A100
```bash
python train_grpo.py --config config_grpo.yaml
```

## Files
- `finetune.json` -- training metadata
- `rule_set.json` -- GEO rules used for reward model
- `config_cold_start.yaml` -- SFT training configuration
- `config_grpo.yaml` -- GRPO training configuration
- `README_training.md` -- this file
"""

    # Create ZIP in memory
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("finetune.json", json.dumps(finetune_data, indent=2))
        zf.writestr("rule_set.json", json.dumps(rules_data, indent=2))
        zf.writestr("config_cold_start.yaml", yaml.dump(cold_start_config, default_flow_style=False))
        zf.writestr("config_grpo.yaml", yaml.dump(grpo_config, default_flow_style=False))
        zf.writestr("README_training.md", readme)

    zip_buffer.seek(0)

    from fastapi.responses import StreamingResponse
    return StreamingResponse(
        io.BytesIO(zip_buffer.read()),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="autogeo-mini-{rs.name}.zip"'},
    )
