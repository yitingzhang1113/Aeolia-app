import base64

from test_discovery import client
from app import avatar, main
from app.models import User


def test_profile_fields_and_private_filters(client):
    payload = {"name": "Yiting", "age": 28, "intent": "dating", "height_cm": 170,
               "minimum_height_cm": 181, "looking_for": "A relationship with shared music taste",
               "music_artists": ["Laufey"], "music_genres": ["Jazz"],
               "music_url": "https://open.spotify.com/playlist/example",
               "interests": ["coffee", "anime"],
               "prompts": [{"question": "A perfect weekend looks like…", "answer": "Coffee and live jazz"}]}
    result = client.put("/me/profile", json=payload)
    assert result.status_code == 200
    assert result.json()["minimum_height_cm"] == 181
    public = client.get("/users/1", headers={"X-User-Id": "2"}).json()
    assert "minimum_height_cm" not in public
    assert public["profile"]["music_artists"] == ["Laufey"]
    assert public["age"] == 28
    with main.SessionLocal() as db:
        context = main.public_agent_profile(db, db.get(User, 1))
        assert context["profile"]["music_genres"] == ["Jazz"]
        assert "minimum_height_cm" not in context
    assert client.put("/me/profile", json={**payload, "music_url": "javascript:alert(1)"}).status_code == 422
    assert client.put("/me/profile", json={**payload, "age": 17}).status_code == 422


def test_generated_avatar_shared_but_source_photo_private(client, monkeypatch, tmp_path):
    monkeypatch.setenv("AEOLIA_MEDIA_DIR", str(tmp_path / "media"))
    png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=")
    source = client.post("/media", content=png, headers={"Content-Type": "image/png"}).json()
    monkeypatch.setattr(avatar, "generate_avatar", lambda body, mime: png)
    assert client.post("/agent/avatar", headers={"X-User-Id": "2"}, json={"photo_id": source["id"]}).status_code == 404
    generated = client.post("/agent/avatar", json={"photo_id": source["id"]})
    assert generated.status_code == 200
    url = generated.json()["avatar_url"]
    assert client.get("/me").json()["avatar_url"] == url
    assert client.get(url, headers={"X-User-Id": "2"}).content == png
    assert client.get(source["url"], headers={"X-User-Id": "2"}).status_code == 404


def test_unconfigured_avatar_provider_does_not_fall_back_to_cloud(client, monkeypatch, tmp_path):
    monkeypatch.delenv("AEOLIA_IMAGE_BASE_URL", raising=False)
    monkeypatch.delenv("AEOLIA_IMAGE_API_KEY", raising=False)
    assert client.get("/agent/avatar/status").json() == {"configured": False}
