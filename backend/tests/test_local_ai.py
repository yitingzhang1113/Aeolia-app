import json
from io import BytesIO

import pytest

from app import ai


@pytest.mark.parametrize("base,allowed", [
    ("http://localhost:11434/v1", True),
    ("http://127.0.0.1:11434/v1", True),
    ("http://[::1]:11434/v1", True),
    ("http://localhost:11434@external.example/v1", False),
    ("http://localhost.example:11434/v1", False),
])
def test_local_provider_requires_loopback_and_opt_in(monkeypatch, base, allowed):
    monkeypatch.delenv("AEOLIA_ALLOW_LOCAL_AI", raising=False)
    assert not ai.local_provider(base)
    monkeypatch.setenv("AEOLIA_ALLOW_LOCAL_AI", "1")
    assert ai.local_provider(base) is allowed


def test_local_model_without_key_and_with_cold_start_timeout(monkeypatch):
    monkeypatch.delenv("AEOLIA_AI_API_KEY", raising=False)
    monkeypatch.setenv("AEOLIA_ALLOW_LOCAL_AI", "1")
    monkeypatch.setenv("AEOLIA_AI_BASE_URL", "http://127.0.0.1:11434/v1")
    monkeypatch.setenv("AEOLIA_AI_MODEL", "test-local-model")

    def reply(request, timeout):
        assert request.full_url == "http://127.0.0.1:11434/v1/chat/completions"
        assert json.loads(request.data)["model"] == "test-local-model"
        assert timeout == 120
        return BytesIO(json.dumps({"choices": [{"message": {"content": "Hello from the local model"}}]}).encode())

    monkeypatch.setattr(ai, "urlopen", reply)
    assert ai.configured()
    assert ai.respond("system", "hello") == "Hello from the local model"


def test_remote_model_still_requires_key(monkeypatch):
    monkeypatch.delenv("AEOLIA_AI_API_KEY", raising=False)
    monkeypatch.setenv("AEOLIA_AI_BASE_URL", "https://example.com/v1")
    assert not ai.configured()
    with pytest.raises(ai.AIUnavailable, match="key"):
        ai.respond("system", "hello")
