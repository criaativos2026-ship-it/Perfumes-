"""Orquestração das etapas. Cada etapa grava seu resultado e pode ser refeita sozinha."""
from __future__ import annotations

import asyncio
import logging
import traceback
from typing import Any, Awaitable, Callable

from . import db, events
from .brand import load_brand
from .claude import StepError
from .config import settings
from .modules import catalog
from .modules.direction import create_direction, similarity, validate
from .modules.identify import identify
from .modules.research import research

log = logging.getLogger("studio")
_running: dict[str, asyncio.Task] = {}

STEP_LABELS = {"identify": "Identificação", "research": "Pesquisa olfativa", "direction": "Direção de arte"}


def is_running(pid: str) -> bool:
    t = _running.get(pid)
    return bool(t and not t.done())


def _launch(pid: str, step: str, fn: Callable[[], Awaitable[None]]) -> None:
    if is_running(pid):
        raise StepError("Já existe uma etapa em andamento neste projeto.", retryable=False)

    async def runner() -> None:
        label = STEP_LABELS[step]
        db.update_project(pid, status=f"{step}:running", error=None)
        events.publish(pid, "step_started", f"{label}: iniciada", step=step)
        try:
            await fn()
        except StepError as e:
            db.update_project(pid, status=f"{step}:failed", error={"step": step, "message": str(e), "retryable": e.retryable})
            events.publish(pid, "step_failed", f"{label}: {e}", step=step)
        except Exception as e:  # erro de programação: registra e mostra, sem esconder
            log.error("Falha inesperada em %s/%s\n%s", pid, step, traceback.format_exc())
            db.update_project(pid, status=f"{step}:failed", error={"step": step, "message": f"Erro interno: {e}", "retryable": True})
            events.publish(pid, "step_failed", f"{label}: erro interno ({e})", step=step)

    _running[pid] = asyncio.create_task(runner())


def start_identify(pid: str) -> None:
    async def run() -> None:
        p = db.get_project(pid)
        events.publish(pid, "progress", "Lendo o frasco e o rótulo…", step="identify")
        result = await identify(str(settings.data_dir / p["image"]))
        data = result.model_dump()
        db.update_project(pid, identification=data, status="identify:done")
        if not data["is_perfume"]:
            events.publish(pid, "step_done", "A foto não parece mostrar um perfume.", step="identify")
        else:
            events.publish(pid, "step_done", f"Identificado: {data.get('product_name')} ({data.get('brand')}), confiança {data['confidence']}. Confirme para pesquisar.", step="identify")

    _launch(pid, "identify", run)


def start_research(pid: str) -> None:
    async def run() -> None:
        p = db.get_project(pid)
        ident = p["confirmed_identity"]
        events.publish(pid, "progress", "Pesquisando fontes oficiais, varejistas e bases especializadas…", step="research")
        result = await research(ident["brand"], ident["product_name"], ident.get("concentration"))
        db.update_project(pid, research=result, status="research:done")
        prof = result["profile"]
        n = len(prof["top_notes"]) + len(prof["heart_notes"]) + len(prof["base_notes"])
        events.publish(pid, "step_done", f"Pesquisa concluída: {n} notas com fonte, {len(prof['sources'])} fontes.", step="research")

    _launch(pid, "research", run)


def start_direction(pid: str, feedback: str | None = None) -> None:
    async def run() -> None:
        p = db.get_project(pid)
        guide = load_brand()
        profile = p["research"]["profile"]
        previous = db.previous_concepts(pid)
        opts = p["options"]
        events.publish(pid, "progress", "Criando conceito, paleta e roteiro com o guia da marca…", step="direction")
        direction = await create_direction(
            guide=guide, identification=p["identification"], profile=profile,
            duration=opts["duration"], aspect=opts["aspect"], previous=previous, feedback=feedback,
        )
        fp = direction.fingerprint.model_dump()
        clash = max(previous, key=lambda prev: similarity(fp, prev), default=None)
        if clash and similarity(fp, clash) >= 0.5:
            events.publish(pid, "progress", f"Conceito parecido com um anterior ({clash.get('environment')}); criando outro…", step="direction")
            direction = await create_direction(
                guide=guide, identification=p["identification"], profile=profile,
                duration=opts["duration"], aspect=opts["aspect"], previous=previous,
                feedback=(feedback or "") + f"\nO conceito anterior ficou parecido demais com '{clash.get('environment')}'. Escolha um ambiente totalmente diferente.",
            )
        warnings = validate(direction, profile=profile, guide=guide, duration=opts["duration"])
        versions = p.get("direction_versions", [])
        versions.append({"direction": direction.model_dump(), "warnings": warnings, "feedback": feedback, "created_at": db.now()})
        db.update_project(pid, direction_versions=versions, direction_index=len(versions) - 1, status="direction:done")
        events.publish(pid, "step_done", f"Conceito pronto: {direction.campaign_title}.", step="direction")

    _launch(pid, "direction", run)


def approve_direction(pid: str, index: int) -> dict[str, Any]:
    p = db.get_project(pid)
    versions = p.get("direction_versions") or []
    if not 0 <= index < len(versions):
        raise StepError("Versão de conceito inexistente.", retryable=False)
    chosen = versions[index]["direction"]
    db.save_concept_fingerprint(pid, chosen["fingerprint"])
    card = catalog.product_card(p["identification"], p["research"]["profile"], chosen, pieces=[f"comercial {p['options']['aspect']} {p['options']['duration']}s (em produção)"])
    updated = catalog.upsert_product(card)
    p = db.update_project(pid, direction_index=index, approved_direction=index, status="concept:approved", catalog_updated=updated)
    events.publish(pid, "step_done", "Conceito aprovado." + (" Ficha do produto registrada no guia da marca." if updated else ""), step="direction")
    return p
