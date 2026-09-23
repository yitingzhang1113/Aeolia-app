import json

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, func
from sqlalchemy.orm import sessionmaker

from app import main
from app.models import AgentAssessment, AgentTurn, Encounter, Follow, SocialProfile, User, UserLocation


@pytest.fixture
def client(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path}/discovery.db", connect_args={"check_same_thread": False})
    monkeypatch.setattr(main, "engine", engine)
    monkeypatch.setattr(main, "SessionLocal", sessionmaker(engine, expire_on_commit=False))
    monkeypatch.setattr(main, "graph", lambda: None)
    with TestClient(main.app) as c:
        yield c
    engine.dispose()


def model(monkeypatch, recommend=True):
    seen = []
    def respond(system, context, key=None):
        data = json.loads(context)
        seen.append((system, data))
        if "private_screening_preferences" in data:
            return json.dumps({"recommend": recommend, "reason": "Both agents confirmed an interest in coffee and sketching.", "turns": [1, 2]})
        return f"{data['your_member']['name']}'s agent: My member enjoys coffee and sketches."
    monkeypatch.setattr(main, "respond", respond)
    return seen


def locations(client):
    for user in (1, 2):
        assert client.put("/me/location", headers={"X-User-Id": str(user)}, json={
            "city": "San Francisco", "latitude": 37.7749, "longitude": -122.4194, "radius_km": 10}).status_code == 200


def test_chat_screening_citations_then_explicit_two_sided_match(client, monkeypatch):
    seen = model(monkeypatch)
    locations(client)
    result = client.post("/explore/nearby").json()
    assert result["status"] == "recommended"
    assert [t["speaker_id"] for t in result["turns"]] == [1, 2, 1, 2]
    assert len(seen) == 5
    for _, context in seen[:4]:
        assert "private_screening_preferences" not in context
        assert "curious, kind" not in json.dumps(context)
    for citation in result["assessment"]["citations"]:
        assert citation["quote"] == result["turns"][citation["turn"] - 1]["body"]
    with main.SessionLocal() as db:
        assert db.get(Encounter, result["id"]).circle_id is None
        assert db.scalar(select(func.count(Follow.id))) == 0
    path = f"/encounters/{result['id']}/decision"
    assert client.post(path, json={"choice": "interested"}).json()["status"] == "pending"
    assert client.post("/messages", json={"recipient_id": 2, "body": "hello"}).status_code == 403
    incoming = client.get("/match-requests", headers={"X-User-Id": "2"}).json()
    assert len(incoming) == 1 and incoming[0]["assessment"] is None
    assert client.post(path, headers={"X-User-Id": "2"}, json={"choice": "interested"}).json()["status"] == "matched"
    assert client.post("/messages", json={"recipient_id": 2, "body": "hello"}).status_code == 200
    assert client.post(path, json={"choice": "interested"}).json()["status"] == "matched"


def test_rejected_and_legacy_encounters_never_become_recommendations(client, monkeypatch):
    model(monkeypatch, recommend=False)
    locations(client)
    with main.SessionLocal() as db:
        db.add(Encounter(owner_id=1, candidate_id=2, circle_id=1, reason="Old recommendation", status="suggested"))
        db.commit()
    assert client.post("/explore/nearby").json()["id"] is None
    assert client.get("/encounters").json() == []
    with main.SessionLocal() as db:
        assert db.scalar(select(func.count(AgentTurn.id))) == 4
        assert db.scalar(select(AgentAssessment)).recommend is False


def test_no_consent_no_chat_and_no_location_leak(client, monkeypatch):
    seen = model(monkeypatch)
    locations(client)
    assert "location" not in client.get("/users/2").json()
    client.patch("/me", headers={"X-User-Id": "2"}, json={"agent_chat_allowed": False})
    assert client.post("/explore/nearby").json()["id"] is None
    assert not seen
    client.delete("/me/location")
    assert client.post("/explore/nearby").status_code == 400


def test_radius_filters_by_coordinates_not_city_label(client, monkeypatch):
    seen = model(monkeypatch)
    locations(client)
    client.put("/me/location", headers={"X-User-Id": "2"}, json={"city": "San Francisco", "latitude": 34.05, "longitude": -118.24, "radius_km": 25})
    assert client.post("/explore/nearby").json()["id"] is None
    assert not seen


@pytest.mark.parametrize("height,eligible", [(180, False), (None, False), (185, True)])
def test_dating_height_is_a_hard_constraint(client, monkeypatch, height, eligible):
    seen = model(monkeypatch)
    locations(client)
    with main.SessionLocal() as db:
        db.add(SocialProfile(user_id=1, intent="dating", age=28, minimum_height_cm=181))
        db.add(SocialProfile(user_id=2, intent="dating", age=29, height_cm=height))
        db.commit()
    result = client.post("/explore/nearby").json()
    assert bool(result["id"]) is eligible
    assert bool(seen) is eligible


def test_pass_removes_card_and_failure_creates_no_recommendation(client, monkeypatch):
    model(monkeypatch)
    locations(client)
    result = client.post("/explore/nearby").json()
    client.post(f"/encounters/{result['id']}/decision", json={"choice": "passed"})
    assert client.get("/encounters").json() == []


def test_invalid_model_assessment_does_not_publish(client, monkeypatch):
    locations(client)
    monkeypatch.setattr(main, "respond", lambda *args: "not JSON")
    assert client.post("/explore/nearby").status_code == 503
    assert client.get("/encounters").json() == []
    with main.SessionLocal() as db:
        assert db.scalar(select(func.count(AgentTurn.id))) == 0
