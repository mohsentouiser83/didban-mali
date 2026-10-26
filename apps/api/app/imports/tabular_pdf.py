"""Readable PDF tables use the regular mapping workflow, without vendor account assumptions."""

import io
from typing import BinaryIO

import pdfplumber

from app.imports.bank_pdf import logical
from app.imports.mapping import ParsedTable, TableParseError, _parse_workbook_rows


def parse_tabular_pdf(
    stream: BinaryIO,
    *,
    sheet_name: str | None,
    header_row: int,
    header_rows: int,
    limit: int | None,
) -> ParsedTable:
    groups: dict[tuple[str, ...], list[tuple[int, list[object]]]] = {}
    try:
        with pdfplumber.open(io.BytesIO(stream.read())) as document:
            if not 1 <= len(document.pages) <= 200:
                raise TableParseError("PDF باید حداکثر ۲۰۰ صفحه داشته باشد.")
            for page in document.pages:
                if not (page.extract_text() or "").strip():
                    raise TableParseError(
                        "PDF اسکن‌شده خوانده نشد؛ خروجی متنی یا Excel/CSV را وارد کنید."
                    )
                tables = page.extract_tables()
                if not tables:
                    raise TableParseError("جدول یک صفحه خوانده نشد؛ خروجی Excel/CSV را وارد کنید.")
                for table in tables:
                    cells = [
                        [logical(cell) if cell is not None else "" for cell in row] for row in table
                    ]
                    if len(cells) <= header_rows:
                        raise TableParseError("جدول PDF ردیف داده ندارد.")
                    # Only identical header blocks are continuations of the same table.
                    key = tuple("\n".join(row) for row in cells[:header_rows])
                    existing = groups.setdefault(key, [])
                    body = cells if not existing else cells[header_rows:]
                    start = len(existing)
                    existing.extend((start + n + 1, list(row)) for n, row in enumerate(body))
        sheets = [f"جدول {index + 1}" for index in range(len(groups))]
        selected = sheet_name or sheets[0]
        if selected not in sheets:
            raise TableParseError("جدول انتخاب‌شده در PDF وجود ندارد.")
        rows = list(groups.values())[sheets.index(selected)]
        return _parse_workbook_rows(rows, sheets, selected, header_row, limit, header_rows)
    except TableParseError:
        raise
    except Exception as exc:
        raise TableParseError("جدول PDF خوانا نیست؛ خروجی Excel/CSV را وارد کنید.") from exc
    finally:
        stream.seek(0)
