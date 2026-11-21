import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Tabs } from "./tabs";

describe("Tabs", () => {
  const items = [
    { id: "tab1", label: "تب اول" },
    { id: "tab2", label: "تب دوم" },
    { id: "tab3", label: "تب سوم", disabled: true },
  ];

  it("renders all enabled tabs with proper accessibility attributes", () => {
    const handleChange = vi.fn();
    render(<Tabs items={items} value="tab1" onChange={handleChange} />);

    const tab1 = screen.getByRole("tab", { name: "تب اول" });
    const tab2 = screen.getByRole("tab", { name: "تب دوم" });
    const tab3 = screen.getByRole("tab", { name: "تب سوم" });

    expect(tab1).toHaveAttribute("aria-selected", "true");
    expect(tab2).toHaveAttribute("aria-selected", "false");
    expect(tab3).toBeDisabled();
  });

  it("calls onChange when an unselected tab is clicked", () => {
    const handleChange = vi.fn();
    render(<Tabs items={items} value="tab1" onChange={handleChange} />);

    const tab2 = screen.getByRole("tab", { name: "تب دوم" });
    fireEvent.click(tab2);

    expect(handleChange).toHaveBeenCalledWith("tab2");
  });

  it("navigates with arrow keys", () => {
    const handleChange = vi.fn();
    render(<Tabs items={items} value="tab1" onChange={handleChange} />);

    const tab1 = screen.getByRole("tab", { name: "تب اول" });
    fireEvent.keyDown(tab1, { key: "ArrowLeft" });

    expect(handleChange).toHaveBeenCalledWith("tab2");
  });

  it("renders underline variant correctly", () => {
    render(<Tabs items={items} value="tab2" onChange={vi.fn()} variant="underline" />);
    const tab2 = screen.getByRole("tab", { name: "تب دوم" });
    expect(tab2).toHaveAttribute("aria-selected", "true");
  });
});
