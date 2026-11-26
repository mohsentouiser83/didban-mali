import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useChartSetup } from "./use-accounting-setup";
import { api } from "@/lib/api";
import type { LedgerAccount } from "@/lib/accounting";
import { useLedgerAccounts } from "./use-ledger-accounts";
vi.mock("./workspace", () => ({ useWorkspace: () => ({
  company: { id: "c" }, companyPath: (path: string) => `/companies/c/${path}`,
}) }));
vi.mock("@/lib/api", async (original) => ({ ...(await original<typeof import("@/lib/api")>()), api: vi.fn() }));
const accounts: LedgerAccount[] = [
  { id: "grp", code: "11", name: "گروه", nature: "debit", active: true, version: 1, level: "group" },
  { id: "g", code: "1101", name: "کل", nature: "debit", active: true, version: 1, level: "general", parent_id: "grp" },
  { id: "s", code: "110101", name: "معین", nature: "debit", active: true, version: 1, level: "subsidiary", parent_id: "g" },
  { id: "d", code: "11010101", name: "تفصیلی", nature: "debit", active: true, version: 1, level: "detail", parent_id: "s" },
];
beforeEach(() => {
  vi.mocked(api).mockReset();
  vi.mocked(api).mockImplementation(async (path) => path.endsWith("capabilities") ? { can_manage_accounts: true } : { items: accounts });
});
it("offers only the matching parent level, auto-suggests pattern codes, and clears a previous parent on level change", async () => {
  const { result } = renderHook(useLedgerAccounts);
  await waitFor(() => expect(result.current.catalogue.loading).toBe(false));
  act(() => result.current.open(null));
  expect(result.current.value.code).toBe("12");
  act(() => result.current.change({ name: "جدید", level: "subsidiary" }));
  expect(result.current.parentOptions.map((option) => option.value)).toEqual(["g"]);
  act(() => result.current.save());
  expect(result.current.errors.parent_id).toBeTruthy();
  expect(vi.mocked(api).mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
  act(() => result.current.change({ parent_id: "g" }));
  expect(result.current.value.code).toBe("110102");
  act(() => result.current.change({ level: "detail" }));
  expect(result.current.value.parent_id).toBe("");
  expect(result.current.parentOptions.map((option) => option.value)).toEqual(["s"]);
});
it("filters on the server, clears parent filters on level changes and resets both", async () => {
  const { result } = renderHook(useLedgerAccounts);
  act(() => result.current.setLevelFilter("detail"));
  act(() => result.current.setParentFilter("s"));
  await waitFor(() => expect(api).toHaveBeenCalledWith("/companies/c/accounting/accounts?level=detail&parent_id=s&limit=25", expect.anything()));
  act(() => result.current.setLevelFilter("group"));
  expect(result.current.parentFilter).toBe("all");
  expect(result.current.canFilterParent).toBe(false);
  act(() => result.current.resetFilters());
  expect(result.current.filtersActive).toBe(false);
});
it("submits all imported levels together so parents may follow their children", async () => {
  const rows = [
    { code: "110101", name: "معین", nature: "debit", active: true, level: "subsidiary", parent_code: "1101" },
    { code: "1101", name: "کل", nature: "debit", active: true, level: "general", parent_code: "11" },
  ];
  const { result } = renderHook(() => useChartSetup(vi.fn()));
  vi.mocked(api).mockImplementation(async (path) => path.endsWith("chart-preview") ? { preview_id: "p" } : { rows });
  await act(async () => { await result.current.loadFile(new File(["نمونه"], "chart.csv")); });
  await act(async () => { await result.current.preview(); });
  expect(api).toHaveBeenCalledWith("/companies/c/accounting/setup/chart-preview", {
    method: "POST", body: { rows },
  });
});
it("builds hierarchical tree rows, supports expand/collapse, and opens child creation pre-filled", async () => {
  const { result } = renderHook(useLedgerAccounts);
  await waitFor(() => expect(result.current.catalogue.loading).toBe(false));
  expect(result.current.treeRows.map((row) => [row.account.code, row.depth])).toEqual([
    ["11", 0],
    ["1101", 1],
    ["110101", 2],
    ["11010101", 3],
  ]);
  act(() => result.current.toggleExpand("g"));
  expect(result.current.treeRows.map((row) => row.account.code)).toEqual(["11", "1101"]);
  act(() => result.current.expandAll());
  expect(result.current.treeRows).toHaveLength(4);
  act(() => result.current.collapseAll());
  expect(result.current.treeRows.map((row) => row.account.code)).toEqual(["11"]);
  act(() => result.current.openChild(accounts[1])); // child under general "1101" -> subsidiary "110102"
  expect(result.current.value.level).toBe("subsidiary");
  expect(result.current.value.parent_id).toBe("g");
  expect(result.current.value.code).toBe("110102");
});

it("searches the full chart while a server level filter is selected", async () => {
  vi.mocked(api).mockImplementation(async (path) => {
    if (path.endsWith("capabilities")) return { can_manage_accounts: true };
    return { items: path.includes("level=subsidiary") ? [] : accounts };
  });
  const { result } = renderHook(useLedgerAccounts);
  await waitFor(() => expect(result.current.catalogue.loading).toBe(false));
  act(() => result.current.setLevelFilter("subsidiary"));
  act(() => result.current.setSearch("110101"));
  expect(result.current.rows.map((row) => row.id)).toEqual(["s"]);
  expect(result.current.serverFiltersActive).toBe(false);
});
