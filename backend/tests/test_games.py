import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app import main


@pytest.fixture
def client(tmp_path, monkeypatch):
    engine = create_engine(f'sqlite:///{tmp_path}/games-test.db', connect_args={'check_same_thread': False})
    monkeypatch.setattr(main, 'engine', engine)
    monkeypatch.setattr(main, 'SessionLocal', sessionmaker(engine, expire_on_commit=False))
    monkeypatch.setattr(main, 'graph', lambda: None)
    with TestClient(main.app) as c:
        yield c
    engine.dispose()


def mutual(client, a, b):
    assert client.post(f'/users/{b}/follow', headers={'X-User-Id': str(a)}).status_code == 200
    assert client.post(f'/users/{a}/follow', headers={'X-User-Id': str(b)}).status_code == 200


def test_invite_join_and_room_lifecycle(client):
    mutual(client, 1, 2)
    # Host invites a mutual friend; a game_invite message lands in the chat.
    created = client.post('/games/rooms', json={'kind': 'uno', 'guest_id': 2}, headers={'X-User-Id': '1'})
    assert created.status_code == 200
    room_id = created.json()['room_id']
    invite = next(m for m in client.get('/messages/2', headers={'X-User-Id': '1'}).json() if m['id'] == created.json()['message_id'])
    assert invite['kind'] == 'game_invite' and invite['body'] == 'uno' and invite['game_room_id'] == room_id
    # Room starts in 'inviting' and is visible to both players only.
    assert client.get(f'/games/rooms/{room_id}', headers={'X-User-Id': '1'}).json()['status'] == 'inviting'
    assert client.get(f'/games/rooms/{room_id}', headers={'X-User-Id': '3'}).status_code == 404
    # Only the invited guest can join; joining activates the room.
    assert client.post(f'/games/rooms/{room_id}/join', headers={'X-User-Id': '1'}).status_code == 403
    joined = client.post(f'/games/rooms/{room_id}/join', headers={'X-User-Id': '2'})
    assert joined.status_code == 200 and joined.json()['status'] == 'active'
    # Ending records the winner.
    ended = client.post(f'/games/rooms/{room_id}/end', json={'winner_id': 2}, headers={'X-User-Id': '2'})
    assert ended.status_code == 200 and ended.json()['status'] == 'ended' and ended.json()['winner_id'] == 2


def test_cannot_invite_non_mutual_or_unknown_game(client):
    # 1 and 3 are not mutual.
    assert client.post('/games/rooms', json={'kind': 'uno', 'guest_id': 3}, headers={'X-User-Id': '1'}).status_code == 403
    mutual(client, 1, 2)
    assert client.post('/games/rooms', json={'kind': 'chess', 'guest_id': 2}, headers={'X-User-Id': '1'}).status_code == 400
