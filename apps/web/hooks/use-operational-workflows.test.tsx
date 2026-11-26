import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api, type EmployeeContract } from "@/lib/api";
import { useCheques, type Cheque } from "./use-cheques";
import { useContracts } from "./use-contracts";
import { useInventoryCardex } from "./use-inventory-cardex";

vi.mock("./workspace", () => ({
  useWorkspace: () => ({
    company: { id: "company" },
    companyPath: (path: string) => `/companies/company/${path}`,
    periodId: "period",
    periods: [{ id: "period", start: "2026-01-01", end: "2026-12-31" }],
    canWrite: true,
  }),
}));
vi.mock("@/lib/api", async (original) => ({ ...(await original<typeof import("@/lib/api")>()), api: vi.fn() }));

beforeEach(() => {
  vi.mocked(api).mockReset();
});

it("does not fetch payroll data when the current member lacks payroll access", async () => {
  vi.mocked(api).mockResolvedValue({ can_view_payroll: false, can_prepare: true });
  const { result } = renderHook(useContracts);
  await waitFor(() => expect(result.current.error?.status).toBe(403));

  act(() => result.current.openAdd());
  expect(result.current.canPrepare).toBe(false);
  expect(result.current.formOpen).toBe(false);
  expect(vi.mocked(api).mock.calls.map(([path]) => path)).toEqual([
    "/companies/company/accounting/capabilities",
  ]);
});

it("edits legal contract details with the version and leaves the employee out of PATCH", async () => {
  vi.mocked(api).mockImplementation(async (path) =>
    path.endsWith("capabilities") ? { can_view_payroll: true, can_prepare: true } as never : { items: [] } as never,
  );
  const { result } = renderHook(useContracts);
  await waitFor(() => expect(result.current.canPrepare).toBe(true));
  const contract = {
    id: "contract", employee_id: "employee", contract_type: "part_time", start_date: "2026-01-01",
    version: 3, workshop_id: "workshop", weekly_hours: "30",
  } as EmployeeContract;

  act(() => result.current.openEdit(contract));
  act(() => result.current.setForm({ ...result.current.form, work_location: "دفتر شعبه" }));
  await act(() => result.current.save());

  const [, request] = vi.mocked(api).mock.calls.find(([, opts]) => opts?.method === "PATCH") ?? [];
  expect(request).toMatchObject({
    version: 3,
    body: { workshop_id: "workshop", weekly_hours: "30", work_location: "دفتر شعبه" },
  });
  expect(request?.body).not.toHaveProperty("employee_id");
});

it("keeps the filtered cheque list separate from event URLs and normalizes manual Sayad IDs", async () => {
  vi.mocked(api).mockResolvedValue({ items: [] });
  const { result } = renderHook(useCheques);

  act(() => result.current.setDirectionFilter("received"));
  act(() => result.current.inspect({ id: "cheque", direction: "received", state: "received" } as Cheque));
  await waitFor(() => expect(api).toHaveBeenCalledWith(
    "/companies/company/cheques/cheque/events?limit=25",
    expect.anything(),
  ));

  act(() => result.current.showCreate());
  act(() => result.current.change({ sayad_id: "۱۲۳۴۵۶۷۸۹۰۱۲۳۴۵۶", issue_date: "2026-02-01", due_date: "2026-02-03" }));
  act(() => result.current.create());
  await waitFor(() => expect(api).toHaveBeenCalledWith(
    "/companies/company/cheques",
    { method: "POST", body: expect.objectContaining({ sayad_id: "1234567890123456", received_date: null }) },
  ));
});

it("applies the selected warehouse and date range to every cardex page", async () => {
  vi.mocked(api).mockResolvedValue({ rows: [], total_records: 30 });
  const { result } = renderHook(() => useInventoryCardex({ itemId: "item", warehouseId: "warehouse", asOf: "2026-06-30" }));
  act(() => result.current.changeFrom("2026-06-01"));
  await waitFor(() => expect(result.current.pagination.total).toBe(30));
  act(() => result.current.pagination.onNext());
  await waitFor(() => expect(api).toHaveBeenLastCalledWith(
    "/companies/company/accounting/inventory/cardex?limit=25&offset=25&item_id=item&warehouse_id=warehouse&from_date=2026-06-01&to_date=2026-06-30",
    expect.anything(),
  ));
});
