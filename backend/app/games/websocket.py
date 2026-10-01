"""Draw & Guess realtime layer.

One WebSocket per member per room. In-process fanout (connection registry);
authoritative state + strokes in Redis. Cross-process pub/sub is a follow-up.

Client → server envelopes:
  {"type":"start"}                       begin / restart the game
  {"type":"choose","word":"cat"}         drawer picks one of their 3 options
  {"type":"stroke","stroke":{...}}       normalized 0–1 stroke (relayed to others)
  {"type":"clear"}                       drawer clears the canvas
  {"type":"chat","body":"..."}           chat == guess (matches → "guessed", not echoed)
  {"type":"time_up"} / {"type":"next"}   end the drawing phase / advance the turn
  {"type":"resume"}                      resend snapshot (reconnect)

Server → client:
  {"type":"snapshot","state":<view>|null,"strokes":[...]}
  {"type":"state","state":<view>}        per-recipient (drawer sees the word)
  {"type":"stroke","stroke":{...}} / {"type":"clear"}
  {"type":"chat","user_id":N,"body":"..."} / {"type":"system","event":"guessed","user_id":N}
"""
import asyncio
import time

from fastapi import WebSocket, WebSocketDisconnect

from ..models import GameRoom
from .draw_guess import engine, words
from . import rooms

connections = {}  # room_id -> set[(WebSocket, user_id)]


async def make_options():
    """AI-generated prompts when configured, else the curated fallback."""
    try:
        return await asyncio.to_thread(words.ai_options)
    except Exception:
        return words.three_options()


def register_game_ws(app, session_factory):
    def get_room(room_id):
        with session_factory() as db:
            return db.get(GameRoom, room_id)

    async def snapshot(ws, room_id, user_id):
        state = await rooms.load_state(room_id)
        await ws.send_json({
            "type": "snapshot",
            "state": engine.view(state, user_id) if state else None,
            "strokes": await rooms.get_strokes(room_id),
        })

    async def broadcast_state(room_id, state):
        for ws, uid in list(connections.get(room_id, set())):
            try:
                await ws.send_json({"type": "state", "state": engine.view(state, uid)})
            except Exception:
                pass

    async def relay(room_id, payload, exclude=None):
        for ws, uid in list(connections.get(room_id, set())):
            if ws is exclude:
                continue
            try:
                await ws.send_json(payload)
            except Exception:
                pass

    async def handle(ws, room_id, user_id, players, msg):
        kind = msg.get("type")
        state = await rooms.load_state(room_id)

        if kind == "start":
            if state is None or state.get("phase") == "finished":
                try:
                    rpp = int(msg.get("rounds_per_player", 3))
                except (TypeError, ValueError):
                    rpp = 3
                rpp = max(1, min(10, rpp))
                state = engine.new_game(players, rounds_per_player=rpp, options=await make_options())
                await rooms.clear_strokes(room_id)
                await rooms.save_state(room_id, state)
                await broadcast_state(room_id, state)
            return
        if kind == "resume":
            await snapshot(ws, room_id, user_id)
            return
        if state is None:
            return

        if kind == "choose":
            try:
                engine.choose_word(state, user_id, msg.get("word", ""))
            except ValueError:
                return
            state["started_at"] = time.time()
            await rooms.clear_strokes(room_id)
            await rooms.save_state(room_id, state)
            await broadcast_state(room_id, state)
        elif kind == "stroke":
            if user_id != state.get("drawer_id") or state.get("phase") != "drawing":
                return
            await rooms.append_stroke(room_id, msg.get("stroke", {}))
            await relay(room_id, {"type": "stroke", "stroke": msg.get("stroke", {})}, exclude=ws)
        elif kind == "clear":
            if user_id == state.get("drawer_id"):
                await rooms.clear_strokes(room_id)
                await relay(room_id, {"type": "clear"})
        elif kind == "chat":
            body = (msg.get("body") or "").strip()
            if not body:
                return
            time_left = max(0, state["duration"] - (time.time() - state.get("started_at", time.time())))
            correct, _ = engine.guess(state, user_id, body, time_left)
            if correct:
                await rooms.save_state(room_id, state)
                await relay(room_id, {"type": "system", "event": "guessed", "user_id": user_id})
                await broadcast_state(room_id, state)
            else:
                await relay(room_id, {"type": "chat", "user_id": user_id, "body": body})
        elif kind == "voice":
            url = msg.get("media_url")
            if url:
                await relay(room_id, {"type": "voice", "user_id": user_id, "media_url": url}, exclude=ws)
        elif kind == "time_up":
            engine.time_up(state)
            await rooms.save_state(room_id, state)
            await broadcast_state(room_id, state)
        elif kind == "next":
            finishing = state["turn"] >= state["total_turns"]
            engine.next_turn(state, options=None if finishing else await make_options())
            state.pop("started_at", None)
            await rooms.clear_strokes(room_id)
            await rooms.save_state(room_id, state)
            await broadcast_state(room_id, state)

    @app.websocket("/ws/games/{room_id}")
    async def game_ws(websocket: WebSocket, room_id: int):
        try:
            user_id = int(websocket.query_params.get("user_id", "0"))
        except ValueError:
            await websocket.close(code=4403)
            return
        room = get_room(room_id)
        if not room or user_id not in (room.host_id, room.guest_id):
            await websocket.close(code=4403)
            return
        await websocket.accept()
        players = [room.host_id, room.guest_id]
        conns = connections.setdefault(room_id, set())
        conns.add((websocket, user_id))
        try:
            await snapshot(websocket, room_id, user_id)
            await relay(room_id, {"type": "presence", "user_id": user_id, "status": "connected"}, exclude=websocket)
            while True:
                msg = await websocket.receive_json()
                await handle(websocket, room_id, user_id, players, msg)
        except WebSocketDisconnect:
            pass
        finally:
            conns.discard((websocket, user_id))
            if not conns:
                connections.pop(room_id, None)
            else:
                await relay(room_id, {"type": "presence", "user_id": user_id, "status": "disconnected"})
