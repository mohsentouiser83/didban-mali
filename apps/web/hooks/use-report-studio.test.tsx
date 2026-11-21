import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { useReportStudio } from "./use-report-studio";

const workspace = vi.hoisted(() => ({
  company: { id: "comp-1", name: "شرکت تست" },
  periodId: "period-1",
  periods: [{ id: "period-1", name: "پاییز ۱۴۰۵" }],
  canWrite: true,
  companyPath: (res: string) => `/companies/comp-1/${res}`,
}));

vi.mock("./workspace", () => ({ useWorkspace: () => workspace }));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  api: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(api).mockReset().mockImplementation(async (path, options) => {
    if (!options?.method || options.method === "GET") {
      if (path.includes("definitions")) {
        return [
          {
            id: "def-1",
            name: "قالب تستی",
            version: 1,
            spec: {
              title: "قالب تستی",
              description: "",
              global_filters: { period_id: "period-1", basis: "all", unit: "IRR" },
              sections: [],
            },
          },
        ];
      }
      return [];
    }
    if (path.includes("preview")) {
      return {
        title: "پیش‌نمایش داشبورد",
        description: "",
        company_name: "شرکت تست",
        period: { id: "period-1", name: "پاییز ۱۴۰۵", start: "2026-09-23", end: "2026-12-21" },
        global_filters: { period_id: "period-1", basis: "all", unit: "IRR" },
        sections: [
          {
            id: "sec-1",
            title: "شاخص‌ها",
            layout: "grid-4",
            widgets: [
              {
                id: "w-1",
                title: "فروش",
                type: "kpi_card",
                entity: "invoices",
                metric: "sales_total",
                data: { value: 1000000, formatted_value: "۱٬۰۰۰٬۰۰۰", unit: "ریال" },
              },
            ],
          },
        ],
      };
    }
    if (path.includes("interpret")) {
      return {
        title: "داشبورد هوشمند فروش",
        description: "",
        global_filters: { period_id: "period-1", basis: "all", unit: "IRR" },
        sections: [
          {
            id: "sec-ai-1",
            title: "فروش و مطالبات",
            layout: "grid-2",
            widgets: [],
          },
        ],
      };
    }
    return { id: "saved-id", name: "ذخیره‌شده" };
  });
});

it("initializes with default sections and fetches live preview", async () => {
  const { result } = renderHook(() => useReportStudio());

  expect(result.current.spec.title).toBe("گزارش جدید");
  expect(result.current.spec.sections.length).toBeGreaterThanOrEqual(2);

  await waitFor(() => {
    expect(result.current.preview?.title).toBe("پیش‌نمایش داشبورد");
  });

  expect(result.current.definitions.length).toBe(1);
  expect(result.current.definitions[0].name).toBe("قالب تستی");
});

it("allows adding, updating, and removing sections", async () => {
  const { result } = renderHook(() => useReportStudio());

  act(() => {
    result.current.addSection("grid-3");
  });

  const lastSection = result.current.spec.sections[result.current.spec.sections.length - 1];
  expect(lastSection.layout).toBe("grid-3");

  act(() => {
    result.current.updateSection(lastSection.id, { title: "بخش تست به‌روزرسانی" });
  });

  const updated = result.current.spec.sections.find((s) => s.id === lastSection.id);
  expect(updated?.title).toBe("بخش تست به‌روزرسانی");

  act(() => {
    result.current.removeSection(lastSection.id);
  });

  expect(result.current.spec.sections.some((s) => s.id === lastSection.id)).toBe(false);
});

it("handles AI prompt interpretation", async () => {
  const { result } = renderHook(() => useReportStudio());

  act(() => {
    result.current.interpretPrompt("گزارش فروش فصلی بساز");
  });

  await waitFor(() => {
    expect(result.current.spec.title).toBe("داشبورد هوشمند فروش");
    expect(result.current.aiMessage).toContain("پیکربندی شد");
  });
});
