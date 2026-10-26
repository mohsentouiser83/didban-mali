"""Offline artifact render dispatch; source values are never executable."""

from pathlib import Path
from .report_pdf import pdf_bytes
from .report_workbooks import csv_bytes, xlsx_bytes

MIME = {
    "pdf": "application/pdf",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "error_csv": "text/csv",
}


def render(format: str, content: dict, font_root: Path) -> bytes:
    if format == "pdf":
        return pdf_bytes(content, font_root)
    if format == "xlsx":
        return xlsx_bytes(content)
    if format == "error_csv":
        return csv_bytes(content)
    raise ValueError("unsupported_export_format")
