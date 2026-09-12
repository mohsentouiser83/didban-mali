import socket
import struct
from typing import BinaryIO

from app.core.config import settings


class ScanUnavailableError(RuntimeError):
    pass


def scan_stream(stream: BinaryIO) -> tuple[bool, str]:
    seekable = getattr(stream, "seekable", lambda: False)()
    if seekable:
        stream.seek(0)
    try:
        with socket.create_connection(
            (settings.clamd_host, settings.clamd_port),
            timeout=settings.clamd_timeout_seconds,
        ) as connection:
            connection.settimeout(settings.clamd_timeout_seconds)
            connection.sendall(b"zINSTREAM\0")
            while chunk := stream.read(1024 * 1024):
                connection.sendall(struct.pack("!I", len(chunk)))
                connection.sendall(chunk)
            connection.sendall(struct.pack("!I", 0))
            response = bytearray()
            while not response.endswith(b"\0"):
                part = connection.recv(4096)
                if not part:
                    break
                response.extend(part)
    except (OSError, TimeoutError) as exc:
        raise ScanUnavailableError("ClamAV is unavailable") from exc
    finally:
        if seekable:
            stream.seek(0)

    result = response.rstrip(b"\0").decode("utf-8", errors="replace")
    if result.endswith(" OK"):
        return True, "OK"
    if result.endswith(" FOUND"):
        signature = result.removeprefix("stream: ").removesuffix(" FOUND")
        return False, signature[:255]
    raise ScanUnavailableError(result or "Empty response from ClamAV")
