import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getFindingTitle,
  rememberFindingTitle,
} from "./finding-navigation-preview";
afterEach(() => vi.useRealTimers());
describe("finding navigation title", () => {
  it("only exposes the selected title for the matching company and finding", () => {
    rememberFindingTitle("one", "a", "کاهش سود");
    expect(getFindingTitle("one", "a")).toBe("کاهش سود");
    expect(getFindingTitle("two", "a")).toBeUndefined();
    expect(getFindingTitle("one", "b")).toBeUndefined();
    rememberFindingTitle("one", "b", "افزایش هزینه");
    expect(getFindingTitle("one", "a")).toBeUndefined();
  });
  it("expires titles instead of reusing stale navigation content", () => {
    vi.useFakeTimers();
    rememberFindingTitle("one", "a", "کاهش سود");
    vi.advanceTimersByTime(30000);
    expect(getFindingTitle("one", "a")).toBeUndefined();
  });
});
