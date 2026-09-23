import os
import tempfile

path = os.path.join(tempfile.gettempdir(), "aeolia_test_api.db")
try:
    os.remove(path)
except FileNotFoundError:
    pass
os.environ["DATABASE_URL"] = "sqlite:///" + path
from fastapi.testclient import TestClient
from app.main import app


def test_public_circle_posts_and_private_feed_boundaries():
    with TestClient(app) as client:
        assert client.get("/health").json()["ok"]
        assert len(client.get("/circles").json()) == 2
        public = client.get("/circles/1/posts").json()
        assert len(public) == 2
        # Someone who does not mutually follow the author cannot see a friends-only post.
        assert all(p["body"] != "A quiet board-game night sounds perfect." for p in client.get("/feed").json())
        result = client.post("/posts", json={"body":"A private thought", "visibility":"friends"})
        assert result.status_code == 200
        assert all(p["body"] != "A private thought" for p in client.get("/feed", headers={"X-User-Id":"2"}).json())
        assert client.post("/posts", json={"body":"Wrong circle privacy", "visibility":"friends", "circle_id":1}).status_code == 400


def test_mutual_follow_required_for_human_chat():
    with TestClient(app) as client:
        assert client.post("/messages", json={"recipient_id":2,"body":"Hello"}).status_code == 403
        client.post("/users/2/follow")
        client.post("/users/1/follow", headers={"X-User-Id":"2"})
        assert client.post("/messages", json={"recipient_id":2,"body":"Hello"}).status_code == 200
        assert client.get("/messages/1", headers={"X-User-Id":"2"}).json()[0]["body"] == "Hello"


def test_exploration_requires_explicit_circle_consent():
    with TestClient(app) as client:
        client.patch("/circles/1", json={"explore":False})
        assert client.post("/explore/1").status_code == 403


def test_agent_reply_uses_model_and_never_returns_private_note(monkeypatch):
    from app import main
    seen = {}
    def fake_respond(system, message, key):
        seen.update(system=system, message=message, key=key)
        return "Let's start with a shared hobby."
    monkeypatch.setattr(main, "respond", fake_respond)
    with TestClient(app) as client:
        reply = client.post("/agent/reply", json={"message": "Help me meet friends", "api_key": "temporary-key"})
        assert reply.json() == {"reply": "Let's start with a shared hobby."}
        assert seen["key"] == "temporary-key"
        assert seen["message"] == "Help me meet friends"
        assert "curious" in seen["system"]
