import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api, ApiError } from "@/lib/api";
import { defaultSpec, type BuilderSnapshot } from "@/lib/report-builder";
import { useReportBuilder } from "./use-report-builder";
const workspace = vi.hoisted(() => ({
  company: { id: "a" },
  periodId: "p",
  canWrite: true,
  companyPath: (resource: string) => `/companies/a/${resource}`,
}));
vi.mock("./workspace", () => ({ useWorkspace: () => workspace }));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  api: vi.fn(),
}));
vi.mock("@/components/ui/sonner", () => ({ notify: { success: vi.fn() } }));
const snapshot: BuilderSnapshot = {
  manifest_id: "frozen-manifest",
  spec: defaultSpec("p"),
  period: {},
  columns: [],
  rows: [],
  row_count: 0,
  evidence_refs: [],
  limitations: [],
  unit: "IRR",
};
beforeEach(() => {
  vi.mocked(api)
    .mockReset()
    .mockImplementation(async (path, options) => {
      if (!options?.method || options.method === "GET") return { items: [] };
      if (path.endsWith("preview")) return snapshot;
      throw new ApiError(409, "تعریف تغییر کرده است.", "version_conflict");
    });
});
it("requires a fresh preview after changing filters and never saves an unseen selection", async () => {
  const { result } = renderHook(useReportBuilder);
  act(() => result.current.buildPreview());
  await waitFor(() =>
    expect(result.current.preview?.manifest_id).toBe("frozen-manifest"),
  );
  act(() => result.current.setName("آزمون"));
  act(() => result.current.selectKind("invoices"));
  expect(result.current.preview).toBeUndefined();
  act(() => result.current.save());
  expect(
    vi
      .mocked(api)
      .mock.calls.some(
        ([path, options]) =>
          path.endsWith("definitions") && options?.method === "POST",
      ),
  ).toBe(false);
});
it("pins the preview manifest on save and retains edits on a version failure", async () => {
  const { result } = renderHook(useReportBuilder);
  act(() =>
    result.current.open({
      id: "definition",
      name: "نسخه قبلی",
      version: 7,
      spec: defaultSpec("p"),
    }),
  );
  act(() => result.current.buildPreview());
  await waitFor(() => expect(result.current.preview).toBeTruthy());
  act(() => result.current.setName("نسخه اصلاح‌شده"));
  act(() => result.current.save());
  await waitFor(() =>
    expect(result.current.command.error?.code).toBe("version_conflict"),
  );
  expect(result.current.name).toBe("نسخه اصلاح‌شده");
  expect(result.current.preview?.manifest_id).toBe("frozen-manifest");
  expect(
    vi
      .mocked(api)
      .mock.calls.find(([, options]) => options?.method === "PATCH"),
  ).toEqual([
    "/companies/a/report-builder/definitions/definition",
    expect.objectContaining({
      version: 7,
      body: expect.objectContaining({ preview_manifest_id: "frozen-manifest" }),
    }),
  ]);
});

it("pins a native source on save and never sends an imported manifest ID", async () => {
  const native = {
    ...snapshot,
    manifest_id: null,
    native_statement_id: "fixed-native",
    source: "native_statement" as const,
    spec: defaultSpec("p", "metrics", "native_statement"),
    as_of: "2026-11-01",
  };
  vi.mocked(api).mockImplementation(async (path, options) => {
    if (!options?.method || options.method === "GET") return { items: [] };
    if (path.endsWith("preview")) return native;
    throw new ApiError(409, "تعارض", "version_conflict");
  });
  const { result } = renderHook(useReportBuilder);
  act(() => result.current.selectSource("native_statement"));
  expect(result.current.spec.metric_keys).not.toContain("net_profit");
  act(() => result.current.buildPreview());
  await waitFor(() =>
    expect(result.current.preview?.native_statement_id).toBe("fixed-native"),
  );
  act(() => result.current.setName("دفتر"));
  act(() => result.current.save());
  await waitFor(() =>
    expect(result.current.command.error?.code).toBe("version_conflict"),
  );
  expect(
    vi
      .mocked(api)
      .mock.calls.find(
        ([path, options]) =>
          path.endsWith("definitions") && options?.method === "POST",
      )?.[1]?.body,
  ).toEqual(
    expect.objectContaining({
      preview_manifest_id: null,
      preview_native_statement_id: "fixed-native",
      spec: expect.objectContaining({ source: "native_statement" }),
    }),
  );
  act(() => result.current.selectSource("imported_manifest"));
  expect(result.current.preview).toBeUndefined();
});

it("ignores an old preview response after the source selection changes", async () => {
  let complete!: (value: BuilderSnapshot) => void;
  vi.mocked(api).mockImplementation(async (path, options) => {
    if (path.endsWith("preview") && options?.method === "POST")
      return new Promise<BuilderSnapshot>((resolve) => {
        complete = resolve;
      });
    return { items: [] };
  });
  const { result } = renderHook(useReportBuilder);
  act(() => result.current.buildPreview());
  act(() => result.current.selectSource("native_statement"));
  await act(async () => complete(snapshot));
  expect(result.current.spec.source).toBe("native_statement");
  expect(result.current.preview).toBeUndefined();
});

it("pins a native invoice snapshot and keeps the invoice filter source on save", async () => {
  const native = {
    ...snapshot,
    manifest_id: null,
    source: "native_invoice" as const,
    native_invoice_snapshot_id: "invoice-snapshot",
    spec: defaultSpec("p", "invoices", "native_invoice"),
  };
  vi.mocked(api).mockImplementation(async (path, options) => {
    if (!options?.method || options.method === "GET") return { items: [] };
    if (path.endsWith("preview")) return native;
    throw new ApiError(409, "تعارض", "version_conflict");
  });
  const { result } = renderHook(useReportBuilder);
  act(() => result.current.selectSource("native_invoice"));
  expect(result.current.spec.kind).toBe("invoices");
  expect(result.current.spec.basis).toBe("invoice");
  act(() => result.current.buildPreview());
  await waitFor(() =>
    expect(result.current.preview?.native_invoice_snapshot_id).toBe(
      "invoice-snapshot",
    ),
  );
  act(() => result.current.setName("فاکتور"));
  act(() => result.current.save());
  await waitFor(() =>
    expect(result.current.command.error?.code).toBe("version_conflict"),
  );
  expect(
    vi
      .mocked(api)
      .mock.calls.find(
        ([path, options]) =>
          path.endsWith("definitions") && options?.method === "POST",
      )?.[1]?.body,
  ).toEqual(
    expect.objectContaining({
      preview_native_invoice_snapshot_id: "invoice-snapshot",
      preview_manifest_id: null,
      spec: expect.objectContaining({
        source: "native_invoice",
        kind: "invoices",
      }),
    }),
  );
});
