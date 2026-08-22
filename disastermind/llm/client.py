"""LLM client abstraction for the escalation layer (PRD Step 7).

The narrator depends only on the tiny :class:`LLMClient` protocol
(``generate(prompt: str) -> str``). Three implementations are provided:

  * :class:`AnthropicClient` — lazily imports the ``anthropic`` SDK and calls the
    ``claude-sonnet-4-6`` model. Used when Anthropic provider is active and an API
    key is configured (``DM_ANTHROPIC_KEY`` or ``ANTHROPIC_API_KEY``).
  * :class:`OpenRouterClient` — stdlib urllib based client for OpenRouter's
    OpenAI-compatible chat completions API (``https://openrouter.ai/api/v1/chat/completions``).
    Activated explicitly via ``DM_LLM_PROVIDER=openrouter`` and key (``DM_OPENROUTER_KEY`` or ``OPENROUTER_API_KEY``).
  * :class:`TemplateClient` — a deterministic, network-free renderer that turns
    the escalation prompt into a clear structured brief using the standard
    library alone. This is the default fallback (PRD Step 10).

:func:`make_client` selects the right implementation from
:class:`~disastermind.core.config.Settings` + the environment. If the SDK or key
is missing, or the API call raises, we always fall back to :class:`TemplateClient`
so no test path ever touches the network.
"""
from __future__ import annotations

import abc
import json
import logging
import os
import ssl
import urllib.error
import urllib.request
from typing import Any

from ..core.config import Settings

log = logging.getLogger("disastermind.llm")

#: Default model for Anthropic provider.
ANTHROPIC_MODEL = "claude-sonnet-4-6"

#: Default model for OpenRouter provider.
OPENROUTER_DEFAULT_MODEL = "openai/gpt-5"

#: OpenRouter chat completions endpoint.
OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"

#: Environment variables that may carry the Anthropic API key.
KEY_ENV_VARS = ("DM_ANTHROPIC_KEY", "ANTHROPIC_API_KEY")

#: Environment variables that may carry the OpenRouter API key.
OPENROUTER_KEY_ENV_VARS = ("DM_OPENROUTER_KEY", "OPENROUTER_API_KEY")

# Default per-call timeout (seconds) for every provider so one slow upstream can
# never wedge a coordination cycle or an API worker indefinitely.
DEFAULT_TIMEOUT_SECONDS = 30.0


def _ssl_context() -> ssl.SSLContext | None:
    """Build a *verified* TLS context, preferring certifi's CA bundle.

    The stdlib urllib path uses OpenSSL default CA paths, which are missing on
    some Python distributions (e.g. python.org macOS frameworks and slim
    containers), making every HTTPS call fail with CERTIFICATE_VERIFY_FAILED —
    silently, unless logged. ``certifi`` is already an optional dependency of
    this project (the ``feeds`` extra), so prefer its bundle when importable and
    fall back to the interpreter default otherwise. Returns ``None`` only when
    no context can be built at all (urllib then uses its own default).
    """
    try:
        import certifi  # type: ignore  # lazy: optional dependency

        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        try:
            return ssl.create_default_context()
        except Exception:  # pragma: no cover - defensive
            return None


def _resolve_provider(settings: Settings | None = None) -> str:
    """Return explicit provider from settings or env (e.g. 'openrouter', 'anthropic', 'template')."""
    prov = getattr(settings, "llm_provider", "") if settings is not None else ""
    if not prov:
        prov = os.environ.get("DM_LLM_PROVIDER", "")
    return prov.strip().lower()


def _resolve_model(settings: Settings | None = None, default: str = "") -> str:
    """Return explicit model from settings or env if present, else default."""
    model = getattr(settings, "llm_model", "") if settings is not None else ""
    if not model:
        model = os.environ.get("DM_LLM_MODEL", "")
    return model.strip() if model.strip() else default


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


def _resolve_openrouter_key(settings: Settings | None = None) -> str:
    """Return the first non-empty OpenRouter key from settings/env, else ""."""
    key = getattr(settings, "openrouter_key", "") if settings is not None else ""
    if key:
        return key
    for var in OPENROUTER_KEY_ENV_VARS:
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
        timeout: float = DEFAULT_TIMEOUT_SECONDS,
    ) -> None:
        self.api_key = api_key
        self.model = model
        self.max_tokens = max_tokens
        # Explicit bound: the SDK's default connect+read timeouts are measured in
        # *minutes*, which would stall a coordination cycle far too long.
        self.timeout = timeout

    def generate(self, prompt: str) -> str:
        try:
            import anthropic  # type: ignore  # lazy: optional dependency

            client = anthropic.Anthropic(api_key=self.api_key, timeout=self.timeout)
            resp = client.messages.create(
                model=self.model,
                max_tokens=self.max_tokens,
                messages=[{"role": "user", "content": prompt}],
            )
            return self._extract_text(resp) or prompt
        except Exception as exc:  # missing SDK / network / shape — degrade gracefully
            log.warning(
                "anthropic generate failed (model=%s): %s: %s",
                self.model,
                type(exc).__name__,
                exc,
            )
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


