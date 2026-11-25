"""Export utilities for multi-source custom reports (Excel XLSX and PDF)."""

from __future__ import annotations

import io
from typing import Any

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Spacer, Table, TableStyle

from ..exports import FONT_MEDIUM, FONT_REGULAR, RTLText, register_fonts


def export_custom_report_xlsx(
    company_name: str,
    report_name: str,
    blocks_results: list[dict[str, Any]],
) -> bytes:
    wb = Workbook()
    # Remove default sheet
    default_sheet = wb.active
    if default_sheet is not None:
        wb.remove(default_sheet)

    header_fill = PatternFill(start_color="EEEDFF", end_color="EEEDFF", fill_type="solid")
    header_font = Font(name="Tahoma", size=10, bold=True, color="5556DE")
    data_font = Font(name="Tahoma", size=9)
    right_align = Alignment(horizontal="right", vertical="center")

    for idx, block_data in enumerate(blocks_results):
        title = (block_data.get("title") or f"بلاک {idx + 1}")[:31]
        ws = wb.create_sheet(title=title)
        ws.views.sheetView[0].rightToLeft = True

        # Sheet Header Info
        ws.append([report_name])
        ws.append([f"شرکت: {company_name} | منبع: {block_data.get('entity_type', '')}"])
        ws.append([])

        columns = block_data.get("columns", [])
        rows = block_data.get("rows", [])

        if columns and rows:
            # Table Headers
            headers = [c.get("label_fa") or c.get("key") for c in columns]
            ws.append(headers)
            header_row_idx = ws.max_row
            for col_idx in range(1, len(headers) + 1):
                cell = ws.cell(row=header_row_idx, column=col_idx)
                cell.fill = header_fill
                cell.font = header_font
                cell.alignment = right_align

            # Table Data
            for r in rows:
                row_vals = [r.get(c["key"]) for c in columns]
                ws.append(row_vals)
                cur_row = ws.max_row
                for col_idx in range(1, len(row_vals) + 1):
                    c_cell = ws.cell(row=cur_row, column=col_idx)
                    c_cell.font = data_font
                    c_cell.alignment = right_align

        # Auto fit column widths
        for col in ws.columns:
            max_len = max(len(str(cell.value or "")) for cell in col)
            col_letter = col[0].column_letter
            ws.column_dimensions[col_letter].width = min(max(max_len + 3, 12), 40)

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def export_custom_report_pdf(
    company_name: str,
    report_name: str,
    blocks_results: list[dict[str, Any]],
) -> bytes:
    register_fonts()
    out = io.BytesIO()
    doc = SimpleDocTemplate(
        out,
        pagesize=A4,
        rightMargin=15 * mm,
        leftMargin=15 * mm,
        topMargin=15 * mm,
        bottomMargin=15 * mm,
        title=report_name,
        lang="fa-IR",
    )

    story = [
        RTLText(report_name, 18, FONT_MEDIUM),
        Spacer(1, 3 * mm),
        RTLText(f"شرکت: {company_name}", 11, FONT_REGULAR),
        Spacer(1, 6 * mm),
    ]

    for block_data in blocks_results:
        title = block_data.get("title") or "بخش گزارش"
        columns = block_data.get("columns", [])
        rows = block_data.get("rows", [])

        story.append(RTLText(title, 13, FONT_MEDIUM))
        story.append(Spacer(1, 2 * mm))

        if columns and rows:
            rtl_columns = list(reversed(columns))
            table_headers = [RTLText(c.get("label_fa") or c.get("key"), 8, FONT_MEDIUM) for c in rtl_columns]
            table_data = [table_headers]
            for row in rows[:40]:  # bounded PDF preview; caller includes its total count
                table_data.append([
                    RTLText("—" if row.get(column["key"]) is None else str(row[column["key"]]), 8, FONT_REGULAR)
                    for column in rtl_columns
                ])

            t = Table(table_data, colWidths=[doc.width / len(columns)] * len(columns), repeatRows=1, hAlign="RIGHT")
            t.setStyle(
                TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#EEEDFF")),
                        ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#5556DE")),
                        ("FONTNAME", (0, 0), (-1, -1), FONT_REGULAR),
                        ("FONTSIZE", (0, 0), (-1, -1), 8),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                        ("TOPPADDING", (0, 0), (-1, -1), 4),
                        ("ALIGN", (0, 0), (-1, -1), "RIGHT"),
                        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
                    ]
                )
            )
            story.append(t)
            story.append(Spacer(1, 5 * mm))

    doc.build(story)
    return out.getvalue()
