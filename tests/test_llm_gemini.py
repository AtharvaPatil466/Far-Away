"""Gemini provider selection and offline degradation.

Keys are read from the environment only. No test supplies a real credential and
no test opens a socket: the client degrades to the prompt on any failure, which
is what keeps the escalation brief usable when the model is unreachable.
"""
from __future__ import annotations

import pytest

from disastermind.llm.client import (
    GEMINI_KEY_ENV_VARS,
    AnthropicClient,
    GeminiClient,
    TemplateClient,
    make_client,
)


@pytest.fixture(autouse=True)
def _clear_keys(monkeypatch):
    for var in (*GEMINI_KEY_ENV_VARS, "DM_ANTHROPIC_KEY", "ANTHROPIC_API_KEY"):
        monkeypatch.delenv(var, raising=False)


def test_no_key_configured_returns_the_offline_template_client():
    assert isinstance(make_client(), TemplateClient)


@pytest.mark.parametrize("var", GEMINI_KEY_ENV_VARS)
def test_any_gemini_key_variable_selects_gemini(monkeypatch, var):
    monkeypatch.setenv(var, "test-key-not-a-real-credential")

    assert isinstance(make_client(), GeminiClient)


def test_gemini_is_preferred_over_anthropic(monkeypatch):
    """Both configured: Gemini wins, so switching provider is one env var."""
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")

    assert isinstance(make_client(), GeminiClient)


def test_anthropic_still_selected_when_only_its_key_is_set(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")

    assert isinstance(make_client(), AnthropicClient)


def test_unreachable_model_degrades_to_the_prompt(monkeypatch):
    """No network: the brief must still render rather than raise."""
    client = GeminiClient(api_key="test-key", timeout=0.001)

    def boom(*_args, **_kwargs):
        raise OSError("no network")

    monkeypatch.setattr("urllib.request.urlopen", boom)

    assert client.generate("ESCALATION BRIEF: zone 4") == "ESCALATION BRIEF: zone 4"


def test_response_text_is_extracted_defensively():
    payload = {"candidates": [{"content": {"parts": [{"text": "ordered"}]}}]}

    assert GeminiClient._extract_text(payload) == "ordered"
    assert GeminiClient._extract_text({}) == ""
    assert GeminiClient._extract_text(None) == ""
    assert GeminiClient._extract_text({"candidates": [{}]}) == ""


def test_no_credential_is_hardcoded_anywhere_in_the_module():
    """The module must carry variable NAMES, never a key value."""
    import inspect

    from disastermind.llm import client as mod

    source = inspect.getsource(mod)
    assert "AIza" not in source, "a Google API key literal is present in the source"
    assert "sk-ant-" not in source, "an Anthropic key literal is present in the source"
