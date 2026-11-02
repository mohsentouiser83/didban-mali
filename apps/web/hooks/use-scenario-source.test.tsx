import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useScenarioSource } from "./use-scenario-source";
const data = vi.hoisted(() => ({ company: "c", mode: "primary" }));
vi.mock("./workspace", () => ({
  useWorkspace: () => ({
    user: { id: "u" },
    company: { id: data.company },
    companyPath: (s: string) => `/companies/${data.company}/${s}`,
  }),
}));
vi.mock("./use-resource", () => ({
  useResource: () => ({ data: { mode: data.mode } }),
}));
it("defaults primary companies to native and resets explicit source choice across companies", () => {
  const { result, rerender } = renderHook(() => useScenarioSource());
  expect(result.current.basis).toBe("native_statement");
  act(() => result.current.select("imported_manifest"));
  expect(result.current.basis).toBe("imported_manifest");
  data.company = "other";
  rerender();
  expect(result.current.basis).toBe("native_statement");
  data.mode = "analysis";
  rerender();
  expect(result.current.basis).toBe("imported_manifest");
});
