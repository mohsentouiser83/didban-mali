"use client";

import * as XLSX from "xlsx";
import { toast } from "sonner";
import { asciiDigits } from "@/lib/utils";

/**
 * Normalizes numbers extracted from Persian/Arabic strings with commas, currency words, etc.
 */
export function parseNumericCell(raw: string): number | null {
  if (!raw) return null;
  const cleaned = asciiDigits(raw)
    .replace(/[٬,]/g, "")
    .replace(/(?:ریال|تومان|IRR|TOMAN)/gi, "")
    .replace(/[٪%]/g, "")
    .replace(/[−-]/g, "-")
    .trim();

  if (/^-?\d+(\.\d+)?$/.test(cleaned)) {
    const num = Number(cleaned);
    if (!Number.isNaN(num)) return num;
  }
  return null;
}

/**
 * Extracts visible header labels and row cell contents from an HTML table element.
 */
export function extractTableData(tableElement: HTMLTableElement) {
  const thead = tableElement.querySelector("thead");
  const tbody = tableElement.querySelector("tbody");

  // Headers: ignore action controls or columns explicitly excluded
  const headers: string[] = [];
  const thElements = thead ? Array.from(thead.querySelectorAll<HTMLTableCellElement>("th")) : [];

  thElements.forEach((th) => {
    // If hidden via display: none, skip
    if (th.style.display === "none" || th.hasAttribute("data-export-ignore")) {
      return;
    }
    // Prefer explicit title attribute or title span, otherwise text
    const titleSpan = th.querySelector<HTMLElement>(".table-head-title");
    const title = titleSpan?.textContent?.trim() || th.getAttribute("data-column-title") || th.firstChild?.textContent?.trim() || th.textContent?.trim() || "ستون";
    // Clean up icon text if any leaked
    const cleanTitle = title.replace(/(?:مرتب‌سازی|پین|فیلتر)/g, "").trim();
    headers.push(cleanTitle || "ستون");
  });

  // Body rows: ignore hidden rows, empty states, or footer rows
  const dataRows: (string | number)[][] = [];
  if (tbody) {
    const trElements = Array.from(tbody.querySelectorAll<HTMLTableRowElement>(":scope > tr")).filter(
      (tr) =>
        tr.style.display !== "none" &&
        !tr.hasAttribute("data-empty-row") &&
        !tr.hasAttribute("data-filter-empty-row") &&
        !tr.hasAttribute("data-export-ignore") &&
        !tr.querySelector("[colspan]")
    );

    trElements.forEach((tr) => {
      const row: (string | number)[] = [];
      const cells = Array.from(tr.querySelectorAll<HTMLTableCellElement>(":scope > td, :scope > th"));

      cells.forEach((cell, idx) => {
        const th = thElements[idx];
        if (th && (th.style.display === "none" || th.hasAttribute("data-export-ignore"))) {
          return;
        }
        if (cell.style.display === "none" || cell.hasAttribute("data-export-ignore")) {
          return;
        }

        const text = cell.textContent?.trim() || "";
        const numeric = parseNumericCell(text);
        row.push(numeric !== null ? numeric : text);
      });

      if (row.length > 0) {
        dataRows.push(row);
      }
    });
  }

  return { headers, dataRows };
}

/**
 * Downloads table data as a genuine Microsoft Excel (.xlsx) spreadsheet with RTL direction.
 */
