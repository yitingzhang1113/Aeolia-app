"""Local prototype media storage. Every read rechecks post visibility."""
import os
from pathlib import Path
from uuid import uuid4

from fastapi import Depends, HTTPException, Request
from fastapi.responses import FileResponse
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .models import AgentAvatar, Block, MediaAsset, Post, PostAsset, User

MAX_BYTES = 64 * 1024 * 1024
MIME_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif", "image/avif", "video/mp4", "video/quicktime"}


def storage_dir():
    return Path(os.getenv("AEOLIA_MEDIA_DIR", str(Path(__file__).resolve().parents[1] / "uploads")))


def valid_signature(mime, data):
    if mime == "image/jpeg":
        return data.startswith(b"\xff\xd8\xff")
    if mime == "image/png":
        return data.startswith(b"\x89PNG\r\n\x1a\n")
    if mime == "image/gif":
        return data.startswith((b"GIF87a", b"GIF89a"))
    if mime == "image/webp":
        return data.startswith(b"RIFF") and data[8:12] == b"WEBP"
    if mime in {"image/heic", "image/heif", "image/avif"}:
        return data[4:8] == b"ftyp" and data[8:12] in {b"heic", b"heix", b"mif1", b"avif", b"avis"}
    return data[4:8] == b"ftyp" and data[8:12] in {b"isom", b"iso2", b"mp41", b"mp42", b"avc1", b"M4V ", b"qt  "}


def asset_view(asset):
    return {"id": asset.id, "url": f"/media/{asset.id}", "kind": asset.kind, "size": asset.size, "mime_type": asset.mime_type}


def post_media(db, post):
    links = list(db.scalars(select(PostAsset).where(PostAsset.post_id == post.id).order_by(PostAsset.position)))
    assets, cover = [], None
    for link in links:
        asset = db.get(MediaAsset, link.asset_id)
        if asset:
            if link.position == -1:
                cover = f"/media/{asset.id}"
            else:
                assets.append(asset_view(asset))
    return {"media": assets, "cover_url": cover}


def register_media(app, get_db, actor, can_view_post):
    @app.post("/media")
    async def upload(request: Request, db: Session = Depends(get_db), user: User = Depends(actor)):
        mime = request.headers.get("content-type", "").split(";")[0].lower()
        if mime not in MIME_TYPES:
            raise HTTPException(415, "Choose a JPEG, PNG, WebP, GIF, HEIC, AVIF, MP4 or MOV file")
        try:
            length = int(request.headers.get("content-length", "0"))
        except ValueError:
            raise HTTPException(400, "Invalid content length")
        if length > MAX_BYTES:
            raise HTTPException(413, "Each file must be 64 MB or smaller")
        folder = storage_dir()
        folder.mkdir(parents=True, exist_ok=True)
        asset_id = uuid4().hex
        path = folder / asset_id
        size, signature, committed = 0, b"", False
        try:
            with path.open("xb") as target:
                async for chunk in request.stream():
                    size += len(chunk)
                    if size > MAX_BYTES:
                        raise HTTPException(413, "Each file must be 64 MB or smaller")
                    if len(signature) < 32:
                        signature = (signature + chunk)[:32]
                    target.write(chunk)
            if not size or not valid_signature(mime, signature):
                raise HTTPException(415, "The file does not match the selected media format")
            asset = MediaAsset(id=asset_id, owner_id=user.id, mime_type=mime, kind=mime.split("/")[0], size=size)
            db.add(asset)
            db.commit()
            committed = True
            return asset_view(asset)
        finally:
            if not committed:
                path.unlink(missing_ok=True)

    @app.get("/media/{asset_id}")
    def read(asset_id: str, db: Session = Depends(get_db), user: User = Depends(actor)):
        asset = db.get(MediaAsset, asset_id)
        if not asset:
            raise HTTPException(404, "Media not found")
        allowed = asset.owner_id == user.id
        if not allowed and db.scalar(select(AgentAvatar.user_id).where(AgentAvatar.asset_id == asset_id)):
            blocked = db.scalar(select(Block.id).where(or_((Block.owner_id == user.id) & (Block.target_id == asset.owner_id), (Block.owner_id == asset.owner_id) & (Block.target_id == user.id))))
            allowed = not blocked
        if not allowed:
            posts = db.scalars(select(Post).join(PostAsset, PostAsset.post_id == Post.id).where(PostAsset.asset_id == asset_id))
            allowed = any(can_view_post(db, p, user) for p in posts)
        if not allowed or not (storage_dir() / asset.id).is_file():
            raise HTTPException(404, "Media not found")
        # FileResponse handles range requests for scrubbing/playback.
        return FileResponse(storage_dir() / asset.id, media_type=asset.mime_type,
                            headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"})
