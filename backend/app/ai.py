"""Minimal server-side OpenAI-compatible chat adapter.

The provider URL is configured by the operator, never supplied by a mobile client.
"""
import json
import os
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


class AIUnavailable(Exception):
    pass


def configured():
    return bool(os.getenv("AEOLIA_AI_API_KEY"))


def respond(system: str, user: str, supplied_key: str | None = None) -> str:
    key = supplied_key or os.getenv("AEOLIA_AI_API_KEY")
    if not key:
        raise AIUnavailable("Configure the server AI key or provide your own key for this request")
    if len(key) > 512:
        raise AIUnavailable("Invalid AI key")
    base = os.getenv("AEOLIA_AI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
    if not base.startswith("https://") and not (os.getenv("AEOLIA_ALLOW_LOCAL_AI") == "1" and base.startswith("http://localhost:")):
        raise AIUnavailable("AI provider must use HTTPS")
    payload = json.dumps({
        "model": os.getenv("AEOLIA_AI_MODEL", "gpt-4.1-mini"),
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "max_tokens": 180,
    }).encode()
    request = Request(base + "/chat/completions", data=payload, headers={
        "Authorization": "Bearer " + key, "Content-Type": "application/json",
    }, method="POST")
    try:
        with urlopen(request, timeout=20) as response:
            body = json.load(response)
        answer = body["choices"][0]["message"]["content"]
        if not isinstance(answer, str) or not answer.strip():
            raise AIUnavailable("AI provider returned no text")
        return answer.strip()[:1200]
    except (HTTPError, URLError, TimeoutError, KeyError, ValueError, IndexError) as error:
        raise AIUnavailable("AI provider request failed") from error
