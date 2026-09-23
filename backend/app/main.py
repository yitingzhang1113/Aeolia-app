import json
import logging
import os
import random
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import create_engine, func, or_, select
from sqlalchemy.orm import Session, sessionmaker

from .ai import AIUnavailable, configured, respond
from .avatar import register_avatar
from .discovery import discuss_and_assess
from .location import distance_km
from .profiles import ProfileIn, save_profile
from .migrations import allow_location_encounters
from .graph import Graph
from .media import post_media, register_media
from .models import MatchChoice, UserLocation, SocialProfile, AgentAssessment, AgentTurn, Base, Block, Circle, Encounter, Event, Follow, Membership, Message, Post, User, MediaAsset, PostAsset, PostSubmission

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

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
    g = None
    try:
        g = Graph()
        g.driver.verify_connectivity()
        return g
    except Exception:
        if g:
            g.close()
        logging.getLogger(__name__).warning("Neo4j unavailable; check the service and NEO4J settings")
        return None


@asynccontextmanager
async def lifespan(app: FastAPI):
    allow_location_encounters(engine)
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        if not db.scalar(select(User.id).limit(1)):
            db.add_all([
                User(id=1, handle="yiting.2048", name="Yiting", city="San Francisco", job="Product builder", bio="Sketches, games and good conversations.", interests="city sketches,cozy games,coffee", agent_discoverable=True, agent_chat_allowed=True, preference_note="I like curious, kind people and relaxed conversations."),
                User(id=2, handle="kai.2048", name="Kai", city="San Francisco", job="Product designer", bio="Coffee, art and indie games.", interests="city sketches,indie games,coffee", outfit="apricot", agent_discoverable=True, agent_chat_allowed=True),
                User(id=3, handle="maya.2048", name="Maya", city="San Francisco", job="Illustrator", bio="Always up for a sketch walk.", interests="city sketches,board games", outfit="sage", agent_discoverable=True, agent_chat_allowed=False),
                User(id=4, handle="leo.2048", name="Leo", city="Oakland", job="Engineer", bio="I don't post much; ask my agent about board games.", interests="board games,cozy games", outfit="navy", agent_discoverable=True, agent_chat_allowed=True),
                Circle(id=1, slug="art-creativity", name="Art & Creativity", description="Art, people and the city."),
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
    media_ids: list[str] = Field(default_factory=list, max_length=10)
    cover_media_id: str | None = None
    request_id: str | None = Field(default=None, max_length=80)


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


class AgentRequest(BaseModel):
    message: str = Field(min_length=1, max_length=1000)
    api_key: str | None = Field(default=None, max_length=512)


class AgentChatRequest(BaseModel):
    api_key: str | None = Field(default=None, max_length=512)


@app.get("/agent/status")
def agent_status():
    return {"server_ai_configured": configured(), "bring_your_own_key": True}


@app.post("/agent/reply")
def agent_reply(data: AgentRequest, u: User = Depends(actor)):
    system = ("You are the member's friendly Aeolia social companion. Help them clarify friendship "
              "preferences without claiming to be the member. Never reveal their private notes to another person. "
              "Keep your reply concise. Their private preferences: " + u.preference_note[:700])
    try:
        return {"reply": respond(system, data.message, data.api_key)}
    except AIUnavailable as error:
        raise HTTPException(503, str(error)) from error


def user_view(u):
    return {"profile": json.loads(u.details.data) if u.details else {},
            "avatar_url": f"/media/{u.avatar.asset_id}" if u.avatar else None, "age": u.social.age if u.social else None, "height_cm": u.social.height_cm if u.social else None,
            "intent": u.social.intent if u.social else "friendship", "id": u.id, "handle": u.handle, "name": u.name, "city": u.city, "job": u.job, "bio": u.bio, "interests": u.interests.split(",") if u.interests else [], "outfit": u.outfit}


def is_blocked(db, a, b):
    return db.scalar(select(Block.id).where(or_((Block.owner_id == a) & (Block.target_id == b), (Block.owner_id == b) & (Block.target_id == a))).limit(1)) is not None


def mutual(db, a, b):
    return db.scalar(select(Follow.id).where(Follow.follower_id == a, Follow.followed_id == b)) is not None and db.scalar(select(Follow.id).where(Follow.follower_id == b, Follow.followed_id == a)) is not None


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/me")
def me(u: User = Depends(actor), db: Session = Depends(get_db)):
    location = db.get(UserLocation, u.id)
    return {**user_view(u), "minimum_height_cm": u.social.minimum_height_cm if u.social else None, "location": {"latitude": location.latitude, "longitude": location.longitude, "radius_km": location.radius_km} if location else None, "agent_discoverable": u.agent_discoverable, "agent_chat_allowed": u.agent_chat_allowed, "preference_note": u.preference_note}


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
    return me(u, db)


@app.put("/me/profile")
def update_profile(data: ProfileIn, db: Session = Depends(get_db), u: User = Depends(actor)):
    save_profile(db, u, data)
    g = graph()
    if g:
        try:
            g.sync_person(u)
        finally:
            g.close()
    return me(u, db)


class LocationIn(BaseModel):
    city: str = Field(min_length=1, max_length=80)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    radius_km: int = Field(default=25, ge=1, le=100)


@app.put("/me/location")
def set_location(data: LocationIn, db: Session = Depends(get_db), u: User = Depends(actor)):
    location = db.get(UserLocation, u.id)
    if not location:
        location = UserLocation(user_id=u.id)
        db.add(location)
    u.city = data.city.strip()
    if not u.city:
        raise HTTPException(422, "Enter your city")
    location.latitude = round(data.latitude, 2)
    location.longitude = round(data.longitude, 2)
    location.radius_km = data.radius_km
    db.commit()
    return me(u, db)


@app.delete("/me/location")
def clear_location(db: Session = Depends(get_db), u: User = Depends(actor)):
    location = db.get(UserLocation, u.id)
    if location:
        db.delete(location)
        db.commit()
    return me(u, db)


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


register_media(app, get_db, actor, can_view_post)
register_avatar(app, get_db, actor)


def post_view(db, p):
    return {"id": p.id, "author": user_view(db.get(User, p.author_id)), "body": p.body,
            "media_url": p.media_url, "media_type": p.media_type, "visibility": p.visibility,
            "circle_id": p.circle_id, "created_at": p.created_at.isoformat(), **post_media(db, p)}


@app.get("/feed")
def feed(tab: str = "for_you", db: Session = Depends(get_db), u: User = Depends(actor)):
    followed = {x.circle_id for x in db.scalars(select(Membership).where(Membership.user_id == u.id, Membership.follow == True))}
    posts = list(db.scalars(select(Post).order_by(Post.created_at.desc(), Post.id.desc()).limit(100)))
    result = []
    for p in posts:
        friend = mutual(db, u.id, p.author_id) or p.author_id == u.id
        circle = p.circle_id in followed and p.visibility == "public"
        if can_view_post(db, p, u) and ((tab == "friends" and friend) or (tab == "circles" and circle) or (tab == "for_you" and (friend or circle))):
            result.append(post_view(db, p))
    return result


@app.get("/circles/{circle_id}/posts")
def circle_posts(circle_id: int, db: Session = Depends(get_db), u: User = Depends(actor)):
    return [post_view(db, p) for p in db.scalars(select(Post).where(Post.circle_id == circle_id, Post.visibility == "public").order_by(Post.id.desc())) if not is_blocked(db, u.id, p.author_id)]


@app.post("/posts")
def create_post(data: PostIn, db: Session = Depends(get_db), u: User = Depends(actor)):
    if data.request_id:
        previous = db.scalar(select(PostSubmission).where(PostSubmission.owner_id == u.id, PostSubmission.request_id == data.request_id))
        if previous:
            return {"id": previous.post_id}
    if data.visibility not in ("public", "friends") or data.media_type not in ("text", "image", "video"):
        raise HTTPException(400, "Invalid post type or visibility")
    if data.circle_id and (data.visibility != "public" or not db.get(Circle, data.circle_id)):
        raise HTTPException(400, "Circle posts must be public")
    if not data.body.strip() and not data.media_url and not data.media_ids:
        raise HTTPException(400, "Post cannot be empty")
    if len(set(data.media_ids)) != len(data.media_ids):
        raise HTTPException(400, "Duplicate media selection")
    assets = [db.get(MediaAsset, asset_id) for asset_id in data.media_ids]
    if any(not asset or asset.owner_id != u.id for asset in assets):
        raise HTTPException(403, "You can only attach your own uploads")
    if assets and not (all(a.kind == "image" for a in assets) or (len(assets) == 1 and assets[0].kind == "video")):
        raise HTTPException(400, "Choose up to 10 photos or one video")
    cover = db.get(MediaAsset, data.cover_media_id) if data.cover_media_id else None
    if data.cover_media_id and (not cover or cover.owner_id != u.id or cover.kind != "image" or not assets or assets[0].kind != "video"):
        raise HTTPException(400, "A video cover must be an image you uploaded")
    values = data.model_dump(exclude={"media_ids", "cover_media_id", "request_id"})
    if assets:
        values.update(media_type=assets[0].kind, media_url=None)
    p = Post(author_id=u.id, **values)
    db.add(p)
    db.flush()
    for position, asset in enumerate(assets):
        db.add(PostAsset(post_id=p.id, asset_id=asset.id, position=position))
    if cover:
        db.add(PostAsset(post_id=p.id, asset_id=cover.id, position=-1))
    if data.request_id:
        db.add(PostSubmission(owner_id=u.id, request_id=data.request_id, post_id=p.id))
    db.commit()
    return {"id": p.id}


@app.delete("/posts/{post_id}")
def delete_post(post_id: int, db: Session = Depends(get_db), u: User = Depends(actor)):
    p = db.get(Post, post_id)
    if not p or p.author_id != u.id:
        raise HTTPException(404, "Post not found")
    for link in db.scalars(select(PostAsset).where(PostAsset.post_id == p.id)):
        db.delete(link)
    for submission in db.scalars(select(PostSubmission).where(PostSubmission.post_id == p.id)):
        db.delete(submission)
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


def public_agent_profile(db, user):
    social = db.get(SocialProfile, user.id)
    posts = list(db.scalars(select(Post).where(Post.author_id == user.id, Post.visibility == "public").order_by(Post.id.desc()).limit(3)))
    return {"id": user.id, "name": user.name, "city": user.city, "bio": user.bio, "interests": user.interests.split(","),
            "intent": social.intent if social else "friendship", "height_cm": social.height_cm if social else None,
            "profile": json.loads(user.details.data) if user.details else {},
            "posts": [{"post_id": p.id, "excerpt": p.body[:180]} for p in posts]}


def screen_encounter(db, encounter, key=None):
    a, b = db.get(User, encounter.owner_id), db.get(User, encounter.candidate_id)
    if not a.agent_chat_allowed or not b.agent_chat_allowed or is_blocked(db, a.id, b.id):
        raise HTTPException(403, "Both people must opt in to agent chat")
    if encounter.id is not None and db.get(AgentAssessment, encounter.id):
        return
    try:
        turns, decision = discuss_and_assess(public_agent_profile(db, a), public_agent_profile(db, b),
                                            db.get(Circle, encounter.circle_id).name if encounter.circle_id else "Nearby people", respond, key, a.preference_note)
    except AIUnavailable as error:
        raise HTTPException(503, str(error)) from error
    # Recheck consent after model calls, before storing a recommendation.
    db.refresh(a)
    db.refresh(b)
    if not a.agent_chat_allowed or not b.agent_chat_allowed or not a.agent_discoverable or not b.agent_discoverable or is_blocked(db, a.id, b.id):
        raise HTTPException(403, "Agent permissions changed during this conversation")
    db.add(encounter)
    db.flush()
    for old in db.scalars(select(AgentTurn).where(AgentTurn.encounter_id == encounter.id)):
        db.delete(old)
    db.add_all([AgentTurn(encounter_id=encounter.id, speaker_id=t["speaker_id"], body=t["body"]) for t in turns])
    db.add(AgentAssessment(encounter_id=encounter.id, recommend=decision["recommend"],
                           reason=decision["reason"], citations=json.dumps(decision["citations"])))
    encounter.reason = decision["reason"]
    encounter.status = "recommended" if decision["recommend"] else "screened_out"
    db.commit()


def recommendation_visible(db, e, user):
    other = db.get(User, e.candidate_id)
    assessment = db.get(AgentAssessment, e.id)
    choice = db.scalar(select(MatchChoice).where(MatchChoice.user_id == user.id, MatchChoice.other_id == e.candidate_id))
    return (not (choice and choice.choice == "passed") and assessment and assessment.recommend and e.status == "recommended"
            and user.agent_chat_allowed and user.agent_discoverable and other
            and other.agent_chat_allowed and other.agent_discoverable and not is_blocked(db, user.id, other.id))


@app.post("/explore/nearby")
def explore_nearby(data: AgentChatRequest | None = None, db: Session = Depends(get_db), u: User = Depends(actor)):
    if not u.agent_discoverable or not u.agent_chat_allowed:
        raise HTTPException(403, "Enable discovery and agent conversations in Settings")
    location = db.get(UserLocation, u.id)
    if not location:
        raise HTTPException(400, "Set your location before using Near me")
    pool = []
    for other_location in db.scalars(select(UserLocation).where(UserLocation.user_id != u.id)):
        if distance_km(location, other_location) <= location.radius_km:
            other = db.get(User, other_location.user_id)
            shared = sorted(set(u.interests.split(",")) & set(other.interests.split(",")))
            pool.append({"id": other.id, "shared": shared})
    random.shuffle(pool)
    return screen_candidates(pool, None, data, db, u)


@app.post("/explore/{circle_id}")
def explore(circle_id: int, data: AgentChatRequest | None = None, db: Session = Depends(get_db), u: User = Depends(actor)):
    permission = db.scalar(select(Membership).where(Membership.circle_id == circle_id, Membership.user_id == u.id, Membership.explore == True))
    if not permission or not u.agent_discoverable:
        raise HTTPException(403, "Enable agent exploration for this circle first")
    if not u.agent_chat_allowed:
        raise HTTPException(403, "Allow agent conversations in Settings before exploring")
    g = graph()
    if not g:
        raise HTTPException(503, "Neo4j unavailable; start docker compose")
    try:
        pool = g.candidates(u.id, circle_id)
    finally:
        g.close()
    return screen_candidates(pool, circle_id, data, db, u)


def screen_candidates(pool, circle_id, data, db, u):
    checked = 0
    # Keep randomized tie order while spending model calls on plausible shared interests.
    pool.sort(key=lambda item: len(item["shared"] or []), reverse=True)
    for item in pool:
        other = db.get(User, item["id"])
        if not other or not other.agent_discoverable or not other.agent_chat_allowed or is_blocked(db, u.id, other.id) or mutual(db, u.id, other.id):
            continue
        preference, profile = db.get(SocialProfile, u.id), db.get(SocialProfile, other.id)
        if preference and ((profile.intent if profile else "friendship") != preference.intent
                or (preference.required_city and other.city != preference.required_city)
                or (preference.minimum_height_cm and (not profile or profile.height_cm is None or profile.height_cm < preference.minimum_height_cm))):
            continue
        if profile and ((profile.intent == "dating" and not (preference and preference.intent == "dating"))
                or (profile.minimum_height_cm and (not preference or preference.height_cm is None or preference.height_cm < profile.minimum_height_cm))
                or (profile.required_city and u.city != profile.required_city)):
            continue
        if db.scalar(select(Encounter.id).join(AgentAssessment).where(Encounter.owner_id == u.id, Encounter.candidate_id == other.id, Encounter.status.in_(["recommended", "screened_out"]))):
            continue
        public = public_agent_profile(db, other)
        shared = item["shared"] or []
        encounter = Encounter(owner_id=u.id, candidate_id=other.id, circle_id=circle_id, reason="", status="screening",
                              evidence=json.dumps(public["posts"]), path=json.dumps(["circle:"+str(circle_id) if circle_id else "Nearby", "topic:"+shared[0] if shared else "chance", "user:"+str(other.id)]))
        screen_encounter(db, encounter, data.api_key if data else None)
        checked += 1
        if encounter.status == "recommended":
            return encounter_detail(encounter.id, db, u)
        if checked >= 3:
            break
    return {"id": None, "message": "Your agent hasn't found a new match to recommend after screening. Try another circle or explore again."}


@app.get("/encounters")
def encounters(db: Session = Depends(get_db), u: User = Depends(actor)):
    return [encounter_detail(e.id, db, u) for e in db.scalars(select(Encounter).where(Encounter.owner_id == u.id, Encounter.status == "recommended").order_by(Encounter.id.desc())) if recommendation_visible(db, e, u)]


@app.get("/encounters/{encounter_id}")
def encounter_detail(encounter_id: int, db: Session = Depends(get_db), u: User = Depends(actor)):
    e = db.get(Encounter, encounter_id)
    if not e or u.id not in (e.owner_id, e.candidate_id):
        raise HTTPException(404, "Encounter not found")
    a, b = db.get(User, e.owner_id), db.get(User, e.candidate_id)
    if is_blocked(db, a.id, b.id) or not a.agent_chat_allowed or not b.agent_chat_allowed:
        raise HTTPException(403, "Agent conversation is no longer available")
    evidence = [x for x in json.loads(e.evidence) if (p := db.get(Post, x["post_id"])) and p.visibility == "public"]
    assessment = db.get(AgentAssessment, e.id)
    return {"id": e.id, "candidate": user_view(b), "reason": e.reason if u.id == a.id else "Your agents exchanged public information.", "path": json.loads(e.path),
            "evidence": evidence, "status": e.status, "match_status": match_status(db, u.id, b.id if u.id == a.id else a.id),
            "assessment": {"recommend": assessment.recommend, "reason": assessment.reason,
                           "citations": json.loads(assessment.citations)} if assessment and u.id == a.id else None,
            "turns": [{"speaker_id": t.speaker_id, "body": t.body} for t in db.scalars(select(AgentTurn).where(AgentTurn.encounter_id == e.id).order_by(AgentTurn.id))]}


@app.post("/encounters/{encounter_id}/agent-chat")
def agent_chat(encounter_id: int, data: AgentChatRequest, db: Session = Depends(get_db), u: User = Depends(actor)):
    e = db.get(Encounter, encounter_id)
    if not e or u.id not in (e.owner_id, e.candidate_id):
        raise HTTPException(404, "Encounter not found")
    screen_encounter(db, e, data.api_key)
    return encounter_detail(encounter_id, db, u)


def match_status(db, user_id, other_id):
    choices = {c.user_id: c.choice for c in db.scalars(select(MatchChoice).where(
        or_((MatchChoice.user_id == user_id) & (MatchChoice.other_id == other_id),
            (MatchChoice.user_id == other_id) & (MatchChoice.other_id == user_id))))}
    if choices.get(user_id) == "passed":
        return "passed"
    if choices.get(user_id) == "interested" and choices.get(other_id) == "interested":
        return "matched"
    if choices.get(user_id) == "interested":
        return "pending"
    return "incoming" if choices.get(other_id) == "interested" else "undecided"


class MatchDecisionIn(BaseModel):
    choice: str


@app.post("/encounters/{encounter_id}/decision")
def decide_match(encounter_id: int, data: MatchDecisionIn, db: Session = Depends(get_db), u: User = Depends(actor)):
    if data.choice not in {"interested", "passed"}:
        raise HTTPException(422, "Choose interested or passed")
    e = db.get(Encounter, encounter_id)
    assessment = db.get(AgentAssessment, encounter_id)
    if not e or u.id not in {e.owner_id, e.candidate_id} or not assessment or not assessment.recommend or e.status != "recommended":
        raise HTTPException(404, "Recommendation not found")
    other_id = e.candidate_id if u.id == e.owner_id else e.owner_id
    if is_blocked(db, u.id, other_id):
        raise HTTPException(404, "Recommendation not found")
    if match_status(db, u.id, other_id) == "matched":
        return {"status": "matched"}
    choice = db.scalar(select(MatchChoice).where(MatchChoice.user_id == u.id, MatchChoice.other_id == other_id))
    if not choice:
        choice = MatchChoice(user_id=u.id, other_id=other_id)
        db.add(choice)
    choice.choice = data.choice
    db.flush()
    state = match_status(db, u.id, other_id)
    if state == "matched":
        for left, right in ((u.id, other_id), (other_id, u.id)):
            if not db.scalar(select(Follow.id).where(Follow.follower_id == left, Follow.followed_id == right)):
                db.add(Follow(follower_id=left, followed_id=right))
    db.commit()
    return {"status": state}


@app.get("/match-requests")
def match_requests(db: Session = Depends(get_db), u: User = Depends(actor)):
    result = []
    for choice in db.scalars(select(MatchChoice).where(MatchChoice.other_id == u.id, MatchChoice.choice == "interested")):
        if match_status(db, u.id, choice.user_id) != "incoming" or is_blocked(db, u.id, choice.user_id):
            continue
        encounter = db.scalar(select(Encounter).join(AgentAssessment).where(
            Encounter.owner_id == choice.user_id, Encounter.candidate_id == u.id, AgentAssessment.recommend == True))
        if encounter:
            detail = encounter_detail(encounter.id, db, u)
            detail["candidate"] = user_view(db.get(User, choice.user_id))
            result.append(detail)
    return result
