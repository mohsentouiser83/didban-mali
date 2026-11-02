"""Bounded local rasterization. Originals remain private and unchanged."""

import io
import os
import re
import selectors
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from PIL import Image, UnidentifiedImageError

from .config import settings
from .errors import DomainError, require


def bounded_process(arguments: list[str], timeout: int) -> tuple[int, bytes]:
    """Bound metadata/error output instead of buffering untrusted PDF metadata."""
    # Set limits in a fresh trusted Python process, avoiding preexec_fn in a
    # multithreaded API. No source text or filename becomes executable code.
    wrapper = "import os,resource,sys\nif sys.platform != 'darwin': resource.setrlimit(resource.RLIMIT_AS,(1073741824,1073741824))\nresource.setrlimit(resource.RLIMIT_CPU,(20,20))\nresource.setrlimit(resource.RLIMIT_FSIZE,(33554432,33554432))\nos.execvp(sys.argv[1],sys.argv[1:])"
    process = subprocess.Popen(
        [sys.executable, "-c", wrapper, *arguments], stdout=subprocess.PIPE, stderr=subprocess.STDOUT
    )
    body = bytearray()
    deadline = time.monotonic() + timeout
    next_memory_check = 0.0
    selector = selectors.DefaultSelector()
    assert process.stdout is not None
    selector.register(process.stdout, selectors.EVENT_READ)
    try:
        while True:
            if sys.platform == "darwin" and time.monotonic() >= next_memory_check:
                # macOS does not permit lowering RLIMIT_AS. Monitor child RSS;
                # Linux production additionally has the hard address-space cap.
                check = subprocess.run(
                    ["ps", "-o", "rss=", "-p", str(process.pid)], capture_output=True, timeout=2
                )
                rss = check.stdout.strip()
                require(
                    not rss or (rss.isdigit() and int(rss) <= 1048576),
                    "media_memory_limit",
                    "حافظهٔ مورد نیاز PDF بیش از حد مجاز است.",
                    413,
                )
                next_memory_check = time.monotonic() + 0.5
            require(time.monotonic() < deadline, "media_render_timeout", "خواندن PDF به پایان نرسید.", 503)
            events = selector.select(min(0.5, max(0, deadline - time.monotonic())))
            if not events:
                if process.poll() is not None:
                    break
                continue
            chunk = os.read(process.stdout.fileno(), 4096)
            if not chunk:
                break
            body.extend(chunk)
            require(len(body) <= 65536, "media_pdf_invalid", "اطلاعات PDF بیش از حد مجاز است.", 413)
        return process.wait(timeout=2), bytes(body)
    finally:
        selector.close()
        if process.poll() is None:
            process.kill()
        process.wait()
        process.stdout.close()


def image_png(content: bytes) -> bytes:
    try:
        with Image.open(io.BytesIO(content)) as image:
            require(
                image.width * image.height <= settings.media_max_pixels
                and getattr(image, "n_frames", 1) == 1,
                "media_pixel_limit",
                "ابعاد تصویر بیش از حد مجاز است.",
                413,
            )
            image.thumbnail((1600, 1600))
            converted = image.convert("RGB")
            out = io.BytesIO()
            converted.save(out, format="PNG")
            result = out.getvalue()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as error:
        raise DomainError("media_image_invalid", "تصویر معتبر نیست.", 415) from error
    require(
        len(result) <= 5 * 1024 * 1024, "media_image_limit", "تصویر برای استخراج بیش از حد بزرگ است.", 413
    )
    return result


def rasterize(path: Path, name: str) -> list[bytes]:
    require(
        path.stat().st_size <= settings.media_max_bytes,
        "media_size_limit",
        "حجم رسانه بیش از حد مجاز است.",
        413,
    )
    if Path(name).suffix.lower() != ".pdf":
        return [image_png(path.read_bytes())]
    try:
        status, metadata = bounded_process(["pdfinfo", str(path)], 10)
        match = re.search(rb"^Pages:\s+(\d+)", metadata, re.M)
        require(status == 0 and match is not None, "media_pdf_invalid", "PDF قابل خواندن نیست.", 415)
        pages = int(match.group(1))
        require(
            1 <= pages <= settings.media_max_pages,
            "media_page_limit",
            "تعداد صفحات PDF بیش از حد مجاز استخراج است.",
            413,
        )
        with tempfile.TemporaryDirectory(prefix="didban-media-") as temporary:
            output = Path(temporary) / "page"
            status, _output = bounded_process(
                [
                    "pdftoppm",
                    "-f",
                    "1",
                    "-l",
                    str(pages),
                    "-scale-to",
                    "1600",
                    "-png",
                    str(path),
                    str(output),
                ],
                30,
            )
            require(status == 0, "media_pdf_invalid", "رندر PDF انجام نشد.", 415)
            images = sorted(Path(temporary).glob("page-*.png"))
            require(len(images) == pages, "media_pdf_invalid", "صفحات PDF کامل خوانده نشد.", 415)
            return [image_png(image.read_bytes()) for image in images]
    except FileNotFoundError as error:
        raise DomainError(
            "media_renderer_unavailable", "ابزار خواندن PDF در سرور نصب نشده است.", 503
        ) from error
    except subprocess.TimeoutExpired as error:
        raise DomainError("media_render_timeout", "خواندن PDF به پایان نرسید.", 503) from error
