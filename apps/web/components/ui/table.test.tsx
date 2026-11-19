import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableRowHeader,
} from "./table";

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
      </Table>,
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
      </Table>,
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
      </Table>,
    );

    const head = screen.getByTestId("head-sticky");
    expect(head.className).toContain("sticky start-0 z-10 bg-surface shadow-[1px_0_0_0_hsl(var(--border))]");

    const rowHead = screen.getByTestId("rowhead-sticky");
    expect(rowHead.className).toContain("sticky start-0 z-10 bg-surface shadow-[1px_0_0_0_hsl(var(--border))]");

    const cell = screen.getByTestId("cell-sticky");
    expect(cell.className).toContain("sticky start-0 z-10 bg-surface shadow-[1px_0_0_0_hsl(var(--border))]");
  });
});
