import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { createDefaultStudioSpec, type StudioDefinition } from "@/lib/report-studio";
import { useReportStudio } from "./use-report-studio";

const workspace = vi.hoisted(() => ({
  company: { id: "c" }, periodId: "p", companyPath: (path: string) => `/companies/c/${path}`,
}));
vi.mock("./workspace", () => ({ useWorkspace: () => workspace }));
vi.mock("@/components/ui/sonner", () => ({ notify: { success: vi.fn() } }));
vi.mock("@/lib/api", async original => ({
  ...(await original<typeof import("@/lib/api")>()), api: vi.fn(),
}));
let definition: StudioDefinition;
beforeEach(() => {
  definition = { id: "system", name: "دفتر روزنامه", system_key: "journals", can_delete: false,
    version: 1, spec: { ...createDefaultStudioSpec("stored-period"), title: "دفتر روزنامه" } };
  vi.mocked(api).mockReset().mockImplementation(async (path, options) => {
    if (String(path).endsWith("/definitions")) return [definition];
    if (String(path).endsWith("/definitions/system")) {
      const body = options?.body as { name: string; spec: StudioDefinition["spec"]; is_dashboard: boolean };
      definition = { ...definition, ...body, version: definition.version + 1 };
      return definition;
    }
    return { sections: [], company_name: "شرکت", period: { name: "دوره" } };
  });
});

it("loads the clicked system definition with the header period and saves it in place", async () => {
  const { result } = renderHook(() => useReportStudio("system"));
  await waitFor(() => expect(result.current.selectedDefinition?.id).toBe("system"));
  expect(result.current.spec.title).toBe("دفتر روزنامه");
  expect(result.current.spec.global_filters.period_id).toBe("p");
  act(() => result.current.updateSection("sec-kpis", { title: "بخش ویرایش‌شده" }));
  await act(async () => { result.current.saveTemplate("روزنامه من"); });
  await waitFor(() => expect(result.current.selectedDefinition?.version).toBe(2));
  const write = vi.mocked(api).mock.calls.find(([path]) => String(path).endsWith("/definitions/system"));
  expect(write?.[1]).toMatchObject({ method: "PATCH", version: 1, body: { name: "روزنامه من" } });
  expect(result.current.spec.sections[0].title).toBe("بخش ویرایش‌شده");
  await act(async () => { result.current.saveTemplate("روزنامه من"); });
  await waitFor(() => expect(result.current.selectedDefinition?.version).toBe(3));
  expect(vi.mocked(api).mock.calls.filter(([path]) => String(path).endsWith("/definitions/system"))[1][1]?.version).toBe(2);
});

it("does not show or preview a different default when the requested definition is missing", async () => {
  const { result } = renderHook(() => useReportStudio("missing"));
  await waitFor(() => expect(result.current.definitionsError?.message).toBe("قالب گزارش یافت نشد."));
  expect(vi.mocked(api).mock.calls.some(([path]) => String(path).endsWith("/preview"))).toBe(false);
});

it("preserves the exact selected template when save fails and uses its version again", async () => {
  const { result } = renderHook(() => useReportStudio("system"));
  await waitFor(() => expect(result.current.selectedDefinition?.id).toBe("system"));
  vi.mocked(api).mockRejectedValueOnce(new Error("conflict"));
  await act(async () => { result.current.saveTemplate("ویرایش"); });
  expect(result.current.selectedDefinition?.version).toBe(1);
  expect(result.current.error).toBeTruthy();
});
