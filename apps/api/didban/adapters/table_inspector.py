from __future__ import annotations
import csv
from pathlib import Path, PurePosixPath
import zipfile
import zlib
import re

from defusedxml.ElementTree import iterparse
from defusedxml.common import DefusedXmlException
from xml.etree.ElementTree import ParseError
import openpyxl
import xlrd
from xlrd.compdoc import CompDocError
from openpyxl.utils.exceptions import InvalidFileException

from ..domain.intake import EncodingQuestion, PreparationFailure


class TableInspector:
    """Bounded structural inspection only; no formulas or financial interpretation."""

    def __init__(self, max_rows: int = 20000, max_expanded: int = 67108864):
        self.max_rows, self.max_expanded = max_rows, max_expanded

    def inspect(self, path: Path, format: str, settings: dict) -> dict:
        try:
            if format == "csv":
                sheets = self._csv(path, settings.get("encoding"))
            elif format == "xlsx":
                sheets = self._xlsx(path)
            else:
                sheets = self._xls(path)
        except (EncodingQuestion, PreparationFailure):
            raise
        except (
            zlib.error,
            CompDocError,
            InvalidFileException,
            IndexError,
            DefusedXmlException,
            ParseError,
            OSError,
            ValueError,
            KeyError,
            zipfile.BadZipFile,
            csv.Error,
            xlrd.XLRDError,
        ):
            raise PreparationFailure(
                "invalid_csv" if format == "csv" else "invalid_workbook"
            ) from None
        total = sum(s["nonempty_rows"] for s in sheets)
        if not total:
            raise PreparationFailure("empty_table")
        if total > self.max_rows:
            raise PreparationFailure("row_limit")
        return {"nonempty_rows": total, "sheets": sheets, "financial_data_rows": None}

    def _csv(self, path: Path, encoding: str | None) -> list[dict]:
        with path.open("rb") as stream:
            prefix = stream.read(65536)
        if encoding is None:
            encoding = (
                "utf-16"
                if prefix.startswith((b"\xff\xfe", b"\xfe\xff"))
                else "utf-8-sig"
            )
        try:
            with path.open("r", encoding=encoding, newline="") as stream:
                sample = stream.read(65536)
                if "\0" in sample or any(
                    ord(c) < 32 and c not in "\t\n\r" for c in sample
                ):
                    raise PreparationFailure("invalid_csv")
                try:
                    delimiter = (
                        csv.Sniffer().sniff(sample, delimiters=",;\t|").delimiter
                    )
                except csv.Error:
                    delimiter = ","
                stream.seek(0)
                rows = 0
                columns = 0
                for index, row in enumerate(
                    csv.reader(stream, delimiter=delimiter, strict=True)
                ):
                    if index > self.max_rows + 1024:
                        raise PreparationFailure("row_limit")
                    if any(cell.strip() for cell in row):
                        rows += 1
                    columns = max(columns, len(row))
                    self._bounds(rows, columns, row)
        except UnicodeDecodeError:
            if encoding == "utf-8-sig":
                raise EncodingQuestion() from None
            raise PreparationFailure("invalid_encoding") from None
        return [{"name": "CSV", "nonempty_rows": rows, "columns": columns}]

    def _xlsx(self, path: Path) -> list[dict]:
        with zipfile.ZipFile(path) as archive:
            items = archive.infolist()
            if len(items) > 2048 or sum(i.file_size for i in items) > self.max_expanded:
                raise PreparationFailure("expanded_limit")
            names = {i.filename for i in items}
            if len(names) != len(items):
                raise PreparationFailure("invalid_workbook")
            for item in items:
                parts = PurePosixPath(item.filename).parts
                if item.flag_bits & 1 or ".." in parts or item.filename.startswith("/"):
                    raise PreparationFailure("unsafe_workbook")
                if (
                    "vbaproject" in item.filename.lower()
                    or "externallinks" in item.filename.lower()
                ):
                    raise PreparationFailure("unsafe_workbook")
            # Bound physical coordinates before a reader can expand sparse ranges.
            for name in names:
                if name.startswith("xl/worksheets/") and name.endswith(".xml"):
                    with archive.open(name) as stream:
                        for _, node in iterparse(stream, events=("end",)):
                            if node.tag.rsplit("}", 1)[-1] == "c":
                                coordinate = node.attrib.get("r", "A1")
                                if not re.fullmatch(
                                    r"[A-Za-z]{1,3}[1-9][0-9]{0,6}", coordinate
                                ):
                                    raise PreparationFailure("invalid_workbook")
                                letters = "".join(c for c in coordinate if c.isalpha())
                                digits = "".join(c for c in coordinate if c.isdigit())
                                column = 0
                                for c in letters:
                                    column = column * 26 + ord(c.upper()) - 64
                                if column > 512:
                                    raise PreparationFailure("column_limit")
                                if int(digits or "1") > self.max_rows + 1024:
                                    raise PreparationFailure("row_limit")
                                for text in node.itertext():
                                    if len(text) > 16384:
                                        raise PreparationFailure("cell_limit")
                                node.clear()
        with path.open("rb") as source:
            workbook = openpyxl.load_workbook(
                source, read_only=True, data_only=False, keep_links=False
            )
            try:
                if len(workbook.worksheets) > 32:
                    raise PreparationFailure("invalid_workbook")
                sheets = []
                for sheet in workbook.worksheets:
                    sheet.reset_dimensions()
                    rows = 0
                    columns = 0
                    for index, row in enumerate(sheet.iter_rows(values_only=True)):
                        if index > self.max_rows + 1024:
                            raise PreparationFailure("row_limit")
                        if any(
                            value is not None and str(value).strip() for value in row
                        ):
                            rows += 1
                        columns = max(columns, len(row))
                        self._bounds(rows, columns, row)
                    sheets.append(
                        {"name": sheet.title, "nonempty_rows": rows, "columns": columns}
                    )
                return sheets
            finally:
                workbook.close()

    def _xls(self, path: Path) -> list[dict]:
        workbook = xlrd.open_workbook(path, on_demand=True)
        try:
            if workbook.nsheets > 32:
                raise PreparationFailure("invalid_workbook")
            sheets = []
            for sheet in workbook.sheets():
                if sheet.nrows > self.max_rows + 1024:
                    raise PreparationFailure("row_limit")
                self._bounds(0, sheet.ncols, [])
                rows = 0
                for index in range(sheet.nrows):
                    row = sheet.row_values(index)
                    if any(value is not None and str(value).strip() for value in row):
                        rows += 1
                    self._bounds(rows, sheet.ncols, row)
                sheets.append(
                    {"name": sheet.name, "nonempty_rows": rows, "columns": sheet.ncols}
                )
            return sheets
        finally:
            workbook.release_resources()

    def _bounds(self, rows: int, columns: int, values: list | tuple) -> None:
        if rows > self.max_rows:
            raise PreparationFailure("row_limit")
        if columns > 512:
            raise PreparationFailure("column_limit")
        if any(len(str(v)) > 16384 for v in values if v is not None):
            raise PreparationFailure("cell_limit")
