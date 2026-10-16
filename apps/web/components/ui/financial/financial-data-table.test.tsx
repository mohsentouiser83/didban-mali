import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FinancialDataTable } from "./financial-data-table";

describe("shared financial table", () => {
  it("exposes sorting and row inspection as keyboard-accessible buttons", () => {
    const onSort = vi.fn(), onRowClick = vi.fn();
    const row = { id: "1", name: "تأمین‌کننده", amount: "9007199254740993" };
    render(<FinancialDataTable tableAriaLabel="بدهی‌ها" data={[row]} columns={[{ key: "name", header: "نام", sortable: true }, { key: "amount", header: "مبلغ", numeric: true }]} keyExtractor={(item) => item.id} sortColumn="name" sortDirection="asc" onSort={onSort} onRowClick={onRowClick} selectedRowKey="1" />);
    expect(screen.getByRole("columnheader", { name: "نام" }).getAttribute("aria-sort")).toBe("ascending");
    fireEvent.click(screen.getByRole("button", { name: "نام" }));
    expect(onSort).toHaveBeenCalledWith("name");
    fireEvent.click(screen.getByRole("button", { name: "تأمین‌کننده" }));
    expect(onRowClick).toHaveBeenCalledWith(row);
    expect(screen.getByText(row.amount).closest("tr")?.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("region", { name: "بدهی‌ها" }).tabIndex).toBe(0);
  });

  it("renders an empty result across every column", () => {
    render(<FinancialDataTable data={[]} columns={[{ key: "name", header: "نام" }, { key: "amount", header: "مبلغ" }]} keyExtractor={() => ""} emptyMessage="نتیجه‌ای پیدا نشد" />);
    expect(screen.getByRole("cell", { name: "نتیجه‌ای پیدا نشد" }).getAttribute("colspan")).toBe("2");
  });
});
