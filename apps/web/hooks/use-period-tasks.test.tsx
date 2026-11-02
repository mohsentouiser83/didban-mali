import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { usePeriodTasks, type PeriodTask } from "./use-period-tasks";
vi.mock("./workspace", () => ({
  useWorkspace: () => ({
    canWrite: true,
    companyPath: (s: string) => `/companies/c/${s}`,
  }),
}));
const source = vi.hoisted(() => ({ paths: [] as (string | null)[] }));
vi.mock("./use-resource", () => ({
  useResource: (path: string | null) => {
    source.paths.push(path);
    return {
      data: { items: [{ membership_id: "fm", name: "مدیر مالی" }] },
      refresh: vi.fn(),
    };
  },
}));
vi.mock("@/components/ui/sonner", () => ({ notify: { success: vi.fn() } }));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  api: vi.fn(),
}));
beforeEach(() => vi.mocked(api).mockReset().mockResolvedValue({}));
it("requires reason and submits task completion against exact item version", async () => {
  const refresh = vi.fn();
  const { result } = renderHook(() => usePeriodTasks("p", refresh));
  const item = {
    id: "task",
    version: 3,
    title: "تطبیق بانک",
    required: true,
    responsible_member_id: null,
    due_date: null,
    active: true,
    completed: false,
    completion_reason: null,
    completed_by: null,
    completed_at: null,
  } satisfies PeriodTask;
  act(() => result.current.edit(item));
  act(() => {
    void result.current.save();
  });
  expect(api).not.toHaveBeenCalled();
  act(() =>
    result.current.set({ completed: true, reason: "با نامه بانک تطبیق شد" }),
  );
  await act(async () => {
    await result.current.save();
  });
  expect(api).toHaveBeenCalledWith(
    "/companies/c/financial-periods/p/checklist-items/task",
    expect.objectContaining({
      method: "PATCH",
      version: 3,
      body: expect.objectContaining({
        completed: true,
        reason: "با نامه بانک تطبیق شد",
        responsible_member_id: null,
        due_date: null,
      }),
    }),
  );
  await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  expect(result.current.open).toBe(false);
});

it("reads only safe collaborator names for assignment, never the owner-only members API", () => {
  source.paths = [];
  const { result } = renderHook(() => usePeriodTasks("p", vi.fn()));
  expect(source.paths).toEqual(["/companies/c/control/assignees"]);
  expect(result.current.members.data?.items[0]).toEqual({
    membership_id: "fm",
    name: "مدیر مالی",
  });
});
