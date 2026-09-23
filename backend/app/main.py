import json
import os
import random
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import create_engine, func, or_, select
from sqlalchemy.orm import Session, sessionmaker

from .graph import Graph
from .models import AgentTurn, Base, Block, Circle, Encounter, Event, Follow, Membership, Message, Post, User

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./aeolia.db")
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {})
SessionLocal = sessionmaker(engine, expire_on_commit=False)


def get_db():
    with SessionLocal() as db:
        yield db


def actor(x_user_id: int = Header(default=1), db: Session = Depends(get_db)):
    # Demo-only account switch; replace with verified auth before public deployment.
    user = db.get(User, x_user_id)
    if not user:
        raise HTTPException(401, "Unknown demo account")
    return user


def graph():
    try:
        g = Graph()
        g.verify = g.driver.verify_connectivity()
        return g
    except Exception:
        return None


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        if not db.scalar(select(User.id).limit(1)):
            db.add_all([
                User(id=1, handle="yiting.2048", name="Yiting", city="San Francisco", job="Product builder", bio="Sketches, games and good conversations.", interests="city sketches,cozy games,coffee", agent_discoverable=True, agent_chat_allowed=True, preference_note="I like curious, kind people and relaxed conversations."),
                User(id=2, handle="kai.2048", name="Kai", city="San Francisco", job="Product designer", bio="Coffee, art and indie games.", interests="city sketches,indie games,coffee", outfit="apricot", agent_discoverable=True, agent_chat_allowed=True),
                User(id=3, handle="maya.2048", name="Maya", city="San Francisco", job="Illustrator", bio="Always up for a sketch walk.", interests="city sketches,board games", outfit="sage", agent_discoverable=True, agent_chat_allowed=False),
                User(id=4, handle="leo.2048", name="Leo", city="Oakland", job="Engineer", bio="I don't post much; ask my agent about board games.", interests="board games,cozy games", outfit="navy", agent_discoverable=True, agent_chat_allowed=True),
                Circle(id=1, slug="sf-creatives", name="SF Creatives", description="Art, people and the city."),
                Circle(id=2, slug="art-games", name="Art & Games", description="Play, create and find your people."),
            ])
            db.flush()
            db.add_all([Membership(user_id=u, circle_id=c, follow=True, explore=u == 1) for u, c in [(1,1),(1,2),(2,1),(2,2),(3,1),(4,2)]])
            db.add_all([
                Post(author_id=3, circle_id=1, body="Any SF people up for a low-key sketch walk this weekend?", visibility="public"),
                Post(author_id=2, circle_id=1, body="Slow morning, good coffee, messy city sketches.", visibility="public"),
                Post(author_id=4, circle_id=None, body="A quiet board-game night sounds perfect.", visibility="friends"),
            ])
            db.commit()
    g = graph()
    if g:
        try:
            g.initialize()
            with SessionLocal() as db:
                for u in db.scalars(select(User)):
                    g.sync_person(u)
                for m in db.scalars(select(Membership)):
                    g.sync_membership(m.user_id, db.get(Circle, m.circle_id))
        finally:
            g.close()
    yield


