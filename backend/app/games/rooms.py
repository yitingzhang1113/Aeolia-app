"""Redis-backed live state for Draw & Guess rooms.

Live game state + drawing strokes live in Redis (ephemeral, TTL'd) so a client
can reconnect and resync by version. Durable outcomes stay in PostgreSQL.
"""
import json
import os

import redis.asyncio as aioredis

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
TTL = 60 * 60  # rooms self-expire after an hour of inactivity

_client = None


def client():
    global _client
    if _client is None:
        _client = aioredis.from_url(REDIS_URL, decode_responses=True)
    return _client


def _state_key(room_id):
    return f"dg:{room_id}:state"


def _stroke_key(room_id):
    return f"dg:{room_id}:strokes"


async def load_state(room_id):
    raw = await client().get(_state_key(room_id))
    return json.loads(raw) if raw else None


async def save_state(room_id, state):
    await client().set(_state_key(room_id), json.dumps(state), ex=TTL)


async def append_stroke(room_id, stroke):
    c = client()
    await c.rpush(_stroke_key(room_id), json.dumps(stroke))
    await c.expire(_stroke_key(room_id), TTL)


async def get_strokes(room_id):
    raw = await client().lrange(_stroke_key(room_id), 0, -1)
    return [json.loads(s) for s in raw]


async def clear_strokes(room_id):
    await client().delete(_stroke_key(room_id))
