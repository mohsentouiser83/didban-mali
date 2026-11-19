import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api, type NumberingRule } from "@/lib/api";
import { useNumberingSystem } from "./use-numbering-system";

const mockRules: NumberingRule[] = [
  {
    id: "r-1",
    company_id: "c-1",
    entity_type: "journal_entry",
    entity_title: "اسناد حسابداری",
    prefix: "",
    start_number: 1,
    current_number: 1,
    padding: 3,
    suffix: "",
    sample: "001",
    description: "شماره‌گذاری اسناد",
    is_system: true,
    active: true,
    version: 1,
  },
  {
    id: "r-2",
    company_id: "c-1",
    entity_type: "sales_invoice",
    entity_title: "فاکتور فروش",
    prefix: "",
    start_number: 1,
    current_number: 1,
    padding: 3,
    suffix: "",
    sample: "001",
    description: "شماره‌گذاری فاکتور فروش",
    is_system: true,
    active: true,
    version: 1,
  },
];

const mockWorkspace = {
  company: { id: "c-1", role: "owner" },
  canWrite: true,
  companyPath: (p: string) => `/companies/c-1/${p}`,
};

const refreshMock = vi.fn();

vi.mock("./workspace", () => ({
  useWorkspace: () => mockWorkspace,
}));

vi.mock("./use-resource", () => ({
  useResource: () => ({
    data: mockRules,
    loading: false,
    error: undefined,
    refresh: refreshMock,
  }),
}));

vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  api: vi.fn(),
}));

vi.mock("@/components/ui/sonner", () => ({
  notify: { success: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

it("loads default numbering rules all starting with 001", () => {
  const { result } = renderHook(() => useNumberingSystem());
  expect(result.current.rules.length).toBe(2);
  expect(result.current.rules[0].sample).toBe("001");
  expect(result.current.rules[1].sample).toBe("001");
});

it("filters rules by search term", () => {
  const { result } = renderHook(() => useNumberingSystem());
  act(() => {
    result.current.setSearch("فاکتور");
  });
  expect(result.current.rules.length).toBe(1);
  expect(result.current.rules[0].entity_type).toBe("sales_invoice");
});

it("computes live formatted preview when editing fields", () => {
  const { result } = renderHook(() => useNumberingSystem());

  act(() => {
    result.current.open(mockRules[1]);
  });

  expect(result.current.editing?.id).toBe("r-2");
  expect(result.current.livePreview).toBe("001");

  act(() => {
    result.current.change({ prefix: "INV-", padding: 4, current_number: 12, suffix: "/1403" });
  });

  expect(result.current.livePreview).toBe("INV-0012/1403");
});

it("saves edited rule via PATCH with version check and refreshes", async () => {
  vi.mocked(api).mockResolvedValueOnce({
    ...mockRules[1],
    prefix: "INV-",
    sample: "INV-001",
    version: 2,
  });

  const { result } = renderHook(() => useNumberingSystem());

  act(() => {
    result.current.open(mockRules[1]);
    result.current.change({ prefix: "INV-" });
  });

  await act(async () => {
    result.current.save();
  });

  expect(api).toHaveBeenCalledWith(
    "/companies/c-1/numbering/r-2",
    expect.objectContaining({
      method: "PATCH",
      version: 1,
      body: expect.objectContaining({
        prefix: "INV-",
      }),
    }),
  );

  expect(refreshMock).toHaveBeenCalled();
  expect(result.current.editing).toBeUndefined();
});

it("does not expose any delete operation", () => {
  const { result } = renderHook(() => useNumberingSystem());
  expect((result.current as Record<string, unknown>).delete).toBeUndefined();
  expect((result.current as Record<string, unknown>).remove).toBeUndefined();
});