app = FastAPI(title="Aeolia API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class PostIn(BaseModel):
    body: str = Field(default="", max_length=2200)
    media_url: str | None = None
    media_type: str = "text"
    visibility: str = "friends"
    circle_id: int | None = None


class SettingsIn(BaseModel):
    interests: str | None = None
    preference_note: str | None = None
    outfit: str | None = None
    agent_discoverable: bool | None = None
    agent_chat_allowed: bool | None = None


class ToggleIn(BaseModel):
    follow: bool | None = None
    explore: bool | None = None


class MessageIn(BaseModel):
    recipient_id: int
    body: str
    kind: str = "text"


class EventIn(BaseModel):
    title: str
    kind: str
    location: str | None = None
    starts_at: datetime | None = None


def user_view(u):
    return {"id": u.id, "handle": u.handle, "name": u.name, "city": u.city, "job": u.job, "bio": u.bio, "interests": u.interests.split(",") if u.interests else [], "outfit": u.outfit}


def is_blocked(db, a, b):
    return db.scalar(select(Block.id).where(or_((Block.owner_id == a) & (Block.target_id == b), (Block.owner_id == b) & (Block.target_id == a))).limit(1)) is not None


def mutual(db, a, b):
    return db.scalar(select(Follow.id).where(Follow.follower_id == a, Follow.followed_id == b)) is not None and db.scalar(select(Follow.id).where(Follow.follower_id == b, Follow.followed_id == a)) is not None


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/me")
def me(u: User = Depends(actor)):
    return {**user_view(u), "agent_discoverable": u.agent_discoverable, "agent_chat_allowed": u.agent_chat_allowed, "preference_note": u.preference_note}


@app.patch("/me")
def update_me(data: SettingsIn, u: User = Depends(actor), db: Session = Depends(get_db)):
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(u, key, value)
    db.commit()
    g = graph()
    if g:
        try:
            g.sync_person(u)
        finally:
            g.close()
    return me(u)


@app.get("/users/{user_id}")
def profile(user_id: int, db: Session = Depends(get_db), u: User = Depends(actor)):
    target = db.get(User, user_id)
    if not target or is_blocked(db, u.id, user_id):
        raise HTTPException(404, "Profile not found")
    return {**user_view(target), "mutual": mutual(db, u.id, user_id)}


@app.get("/users/by-id/{handle}")
def by_id(handle: str, db: Session = Depends(get_db), u: User = Depends(actor)):
    target = db.scalar(select(User).where(User.handle == handle))
    if not target or is_blocked(db, u.id, target.id):
        raise HTTPException(404, "Profile not found")
    return user_view(target)


@app.post("/users/{user_id}/follow")
def follow_user(user_id: int, db: Session = Depends(get_db), u: User = Depends(actor)):
    if user_id == u.id or not db.get(User, user_id) or is_blocked(db, u.id, user_id):
        raise HTTPException(400, "Cannot follow")
    if not db.scalar(select(Follow).where(Follow.follower_id == u.id, Follow.followed_id == user_id)):
        db.add(Follow(follower_id=u.id, followed_id=user_id))
        db.commit()
    return {"mutual": mutual(db, u.id, user_id)}


@app.get("/circles")
def circles(db: Session = Depends(get_db), u: User = Depends(actor)):
    out = []
    for c in db.scalars(select(Circle)):
        m = db.scalar(select(Membership).where(Membership.circle_id == c.id, Membership.user_id == u.id))
        out.append({"id": c.id, "name": c.name, "description": c.description, "follow": bool(m and m.follow), "explore": bool(m and m.explore)})
    return out


@app.patch("/circles/{circle_id}")
def toggle_circle(circle_id: int, data: ToggleIn, db: Session = Depends(get_db), u: User = Depends(actor)):
    c = db.get(Circle, circle_id)
    if not c:
        raise HTTPException(404, "Circle not found")
    m = db.scalar(select(Membership).where(Membership.circle_id == c.id, Membership.user_id == u.id))
    if not m:
        m = Membership(user_id=u.id, circle_id=c.id)
        db.add(m)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(m, key, value)
    db.commit()
    g = graph()
    if g:
        try:
            if m.explore:
                g.sync_membership(u.id, c)
        finally:
            g.close()
    return {"follow": m.follow, "explore": m.explore}


def can_view_post(db, post, viewer):
    return post.author_id == viewer.id or (not is_blocked(db, viewer.id, post.author_id) and (post.visibility == "public" or mutual(db, viewer.id, post.author_id)))


@app.get("/feed")
def feed(tab: str = "for_you", db: Session = Depends(get_db), u: User = Depends(actor)):
    followed = {x.circle_id for x in db.scalars(select(Membership).where(Membership.user_id == u.id, Membership.follow == True))}
    posts = list(db.scalars(select(Post).order_by(Post.created_at.desc(), Post.id.desc()).limit(100)))
    result = []
    for p in posts:
        friend = mutual(db, u.id, p.author_id) or p.author_id == u.id
        circle = p.circle_id in followed and p.visibility == "public"
        if can_view_post(db, p, u) and ((tab == "friends" and friend) or (tab == "circles" and circle) or (tab == "for_you" and (friend or circle))):
            result.append({"id": p.id, "author": user_view(db.get(User, p.author_id)), "body": p.body, "media_url": p.media_url, "media_type": p.media_type, "visibility": p.visibility, "circle_id": p.circle_id, "created_at": p.created_at.isoformat()})
    return result


@app.get("/circles/{circle_id}/posts")
def circle_posts(circle_id: int, db: Session = Depends(get_db), u: User = Depends(actor)):
    return [{"id": p.id, "author": user_view(db.get(User, p.author_id)), "body": p.body, "media_url": p.media_url, "media_type": p.media_type} for p in db.scalars(select(Post).where(Post.circle_id == circle_id, Post.visibility == "public").order_by(Post.id.desc())) if not is_blocked(db, u.id, p.author_id)]


@app.post("/posts")
def create_post(data: PostIn, db: Session = Depends(get_db), u: User = Depends(actor)):
    if data.visibility not in ("public", "friends") or data.media_type not in ("text", "image", "video"):
        raise HTTPException(400, "Invalid post type or visibility")
    if data.circle_id and (data.visibility != "public" or not db.get(Circle, data.circle_id)):
        raise HTTPException(400, "Circle posts must be public")
    if not data.body.strip() and not data.media_url:
        raise HTTPException(400, "Post cannot be empty")
    p = Post(author_id=u.id, **data.model_dump())
    db.add(p)
    db.commit()
    return {"id": p.id}


@app.delete("/posts/{post_id}")
def delete_post(post_id: int, db: Session = Depends(get_db), u: User = Depends(actor)):
    p = db.get(Post, post_id)
    if not p or p.author_id != u.id:
        raise HTTPException(404, "Post not found")
    db.delete(p)
    db.commit()
    return {"deleted": True}


@app.get("/messages/{other_id}")
def messages(other_id: int, db: Session = Depends(get_db), u: User = Depends(actor)):
    if not mutual(db, u.id, other_id) or is_blocked(db, u.id, other_id):
        raise HTTPException(403, "Mutual follow required")
    return [{"id": m.id, "sender_id": m.sender_id, "body": m.body, "kind": m.kind} for m in db.scalars(select(Message).where(or_((Message.sender_id == u.id) & (Message.recipient_id == other_id), (Message.sender_id == other_id) & (Message.recipient_id == u.id))).order_by(Message.id))]


@app.post("/messages")
def send_message(data: MessageIn, db: Session = Depends(get_db), u: User = Depends(actor)):
    if not mutual(db, u.id, data.recipient_id) or is_blocked(db, u.id, data.recipient_id):
        raise HTTPException(403, "Mutual follow required")
    if data.kind not in ("text", "image", "voice"):
        raise HTTPException(400, "Invalid message kind")
    m = Message(sender_id=u.id, recipient_id=data.recipient_id, body=data.body, kind=data.kind)
    db.add(m)
    db.commit()
    return {"id": m.id}


@app.post("/events")
def create_event(data: EventIn, db: Session = Depends(get_db), u: User = Depends(actor)):
    if data.kind not in ("game", "meetup"):
        raise HTTPException(400, "Expected game or meetup")
    e = Event(creator_id=u.id, title=data.title, kind=data.kind, location=data.location if data.kind == "meetup" else None, **({"starts_at": data.starts_at} if data.starts_at else {}))
    db.add(e)
    db.commit()
    return {"id": e.id}


@app.get("/events")
def events(db: Session = Depends(get_db), u: User = Depends(actor)):
    return [{"id": e.id, "title": e.title, "kind": e.kind, "location": e.location, "creator": user_view(db.get(User, e.creator_id))} for e in db.scalars(select(Event).order_by(Event.id.desc()))]


@app.post("/explore/{circle_id}")
def explore(circle_id: int, db: Session = Depends(get_db), u: User = Depends(actor)):
    permission = db.scalar(select(Membership).where(Membership.circle_id == circle_id, Membership.user_id == u.id, Membership.explore == True))
    if not permission or not u.agent_discoverable:
        raise HTTPException(403, "Enable agent exploration for this circle first")
    g = graph()
    if not g:
        raise HTTPException(503, "Neo4j unavailable; start docker compose")
    try:
        pool = g.candidates(u.id, circle_id)
    finally:
        g.close()
    for item in pool:
        other = db.get(User, item["id"])
        if not other or not other.agent_discoverable or is_blocked(db, u.id, other.id) or mutual(db, u.id, other.id):
            continue
        # Posts are read from Postgres with a fresh visibility check, never from graph cache.
        public_posts = list(db.scalars(select(Post).where(Post.author_id == other.id, Post.visibility == "public").limit(3)))
        shared = item["shared"] or []
        reason = ("You both mentioned " + ", ".join(shared[:2]) + ".") if shared else "Your agents crossed paths in this circle; get to know each other."
        if public_posts:
            reason += " Their public posts offer a conversation starter."
        encounter = Encounter(owner_id=u.id, candidate_id=other.id, circle_id=circle_id, reason=reason, evidence=json.dumps([{"post_id": p.id, "excerpt": p.body[:180]} for p in public_posts]), path=json.dumps(["circle:"+str(circle_id), "topic:"+shared[0] if shared else "chance", "user:"+str(other.id)]))
        db.add(encounter)
        db.commit()
        return {"id": encounter.id, "candidate": user_view(other), "reason": reason, "evidence": json.loads(encounter.evidence), "path": json.loads(encounter.path), "status": encounter.status}
    return {"id": None, "message": "No new encounter this time. Try again later."}


@app.get("/encounters")
def encounters(db: Session = Depends(get_db), u: User = Depends(actor)):
    return [{"id": e.id, "candidate": user_view(db.get(User, e.candidate_id)), "reason": e.reason, "status": e.status} for e in db.scalars(select(Encounter).where(Encounter.owner_id == u.id).order_by(Encounter.id.desc()))]


@app.get("/encounters/{encounter_id}")
def encounter_detail(encounter_id: int, db: Session = Depends(get_db), u: User = Depends(actor)):
    e = db.get(Encounter, encounter_id)
    if not e or u.id not in (e.owner_id, e.candidate_id):
        raise HTTPException(404, "Encounter not found")
    # Recheck post visibility before exposing previously captured evidence.
    evidence = [x for x in json.loads(e.evidence) if (p := db.get(Post, x["post_id"])) and p.visibility == "public"]
    return {"id": e.id, "reason": e.reason, "path": json.loads(e.path), "evidence": evidence, "status": e.status, "turns": [{"speaker_id": t.speaker_id, "body": t.body} for t in db.scalars(select(AgentTurn).where(AgentTurn.encounter_id == e.id).order_by(AgentTurn.id))]}


@app.post("/encounters/{encounter_id}/agent-chat")
def agent_chat(encounter_id: int, db: Session = Depends(get_db), u: User = Depends(actor)):
    e = db.get(Encounter, encounter_id)
    if not e or u.id not in (e.owner_id, e.candidate_id):
        raise HTTPException(404, "Encounter not found")
    a, b = db.get(User, e.owner_id), db.get(User, e.candidate_id)
    if not a.agent_chat_allowed or not b.agent_chat_allowed or is_blocked(db, a.id, b.id):
        raise HTTPException(403, "Both people must opt in to agent chat")
    if db.scalar(select(AgentTurn.id).where(AgentTurn.encounter_id == e.id)):
        return encounter_detail(encounter_id, db, u)
    # Explicit deterministic demo transcript: replace with a moderated LLM worker in production.
    topic = next(iter(set(a.interests.split(",")) & set(b.interests.split(","))), "this circle")
    db.add_all([AgentTurn(encounter_id=e.id, speaker_id=a.id, body=f"My person likes {topic}. Is that something your person enjoys too?"), AgentTurn(encounter_id=e.id, speaker_id=b.id, body=f"Yes, {topic} sounds like a good place to start a conversation.")])
    e.status = "agent_chatted"
    db.commit()
    return encounter_detail(encounter_id, db, u)
