import base64
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app import main
from scripts.seed_demo import seed

PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=')

@pytest.fixture
def client(tmp_path, monkeypatch):
    engine = create_engine(f'sqlite:///{tmp_path}/media-test.db', connect_args={'check_same_thread': False})
    monkeypatch.setattr(main, 'engine', engine)
    monkeypatch.setattr(main, 'SessionLocal', sessionmaker(engine, expire_on_commit=False))
    monkeypatch.setattr(main, 'graph', lambda: None)
    monkeypatch.setenv('AEOLIA_MEDIA_DIR', str(tmp_path / 'uploads'))
    with TestClient(main.app) as c:
        yield c
    engine.dispose()

def upload(client, body=PNG, mime='image/png', user=1):
    response = client.post('/media', content=body, headers={'Content-Type': mime, 'X-User-Id': str(user)})
    assert response.status_code == 200, response.text
    return response.json()

def test_carousel_order_privacy_and_publish_retry(client):
    first, second = upload(client), upload(client)
    assert client.get(first['url'], headers={'X-User-Id': '2'}).status_code == 404
    payload = {'body': 'My ordered photos', 'media_ids': [second['id'], first['id']], 'visibility': 'friends', 'request_id': 'test-retry'}
    created = client.post('/posts', json=payload)
    assert created.status_code == 200
    assert client.post('/posts', json=payload).json() == created.json()
    posts = [p for p in client.get('/feed').json() if p['id'] == created.json()['id']]
    assert len(posts) == 1
    assert [m['id'] for m in posts[0]['media']] == [second['id'], first['id']]
    assert client.get(first['url'], headers={'X-User-Id': '2'}).status_code == 404
    client.post('/users/2/follow')
    client.post('/users/1/follow', headers={'X-User-Id': '2'})
    assert client.get(first['url'], headers={'X-User-Id': '2'}).content == PNG
    assert client.get(first['url']).headers['cache-control'] == 'private, no-store'
    client.delete('/posts/' + str(created.json()['id']))
    assert client.get(first['url'], headers={'X-User-Id': '2'}).status_code == 404

def test_upload_validation_and_attachment_ownership(client, monkeypatch):
    asset = upload(client, user=2)
    assert client.post('/posts', json={'media_ids': [asset['id']]}).status_code == 403
    assert client.post('/media', content=b'not an image', headers={'Content-Type': 'image/png'}).status_code == 415
    assert client.post('/media', content=b'<script>hello</script>', headers={'Content-Type': 'text/html'}).status_code == 415
    assert client.post('/posts', json={'media_ids': ['fake'] * 11}).status_code == 422
    assert client.post('/posts', json={'media_ids': [asset['id']] * 2}).status_code == 400
    from app import media
    monkeypatch.setattr(media, 'MAX_BYTES', 4)
    assert client.post('/media', content=PNG, headers={'Content-Type': 'image/png'}).status_code == 413

def test_video_cover_and_byte_ranges(client):
    # Tests storage/range semantics; actual playback is checked in Simulator.
    video = upload(client, b'\x00\x00\x00\x18ftypmp42' + b'\x00' * 32, 'video/mp4')
    cover = upload(client)
    result = client.post('/posts', json={'media_ids': [video['id']], 'cover_media_id': cover['id'], 'visibility': 'public', 'circle_id': 1})
    assert result.status_code == 200
    post = next(p for p in client.get('/circles/1/posts').json() if p['id'] == result.json()['id'])
    assert post['media_type'] == 'video'
    assert post['cover_url'] == cover['url']
    partial = client.get(video['url'], headers={'Range': 'bytes=0-11', 'X-User-Id': '3'})
    assert partial.status_code == 206
    assert len(partial.content) == 12
    assert client.post('/posts', json={'media_ids': [video['id'], cover['id']]}).status_code == 400

def test_demo_seed_is_repeatable_and_conversations_are_two_way(client):
    def request(method, path, user, data=None):
        result = client.request(method, path, json=data, headers={'X-User-Id': str(user)})
        assert result.status_code == 200, result.text
        return result.json()
    assert seed(request) == {'posts': 4, 'messages': 15, 'events': 2}
    assert seed(request) == {'posts': 0, 'messages': 0, 'events': 0}
    for friend in [2, 3, 4]:
        messages = request('GET', f'/messages/{friend}', 1)
        assert {m['sender_id'] for m in messages} == {1, friend}
        assert len(messages) == 5
    assert any('[Demo]' in p['body'] for p in request('GET', '/feed?tab=friends', 1))


def test_simulation_seed_preserves_accounts_and_is_repeatable(client):
    from scripts.simulate_agents import seed as seed_simulation
    from app.models import User, Post, Membership
    from sqlalchemy import select, func
    with main.SessionLocal() as db:
        before = db.get(User, 3).agent_chat_allowed
        first = seed_simulation(db)
        second = seed_simulation(db)
        assert len(first) == 20
        assert [u.id for u in first] == [u.id for u in second]
        assert db.scalar(select(func.count(User.id))) == 24
        assert db.scalar(select(func.count(Post.id)).where(Post.body.like('[Simulation]%'))) == 20
        assert db.scalar(select(func.count(Membership.id)).where(Membership.user_id.in_([u.id for u in first]))) == 40
        assert db.get(User, 3).agent_chat_allowed == before
