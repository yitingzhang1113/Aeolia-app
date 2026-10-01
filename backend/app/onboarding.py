"""First-run onboarding contract.

The mobile UI can save each step locally and submit this payload after identity
verification. Public profile data and private discovery rules remain separate.
"""
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class OnboardingProfile(BaseModel):
    display_name: str = Field(min_length=1, max_length=80)
    age: int = Field(ge=18, le=99)
    height_cm: int | None = Field(default=None, ge=100, le=230)
    ethnicity: str = Field(default="", max_length=80)
    city: str = Field(default="", max_length=80)
    school: str = Field(default="", max_length=120)
    education_level: str = Field(default="", max_length=80)
    field_of_study: str = Field(default="", max_length=100)
    job: str = Field(default="", max_length=100)
    company: str = Field(default="", max_length=100)
    bio: str = Field(default="", max_length=600)
    interests: list[str] = Field(default_factory=list, max_length=20)
    languages: list[str] = Field(default_factory=list, max_length=10)
    lifestyle: list[str] = Field(default_factory=list, max_length=12)
    intents: list[Literal["friendship", "dating", "networking", "activities"]] = Field(
        default_factory=lambda: ["friendship"]
    )
    looking_for: str = Field(default="", max_length=300)
    photo_ids: list[str] = Field(default_factory=list, min_length=1, max_length=6)

    @field_validator("ethnicity")
    @classmethod
    def self_declared_ethnicity(cls, value):
        # This is only a user-entered string. No inference path exists here.
        return value.strip()


class OnboardingState(BaseModel):
    completed: bool
    required_steps: list[str]
    privacy: dict


def initial_state():
    return OnboardingState(
        completed=False,
        required_steps=[
            "verify_identity",
            "basic_profile",
            "profile_photos",
            "education_and_work",
            "interests_and_lifestyle",
            "social_intent",
            "private_discovery_rules",
            "create_elf",
        ],
        privacy={
            "profile_photos_in_elf_context": False,
            "private_rules_visible_to_others": False,
            "connect_requires_human_action": True,
            "ethnicity_inference_from_media": False,
        },
    )
