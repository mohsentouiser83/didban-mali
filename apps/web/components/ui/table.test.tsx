import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableRowHeader,
  DataTable,
} from "./table";
import * as tableExport from "./table-export";
import { TableImportArchiveContext } from "@/hooks/table-import-archive";

describe("Table with stickyFirstColumn", () => {
  it("renders a standard table without sticky classes by default", () => {
    render(
      <Table data-testid="test-table">
        <TableHeader>
          <TableRow>
            <TableHead>عنوان</TableHead>
            <TableHead>مبلغ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>فاکتور ۱</TableCell>
            <TableCell>۱۰۰ ریال</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );

    const table = screen.getByTestId("test-table");
    expect(table.className).not.toContain("[&_thead_th:first-child]:sticky");
    const cell = screen.getByText("فاکتور ۱");
    expect(cell.className).not.toContain("sticky start-0");
  });

  it("applies sticky first column utility classes when enabled on Table", () => {
    render(
      <Table stickyFirstColumn data-testid="sticky-table">
        <TableHeader>
          <TableRow>
            <TableHead>کد معین</TableHead>
            <TableHead>نام حساب</TableHead>
            <TableHead>گردش بدهکار</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>۱۰۱۰</TableCell>
            <TableCell>صندوق مرکزی</TableCell>
            <TableCell>۵۰٬۰۰۰ ریال</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );

    const table = screen.getByTestId("sticky-table");
    expect(table.className).toContain("[&_thead_th:first-child]:sticky");
    expect(table.className).toContain("[&_tbody_td:first-child]:sticky");
    expect(table.className).toContain("start-0");
    expect(table.className).toContain("bg-surface");
    expect(table.className).toContain("shadow-[1px_0_0_0_hsl(var(--border))]");
  });

  it("applies sticky classes when explicitly passed to TableHead, TableCell, or TableRowHeader", () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead stickyFirstColumn data-testid="head-sticky">
              شناسه ردیف
            </TableHead>
            <TableHead>شرح</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableRowHeader stickyFirstColumn data-testid="rowhead-sticky">
              ردیف ۱
            </TableRowHeader>
            <TableCell stickyFirstColumn data-testid="cell-sticky">
              داده ردیف
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );

    const head = screen.getByTestId("head-sticky");
    expect(head.className).toContain("sticky start-0 z-10 bg-surface shadow-[1px_0_0_0_hsl(var(--border))]");

    const rowHead = screen.getByTestId("rowhead-sticky");
    expect(rowHead.className).toContain("sticky start-0 z-10 bg-surface shadow-[1px_0_0_0_hsl(var(--border))]");

    const cell = screen.getByTestId("cell-sticky");
    expect(cell.className).toContain("sticky start-0 z-10 bg-surface shadow-[1px_0_0_0_hsl(var(--border))]");
  });
});

