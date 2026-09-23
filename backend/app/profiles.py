import json
from typing import Literal
from urllib.parse import urlparse

from pydantic import BaseModel, Field, field_validator

from .models import ProfileDetails, SocialProfile


class PromptAnswer(BaseModel):
    question: str = Field(min_length=1, max_length=100)
    answer: str = Field(max_length=300)


class ProfileIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    age: int = Field(ge=18, le=99)
    height_cm: int | None = Field(default=None, ge=100, le=230)
    intent: Literal["friendship", "dating"] = "friendship"
    looking_for: str = Field(default="", max_length=200)
    bio: str = Field(default="", max_length=600)
    job: str = Field(default="", max_length=80)
    school: str = Field(default="", max_length=100)
    interests: list[str] = Field(default_factory=list, max_length=12)
    languages: list[str] = Field(default_factory=list, max_length=8)
    lifestyle: list[str] = Field(default_factory=list, max_length=8)
    music_artists: list[str] = Field(default_factory=list, max_length=8)
    music_genres: list[str] = Field(default_factory=list, max_length=8)
    music_url: str = Field(default="", max_length=500)
    prompts: list[PromptAnswer] = Field(default_factory=list, max_length=3)
    minimum_height_cm: int | None = Field(default=None, ge=100, le=230)

    @field_validator("interests", "languages", "lifestyle", "music_artists", "music_genres")
    @classmethod
    def bounded_tags(cls, values):
        if any(not value.strip() or len(value) > 60 for value in values):
            raise ValueError("Each tag must contain 1–60 characters")
        return list(dict.fromkeys(value.strip() for value in values))

    @field_validator("music_url")
    @classmethod
    def music_link(cls, value):
        if not value:
            return value
        parsed = urlparse(value)
        if parsed.scheme != "https" or parsed.hostname not in {"open.spotify.com", "music.apple.com", "soundcloud.com", "music.youtube.com"} or parsed.username or parsed.password:
            raise ValueError("Use an HTTPS Spotify, Apple Music, SoundCloud or YouTube Music link")
        return value


def save_profile(db, user, data):
    user.name, user.bio, user.job = data.name.strip(), data.bio.strip(), data.job.strip()
    user.interests = ",".join(data.interests)
    social = db.get(SocialProfile, user.id)
    if not social:
        social = SocialProfile(user_id=user.id)
        db.add(social)
    social.age, social.height_cm, social.intent = data.age, data.height_cm, data.intent
    social.minimum_height_cm = data.minimum_height_cm if data.intent == "dating" else None
    details = db.get(ProfileDetails, user.id)
    if not details:
        details = ProfileDetails(user_id=user.id)
        db.add(details)
    details.data = json.dumps(data.model_dump(include={"looking_for", "school", "languages", "lifestyle", "music_artists", "music_genres", "music_url", "prompts"}))
    db.commit()
    db.expire(user, ["social", "details"])