export function exportTableToExcel(
  tableElement: HTMLTableElement,
  options: { title?: string; filename?: string } = {}
) {
  try {
    const { headers, dataRows } = extractTableData(tableElement);
    if (!headers.length && !dataRows.length) {
      toast.error("داده‌ای برای خروجی اکسل یافت نشد.");
      return false;
    }

    const title = options.title || "گزارش_جدول";
    const filename = (options.filename || title).replace(/[/\\?%*:|"<>]/g, "_");

    // Build worksheet with header row + data rows
    const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);

    // Set RTL orientation for Iranian/Persian standards
    ws["!dir"] = "rtl";

    // Auto-calculate column widths
    const colWidths = headers.map((h, i) => {
      let maxLen = h.length;
      dataRows.forEach((r) => {
        const valStr = String(r[i] ?? "");
        if (valStr.length > maxLen) maxLen = Math.min(valStr.length, 50);
      });
      return { wch: Math.max(maxLen + 4, 12) };
    });
    ws["!cols"] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, title.slice(0, 31));

    const todayStr = new Intl.DateTimeFormat("fa-IR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .format(new Date())
      .replace(/\//g, "-");

    XLSX.writeFile(wb, `${filename}_${todayStr}.xlsx`);
    toast.success("فایل اکسل با موفقیت دانلود شد.");
    return true;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "خطا در تولید فایل اکسل";
    toast.error(`خطا در ایجاد خروجی اکسل: ${msg}`);
    return false;
  }
}

/**
 * Downloads table data as a UTF-8 CSV with BOM for seamless viewing in Persian Excel.
 */
export function exportTableToCsv(
  tableElement: HTMLTableElement,
  options: { title?: string; filename?: string } = {}
) {
  try {
    const { headers, dataRows } = extractTableData(tableElement);
    if (!headers.length && !dataRows.length) {
      toast.error("داده‌ای برای خروجی CSV یافت نشد.");
      return false;
    }

    const title = options.title || "گزارش_جدول";
    const filename = (options.filename || title).replace(/[/\\?%*:|"<>]/g, "_");

    const formatCsvCell = (val: string | number) => {
      const s = String(val ?? "");
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const lines: string[] = [
      headers.map(formatCsvCell).join(","),
      ...dataRows.map((r) => r.map(formatCsvCell).join(",")),
    ];

    // Prepend UTF-8 BOM (\uFEFF) so Excel natively opens it in UTF-8
    const csvContent = "\uFEFF" + lines.join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success("فایل CSV با موفقیت دانلود شد.");
    return true;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "خطا در تولید فایل CSV";
    toast.error(`خطا در ایجاد خروجی CSV: ${msg}`);
    return false;
  }
}

/**
 * Prints the table data in a high-fidelity, Persian RTL layout optimized for PDF saving.
 */
export function exportTableToPdf(
  tableElement: HTMLTableElement,
  options: { title?: string } = {}
) {
  try {
    const { headers, dataRows } = extractTableData(tableElement);
    if (!headers.length && !dataRows.length) {
      toast.error("داده‌ای برای چاپ یا PDF یافت نشد.");
      return false;
    }

    const title = options.title || "گزارش جدول اطلاعات";
    const todayStr = new Intl.DateTimeFormat("fa-IR", {
      dateStyle: "full",
    }).format(new Date());

    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "none";
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      toast.error("امکان باز کردن صفحه چاپ وجود ندارد.");
      return false;
    }

    const rowsHtml = dataRows
      .map(
        (r) =>
          `<tr>${r
            .map(
              (c) =>
                `<td>${String(c).replace(/</g, "&lt;").replace(/>/g, "&gt;")}</td>`
            )
            .join("")}</tr>`
      )
      .join("");

    const thsHtml = headers
      .map(
        (h) => `<th>${String(h).replace(/</g, "&lt;").replace(/>/g, "&gt;")}</th>`
      )
      .join("");

    doc.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="fa">
      <head>
        <meta charset="utf-8">
        <title>${title}</title>
        <style>
          @page {
            size: A4 landscape;
            margin: 12mm 10mm;
          }
          * { box-sizing: border-box; }
          body {
            font-family: IRANYekanX, Tahoma, sans-serif;
            direction: rtl;
            color: #20243f;
            margin: 0;
            padding: 16px;
            font-size: 11px;
            background: #ffffff;
          }
          .report-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #5556de;
            padding-bottom: 12px;
            margin-bottom: 16px;
          }
          .report-title {
            font-size: 16px;
            font-weight: 700;
            color: #20243f;
            margin: 0 0 4px 0;
          }
          .report-subtitle {
            font-size: 11px;
            color: #68718a;
            margin: 0;
          }
          .report-date {
            font-size: 11px;
            color: #68718a;
            text-align: end;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            text-align: start;
            margin-bottom: 20px;
          }
          thead {
            display: table-header-group;
            background-color: #f6f7fc;
          }
          th, td {
            border: 1px solid #e9ecf5;
            padding: 7px 10px;
            vertical-align: middle;
            font-size: 10.5px;
          }
          th {
            font-weight: 600;
            color: #20243f;
            white-space: nowrap;
          }
          tr:nth-child(even) {
            background-color: #fafbfe;
          }
          .report-footer {
            margin-top: 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-top: 1px solid #e9ecf5;
            padding-top: 8px;
            font-size: 10px;
            color: #68718a;
          }
        </style>
      </head>
      <body>
        <div class="report-header">
          <div>
            <h1 class="report-title">${title}</h1>
            <p class="report-subtitle">سامانه هوشمند دیدبان مالی</p>
          </div>
          <div class="report-date">
            <div>تاریخ چاپ: ${todayStr}</div>
            <div>تعداد ردیف: ${dataRows.length}</div>
          </div>
        </div>
        <table>
          <thead><tr>${thsHtml}</tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <div class="report-footer">
          <span>دیدبان مالی · مدیریت و تحلیل مالی هوشمند</span>
          <span>صفحه چاپی</span>
        </div>
      </body>
      </html>
    `);
    doc.close();

    // Trigger print after iframe renders
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } finally {
        setTimeout(() => {
          if (iframe.parentNode) {
            document.body.removeChild(iframe);
          }
        }, 1500);
      }
    }, 250);

    toast.info("پیش‌نمایش چاپ و ذخیره PDF باز شد.");
    return true;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "خطا در چاپ PDF";
    toast.error(`خطا در آماده‌سازی PDF: ${msg}`);
    return false;
  }
}
