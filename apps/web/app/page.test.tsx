import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "./page";

describe("Home", () => {
  it("announces the current infrastructure phase in Persian", () => {
    render(<Home />);

    expect(screen.getByRole("heading", { name: /از داده مالی خام/ })).toBeInTheDocument();
    expect(screen.getByText("فاز ۱ · زیرساخت")).toBeInTheDocument();
    expect(screen.getAllByText("آماده")).toHaveLength(4);
  });
});
