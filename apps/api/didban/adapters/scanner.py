from __future__ import annotations
from pathlib import Path
import socket
import struct

from ..domain.intake import DependencyUnavailable, PreparationFailure


class ClamScanner:
    def __init__(self, host: str, port: int):
        self.host, self.port = host, port

    def scan(self, path: Path) -> str:
        try:
            with (
                socket.create_connection((self.host, self.port), timeout=30) as sock,
                path.open("rb") as stream,
            ):
                sock.sendall(b"zINSTREAM\0")
                while chunk := stream.read(65536):
                    sock.sendall(struct.pack("!I", len(chunk)) + chunk)
                sock.sendall(b"\0\0\0\0")
                reply = bytearray()
                while not reply.endswith(b"\0"):
                    chunk = sock.recv(1024)
                    if not chunk or len(reply) > 4096:
                        break
                    reply.extend(chunk)
                if bytes(reply).endswith(b" FOUND\0"):
                    raise PreparationFailure("malware_detected")
                if bytes(reply) != b"stream: OK\0":
                    raise DependencyUnavailable("scanner_unavailable")
            with socket.create_connection((self.host, self.port), timeout=5) as sock:
                sock.sendall(b"zVERSION\0")
                version = sock.recv(512).rstrip(b"\0").decode("ascii", "replace")
            return version
        except OSError:
            raise DependencyUnavailable("scanner_unavailable") from None
