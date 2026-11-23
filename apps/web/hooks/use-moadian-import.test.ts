import { renderHook } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { useMoadianImport } from "./use-moadian-import";

const { upload } = vi.hoisted(() => ({ upload: vi.fn() }));

vi.mock("./use-upload", () => ({
  useUpload: () => ({ busy: false, error: "", sessionId: "", upload }),
}));

test("forwards the original file to the server processing workflow", () => {
  upload.mockClear();
  const file = new File(["tax_id,amount\nA,10"], "tax.csv");
  const { result } = renderHook(() => useMoadianImport("selected-result"));
  result.current.importSource({ headers: ["tax_id", "amount"], rows: [["A", 10]], totalRows: 1, file }, "sales");
  expect(upload).toHaveBeenCalledWith([file], undefined, "selected-result");
});

test("routes pasted data through processing as a distinct source file", () => {
  upload.mockClear();
  const { result } = renderHook(() => useMoadianImport());
  result.current.importSource({ headers: ["tax_id", "amount"], rows: [["A", ""]], totalRows: 1 }, "purchases");
  const [[file]] = upload.mock.calls[0];
  expect(file).toBeInstanceOf(File);
  expect(file.name).toBe("moadian-purchases-pasted.csv");
  expect(file.type).toBe("text/csv");
});
