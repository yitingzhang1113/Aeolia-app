"""Prompts for Draw & Guess.

Two sources: an AI generator for fresh, entertaining, hard-to-draw prompts
(famous people, characters, idioms — Shakespeare, Mona Lisa, …), and a curated
fallback used whenever AI is unavailable. Both aim for "show effect": recognisable
but genuinely tricky to sketch.
"""
import json
import random

from ... import ai

# Curated fallback: challenging objects, actions, scenes, idioms and icons.
WORDS = [
    "lighthouse", "telescope", "hourglass", "volcano", "waterfall", "chandelier",
    "escalator", "windmill", "fireworks", "avalanche", "skeleton", "scarecrow",
    "jellyfish", "chameleon", "submarine", "pyramid",
    "juggling", "surfing", "sneezing", "skateboarding", "meditating", "hibernating",
    "gravity", "echo", "shadow", "photosynthesis",
    "traffic jam", "haunted house", "shooting star", "roller coaster",
    "message in a bottle", "tip of the iceberg", "needle in a haystack",
    "breaking the ice", "raining cats and dogs", "couch potato", "night owl",
    "cold feet", "bookworm", "brainstorm", "wanderlust", "homesick", "daydream",
    # icons / famous — "show effect"
    "Shakespeare", "Mona Lisa", "Einstein", "Statue of Liberty", "Sherlock Holmes",
    "Cleopatra", "Napoleon", "the Eiffel Tower", "Great Wall of China",
    "Charlie Chaplin", "Frankenstein", "Mount Rushmore", "the Big Bang",
]

_SYSTEM = (
    "You generate prompts for a Pictionary-style drawing game. "
    "Return ONLY JSON: a JSON array of exactly 3 short strings, nothing else."
)
_USER = (
    "Give 3 challenging, entertaining, hard-to-draw prompts with real show effect — "
    "famous people, fictional characters, iconic scenes or idioms (e.g. Shakespeare, "
    "Mona Lisa, raining cats and dogs). Each 1-3 words. Mix the categories. JSON array only."
)


def three_options(rng=random):
    return rng.sample(WORDS, 3)


def ai_options():
    """3 AI-generated prompts, or raise ai.AIUnavailable to fall back."""
    text = ai.respond(_SYSTEM, _USER)
    start, end = text.find("["), text.rfind("]")
    if start == -1 or end == -1:
        raise ai.AIUnavailable("AI prompt was not JSON")
    parsed = json.loads(text[start : end + 1])
    options = [str(w).strip() for w in parsed if str(w).strip()]
    options = [w for w in options if 1 <= len(w) <= 40][:3]
    if len(options) != 3:
        raise ai.AIUnavailable("AI prompt had wrong shape")
    return options