class OpenRouterClient(LLMClient):
    """OpenRouter client — stdlib urllib based, key-gated.

    Calls OpenRouter's OpenAI-compatible chat completions API:
    https://openrouter.ai/api/v1/chat/completions
    Degrades gracefully to returning the prompt text on any failure (missing key,
    HTTP error, timeout, malformed JSON).
    """

    name = "openrouter"

    def __init__(
        self,
        api_key: str,
        model: str = OPENROUTER_DEFAULT_MODEL,
        timeout: float = DEFAULT_TIMEOUT_SECONDS,
    ) -> None:
        self.api_key = api_key
        self.model = model
        self.timeout = timeout
        # Resolved once per client: a verified context (certifi-backed when the
        # bundle is importable) so TLS verification works on interpreters whose
        # OpenSSL CA defaults are empty.
        self._ssl_context = _ssl_context()

    def generate(self, prompt: str) -> str:
        if not self.api_key:
            return prompt

        payload = {
            "model": self.model,
            "messages": [{"role": "user", "content": prompt}],
        }
        data = json.dumps(payload).encode("utf-8")
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://disastermind.local",
            "X-Title": "DisasterMind",
        }
        req = urllib.request.Request(
            OPENROUTER_API_URL,
            data=data,
            headers=headers,
            method="POST",
        )

        try:
            with urllib.request.urlopen(
                req, timeout=self.timeout, context=self._ssl_context
            ) as resp:
                resp_bytes = resp.read()
                resp_data = json.loads(resp_bytes.decode("utf-8"))
                return self._extract_text(resp_data) or prompt
        except Exception as exc:  # HTTP error / timeout / parse error — degrade gracefully
            # Never silently swallow: a misconfigured key, an expired model id or
            # a broken CA bundle all land here and MUST be visible in ops logs.
            log.warning(
                "openrouter generate failed (model=%s): %s: %s",
                self.model,
                type(exc).__name__,
                exc,
            )
            return prompt

    @staticmethod
    def _extract_text(resp_data: Any) -> str:
        """Extract completion text from OpenAI/OpenRouter chat response JSON."""
        if not isinstance(resp_data, dict):
            return ""
        choices = resp_data.get("choices")
        if not isinstance(choices, list) or not choices:
            return ""
        first = choices[0]
        if not isinstance(first, dict):
            return ""
        message = first.get("message")
        if not isinstance(message, dict):
            return ""
        content = message.get("content")
        if content is None:
            return ""
        return str(content).strip()


def make_client(settings: Settings | None = None) -> LLMClient:
    """Pick the right :class:`LLMClient` (PRD Step 7).

    Provider selection must be explicit via ``DM_LLM_PROVIDER``:
      * ``"openrouter"``: returns :class:`OpenRouterClient` if key present, else :class:`TemplateClient`.
      * ``"anthropic"``: returns :class:`AnthropicClient` if key present, else :class:`TemplateClient`.
      * ``"template"``: returns :class:`TemplateClient`.

    If ``DM_LLM_PROVIDER`` is unset/empty:
      * Returns :class:`AnthropicClient` if an Anthropic key is present (backward compatibility).
      * Otherwise returns :class:`TemplateClient`.
    """
    provider = _resolve_provider(settings)
    if provider == "openrouter":
        key = _resolve_openrouter_key(settings)
        if key:
            model = _resolve_model(settings, default=OPENROUTER_DEFAULT_MODEL)
            return OpenRouterClient(api_key=key, model=model)
        return TemplateClient()
    elif provider == "anthropic":
        key = _resolve_api_key(settings)
        if key:
            model = _resolve_model(settings, default=ANTHROPIC_MODEL)
            return AnthropicClient(api_key=key, model=model)
        return TemplateClient()
    elif provider == "template":
        return TemplateClient()

    # Legacy fallback path when DM_LLM_PROVIDER is not set:
    anthropic_key = _resolve_api_key(settings)
    if anthropic_key:
        model = _resolve_model(settings, default=ANTHROPIC_MODEL)
        return AnthropicClient(api_key=anthropic_key, model=model)

    return TemplateClient()

