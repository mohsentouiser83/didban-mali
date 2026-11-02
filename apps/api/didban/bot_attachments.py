"""Normalize direct private attachments without trusting message URLs or MIME."""

from dataclasses import dataclass
from pathlib import PurePosixPath

from .bot_transport import PrivateMessage, normalize_update


@dataclass(frozen=True)
class PrivateAttachment:
    message: PrivateMessage
    file_id: str
    name: str
    kind: str
    declared_size: int | None


def normalize_attachment(provider, payload: object) -> PrivateAttachment | None:
    if not isinstance(payload, dict) or not isinstance(payload.get("message"), dict):
        return None
    message = dict(payload["message"])
    present = [key for key in ("document", "photo", "voice") if key in message]
    if len(present) != 1:
        return None
    kind = present[0]
    item = message[kind]
    if kind == "photo":
        if not isinstance(item, list) or not item or len(item) > 10:
            return None
        item = item[-1]
    if not isinstance(item, dict):
        return None
    fid = item.get("file_id")
    size = item.get("file_size")
    if not isinstance(fid, str) or not 1 <= len(fid) <= 256:
        return None
    if size is not None and (type(size) is not int or size < 0 or size > 20 * 1024 * 1024):
        return None
    name = item.get("file_name") or (
        "photo.jpg" if kind == "photo" else "voice.ogg" if kind == "voice" else ""
    )
    if not isinstance(name, str) or not name or len(name) > 255:
        return None
    name = PurePosixPath(name.replace("\\", "/")).name
    ext = PurePosixPath(name).suffix.lower()
    if ext not in (".csv", ".xls", ".xlsx", ".pdf", ".jpg", ".jpeg", ".png", ".ogg", ".mp3", ".wav", ".m4a"):
        return None
    message.pop(kind)
    message["text"] = "attachment"
    safe = normalize_update(provider, {**payload, "message": message})
    if safe is None:
        return None
    return PrivateAttachment(safe, fid, name, kind, size)
