from __future__ import annotations
import hashlib
import os
from pathlib import Path
import re
from typing import BinaryIO
from uuid import uuid4

from ..domain.intake import PreparedFile, DependencyUnavailable
from ..errors import ApiError


class PrivateFiles:
    """Immutable random objects; original names never form a filesystem path."""

    def __init__(self, root: Path, max_bytes: int):
        self.root, self.max_bytes = root, max_bytes

    def path(self, key: str) -> Path:
        if not re.fullmatch(r"[0-9a-f]{32}/[0-9a-f]{32}", key):
            raise ValueError("Invalid private object key")
        return self.root / key

    def store(self, company: str, name: str, stream: BinaryIO) -> PreparedFile:
        name = name.replace("\\", "/").rsplit("/", 1)[-1].strip()
        if not name or len(name) > 240 or any(ord(c) < 32 for c in name):
            raise ApiError(422, "invalid_file_name", "نام فایل معتبر نیست.")
        format = Path(name).suffix.lower().lstrip(".")
        if format not in ("csv", "xls", "xlsx"):
            raise ApiError(
                415, "unsupported_file", "فقط Excel و CSV قابل بارگذاری است."
            )
        key = company.replace("-", "") + "/" + uuid4().hex
        target = self.path(key)
        size = 0
        digest = hashlib.sha256()
        try:
            target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            descriptor = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(descriptor, "wb") as output:
                while chunk := stream.read(65536):
                    size += len(chunk)
                    if size > self.max_bytes:
                        raise ApiError(
                            413, "file_too_large", "حجم فایل بیش از حد مجاز است."
                        )
                    digest.update(chunk)
                    output.write(chunk)
                output.flush()
                os.fsync(output.fileno())
            if not size:
                raise ApiError(422, "empty_file", "فایل خالی است.")
            with target.open("rb") as source:
                signature = source.read(8)
            if format == "xlsx" and not signature.startswith(b"PK\x03\x04"):
                raise ApiError(
                    415, "format_mismatch", "محتوای فایل با پسوند آن سازگار نیست."
                )
            if format == "xls" and signature != b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1":
                raise ApiError(
                    415, "format_mismatch", "محتوای فایل با پسوند آن سازگار نیست."
                )
            if format == "csv" and (
                signature.startswith(b"PK\x03\x04") or signature.startswith(b"\xd0\xcf")
            ):
                raise ApiError(
                    415, "format_mismatch", "محتوای فایل با پسوند آن سازگار نیست."
                )
            return PreparedFile(key, digest.hexdigest(), size, name, format)
        except ApiError:
            self.discard(key)
            raise
        except OSError:
            self.discard(key)
            raise DependencyUnavailable("storage_unavailable") from None

    def discard(self, key: str) -> None:
        try:
            self.path(key).unlink(missing_ok=True)
        except OSError:
            pass
