"""API do AI Perfume Commercial Studio."""
from __future__ import annotations

import asyncio
import json
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel

from . import db, events, pipeline
from .brand import load_brand
from .claude import StepError
from .config import provider_status, settings
from .modules.direction import DURATIONS, FORMATS

logging.basicConfig(level=logging.INFO)
MAX_UPLOAD = 20 * 1024 * 1024


@asynccontextmanager
async def lifespan(_app: FastAPI):
    db.init_db()
    settings.uploads_dir.mkdir(parents=True, exist_ok=True)
    yield


app = FastAPI(title="AI Perfume Commercial Studio", lifespan=lifespan)


def _project(pid: str) -> dict:
    p = db.get_project(pid)
    if not p:
        raise HTTPException(404, "Projeto não encontrado.")
    return p


def _guard(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except StepError as e:
        raise HTTPException(409, str(e))


@app.get("/api/config")
def config() -> dict:
    try:
        guide = load_brand()
        brand = {
            "name": guide.brand_name,
            "palette": [c.__dict__ for c in guide.official_palette],
            "fonts": guide.fonts,
            "loaded": True,
        }
    except FileNotFoundError as e:
        brand = {"loaded": False, "error": str(e)}
    return {
        "providers": provider_status(),
        "brand": brand,
        "formats": FORMATS,
        "durations": list(DURATIONS),
    }


@app.get("/api/projects")
def projects() -> list[dict]:
    return [
        {"id": p["id"], "created_at": p["created_at"], "status": p.get("status"),
         "name": (p.get("confirmed_identity") or p.get("identification") or {}).get("product_name")}
        for p in db.list_projects()
    ]


@app.post("/api/projects")
async def create_project(photo: UploadFile = File(...), duration: int = Form(30), aspect: str = Form("9:16")) -> dict:
    if duration not in DURATIONS:
        raise HTTPException(422, f"Duração deve ser uma de {list(DURATIONS)}.")
    if aspect not in FORMATS:
        raise HTTPException(422, f"Formato deve ser um de {list(FORMATS)}.")
    raw = await photo.read()
    if len(raw) > MAX_UPLOAD:
        raise HTTPException(413, "Imagem maior que 20 MB.")
    pid = db.create_project({"status": "created", "options": {"duration": duration, "aspect": aspect}})
    folder = settings.uploads_dir / pid
    folder.mkdir(parents=True, exist_ok=True)
    tmp = folder / "upload.bin"
    tmp.write_bytes(raw)
    try:
        with Image.open(tmp) as im:
            im.load()
            fmt = (im.format or "PNG").lower()
            ext = {"jpeg": "jpg"}.get(fmt, fmt)
            if ext not in {"jpg", "png", "webp"}:
                im.convert("RGBA" if im.mode in ("RGBA", "LA", "P") else "RGB").save(folder / "original.png")
                ext = "png"
            else:
                tmp.rename(folder / f"original.{ext}")
            size = im.size
    except UnidentifiedImageError:
        tmp.unlink(missing_ok=True)
        raise HTTPException(422, "Arquivo enviado não é uma imagem válida.")
    tmp.unlink(missing_ok=True)
    rel = f"projects/{pid}/original.{ext}"
    db.update_project(pid, image=rel, image_size=size)
    pipeline.start_identify(pid)
    return _project(pid)


@app.get("/api/projects/{pid}")
def get_project(pid: str) -> dict:
    p = _project(pid)
    p["running"] = pipeline.is_running(pid)
    return p


class Identity(BaseModel):
    brand: str
    product_name: str
    concentration: str | None = None


@app.post("/api/projects/{pid}/identify")
def retry_identify(pid: str) -> dict:
    _project(pid)
    _guard(pipeline.start_identify, pid)
    return {"ok": True}


@app.post("/api/projects/{pid}/research")
def confirm_and_research(pid: str, identity: Identity) -> dict:
    _project(pid)
    if not identity.brand.strip() or not identity.product_name.strip():
        raise HTTPException(422, "Informe marca e nome do perfume.")
    db.update_project(pid, confirmed_identity=identity.model_dump())
    _guard(pipeline.start_research, pid)
    return {"ok": True}


class DirectionRequest(BaseModel):
    feedback: str | None = None
    duration: int | None = None
    aspect: str | None = None


@app.post("/api/projects/{pid}/direction")
def make_direction(pid: str, req: DirectionRequest) -> dict:
    p = _project(pid)
    if not p.get("research"):
        raise HTTPException(409, "Faça a pesquisa olfativa antes da direção de arte.")
    opts = dict(p["options"])
    if req.duration is not None:
        if req.duration not in DURATIONS:
            raise HTTPException(422, "Duração inválida.")
        opts["duration"] = req.duration
    if req.aspect is not None:
        if req.aspect not in FORMATS:
            raise HTTPException(422, "Formato inválido.")
        opts["aspect"] = req.aspect
    db.update_project(pid, options=opts)
    _guard(pipeline.start_direction, pid, req.feedback)
    return {"ok": True}


class Approve(BaseModel):
    index: int


@app.post("/api/projects/{pid}/direction/approve")
def approve(pid: str, req: Approve) -> dict:
    _project(pid)
    return _guard(pipeline.approve_direction, pid, req.index)


@app.get("/api/projects/{pid}/events")
async def stream_events(pid: str, request: Request) -> StreamingResponse:
    _project(pid)

    async def gen():
        q = events.subscribe(pid)
        try:
            for ev in events.history(pid):
                yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"
            while not await request.is_disconnected():
                try:
                    ev = await asyncio.wait_for(q.get(), timeout=15)
                    yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"
                except asyncio.TimeoutError:
                    yield ": keep-alive\n\n"
        finally:
            events.unsubscribe(pid, q)

    return StreamingResponse(gen(), media_type="text/event-stream")


@app.get("/media/{path:path}")
def media(path: str) -> FileResponse:
    base = settings.data_dir.resolve()
    target = (base / path).resolve()
    if not target.is_relative_to(base) or not target.is_file():
        raise HTTPException(404)
    return FileResponse(target)


app.mount("/", StaticFiles(directory=Path(settings.frontend_dir), html=True), name="frontend")
