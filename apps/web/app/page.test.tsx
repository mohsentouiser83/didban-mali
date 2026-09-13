import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Home from "./page";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh: vi.fn() }),
}));

describe("Home", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: vi.fn() }));
  });

  it("routes a visitor without a session to the login page", async () => {
    render(<Home />);
    expect(screen.getByText("دیدبان مالی")).toBeInTheDocument();
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });
});
