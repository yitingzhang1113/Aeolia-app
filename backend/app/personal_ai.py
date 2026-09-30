"""ChatGPT connection metadata and privacy contract.

Production Sign in with ChatGPT requires credentials issued for the application.
This module deliberately does not fake an OAuth exchange in local development.
"""
import os

from fastapi import APIRouter
from pydantic import BaseModel


router = APIRouter(prefix="/ai-connections", tags=["personal-ai"])


class PersonalAIConnection(BaseModel):
    provider: str
    label: str
    identity_supported: bool
    plan_usage_supported: bool
    conversation_history_access: bool = False
    privacy_note: str


@router.get("/chatgpt/status", response_model=PersonalAIConnection)
def chatgpt_status():
    return PersonalAIConnection(
        provider="chatgpt",
        label="ChatGPT",
        identity_supported=bool(os.getenv("OPENAI_CLIENT_ID")),
        plan_usage_supported=os.getenv("AEOLIA_CHATGPT_PLAN_USAGE") == "1",
        conversation_history_access=False,
        privacy_note=(
            "Connecting ChatGPT does not give Aeolia access to your ChatGPT conversation history. "
            "Aeolia receives only information you explicitly authorize through supported connection flows."
        ),
    )


@router.get("/privacy")
def personal_ai_privacy():
    return {
        "principles": [
            "Your personal AI works for you; Aeolia does not copy its full memory or chat history.",
            "Real profile photos are human-facing and are never included in Elf discovery or Elf-to-Elf prompts.",
            "Private hard rules remain owner-only and are applied before any Elf conversation.",
            "Only humans can Connect. An Elf cannot create a friendship or dating connection for you.",
            "Elf conversations are inspectable by the participating members.",
        ]
    }
