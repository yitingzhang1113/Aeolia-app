"""Private discovery policy for social-first, personal-AI-assisted matching.

Hard rules run before any model call. Rules are member-owned and must never be
included in another member's agent context or rejection explanation.
"""
import json
from typing import Any

from pydantic import BaseModel, Field, field_validator

from .models import DiscoveryPolicy, SocialProfile


ALLOWED_FIELDS = {
    "age", "height_cm", "city", "intent", "school", "job", "ethnicity",
    "languages", "interests", "lifestyle",
}
ALLOWED_STRENGTHS = {"hard", "strong", "soft"}
ALLOWED_OPS = {"eq", "in", "contains_any", "contains_all", "gte", "lte"}


class PreferenceRule(BaseModel):
    field: str
    op: str = "eq"
    value: Any
    strength: str = "hard"
    label: str = Field(default="", max_length=80)

    @field_validator("field")
    @classmethod
    def field_allowed(cls, value):
        if value not in ALLOWED_FIELDS:
            raise ValueError("Unsupported discovery field")
        return value

    @field_validator("op")
    @classmethod
    def op_allowed(cls, value):
        if value not in ALLOWED_OPS:
            raise ValueError("Unsupported discovery operator")
        return value

    @field_validator("strength")
    @classmethod
    def strength_allowed(cls, value):
        if value not in ALLOWED_STRENGTHS:
            raise ValueError("Use hard, strong or soft")
        return value


class IntentPolicy(BaseModel):
    enabled: bool = True
    rules: list[PreferenceRule] = Field(default_factory=list, max_length=30)


class DiscoveryPolicyIn(BaseModel):
    friendship: IntentPolicy = Field(default_factory=IntentPolicy)
    dating: IntentPolicy = Field(default_factory=IntentPolicy)
    people_per_week: int = Field(default=5, ge=0, le=100)
    max_turns_per_person: int = Field(default=8, ge=2, le=30)
    max_tokens_per_person: int = Field(default=2500, ge=500, le=20000)
    show_near_matches: bool = False


def policy_document(policy: DiscoveryPolicy | None):
    if not policy:
        return {"friendship": {"enabled": True, "rules": []}, "dating": {"enabled": True, "rules": []}}
    try:
        value = json.loads(policy.rules)
        return value if isinstance(value, dict) else {}
    except (TypeError, ValueError):
        return {}


def save_policy(db, user_id: int, data: DiscoveryPolicyIn):
    policy = db.get(DiscoveryPolicy, user_id)
    if not policy:
        policy = DiscoveryPolicy(user_id=user_id)
        db.add(policy)
    policy.rules = json.dumps({
        "friendship": data.friendship.model_dump(),
        "dating": data.dating.model_dump(),
    }, ensure_ascii=False)
    policy.people_per_week = data.people_per_week
    policy.max_turns_per_person = data.max_turns_per_person
    policy.max_tokens_per_person = data.max_tokens_per_person
    policy.show_near_matches = data.show_near_matches
    db.commit()
    return policy


def private_policy_view(policy: DiscoveryPolicy | None):
    doc = policy_document(policy)
    return {
        **doc,
        "people_per_week": policy.people_per_week if policy else 5,
        "max_turns_per_person": policy.max_turns_per_person if policy else 8,
        "max_tokens_per_person": policy.max_tokens_per_person if policy else 2500,
        "show_near_matches": policy.show_near_matches if policy else False,
    }


def candidate_facts(user):
    details = json.loads(user.details.data) if user.details else {}
    social = user.social
    return {
        "age": social.age if social else None,
        "height_cm": social.height_cm if social else None,
        "city": user.city,
        "intent": social.intent if social else "friendship",
        "school": details.get("school", ""),
        "job": user.job,
        # ethnicity is optional and self-declared profile data only. Never infer it from photos/names.
        "ethnicity": details.get("ethnicity"),
        "languages": details.get("languages", []),
        "interests": user.interests.split(",") if user.interests else [],
        "lifestyle": details.get("lifestyle", []),
    }


def _norm(value):
    return value.casefold().strip() if isinstance(value, str) else value


def rule_matches(rule: dict, facts: dict):
    actual, expected, op = facts.get(rule.get("field")), rule.get("value"), rule.get("op", "eq")
    if actual is None:
        return False
    if op == "eq":
        return _norm(actual) == _norm(expected)
    if op == "in":
        choices = expected if isinstance(expected, list) else [expected]
        return _norm(actual) in {_norm(v) for v in choices}
    if op in {"contains_any", "contains_all"}:
        haystack = actual if isinstance(actual, list) else [actual]
        needles = expected if isinstance(expected, list) else [expected]
        h = {_norm(v) for v in haystack}
        checks = [_norm(v) in h for v in needles]
        return any(checks) if op == "contains_any" else all(checks)
    try:
        return actual >= expected if op == "gte" else actual <= expected
    except TypeError:
        return False


def evaluate_candidate(policy: DiscoveryPolicy | None, intent: str, candidate):
    """Return eligibility and a cheap preference score; no model call happens here."""
    doc = policy_document(policy)
    intent_policy = doc.get(intent, {"enabled": True, "rules": []})
    if not intent_policy.get("enabled", True):
        return False, 0
    facts = candidate_facts(candidate)
    score = 0
    for rule in intent_policy.get("rules", []):
        matched = rule_matches(rule, facts)
        strength = rule.get("strength", "hard")
        if strength == "hard" and not matched:
            return False, 0
        if matched:
            score += 5 if strength == "strong" else 1 if strength == "soft" else 10
    return True, score
