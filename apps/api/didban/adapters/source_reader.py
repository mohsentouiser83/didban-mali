"""Bounded physical cells with their original coordinates and formula markers."""

from __future__ import annotations
import csv
from pathlib import Path
import struct
import math
import openpyxl
import xlrd
from xlrd.compdoc import CompDoc
from ..domain.intake import PreparationFailure
from ..domain.source_tables import Row, Sheet
from .table_inspector import TableInspector


class SourceReader:
    def read(self, path: Path, format: str, settings: dict) -> list[Sheet]:
        TableInspector().inspect(path, format, settings)
        if format == "csv":
            prefix = path.read_bytes()[:65536]
            encoding = settings.get("encoding") or (
                "utf-16"
                if prefix.startswith((b"\xff\xfe", b"\xfe\xff"))
                else "utf-8-sig"
            )
            with path.open("r", encoding=encoding, newline="") as stream:
                sample = stream.read(65536)
                stream.seek(0)
                try:
                    delimiter = (
                        csv.Sniffer().sniff(sample, delimiters=",;\t|").delimiter
                    )
                except csv.Error:
                    delimiter = ","
                return [
                    Sheet(
                        "CSV",
                        [
                            Row(i, list(row))
                            for i, row in enumerate(
                                csv.reader(stream, delimiter=delimiter, strict=True), 1
                            )
                        ],
                    )
                ]
        if format == "xlsx":
            with path.open("rb") as stream:
                book = openpyxl.load_workbook(
                    stream, read_only=True, data_only=False, keep_links=False
                )
                try:
                    tables = []
                    for sheet in book:
                        sheet.reset_dimensions()
                        rows = []
                        for i, cells in enumerate(sheet.iter_rows(), 1):
                            values = []
                            formulas = set()
                            for j, cell in enumerate(cells, 1):
                                value = cell.value
                                if cell.data_type == "f":
                                    formulas.add(j)
                                # Preserve source identifiers displayed using an explicit zero mask.
                                if (
                                    isinstance(value, (int, float))
                                    and not isinstance(value, bool)
                                    and (
                                        not isinstance(value, float)
                                        or math.isfinite(value)
                                        and abs(value) < 2**53
                                    )
                                    and str(cell.number_format).strip("0") == ""
                                    and len(cell.number_format) > 1
                                    and value == int(value)
                                ):
                                    value = str(int(value)).zfill(
                                        len(cell.number_format)
                                    )
                                values.append(value)
                            rows.append(Row(i, values, frozenset(formulas)))
                        tables.append(Sheet(sheet.title, rows))
                    return tables
                finally:
                    book.close()
        # xlrd exposes cached formula values: reject BIFF formula records before accepting any.
        compound = CompDoc(path.read_bytes())
        data = compound.get_named_stream("Workbook") or compound.get_named_stream(
            "Book"
        )
        if not data:
            raise PreparationFailure("invalid_workbook")
        position = 0
        while position + 4 <= len(data):
            kind, size = struct.unpack_from("<HH", data, position)
            if kind == 0x0006:
                raise PreparationFailure("untrusted_formula_cache")
            position += 4 + size
        book = xlrd.open_workbook(path, on_demand=True)
        try:
            return [
                Sheet(
                    s.name,
                    [
                        Row(
                            i + 1,
                            [
                                xlrd.xldate.xldate_as_datetime(c.value, book.datemode)
                                if c.ctype == xlrd.XL_CELL_DATE
                                else c.value
                                for c in s.row(i)
                            ],
                        )
                        for i in range(s.nrows)
                    ],
                )
                for s in book.sheets()
            ]
        finally:
            book.release_resources()
