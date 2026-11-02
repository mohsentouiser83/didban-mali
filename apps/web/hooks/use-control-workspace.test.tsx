import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api, ApiError } from "@/lib/api";
import type { ControlCase, ControlSelection } from "@/lib/control";
import {
  useCollectionFollowups,
  useControlCasePanel,
} from "./use-control-workspace";
const workspace = vi.hoisted(() => ({
  company: { id: "c" },
  canWrite: true,
  companyPath: (resource: string) =>
    `/companies/${workspace.company.id}/${resource}`,
}));
vi.mock("./workspace", () => ({ useWorkspace: () => workspace }));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  api: vi.fn(),
}));
vi.mock("@/components/ui/sonner", () => ({ notify: { success: vi.fn() } }));
function caseValue(version = 1): ControlCase {
  return {
    id: "case-a",
    version,
    finding_id: null,
    invoice_id: "invoice-a",
    assignee_membership_id: null,
    assignee_name: null,
    assignee_active: false,
    due_date: null,
    state: "open",
    next_action: "قبلی",
    resolution_reason: null,
    source_snapshot: {
      kind: "invoice",
      id: "invoice-a",
      title: "فاکتور",
      evidence_refs: ["row-a"],
      amount: "100",
      remaining: "100",
      as_of_date: "2026-11-01",
    },
  };
}
function selection(value = caseValue()): ControlSelection {
  return {
    kind: "invoice",
    subject_id: "invoice-a",
    source: value.source_snapshot,
    case: value,
  };
}
beforeEach(() => {
  vi.mocked(api).mockReset();
});
it("does not silently adopt a new server version over unsaved fields", async () => {
  vi.mocked(api).mockImplementation(async (path) =>
    path.endsWith("case-a") ? caseValue(2) : { items: [] },
  );
  const { result } = renderHook(() => useControlCasePanel(vi.fn()));
  act(() => result.current.open(selection()));
  act(() =>
    result.current.change({ next_action: "تغییر محلی", reason: "دلیل" }),
  );
  await waitFor(() => expect(result.current.newerVersionAvailable).toBe(true));
  expect(result.current.currentCase?.version).toBe(1);
  expect(result.current.value.next_action).toBe("تغییر محلی");
  act(() => result.current.save());
  expect(
    vi
      .mocked(api)
      .mock.calls.some(([, options]) => options?.method === "PATCH"),
  ).toBe(false);
  act(() => result.current.reloadLatest());
  expect(result.current.currentCase?.version).toBe(2);
  expect(result.current.value.next_action).toBe("قبلی");
});
it("records an activity with the displayed version and preserves unsaved metadata", async () => {
  let version = 1;
  vi.mocked(api).mockImplementation(async (path, options) => {
    if (options?.method === "POST") {
      version = 2;
      return caseValue(version);
    }
    return path.endsWith("case-a") ? caseValue(version) : { items: [] };
  });
  const refresh = vi.fn();
  const { result } = renderHook(() => useControlCasePanel(refresh));
  act(() => result.current.open(selection()));
  await waitFor(() => expect(result.current.detail.loading).toBe(false));
  act(() => {
    result.current.change({ next_action: "هنوز ذخیره نشده" });
    result.current.changeActivity({ message: "نتیجه تماس" });
  });
  act(() => result.current.addActivity());
  await waitFor(() => expect(result.current.currentCase?.version).toBe(2));
  expect(result.current.value.next_action).toBe("هنوز ذخیره نشده");
  expect(result.current.activity.message).toBe("");
  expect(
    vi.mocked(api).mock.calls.find(([, options]) => options?.method === "POST"),
  ).toEqual([
    "/companies/c/control/cases/case-a/activities",
    expect.objectContaining({
      version: 1,
      body: {
        kind: "comment",
        message: "نتیجه تماس",
        unit: "IRR",
        promise_date: null,
        promise_amount: null,
      },
    }),
  ]);
  expect(refresh).toHaveBeenCalled();
});
it("keeps a failed update and its original version without discarding edits", async () => {
  vi.mocked(api).mockImplementation(async (path, options) => {
    if (options?.method === "PATCH")
      throw new ApiError(409, "پرونده تغییر کرده است.", "version_conflict");
    return path.endsWith("case-a") ? caseValue() : { items: [] };
  });
  const { result } = renderHook(() => useControlCasePanel(vi.fn()));
  act(() => result.current.open(selection()));
  await waitFor(() => expect(result.current.detail.loading).toBe(false));
  act(() =>
    result.current.change({
      next_action: "کار جدید",
      state: "resolved",
      reason: "انجام شد",
    }),
  );
  act(() => result.current.save());
  await waitFor(() =>
    expect(result.current.command.error?.code).toBe("version_conflict"),
  );
  expect(result.current.value.next_action).toBe("کار جدید");
  expect(result.current.currentCase?.version).toBe(1);
});
it("requires a promise date locally and associates the error with that field", async () => {
  vi.mocked(api).mockImplementation(async (path) =>
    path.endsWith("case-a") ? caseValue() : { items: [] },
  );
  const { result } = renderHook(() => useControlCasePanel(vi.fn()));
  act(() => result.current.open(selection()));
  act(() =>
    result.current.changeActivity({ kind: "promise", message: "وعده پرداخت" }),
  );
  act(() => result.current.addActivity());
  expect(
    result.current.activityFieldErrors["control-promise-date"],
  ).toBeTruthy();
  expect(result.current.activityError).toBeUndefined();
  expect(
    vi.mocked(api).mock.calls.some(([, options]) => options?.method === "POST"),
  ).toBe(false);
});
it("distinguishes missing report date from missing invoice due date", async () => {
  vi.mocked(api).mockResolvedValue({
    items: [{ id: "invoice-a", due_date: "2026-10-01", overdue_days: null }],
    as_of_date: null,
    total: 1,
  });
  const { result } = renderHook(useCollectionFollowups);
  await waitFor(() => expect(result.current.resource.loading).toBe(false));
  expect(result.current.rows[0].delayLabel).toBe("تاریخ مبنای گزارش نامشخص");
});
