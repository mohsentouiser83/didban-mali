import hashlib
import re
import tempfile
import unicodedata
import zipfile
from dataclasses import dataclass
from pathlib import PurePath
from typing import BinaryIO, cast

import olefile
import xlrd
from fastapi import HTTPException, UploadFile, status

from app.core.config import settings

CHUNK_SIZE = 1024 * 1024
ALLOWED_MIME_TYPES = {
    ".pdf": {"application/pdf", "application/octet-stream"},
    ".csv": {"text/csv", "application/csv", "text/plain", "application/vnd.ms-excel"},
    ".xls": {"application/vnd.ms-excel", "application/octet-stream"},
    ".xlsx": {
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/octet-stream",
    },
}
EXECUTABLE_SIGNATURES = (b"MZ", b"\x7fELF", b"#!/bin/", b"#!/usr/bin/")
CONTROL_CHARACTERS = re.compile(r"[\x00-\x1f\x7f]+")


@dataclass(frozen=True)
class ValidatedUpload:
    stream: BinaryIO
    original_name: str
    extension: str
    mime_type: str
    sha256: str
    size_bytes: int
    metadata: dict[str, object]


def safe_original_name(filename: str | None) -> str:
    normalized = unicodedata.normalize("NFC", filename or "")
    basename = PurePath(normalized.replace("\\", "/")).name
    cleaned = CONTROL_CHARACTERS.sub("", basename).strip().strip(".")
    if not cleaned or len(cleaned) > 255:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="نام فایل معتبر نیست.",
        )
    return cleaned


def _inspect_csv(stream: BinaryIO) -> dict[str, object]:
    stream.seek(0)
    sample = stream.read(64 * 1024)
    stream.seek(0)
    if not sample or sample.startswith(EXECUTABLE_SIGNATURES) or b"\x00" in sample:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="محتوای فایل با قالب CSV سازگار نیست.",
        )
    encoding = "utf-8"
    try:
        sample.decode("utf-8-sig")
    except UnicodeDecodeError:
        encoding = "unknown"
    return {"detected_format": "csv", "encoding_hint": encoding}


def _inspect_xlsx(stream: BinaryIO) -> dict[str, object]:
    stream.seek(0)
    entries: list[zipfile.ZipInfo] = []
    total_uncompressed = 0
    try:
        with zipfile.ZipFile(stream) as workbook:
            entries = workbook.infolist()
            names = {entry.filename for entry in entries}
            if "[Content_Types].xml" not in names or "xl/workbook.xml" not in names:
                raise ValueError("missing workbook structure")
            if len(entries) > 10_000:
                raise ValueError("too many archive entries")
            total_uncompressed = sum(entry.file_size for entry in entries)
            if total_uncompressed > 250 * 1024 * 1024:
                raise ValueError("expanded workbook is too large")
            for entry in entries:
                lowered = entry.filename.casefold()
                normalized_entry = entry.filename.replace("\\", "/")
                if ".." in PurePath(normalized_entry).parts or entry.flag_bits & 0x1:
                    raise ValueError("unsafe archive entry")
                if lowered.endswith("vbaproject.bin") or "/macrosheets/" in lowered:
                    raise HTTPException(
                        status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                        detail="فایل اکسل دارای ماکرو در این نسخه پذیرفته نمی‌شود.",
                    )
                if entry.compress_size and entry.file_size / entry.compress_size > 200:
                    raise ValueError("suspicious compression ratio")
    except HTTPException:
        raise
    except (ValueError, zipfile.BadZipFile) as exc:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="ساختار فایل XLSX معتبر یا ایمن نیست.",
        ) from exc
    finally:
        stream.seek(0)
    return {
        "detected_format": "xlsx",
        "archive_entries": len(entries),
        "expanded_size_bytes": total_uncompressed,
        "macros_present": False,
    }


def _inspect_xls(stream: BinaryIO) -> dict[str, object]:
    try:
        stream.seek(0)
        with olefile.OleFileIO(stream) as compound:
            names = ["/".join(path).casefold() for path in compound.listdir()]
            if any("vba" in name or "macros" in name or "encrypt" in name for name in names):
                raise ValueError("macros or encryption")
        stream.seek(0)
        workbook = xlrd.open_workbook(file_contents=stream.read(), on_demand=True)
        workbook.release_resources()
    except (OSError, ValueError, xlrd.XLRDError) as exc:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="فایل XLS معتبر نیست یا دارای ماکرو/رمزگذاری است.",
        ) from exc
    finally:
        stream.seek(0)
    return {"detected_format": "xls", "macros_present": False}


def _inspect_pdf(stream: BinaryIO) -> dict[str, object]:
    from pypdf import PdfReader
    from pypdf.generic import DictionaryObject

    try:
        stream.seek(0)
        if stream.read(5) != b"%PDF-":
            raise ValueError("signature")
        stream.seek(0)
        reader = PdfReader(stream, strict=True)
        if reader.is_encrypted or not 1 <= len(reader.pages) <= 200:
            raise ValueError("encrypted or too many pages")
        # Reject active/attached content without interpreting it.
        root = cast(DictionaryObject, reader.trailer["/Root"])
        if any(key in root for key in ("/OpenAction", "/AA", "/AcroForm")):
            raise ValueError("active content")
        names = root.get("/Names", {})
        if any(key in names for key in ("/JavaScript", "/EmbeddedFiles")):
            raise ValueError("embedded content")
        for page in reader.pages:
            if "/AA" in page:
                raise ValueError("page actions")
            for annotation in page.get("/Annots", []):
                obj = cast(DictionaryObject, annotation.get_object())
                if "/A" in obj or "/AA" in obj or obj.get("/Subtype") == "/FileAttachment":
                    raise ValueError("annotation action")
        return {"detected_format": "pdf", "pages": len(reader.pages)}
    except Exception as exc:
        raise HTTPException(415, "PDF معتبر نیست یا محتوای فعال/رمزگذاری‌شده دارد.") from exc
    finally:
        stream.seek(0)


async def receive_and_validate(file: UploadFile) -> ValidatedUpload:
    original_name = safe_original_name(file.filename)
    extension = PurePath(original_name).suffix.casefold()
    declared_mime = (file.content_type or "application/octet-stream").casefold()
    if extension not in ALLOWED_MIME_TYPES or declared_mime not in ALLOWED_MIME_TYPES[extension]:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="فقط CSV، XLS، XLSX و PDF بانک پذیرفته می‌شوند.",
        )

    stream = tempfile.SpooledTemporaryFile(max_size=8 * 1024 * 1024, mode="w+b")
    digest = hashlib.sha256()
    size_bytes = 0
    try:
        while chunk := await file.read(CHUNK_SIZE):
            size_bytes += len(chunk)
            if size_bytes > settings.upload_max_bytes:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail="حجم فایل بیشتر از سقف مجاز ۵۰ مگابایت است.",
                )
            digest.update(chunk)
            stream.write(chunk)
        if size_bytes == 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="فایل خالی قابل پردازش نیست.",
            )
        binary_stream = cast(BinaryIO, stream)
        inspector = {
            ".pdf": _inspect_pdf,
            ".csv": _inspect_csv,
            ".xls": _inspect_xls,
            ".xlsx": _inspect_xlsx,
        }[extension]
        metadata = inspector(binary_stream)
        stream.seek(0)
        return ValidatedUpload(
            stream=binary_stream,
            original_name=original_name,
            extension=extension,
            mime_type=declared_mime,
            sha256=digest.hexdigest(),
            size_bytes=size_bytes,
            metadata=metadata,
        )
    except Exception:
        stream.close()
        raise
    finally:
        await file.close()
