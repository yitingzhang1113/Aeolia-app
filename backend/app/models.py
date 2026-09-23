from datetime import datetime, timezone
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


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
    details: Mapped["ProfileDetails | None"] = relationship(uselist=False)
    social: Mapped["SocialProfile | None"] = relationship(uselist=False)
    avatar: Mapped["AgentAvatar | None"] = relationship(uselist=False)


class AgentAvatar(Base):
    __tablename__ = "agent_avatars"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    asset_id: Mapped[str] = mapped_column(ForeignKey("media_assets.id"))


class ProfileDetails(Base):
    __tablename__ = "profile_details"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    data: Mapped[str] = mapped_column(Text, default="{}")


class Circle(Base):
    __tablename__ = "circles"
    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(80), unique=True)
    name: Mapped[str] = mapped_column(String(80))
    description: Mapped[str] = mapped_column(Text, default="")


class SocialProfile(Base):
    __tablename__ = "social_profiles"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    intent: Mapped[str] = mapped_column(String(20), default="friendship")
    age: Mapped[int] = mapped_column(Integer)
    height_cm: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Private hard constraints, never sent to the other member's agent.
    minimum_height_cm: Mapped[int | None] = mapped_column(Integer, nullable=True)
    required_city: Mapped[str | None] = mapped_column(String(80), nullable=True)


class UserLocation(Base):
    __tablename__ = "user_locations"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    radius_km: Mapped[int] = mapped_column(Integer, default=25)


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
    circle_id: Mapped[int | None] = mapped_column(ForeignKey("circles.id"), nullable=True)
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


class AgentAssessment(Base):
    __tablename__ = "agent_assessments"
    encounter_id: Mapped[int] = mapped_column(ForeignKey("encounters.id"), primary_key=True)
    recommend: Mapped[bool] = mapped_column(Boolean)
    reason: Mapped[str] = mapped_column(Text)
    # Exact excerpts from saved dialogue, using one-based turn numbers.
    citations: Mapped[str] = mapped_column(Text)


class MatchChoice(Base):
    __tablename__ = "match_choices"
    __table_args__ = (UniqueConstraint("user_id", "other_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    other_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    choice: Mapped[str] = mapped_column(String(16))


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


class MediaAsset(Base):
    __tablename__ = "media_assets"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    mime_type: Mapped[str] = mapped_column(String(64))
    kind: Mapped[str] = mapped_column(String(12))
    size: Mapped[int] = mapped_column(Integer)


class PostAsset(Base):
    __tablename__ = "post_assets"
    __table_args__ = (UniqueConstraint("post_id", "position"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    post_id: Mapped[int] = mapped_column(ForeignKey("posts.id"))
    asset_id: Mapped[str] = mapped_column(ForeignKey("media_assets.id"))
    # -1 is the video cover; 0..9 preserve photo selection order.
    position: Mapped[int] = mapped_column(Integer)


class PostSubmission(Base):
    __tablename__ = "post_submissions"
    __table_args__ = (UniqueConstraint("owner_id", "request_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    request_id: Mapped[str] = mapped_column(String(80))
    post_id: Mapped[int] = mapped_column(ForeignKey("posts.id"))
