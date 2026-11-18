"""Barramento de eventos em memória para acompanhar a geração em tempo real (SSE)."""
from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Any

from .db import now

_subscribers: dict[str, set[asyncio.Queue]] = defaultdict(set)
_history: dict[str, list[dict[str, Any]]] = defaultdict(list)


def publish(pid: str, kind: str, message: str, **extra: Any) -> None:
    event = {"ts": now(), "kind": kind, "message": message, **extra}
    log = _history[pid]
    log.append(event)
    del log[:-200]
    for q in list(_subscribers[pid]):
        q.put_nowait(event)


def history(pid: str) -> list[dict[str, Any]]:
    return list(_history[pid])


def subscribe(pid: str) -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue()
    _subscribers[pid].add(q)
    return q


def unsubscribe(pid: str, q: asyncio.Queue) -> None:
    _subscribers[pid].discard(q)
