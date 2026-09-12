import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Home from "./page";

describe("Home", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: vi.fn() }));
  });

  it("shows the Persian authentication entry point", async () => {
    render(<Home />);

    expect(await screen.findByRole("heading", { name: "خوش آمدید" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ورود به دیدبان" })).toBeInTheDocument();
    expect(screen.getByText("اطلاعات نشست در کوکی امن نگهداری می‌شود.")).toBeInTheDocument();
  });
});
