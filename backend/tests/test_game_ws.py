import pytest
import redis
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app import main


@pytest.fixture
def client(tmp_path, monkeypatch):
    engine = create_engine(f'sqlite:///{tmp_path}/games-ws-test.db', connect_args={'check_same_thread': False})
    monkeypatch.setattr(main, 'engine', engine)
    monkeypatch.setattr(main, 'SessionLocal', sessionmaker(engine, expire_on_commit=False))
    monkeypatch.setattr(main, 'graph', lambda: None)
    with TestClient(main.app) as c:
        yield c
    engine.dispose()


def recv(ws, wanted):
    """Receive until a message of the wanted type arrives (skips presence noise)."""
    for _ in range(20):
        msg = ws.receive_json()
        if msg["type"] == wanted:
            return msg
    raise AssertionError(f"never received {wanted}")


def setup_room(client):
    client.post('/users/2/follow', headers={'X-User-Id': '1'})
    client.post('/users/1/follow', headers={'X-User-Id': '2'})
    room_id = client.post('/games/rooms', json={'kind': 'draw_guess', 'guest_id': 2}, headers={'X-User-Id': '1'}).json()['room_id']
    client.post(f'/games/rooms/{room_id}/join', headers={'X-User-Id': '2'})
    return room_id


def test_ws_realtime_draw_guess(client):
    room_id = setup_room(client)
    redis.Redis(decode_responses=True).delete(f'dg:{room_id}:state', f'dg:{room_id}:strokes')

    with client.websocket_connect(f'/ws/games/{room_id}?user_id=1') as w1, \
         client.websocket_connect(f'/ws/games/{room_id}?user_id=2') as w2:
        assert recv(w1, 'snapshot')['state'] is None
        assert recv(w2, 'snapshot')['state'] is None

        # Host starts → both see 'choosing'; only the drawer gets word options.
        w1.send_json({'type': 'start'})
        s1 = recv(w1, 'state')['state']
        s2 = recv(w2, 'state')['state']
        assert s1['drawer_id'] == 1 and s1['phase'] == 'choosing'
        assert 'word_options' in s1 and 'word_options' not in s2

        # Drawer chooses → drawing; drawer sees the word, guesser sees a mask.
        word = s1['word_options'][0]
        w1.send_json({'type': 'choose', 'word': word})
        d1 = recv(w1, 'state')['state']
        d2 = recv(w2, 'state')['state']
        assert d1['word'] == word and 'word' not in d2
        assert d2['hint'] == ''.join('_' if ch != ' ' else ' ' for ch in word)

        # A stroke from the drawer reaches the other player.
        w1.send_json({'type': 'stroke', 'stroke': {'points': [[0.1, 0.1], [0.2, 0.2]], 'width': 4}})
        assert recv(w2, 'stroke')['stroke']['width'] == 4

        # Guess via chat: a correct guess ends the round and scores both players.
        w2.send_json({'type': 'chat', 'body': word.upper()})
        assert recv(w2, 'system')['event'] == 'guessed'
        end = recv(w2, 'state')['state']
        assert end['phase'] == 'round_end' and end['scores']['2'] > 0 and end['scores']['1'] > 0

        # A wrong guess is echoed as normal chat, not a system event.
        w1.send_json({'type': 'next'})
        recv(w1, 'state'); recv(w2, 'state')
        w2.send_json({'type': 'chat', 'body': 'nope-not-it'})
        assert recv(w1, 'chat')['body'] == 'nope-not-it'
