"""Minimal server-side OpenAI-compatible chat adapter.

The provider URL is configured by the operator, never supplied by a mobile client.
"""
import json
import os
from urllib.parse import urlparse
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


class AIUnavailable(Exception):
    pass


def local_provider(base):
    parsed = urlparse(base)
    return (os.getenv("AEOLIA_ALLOW_LOCAL_AI") == "1"
            and parsed.scheme == "http"
            and parsed.hostname in {"localhost", "127.0.0.1", "::1"}
            and not parsed.username and not parsed.password)


def configured():
    return bool(os.getenv("AEOLIA_AI_API_KEY")) or local_provider(os.getenv("AEOLIA_AI_BASE_URL", ""))


def respond(system: str, user: str, supplied_key: str | None = None) -> str:
    base = os.getenv("AEOLIA_AI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
    local = local_provider(base)
    key = supplied_key or os.getenv("AEOLIA_AI_API_KEY") or ("local" if local else None)
    if not key:
        raise AIUnavailable("Configure the server AI key or provide your own key for this request")
    if len(key) > 512:
        raise AIUnavailable("Invalid AI key")
    if urlparse(base).scheme != "https" and not local:
        raise AIUnavailable("AI provider must use HTTPS")
    payload = json.dumps({
        "model": os.getenv("AEOLIA_AI_MODEL", "gpt-4.1-mini"),
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "max_tokens": (220 if "Return ONLY JSON" in system else 120) if local else 180,
    }).encode()
    request = Request(base + "/chat/completions", data=payload, headers={
        "Authorization": "Bearer " + key, "Content-Type": "application/json",
    }, method="POST")
    try:
        with urlopen(request, timeout=120 if local else 20) as response:
            body = json.load(response)
        answer = body["choices"][0]["message"]["content"]
        if not isinstance(answer, str) or not answer.strip():
            raise AIUnavailable("AI provider returned no text")
        return answer.strip()[:1200]
    except (HTTPError, URLError, TimeoutError, KeyError, ValueError, IndexError) as error:
        raise AIUnavailable("AI provider request failed") from error
