import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { useAutomationRules } from "./use-automation-rules";
const financial = vi.hoisted(() => ({
  manifest: {
    id: "manifest-a",
    metrics: [{ metric_key: "cash", label: "نقد", value: "100" }],
  },
  workspace: {
    company: { id: "a" },
    companyPath: (path: string) => `/companies/a/${path}`,
  },
}));
vi.mock("./use-financial-view", () => ({ useFinancialView: () => financial }));
vi.mock("./use-resource", () => ({
  useResource: () => ({
    data: { can_manage: true, can_learn: true },
    refresh: vi.fn(),
  }),
}));
vi.mock("./use-paged-resource", () => ({
  usePagedResource: () => ({ data: { items: [] }, refresh: vi.fn() }),
}));
vi.mock("@/components/ui/sonner", () => ({ notify: { success: vi.fn() } }));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  api: vi.fn(),
}));
beforeEach(() => {
  vi.mocked(api)
    .mockReset()
    .mockImplementation(async (path, options) =>
      path.endsWith("preview")
        ? {
            preview_id: "proof",
            status: "available",
            match_count: 1,
            matches: [],
            definition: options?.body,
          }
        : {},
    );
  financial.workspace.company.id = "a";
  financial.manifest.id = "manifest-a";
});
it("binds preview proof to the exact definition and drops it when conditions change", async () => {
  const { result } = renderHook(useAutomationRules);
  act(() => {
    void result.current.previewNow();
  });
  await waitFor(() => expect(result.current.canEnable).toBe(true));
  act(() => result.current.set({ name: "قاعده", enabled: true }));
  act(() => {
    void result.current.save();
  });
  await waitFor(() =>
    expect(
      vi
        .mocked(api)
        .mock.calls.some(
          ([path, options]) =>
            path.endsWith("rules") &&
            !!(options?.body as { preview_id?: string })?.preview_id,
        ),
    ).toBe(true),
  );
  act(() => result.current.changeCondition(0, { value: "999" }));
  expect(result.current.canEnable).toBe(false);
  expect(result.current.preview).toBeNull();
});
it("discards preview when the company or manifest changes", async () => {
  const { result, rerender } = renderHook(useAutomationRules);
  act(() => {
    void result.current.previewNow();
  });
  await waitFor(() => expect(result.current.canEnable).toBe(true));
  financial.manifest.id = "manifest-b";
  rerender();
  expect(result.current.preview).toBeNull();
  financial.workspace.company.id = "b";
  rerender();
  expect(result.current.local.name).toBe("");
  expect(result.current.canEnable).toBe(false);
});
it("prevents a metric rule from retaining invoice-only followup and fields", () => {
  const { result } = renderHook(useAutomationRules);
  act(() => result.current.changeScope("invoice"));
  act(() => result.current.setDefinition({ action: "followup" }));
  act(() => result.current.changeScope("metric"));
  expect(result.current.local.definition.action).toBe("notify");
  expect(result.current.local.definition.conditions[0].field).toBe("value");
});
it("invalidates invoice draft preview when account mapping changes and clears it outside invoice scope", async () => {
  const { result } = renderHook(useAutomationRules);
  act(() => result.current.changeScope("invoice"));
  act(() => result.current.setDefinition({ action: "prepare_draft" }));
  expect(result.current.local.definition.draft_template?.kind).toBe(
    "sale_service",
  );
  act(() => result.current.changeTemplateAccount("trade_receivable", "ar"));
  act(() => result.current.changeTemplateAccount("service_revenue", "revenue"));
  act(() => {
    void result.current.previewNow();
  });
  await waitFor(() => expect(result.current.canEnable).toBe(true));
  act(() => result.current.changeTemplateAccount("service_revenue", "changed"));
  expect(result.current.canEnable).toBe(false);
  act(() => result.current.changeScope("metric"));
  expect(result.current.local.definition.action).toBe("notify");
  expect(result.current.local.definition.draft_template).toBeNull();
});
it("uses native-book preview independently of imported manifests and resets source-only fields", async () => {
  Object.assign(financial.workspace, {
    periodId: "p",
    periods: [{ id: "p", name: "دوره" }],
  });
  const { result, rerender } = renderHook(useAutomationRules);
  act(() => result.current.changeScope("native_journal"));
  expect(result.current.local.definition.period_id).toBe("p");
  expect(
    result.current.fieldOptions.some((row) => row.value === "account_id"),
  ).toBe(true);
  expect(
    result.current.fieldOptions.some((row) => row.value === "remaining"),
  ).toBe(false);
  act(() => {
    void result.current.previewNow();
  });
  await waitFor(() => expect(result.current.canEnable).toBe(true));
  expect(
    vi
      .mocked(api)
      .mock.calls.some(
        ([path, options]) =>
          path.endsWith("native-preview") &&
          !(options?.body as { manifest_id?: string }).manifest_id,
      ),
  ).toBe(true);
  financial.manifest.id = "unrelated-imported-version";
  rerender();
  expect(result.current.canEnable).toBe(true);
  act(() => result.current.changeCondition(0, { field: "date" }));
  expect(result.current.canEnable).toBe(false);
  expect(result.current.conditionRows[0].date).toBe(true);
  expect(
    result.current.conditionRows[0].operators.some(
      (row) => row.value === "contains",
    ),
  ).toBe(false);
  act(() => result.current.changeScope("invoice"));
  expect(result.current.local.definition.period_id).toBe("");
  expect(
    result.current.fieldOptions.some((row) => row.value === "account_id"),
  ).toBe(false);
});

it("keeps the editor closed until requested, preserves failed input and closes after saving", async () => {
  const { result, rerender } = renderHook(useAutomationRules);
  expect(result.current.editorOpen).toBe(false);
  act(() => result.current.load(null));
  expect(result.current.editorOpen).toBe(true);
  act(() => result.current.set({ name: "قاعده آزمایش" }));
  vi.mocked(api).mockRejectedValueOnce(new Error("offline"));
  await act(async () => { await result.current.save(); });
  expect(result.current.editorOpen).toBe(true);
  expect(result.current.local.name).toBe("قاعده آزمایش");
  vi.mocked(api).mockResolvedValueOnce({ id: "rule-1", name: "قاعده آزمایش", enabled: false, definition: result.current.local.definition });
  await act(async () => { await result.current.save(); });
  expect(result.current.editorOpen).toBe(false);
  act(() => result.current.load(null));
  financial.workspace.company.id = "b";
  rerender();
  expect(result.current.editorOpen).toBe(false);
});