describe("Table Advanced Features (Sort, Pin, Filter, Export, Import, Fullscreen)", () => {
  const sampleTable = (
    <Table title="فهرست پرسنل">
      <TableHeader>
        <TableRow>
          <TableHead>نام پرسنل</TableHead>
          <TableHead numeric>حقوق پایه</TableHead>
          <TableHead>وضعیت</TableHead>
          <TableHead>عملیات</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow data-testid="row-1">
          <TableCell>رضا احمدی</TableCell>
          <TableCell numeric>۵۰٬۰۰۰ ریال</TableCell>
          <TableCell>فعال</TableCell>
          <TableCell><button type="button">ویرایش</button></TableCell>
        </TableRow>
        <TableRow data-testid="row-2">
          <TableCell>علی موسوی</TableCell>
          <TableCell numeric>۳۰٬۰۰۰ ریال</TableCell>
          <TableCell>غیرفعال</TableCell>
          <TableCell><button type="button">ویرایش</button></TableCell>
        </TableRow>
        <TableRow data-testid="row-3">
          <TableCell>مریم کریمی</TableCell>
          <TableCell numeric>۸۰٬۰۰۰ ریال</TableCell>
          <TableCell>فعال</TableCell>
          <TableCell><button type="button">ویرایش</button></TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );

  it("shows search and export controls on a read-only table", () => {
    render(sampleTable);

    expect(screen.getByPlaceholderText("جست‌وجو در جدول")).toBeInTheDocument();
    expect(screen.getByLabelText("نمایش تمام صفحه")).toBeInTheDocument();
    expect(screen.getByLabelText("دانلود خروجی اکسل و PDF")).toBeInTheDocument();
    expect(screen.queryByLabelText("ورود اطلاعات از اکسل")).not.toBeInTheDocument();

    // Show/hide columns and reset button are removed
    expect(screen.queryByLabelText("مدیریت ستون‌ها")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("بازنشانی فیلترها")).not.toBeInTheDocument();
  });

  it("filters rows dynamically via global search input", () => {
    render(sampleTable);

    const searchInput = screen.getByPlaceholderText("جست‌وجو در جدول");
    fireEvent.change(searchInput, { target: { value: "علی" } });

    const row1 = screen.getByTestId("row-1");
    const row2 = screen.getByTestId("row-2");
    const row3 = screen.getByTestId("row-3");

    expect(row1.style.display).toBe("none");
    expect(row2.style.display).toBe("");
    expect(row3.style.display).toBe("none");

    // Clear search
    fireEvent.change(searchInput, { target: { value: "" } });
    expect(row1.style.display).toBe("");
    expect(row2.style.display).toBe("");
    expect(row3.style.display).toBe("");
  });

  it("toggles sorting when sort button on column header is clicked", () => {
    render(sampleTable);

    const sortButtons = screen.getAllByLabelText("مرتب‌سازی ستون");
    expect(sortButtons.length).toBeGreaterThan(0);

    // Click sort on numeric column (index 1: حقوق پایه)
    const numericSortBtn = sortButtons[1];
    fireEvent.click(numericSortBtn);

    // Sorted ascending: row-2 (30k), row-1 (50k), row-3 (80k)
    const rows = screen.getAllByRole("row").slice(1); // skip header row
    expect(rows[0]).toHaveAttribute("data-testid", "row-2");
    expect(rows[1]).toHaveAttribute("data-testid", "row-1");
    expect(rows[2]).toHaveAttribute("data-testid", "row-3");

    // Click again: sort descending (80k, 50k, 30k)
    fireEvent.click(numericSortBtn);
    const descRows = screen.getAllByRole("row").slice(1);
    expect(descRows[0]).toHaveAttribute("data-testid", "row-3");
    expect(descRows[1]).toHaveAttribute("data-testid", "row-1");
    expect(descRows[2]).toHaveAttribute("data-testid", "row-2");
  });

  it("toggles pinning on column when pin button is clicked", () => {
    render(sampleTable);

    const pinButtons = screen.getAllByLabelText("پین ستون");
    expect(pinButtons.length).toBe(3);

    // Pin first column
    fireEvent.click(pinButtons[0]);

    const ths = screen.getAllByRole("columnheader");
    expect(ths[0].className).toContain("sticky");
    expect(ths[0].className).toContain("z-20");

    // Unpin first column
    fireEvent.click(pinButtons[0]);
    expect(ths[0].className).not.toContain("sticky z-20");
  });

  it("hides sort, pin, and filter controls on 'عملیات' column", () => {
    render(sampleTable);

    const opTh = screen.getByRole("columnheader", { name: /عملیات/i });
    expect(opTh).toBeInTheDocument();

    expect(opTh.querySelector("button[aria-label='پین ستون']")).toBeNull();
    expect(opTh.querySelector("button[aria-label='مرتب‌سازی ستون']")).toBeNull();
    expect(opTh.querySelector("button[aria-label*='فیلتر']")).toBeNull();
  });

  it("toggles fullscreen mode and exits via Escape key", () => {
    render(sampleTable);

    const fullscreenBtn = screen.getByLabelText("نمایش تمام صفحه");
    fireEvent.click(fullscreenBtn);

    // In fullscreen
    expect(screen.getByText("خروج از تمام صفحه (Esc)")).toBeInTheDocument();

    // Escape key press
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByText("خروج از تمام صفحه (Esc)")).toBeNull();
  });

  it("opens Excel import dialog and parses text data", async () => {
    const handleImport = vi.fn();
    render(
      <Table onImport={handleImport} title="فهرست پرسنل">
        <TableHeader>
          <TableRow>
            <TableHead>نام</TableHead>
            <TableHead>کد</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>کاربر ۱</TableCell>
            <TableCell>۱۰۱</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );

    const importBtn = screen.getByLabelText("ورود اطلاعات از اکسل");
    fireEvent.click(importBtn);

    expect(screen.getByText("چسباندن مستقیم از اکسل (Paste)")).toBeInTheDocument();
    fireEvent.click(screen.getByText("چسباندن مستقیم از اکسل (Paste)"));

    const textarea = screen.getByPlaceholderText(/کد\s+نام\s+مبلغ/);
    fireEvent.change(textarea, {
      target: { value: "کد\tنام\n105\tرضا محمدی\n106\tسارا راد" },
    });

    const processBtn = screen.getByText("پردازش متن کپی‌شده");
    fireEvent.click(processBtn);

    await waitFor(() => {
      expect(screen.getByText(/پیش‌نمایش داده‌های خوانده‌شده/)).toBeInTheDocument();
    });

    const confirmBtn = screen.getByText("تأیید و ورود به جدول");
    fireEvent.click(confirmBtn);

    expect(handleImport).toHaveBeenCalledTimes(1);
    expect(handleImport).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: ["کد", "نام"],
        totalRows: 2,
      })
    );
  });

  it("triggers Excel and PDF export when requested", async () => {
    const excelSpy = vi.spyOn(tableExport, "exportTableToExcel").mockReturnValue(true);
    const pdfSpy = vi.spyOn(tableExport, "exportTableToPdf").mockReturnValue(true);

    render(sampleTable);

    const downloadBtn = screen.getByLabelText("دانلود خروجی اکسل و PDF");
    fireEvent.pointerDown(downloadBtn);

    const excelItem = await screen.findByText(/خروجی اکسل/);
    fireEvent.click(excelItem);
    expect(excelSpy).toHaveBeenCalledTimes(1);

    fireEvent.pointerDown(downloadBtn);
    const pdfItem = await screen.findByText(/خروجی PDF/);
    fireEvent.click(pdfItem);
    expect(pdfSpy).toHaveBeenCalledTimes(1);
  });

  it("renders typed DataTable with columns and data", () => {
    interface Person {
      id: number;
      name: string;
      role: string;
    }
    const data: Person[] = [
      { id: 1, name: "حسین", role: "مدیر مالی" },
      { id: 2, name: "مهسا", role: "حسابدار" },
    ];

    render(
      <DataTable
        title="تیم مالی"
        columns={[
          { key: "name", header: "نام" },
          { key: "role", header: "نقش" },
        ]}
        data={data}
      />
    );

    expect(screen.getByText("حسین")).toBeInTheDocument();
    expect(screen.getByText("مدیر مالی")).toBeInTheDocument();
    expect(screen.getByText("مهسا")).toBeInTheDocument();
  });
});

it("archives the selected original before passing parsed rows to a table import", async () => {
  const calls: string[] = [];
  const archive = vi.fn(async () => { calls.push("archive"); });
  const ingest = vi.fn(() => { calls.push("import"); });
  render(
    <TableImportArchiveContext.Provider value={archive}>
      <Table onImport={ingest} title="نمونه" />
    </TableImportArchiveContext.Provider>,
  );

  fireEvent.click(screen.getByLabelText("ورود اطلاعات از اکسل"));
  const file = new File(["code,name\n101,Sample"], "import.csv", { type: "text/csv" });
  const chooser = screen.getByRole("dialog").querySelector("input[type=file]")!;
  fireEvent.change(chooser, { target: { files: [file] } });
  await screen.findByText(/پیش‌نمایش داده‌های خوانده‌شده/);
  fireEvent.click(screen.getByRole("button", { name: "تأیید و ورود به جدول" }));

  await waitFor(() => expect(calls).toEqual(["archive", "import"]));
  expect(archive).toHaveBeenCalledWith(file);
  expect(ingest).toHaveBeenCalledWith(expect.objectContaining({ file, totalRows: 1 }));
});
