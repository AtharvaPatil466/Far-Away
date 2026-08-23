"""LLM client abstraction for the escalation layer (PRD Step 7).

The narrator depends only on the tiny :class:`LLMClient` protocol
(``generate(prompt: str) -> str``). Two implementations are provided:

  * :class:`GeminiClient` — calls the Google Generative Language REST API using
    the standard library only (no SDK). Used when a Gemini key is configured
    (``DM_GEMINI_KEY``, ``GEMINI_API_KEY`` or ``GOOGLE_API_KEY``).
  * :class:`AnthropicClient` — lazily imports the ``anthropic`` SDK and calls the
    ``claude-sonnet-4-6`` model. Used ONLY when an API key is configured
    (``DM_ANTHROPIC_KEY`` or ``ANTHROPIC_API_KEY``).
  * :class:`TemplateClient` — a deterministic, network-free renderer that turns
    the escalation prompt into a clear structured brief using the standard
    library alone. This is the default fallback (PRD Step 10).

:func:`make_client` selects the right implementation from
:class:`~disastermind.core.config.Settings` + the environment. If the SDK or key
is missing, or the SDK call raises, we always fall back to :class:`TemplateClient`
so no test path ever touches the network.
"""
from __future__ import annotations

import abc
import os

from ..core.config import Settings

#: The single model this layer is authorised to call (spec requirement).
ANTHROPIC_MODEL = "claude-sonnet-4-6"

#: Environment variables that may carry the Anthropic API key.
KEY_ENV_VARS = ("DM_ANTHROPIC_KEY", "ANTHROPIC_API_KEY")

#: Gemini model used when a Gemini key is configured.
GEMINI_MODEL = "gemini-2.0-flash"

#: Environment variables that may carry the Gemini API key. Keys are read from
#: the environment ONLY — never committed, never defaulted to a literal. The
#: repository ships ``.env.example`` with the names and no values.
GEMINI_KEY_ENV_VARS = ("DM_GEMINI_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY")

GEMINI_ENDPOINT = (
    "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
)


def _resolve_gemini_key(settings: Settings | None = None) -> str:
    """Return the first non-empty Gemini key from settings/env, else ""."""
    key = getattr(settings, "gemini_key", "") if settings is not None else ""
    if key:
        return str(key)
    for var in GEMINI_KEY_ENV_VARS:
        val = os.environ.get(var, "")
        if val:
            return val
    return ""


def _resolve_api_key(settings: Settings | None = None) -> str:
    """Return the first non-empty Anthropic key from settings/env, else ""."""
    key = getattr(settings, "anthropic_key", "") if settings is not None else ""
    if key:
        return key
    for var in KEY_ENV_VARS:
        val = os.environ.get(var, "")
        if val:
            return val
    return ""


class LLMClient(abc.ABC):
    """Minimal text-completion contract the narrator codes against."""

    name: str = "llm"

    @abc.abstractmethod
    def generate(self, prompt: str) -> str:
        """Return a completion for ``prompt`` (single string in, single out)."""


class TemplateClient(LLMClient):
    """Deterministic, offline brief renderer (PRD Step 10 fallback).

    Echoes the structured prompt straight back. The narrator builds a
    fully-formed, human-readable brief as the prompt body, so a no-op "model"
    that returns the prompt verbatim yields a clear, reproducible brief with no
    network dependency. This keeps every test path deterministic.
    """

    name = "template"

    def generate(self, prompt: str) -> str:
        return prompt


class AnthropicClient(LLMClient):
    """Real Claude client — lazily imported, key-gated (PRD Step 7).

    The ``anthropic`` SDK is imported inside :meth:`generate` so the package
    imports cleanly without the optional dependency. Any failure (missing SDK,
    transport error, unexpected response shape) degrades to the prompt text so
    the caller — :class:`~disastermind.llm.narrator.EscalationNarrator` — still
    produces a usable brief.
    """

    name = "anthropic"

    def __init__(
        self,
        api_key: str,
        model: str = ANTHROPIC_MODEL,
        max_tokens: int = 1024,
    ) -> None:
        self.api_key = api_key
        self.model = model
        self.max_tokens = max_tokens

    def generate(self, prompt: str) -> str:
        try:
            import anthropic  # type: ignore  # lazy: optional dependency

            client = anthropic.Anthropic(api_key=self.api_key)
            resp = client.messages.create(
                model=self.model,
                max_tokens=self.max_tokens,
                messages=[{"role": "user", "content": prompt}],
            )
            return self._extract_text(resp) or prompt
        except Exception:  # missing SDK / network / shape — degrade gracefully
            return prompt

    @staticmethod
    def _extract_text(resp: object) -> str:
        """Pull plain text from an Anthropic Messages response defensively."""
        content = getattr(resp, "content", None)
        if not content:
            return ""
        parts: list[str] = []
        for block in content:
            text = getattr(block, "text", None)
            if text is None and isinstance(block, dict):
                text = block.get("text")
            if text:
                parts.append(str(text))
        return "\n".join(parts).strip()


class GeminiClient(LLMClient):
    """Google Generative Language client over stdlib ``urllib`` — key-gated.

    Deliberately no SDK: the runtime is standard-library-first by design, and a
    single REST POST does not justify a dependency. Any failure (no network,
    non-200, unexpected shape) degrades to the prompt text, so the narrator
    still produces a usable brief and no test path can hang on a socket.
    """

    name = "gemini"

    def __init__(
        self,
        api_key: str,
        model: str = GEMINI_MODEL,
        max_tokens: int = 1024,
        timeout: float = 20.0,
    ) -> None:
        self.api_key = api_key
        self.model = model
        self.max_tokens = max_tokens
        self.timeout = timeout

    def generate(self, prompt: str) -> str:
        import json
        import urllib.request

        url = f"{GEMINI_ENDPOINT.format(model=self.model)}?key={self.api_key}"
        body = json.dumps({
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"maxOutputTokens": self.max_tokens},
        }).encode("utf-8")
        request = urllib.request.Request(
            url, data=body, headers={"Content-Type": "application/json"}, method="POST"
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
            return self._extract_text(payload) or prompt
        except Exception:  # no network / non-200 / shape — degrade gracefully
            return prompt

    @staticmethod
    def _extract_text(payload: object) -> str:
        """Pull plain text out of a generateContent response defensively."""
        if not isinstance(payload, dict):
            return ""
        parts_out: list[str] = []
        for candidate in payload.get("candidates", []) or []:
            content = (candidate or {}).get("content", {}) or {}
            for part in content.get("parts", []) or []:
                text = (part or {}).get("text")
                if text:
                    parts_out.append(str(text))
        return "\n".join(parts_out).strip()


def make_client(settings: Settings | None = None) -> LLMClient:
    """Pick the right :class:`LLMClient` (PRD Step 7).

    Gemini wins when its key is set, then Anthropic; with neither key present the
    deterministic, network-free :class:`TemplateClient` is returned. Keys come
    from the environment, so a checkout carries no credential.
    """
    gemini_key = _resolve_gemini_key(settings)
    if gemini_key:
        return GeminiClient(api_key=gemini_key)
    key = _resolve_api_key(settings)
    if key:
        return AnthropicClient(api_key=key)
    return TemplateClient()
