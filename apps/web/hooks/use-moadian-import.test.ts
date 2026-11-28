import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { useMoadianImport } from "./use-moadian-import";

const { api, push } = vi.hoisted(() => ({ api: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("./workspace", () => ({
  useWorkspace: () => ({ companyPath: (path: string) => `/companies/company/${path}`, periodId: "period" }),
}));
vi.mock("@/lib/api", () => ({ api }));

beforeEach(() => {
  api.mockReset().mockResolvedValue({ id: "report" });
  push.mockReset();
});

test("imports the original workpaper in its selected company and period", async () => {
  const file = new File(["tax_id,amount\nA,10"], "tax.csv");
  const { result } = renderHook(() => useMoadianImport("selected-result"));
  await act(() => result.current({
    headers: ["tax_id", "amount"], rows: [["A", 10]], totalRows: 1, file,
  }, "sales"));
  expect(api.mock.calls[0][0]).toBe("/companies/company/moadian/import/sales?period_id=period&parent_id=selected-result");
  expect(api.mock.calls[0][1].body.get("file")).toBe(file);
  expect(push).toHaveBeenCalledWith("/reports/processing/report");
});

test("converts pasted workpaper rows to an import file", async () => {
  const { result } = renderHook(() => useMoadianImport());
  await act(() => result.current({
    headers: ["tax_id", "amount"], rows: [["A", ""]], totalRows: 1,
  }, "purchases"));
  expect(api.mock.calls[0][0]).toBe("/companies/company/moadian/import/purchases?period_id=period");
  const file = api.mock.calls[0][1].body.get("file");
  expect(file).toBeInstanceOf(File);
  expect(file.name).toBe("moadian-purchases-pasted.csv");
  expect(file.type).toBe("text/csv");
});


test("leaves the file preview open when the import request fails", async () => {
  const failure = new Error("invalid file");
  api.mockRejectedValue(failure);
  const { result } = renderHook(() => useMoadianImport());
  await expect(result.current({ headers: ["tax_id"], rows: [["A"]], totalRows: 1 }, "sales"))
    .rejects.toBe(failure);
  expect(push).not.toHaveBeenCalled();
});
