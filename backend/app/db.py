"""Persistência simples em SQLite. Cada projeto guarda seu estado como JSON versionado."""
from __future__ import annotations

import json
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from typing import Any

from .config import settings

_lock = threading.Lock()


def _conn() -> sqlite3.Connection:
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(settings.db_path)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with _lock, _conn() as c:
        c.execute(
            """CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                data TEXT NOT NULL
            )"""
        )
        c.execute(
            """CREATE TABLE IF NOT EXISTS concepts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                fingerprint TEXT NOT NULL
            )"""
        )


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def create_project(data: dict[str, Any]) -> str:
    pid = uuid.uuid4().hex[:12]
    ts = now()
    data = {**data, "id": pid, "created_at": ts}
    with _lock, _conn() as c:
        c.execute("INSERT INTO projects VALUES (?,?,?,?)", (pid, ts, ts, json.dumps(data, ensure_ascii=False)))
    return pid


def get_project(pid: str) -> dict[str, Any] | None:
    with _conn() as c:
        row = c.execute("SELECT data FROM projects WHERE id=?", (pid,)).fetchone()
    return json.loads(row["data"]) if row else None


def update_project(pid: str, **changes: Any) -> dict[str, Any]:
    with _lock, _conn() as c:
        row = c.execute("SELECT data FROM projects WHERE id=?", (pid,)).fetchone()
        if not row:
            raise KeyError(pid)
        data = json.loads(row["data"])
        data.update(changes)
        data["updated_at"] = now()
        c.execute("UPDATE projects SET data=?, updated_at=? WHERE id=?", (json.dumps(data, ensure_ascii=False), data["updated_at"], pid))
    return data


def list_projects(limit: int = 50) -> list[dict[str, Any]]:
    with _conn() as c:
        rows = c.execute("SELECT data FROM projects ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall()
    return [json.loads(r["data"]) for r in rows]


def save_concept_fingerprint(pid: str, fingerprint: dict[str, Any]) -> None:
    with _lock, _conn() as c:
        c.execute("DELETE FROM concepts WHERE project_id=?", (pid,))
        c.execute("INSERT INTO concepts (project_id, created_at, fingerprint) VALUES (?,?,?)", (pid, now(), json.dumps(fingerprint, ensure_ascii=False)))


def previous_concepts(exclude_pid: str, limit: int = 30) -> list[dict[str, Any]]:
    with _conn() as c:
        rows = c.execute(
            "SELECT fingerprint FROM concepts WHERE project_id != ? ORDER BY id DESC LIMIT ?", (exclude_pid, limit)
        ).fetchall()
    return [json.loads(r["fingerprint"]) for r in rows]
