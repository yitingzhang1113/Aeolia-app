import base64
import os
from pathlib import Path
from urllib.parse import urlparse
from uuid import uuid4

import httpx
from fastapi import Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .media import storage_dir, valid_signature
from .models import AgentAvatar, MediaAsset, User

PROMPT = Path(__file__).with_name("avatar_prompt.txt").read_text()
STYLE = Path(__file__).resolve().parents[2] / "mobile/assets/agent-outfits.png"


def image_config():
    base = os.getenv("AEOLIA_IMAGE_BASE_URL", "").rstrip("/")
    parsed = urlparse(base)
    local = os.getenv("AEOLIA_ALLOW_LOCAL_IMAGES") == "1" and parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1", "::1"} and not parsed.username and not parsed.password
    key = os.getenv("AEOLIA_IMAGE_API_KEY")
    return base, key, local


def generate_avatar(source, mime):
    base, key, local = image_config()
    if not base or (not key and not local):
        raise HTTPException(503, "Avatar generation needs an image model connection. Chat models cannot generate avatars.")
    if urlparse(base).scheme != "https" and not local:
        raise HTTPException(503, "Image provider must use HTTPS or an explicitly enabled local service")
    try:
        with httpx.Client(timeout=180) as client:
            result = client.post(base + "/images/edits",
                headers={"Authorization": "Bearer " + (key or "local")},
                data={"model": os.getenv("AEOLIA_IMAGE_MODEL", "gpt-image-2"), "prompt": PROMPT,
                      "size": "1024x1536", "quality": "medium", "output_format": "png"},
                files=[("image[]", ("portrait", source, mime)), ("image[]", ("aeolia-style.png", STYLE.read_bytes(), "image/png"))])
            result.raise_for_status()
            data = base64.b64decode(result.json()["data"][0]["b64_json"], validate=True)
        if len(data) > 20 * 1024 * 1024 or not valid_signature("image/png", data):
            raise ValueError("Invalid generated image")
        return data
    except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError, OSError) as error:
        raise HTTPException(502, "Couldn't generate your avatar. Your current avatar is unchanged; please try again.") from error


class AvatarIn(BaseModel):
    photo_id: str


def register_avatar(app, get_db, actor):
    @app.get("/agent/avatar/status")
    def status():
        _, key, local = image_config()
        base, _, _ = image_config()
        return {"configured": bool(base and (key or local))}

    @app.post("/agent/avatar")
    def create(data: AvatarIn, db: Session = Depends(get_db), user: User = Depends(actor)):
        source = db.get(MediaAsset, data.photo_id)
        if not source or source.owner_id != user.id:
            raise HTTPException(404, "Photo not found")
        if source.mime_type not in {"image/jpeg", "image/png", "image/webp"} or source.size > 10 * 1024 * 1024:
            raise HTTPException(400, "Choose a JPEG, PNG or WebP portrait smaller than 10 MB")
        path = storage_dir() / source.id
        if not path.is_file():
            raise HTTPException(404, "Photo not found")
        generated = generate_avatar(path.read_bytes(), source.mime_type)
        asset_id = uuid4().hex
        output = storage_dir() / asset_id
        output.write_bytes(generated)
        try:
            db.add(MediaAsset(id=asset_id, owner_id=user.id, mime_type="image/png", kind="image", size=len(generated)))
            db.flush()
            avatar = db.get(AgentAvatar, user.id)
            if avatar:
                avatar.asset_id = asset_id
            else:
                db.add(AgentAvatar(user_id=user.id, asset_id=asset_id))
            db.commit()
        except Exception:
            output.unlink(missing_ok=True)
            raise
        return {"avatar_url": f"/media/{asset_id}"}
