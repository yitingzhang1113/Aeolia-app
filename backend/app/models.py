from datetime import datetime, timezone
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def now():
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    handle: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(80))
    city: Mapped[str] = mapped_column(String(80), default="")
    job: Mapped[str] = mapped_column(String(80), default="")
    bio: Mapped[str] = mapped_column(Text, default="")
    interests: Mapped[str] = mapped_column(Text, default="")
    outfit: Mapped[str] = mapped_column(String(40), default="teal")
    agent_discoverable: Mapped[bool] = mapped_column(Boolean, default=False)
    agent_chat_allowed: Mapped[bool] = mapped_column(Boolean, default=False)
    preference_note: Mapped[str] = mapped_column(Text, default="")


class Circle(Base):
    __tablename__ = "circles"
    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(80), unique=True)
    name: Mapped[str] = mapped_column(String(80))
    description: Mapped[str] = mapped_column(Text, default="")


class Membership(Base):
    __tablename__ = "memberships"
    __table_args__ = (UniqueConstraint("user_id", "circle_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    circle_id: Mapped[int] = mapped_column(ForeignKey("circles.id"))
    follow: Mapped[bool] = mapped_column(Boolean, default=False)
    explore: Mapped[bool] = mapped_column(Boolean, default=False)


class Follow(Base):
    __tablename__ = "follows"
    __table_args__ = (UniqueConstraint("follower_id", "followed_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    follower_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    followed_id: Mapped[int] = mapped_column(ForeignKey("users.id"))


class Post(Base):
    __tablename__ = "posts"
    id: Mapped[int] = mapped_column(primary_key=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    circle_id: Mapped[int | None] = mapped_column(ForeignKey("circles.id"), nullable=True)
    body: Mapped[str] = mapped_column(Text, default="")
    media_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    media_type: Mapped[str] = mapped_column(String(12), default="text")
    visibility: Mapped[str] = mapped_column(String(12), default="friends")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Message(Base):
    __tablename__ = "messages"
    id: Mapped[int] = mapped_column(primary_key=True)
    sender_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    recipient_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    body: Mapped[str] = mapped_column(Text)
    kind: Mapped[str] = mapped_column(String(12), default="text")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Encounter(Base):
    __tablename__ = "encounters"
    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    candidate_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    circle_id: Mapped[int] = mapped_column(ForeignKey("circles.id"))
    reason: Mapped[str] = mapped_column(Text)
    evidence: Mapped[str] = mapped_column(Text, default="[]")
    path: Mapped[str] = mapped_column(Text, default="[]")
    status: Mapped[str] = mapped_column(String(24), default="suggested")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class AgentTurn(Base):
    __tablename__ = "agent_turns"
    id: Mapped[int] = mapped_column(primary_key=True)
    encounter_id: Mapped[int] = mapped_column(ForeignKey("encounters.id"))
    speaker_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Event(Base):
    __tablename__ = "events"
    id: Mapped[int] = mapped_column(primary_key=True)
    creator_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    title: Mapped[str] = mapped_column(String(100))
    kind: Mapped[str] = mapped_column(String(16))
    location: Mapped[str | None] = mapped_column(String(100), nullable=True)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Block(Base):
    __tablename__ = "blocks"
    __table_args__ = (UniqueConstraint("owner_id", "target_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    target_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
