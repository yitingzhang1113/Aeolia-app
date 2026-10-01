"""Account creation and external sign-in scaffolding.

Google can be enabled as soon as GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET and an
exact redirect URI are configured. ChatGPT identity is exposed only when an
OpenAI commercial client ID has been issued to Aeolia.
"""
import os
from urllib.parse import urlencode

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr, Field


router = APIRouter(prefix="/auth", tags=["auth"])


class EmailSignupIn(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=80)


@router.get("/providers")
def providers():
    return {
        "google": {
            "enabled": bool(os.getenv("GOOGLE_CLIENT_ID") and os.getenv("GOOGLE_CLIENT_SECRET")),
            "label": "Continue with Google",
        },
        "chatgpt": {
            "enabled": bool(os.getenv("OPENAI_CLIENT_ID")),
            "label": "Continue with ChatGPT",
            "limited_trial": True,
        },
        "email": {"enabled": True, "label": "Continue with email"},
    }


@router.get("/google/start")
def google_start():
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    redirect_uri = os.getenv("GOOGLE_REDIRECT_URI")
    if not client_id or not redirect_uri:
        raise HTTPException(503, "Google sign-in is not configured yet")
    # Production must persist cryptographically random state + PKCE/nonce per attempt.
    return {
        "authorization_endpoint": "https://accounts.google.com/o/oauth2/v2/auth",
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "scope": "openid email profile",
        "note": "Client should open the authorization flow; callback verification must run on the server.",
    }


@router.get("/chatgpt/start")
def chatgpt_start():
    client_id = os.getenv("OPENAI_CLIENT_ID")
    redirect_uri = os.getenv("OPENAI_REDIRECT_URI")
    if not client_id or not redirect_uri:
        raise HTTPException(
            503,
            "Continue with ChatGPT is waiting for Aeolia's issued OpenAI commercial client ID.",
        )
    return {
        "authorization_endpoint": "https://auth.openai.com/api/accounts/authorize",
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "scope": "openid profile email",
        "pkce_required": True,
    }


@router.post("/email/signup")
def email_signup(data: EmailSignupIn):
    # Intentionally no fake account creation: production should send a verified
    # magic link / OTP before creating or linking an Aeolia identity.
    return {
        "verification_required": True,
        "email": str(data.email),
        "name": data.name.strip(),
        "message": "Email verification transport is not configured in this prototype.",
    }
