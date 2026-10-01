"""Game Room lifecycle (P1): invite → join → shell. No live gameplay yet.

Live gameplay (P2+) will run over WebSocket with authoritative engines and Redis
state; this module only manages room records and the in-chat invite message.
"""
from fastapi import Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import GameParticipant, GameRoom, Message, User

GAME_KINDS = ("uno", "draw_guess")


class RoomIn(BaseModel):
    kind: str
    guest_id: int


class EndIn(BaseModel):
    winner_id: int | None = None


def register_games(app, get_db, actor, mutual, is_blocked, user_view, now):
    def room_view(db, room):
        return {
            "id": room.id,
            "kind": room.kind,
            "status": room.status,
            "host": user_view(db.get(User, room.host_id)),
            "guest": user_view(db.get(User, room.guest_id)),
            "winner_id": room.winner_id,
        }

    def member_room(db, room_id, user):
        room = db.get(GameRoom, room_id)
        if not room or user.id not in (room.host_id, room.guest_id):
            raise HTTPException(404, "Game room not found")
        return room

    @app.post("/games/rooms")
    def create_room(data: RoomIn, db: Session = Depends(get_db), u: User = Depends(actor)):
        if data.kind not in GAME_KINDS:
            raise HTTPException(400, "Unknown game")
        if data.guest_id == u.id or not db.get(User, data.guest_id):
            raise HTTPException(400, "Invite a friend to play")
        if not mutual(db, u.id, data.guest_id) or is_blocked(db, u.id, data.guest_id):
            raise HTTPException(403, "You can only play with mutual friends")
        room = GameRoom(kind=data.kind, host_id=u.id, guest_id=data.guest_id, status="inviting")
        db.add(room)
        db.flush()
        db.add(GameParticipant(room_id=room.id, user_id=u.id))
        # The invite lands in the conversation as a card with a Join button.
        invite = Message(sender_id=u.id, recipient_id=data.guest_id, kind="game_invite",
                         body=data.kind, game_room_id=room.id)
        db.add(invite)
        db.commit()
        return {"room_id": room.id, "message_id": invite.id}

    @app.get("/games/rooms/{room_id}")
    def get_room(room_id: int, db: Session = Depends(get_db), u: User = Depends(actor)):
        return room_view(db, member_room(db, room_id, u))

    @app.post("/games/rooms/{room_id}/join")
    def join_room(room_id: int, db: Session = Depends(get_db), u: User = Depends(actor)):
        room = member_room(db, room_id, u)
        if u.id != room.guest_id:
            raise HTTPException(403, "Only the invited friend can join")
        if room.status == "ended":
            raise HTTPException(409, "This game has ended")
        if room.status == "inviting":
            room.status = "active"
            if not db.scalar(select(GameParticipant.id).where(GameParticipant.room_id == room.id, GameParticipant.user_id == u.id)):
                db.add(GameParticipant(room_id=room.id, user_id=u.id))
            db.commit()
        return room_view(db, room)

    @app.post("/games/rooms/{room_id}/end")
    def end_room(room_id: int, data: EndIn, db: Session = Depends(get_db), u: User = Depends(actor)):
        room = member_room(db, room_id, u)
        if data.winner_id is not None and data.winner_id not in (room.host_id, room.guest_id):
            raise HTTPException(400, "Winner must be a player")
        if room.status != "ended":
            room.status = "ended"
            room.winner_id = data.winner_id
            room.ended_at = now()
            db.commit()
        return room_view(db, room)
