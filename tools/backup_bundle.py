"""Authenticated, encrypted installation bundles. Never extract untrusted paths."""

from __future__ import annotations
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import tarfile

from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt

MAGIC = b"DIDBAN-BACKUP-1\n"
CHUNK = 1024 * 1024


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(CHUNK):
            h.update(chunk)
    return h.hexdigest()


def key(password: str, salt: bytes) -> bytes:
    if len(password) < 16:
        raise ValueError("Backup passphrase must contain at least 16 characters.")
    return Scrypt(salt=salt, length=32, n=2**15, r=8, p=1).derive(password.encode())


def encrypt(source: Path, target: Path, password: str) -> None:
    salt, nonce = os.urandom(16), os.urandom(12)
    cipher = Cipher(algorithms.AES(key(password, salt)), modes.GCM(nonce)).encryptor()
    header = MAGIC + salt + nonce
    cipher.authenticate_additional_data(header)
    fd = os.open(target, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    try:
        with os.fdopen(fd, "wb") as out, source.open("rb") as incoming:
            out.write(header)
            while chunk := incoming.read(CHUNK):
                out.write(cipher.update(chunk))
            out.write(cipher.finalize())
            out.write(cipher.tag)
            out.flush()
            os.fsync(out.fileno())
    except BaseException:
        target.unlink(missing_ok=True)
        raise


def decrypt(source: Path, target: Path, password: str) -> None:
    # Plaintext is private and temporary; it is unusable until authentication ends.
    size = source.stat().st_size
    header_size = len(MAGIC) + 28
    if size < header_size + 16:
        raise ValueError("Truncated backup.")
    with source.open("rb") as incoming:
        header = incoming.read(header_size)
        if not header.startswith(MAGIC):
            raise ValueError("Unsupported backup format.")
        salt, nonce = header[len(MAGIC) : len(MAGIC) + 16], header[-12:]
        incoming.seek(-16, 2)
        tag = incoming.read(16)
        incoming.seek(header_size)
        cipher = Cipher(
            algorithms.AES(key(password, salt)), modes.GCM(nonce, tag)
        ).decryptor()
        cipher.authenticate_additional_data(header)
        fd = os.open(target, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        try:
            with os.fdopen(fd, "wb") as out:
                remaining = size - header_size - 16
                while remaining:
                    chunk = incoming.read(min(CHUNK, remaining))
                    if not chunk:
                        raise ValueError("Truncated backup.")
                    remaining -= len(chunk)
                    out.write(cipher.update(chunk))
                out.write(cipher.finalize())
                out.flush()
                os.fsync(out.fileno())
        except BaseException:
            target.unlink(missing_ok=True)
            raise


def pack(directory: Path, target: Path) -> dict[str, str]:
    if (directory / "checksums.json").exists():
        raise ValueError("Reserved backup manifest already exists.")
    files = sorted(p for p in directory.rglob("*") if p.is_file())
    if any(p.is_symlink() for p in directory.rglob("*")):
        raise ValueError("Symbolic links are not allowed in backups.")
    checksums = {p.relative_to(directory).as_posix(): digest(p) for p in files}
    (directory / "checksums.json").write_text(json.dumps(checksums, sort_keys=True))
    with tarfile.open(target, "w:gz") as archive:
        for p in [*files, directory / "checksums.json"]:
            archive.add(p, arcname=p.relative_to(directory).as_posix(), recursive=False)
    return checksums


def unpack(source: Path, destination: Path, max_bytes: int = 1024**4) -> None:
    if destination.exists() and any(destination.iterdir()):
        raise ValueError("Restore extraction target must be empty.")
    destination.mkdir(mode=0o700, parents=True, exist_ok=True)
    total = 0
    seen = set()
    with tarfile.open(source, "r:gz") as archive:
        for member in archive:
            name = PurePosixPath(member.name)
            if (
                name.is_absolute()
                or ".." in name.parts
                or "\\" in member.name
                or not member.isfile()
                or member.name in seen
            ):
                raise ValueError("Unsafe or duplicate backup entry.")
            seen.add(member.name)
            total += member.size
            if total > max_bytes:
                raise ValueError("Backup exceeds extraction quota.")
            target = destination.joinpath(*name.parts)
            target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            incoming = archive.extractfile(member)
            if incoming is None:
                raise ValueError("Invalid backup entry.")
            fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with incoming, os.fdopen(fd, "wb") as out:
                while chunk := incoming.read(CHUNK):
                    out.write(chunk)
    hashes = json.loads((destination / "checksums.json").read_text())
    if set(hashes) != seen - {"checksums.json"}:
        raise ValueError("Backup manifest does not cover all files.")
    for name, expected in hashes.items():
        if digest(destination / name) != expected:
            raise ValueError("Backup content checksum mismatch.")
