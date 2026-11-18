"""Acesso ao Claude (Anthropic SDK oficial).

- Usa `claude-opus-5-5` com pensamento adaptativo.
- Ativa o fallback de recusa no servidor (`fallbacks: "default"`).
- Converte qualquer falha em `StepError` com a mensagem real da API, sem esconder erros.
"""
from __future__ import annotations

import base64
import io
from typing import Any, TypeVar

import anthropic
from PIL import Image
from pydantic import BaseModel

from .config import settings

T = TypeVar("T", bound=BaseModel)
BETAS = ["server-side-fallback-2026-07-01"]


class StepError(RuntimeError):
    """Erro de uma etapa, com mensagem pronta para a interface."""

    def __init__(self, message: str, retryable: bool = True):
        super().__init__(message)
        self.retryable = retryable


_client: anthropic.AsyncAnthropic | None = None


def client() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        _client = anthropic.AsyncAnthropic(max_retries=3, timeout=600.0)
    return _client


def image_block(path: str, max_side: int = 1568) -> dict[str, Any]:
    """Reduz a imagem ao tamanho útil para visão e devolve um bloco base64."""
    with Image.open(path) as im:
        im = im.convert("RGB")
        im.thumbnail((max_side, max_side))
        buf = io.BytesIO()
        im.save(buf, format="JPEG", quality=92)
    return {
        "type": "image",
        "source": {"type": "base64", "media_type": "image/jpeg", "data": base64.standard_b64encode(buf.getvalue()).decode()},
    }


NO_KEY = StepError("Chave da Anthropic não configurada. Defina ANTHROPIC_API_KEY no ambiente do servidor.", retryable=False)


def _translate(e: Exception) -> StepError:
    if isinstance(e, TypeError) and "authentication method" in str(e):
        return NO_KEY
    if isinstance(e, anthropic.AuthenticationError):
        return StepError("Chave da Anthropic inválida ou ausente (ANTHROPIC_API_KEY).", retryable=False)
    if isinstance(e, anthropic.PermissionDeniedError):
        return StepError(f"A chave da Anthropic não tem permissão: {e.message}", retryable=False)
    if isinstance(e, anthropic.BadRequestError):
        return StepError(f"Requisição recusada pela API do Claude: {e.message}", retryable=False)
    if isinstance(e, anthropic.RateLimitError):
        return StepError("Limite de uso da API do Claude atingido. Tente novamente em instantes.")
    if isinstance(e, anthropic.APIStatusError):
        return StepError(f"Erro da API do Claude ({e.status_code}): {e.message}")
    if isinstance(e, anthropic.APIConnectionError):
        return StepError("Sem conexão com a API do Claude (rede ou proxy).")
    raise e


def _check_stop(msg: Any) -> None:
    if msg.stop_reason == "refusal":
        details = getattr(msg, "stop_details", None)
        why = getattr(details, "explanation", None) or "sem detalhes"
        raise StepError(f"O Claude recusou a solicitação ({why}).", retryable=False)
    if msg.stop_reason == "max_tokens":
        raise StepError("A resposta do Claude foi cortada por limite de tamanho.")


async def structured(
    *,
    system: str,
    content: list[dict[str, Any]],
    schema: type[T],
    effort: str = "medium",
    max_tokens: int = 32000,
) -> T:
    """Chamada com saída estruturada validada por Pydantic."""
    try:
        msg = await client().beta.messages.parse(
            model=settings.claude_model,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": content}],
            output_format=schema,
            output_config={"effort": effort},
            thinking={"type": "adaptive"},
            betas=BETAS,
            fallbacks="default",
        )
    except (anthropic.APIError, TypeError) as e:
        raise _translate(e) from e
    _check_stop(msg)
    parsed = getattr(msg, "parsed_output", None)
    if parsed is None:
        raise StepError("O Claude não devolveu dados no formato esperado.")
    return parsed


async def with_server_tools(
    *,
    system: str,
    content: list[dict[str, Any]],
    tools: list[dict[str, Any]],
    effort: str = "medium",
    max_tokens: int = 64000,
    max_continuations: int = 5,
) -> list[Any]:
    """Executa uma conversa com ferramentas de servidor (web search/fetch).

    Retorna todos os blocos de conteúdo produzidos (incluindo resultados das buscas),
    tratando `pause_turn` até o limite de continuações.
    """
    messages: list[dict[str, Any]] = [{"role": "user", "content": content}]
    blocks: list[Any] = []
    try:
        for _ in range(max_continuations + 1):
            async with client().beta.messages.stream(
                model=settings.claude_model,
                max_tokens=max_tokens,
                system=system,
                messages=messages,
                tools=tools,
                output_config={"effort": effort},
                thinking={"type": "adaptive"},
                betas=BETAS,
                fallbacks="default",
            ) as stream:
                msg = await stream.get_final_message()
            blocks.extend(msg.content)
            if msg.stop_reason == "pause_turn":
                messages = [messages[0], {"role": "assistant", "content": msg.content}] if len(messages) == 1 else [*messages[:-1], {"role": "assistant", "content": [*messages[-1]["content"], *msg.content]}]
                continue
            _check_stop(msg)
            return blocks
    except (anthropic.APIError, TypeError) as e:
        raise _translate(e) from e
    raise StepError("A pesquisa excedeu o número máximo de continuações.")
