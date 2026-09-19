import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableFooter,
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

  it("applies numeric left-aligned tabular styling to cells", () => {
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
    expect(td.className).toContain("text-left");
    expect(td.className).toContain("font-mono");
  });
});
