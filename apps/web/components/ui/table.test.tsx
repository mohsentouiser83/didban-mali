import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableFooter,
  TableRowHeader,
} from "./table";

describe("Table Component & High-Density Styles", () => {
  it("renders full financial table structure with footer", () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>شرح سند</TableHead>
            <TableHead>مبلغ (ریال)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>واریز نقدی</TableCell>
            <TableCell numeric>۲,۵۰۰,۰۰۰,۰۰۰</TableCell>
          </TableRow>
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell>جمع کل</TableCell>
            <TableCell numeric>۲,۵۰۰,۰۰۰,۰۰۰</TableCell>
          </TableRow>
        </TableFooter>
      </Table>,
    );

    expect(screen.getByText("شرح سند")).toBeDefined();
    expect(screen.getByText("واریز نقدی")).toBeDefined();
    expect(screen.getByText("جمع کل")).toBeDefined();
  });

  it("applies compact density to head and cells", () => {
    render(
      <Table density="compact">
        <TableHeader>
          <TableRow>
            <TableHead>سرستون فشرده</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>سلول فشرده</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    const th = screen.getByText("سرستون فشرده");
    const td = screen.getByText("سلول فشرده");
    expect(th.className).toContain("h-9");
    expect(td.className).toContain("py-2");
  });

  it("applies selected row styling and active RTL edge indicator", () => {
    render(
      <Table>
        <TableBody>
          <TableRow selected>
            <TableCell>سطر انتخاب‌شده</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    const tr = screen.getByText("سطر انتخاب‌شده").closest("tr");
    expect(tr?.className).toContain("bg-[var(--ds-table-selected)]");
    expect(tr?.className).toContain("shadow-[inset_3px_0_0_var(--ds-primary)]");
    expect(tr?.getAttribute("aria-selected")).toBe("true");
  });

  it("applies critical risk indicator to row", () => {
    render(
      <Table>
        <TableBody>
          <TableRow risk="critical">
            <TableCell>سطر با ریسک بحرانی</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    const tr = screen.getByText("سطر با ریسک بحرانی").closest("tr");
    expect(tr?.className).toContain("shadow-[inset_3px_0_0_var(--ds-danger)]");
    expect(tr?.getAttribute("data-risk")).toBe("critical");
  });

  it("applies numeric tabular styling with the project font to cells", () => {
    render(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell numeric>۱,۲۰۰,۰۰۰</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    const td = screen.getByText("۱,۲۰۰,۰۰۰");
    expect(td.className).toContain("text-end");
    expect(td.className).toContain("tabular-nums");
    expect(td.className).not.toContain("font-mono");
  });
  it("retains row-header semantics and exposes the shared scroll container", () => {
    const containerRef = React.createRef<HTMLDivElement>();
    render(<Table aria-label="مانده مشتریان" containerRef={containerRef}><TableBody><TableRow><TableRowHeader>مشتری نمونه</TableRowHeader><TableCell>۱۲۳</TableCell></TableRow></TableBody></Table>);
    expect(screen.getByRole("rowheader", { name: "مشتری نمونه" }).getAttribute("scope")).toBe("row");
    expect(containerRef.current).toBe(screen.getByRole("region", { name: "مانده مشتریان" }));
    expect(containerRef.current?.tabIndex).toBe(0);
  });

});

it("opens a row from any cell while preserving nested actions and table semantics", () => {
  const activate = vi.fn();
  const nested = vi.fn();
  render(<Table><TableBody><TableRow onActivate={activate}><TableRowHeader><button onClick={nested}>جزئیات</button></TableRowHeader><TableCell>بحرانی</TableCell><TableCell><a href="#source" onClick={(event) => event.preventDefault()}>فایل</a></TableCell></TableRow></TableBody></Table>);
  fireEvent.click(screen.getByText("بحرانی"));
  expect(activate).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("row")).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "جزئیات" }));
  expect(nested).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("link", { name: "فایل" }));
  expect(activate).toHaveBeenCalledTimes(1);
});
