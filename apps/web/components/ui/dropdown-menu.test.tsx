import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
} from "./dropdown-menu";

describe("DropdownMenu Component", () => {
  it("renders trigger button", () => {
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>اقدامات</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>تایید مغایرت</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    expect(screen.getByText("اقدامات")).toBeDefined();
  });

  it("renders shortcut with LTR direction", () => {
    render(<DropdownMenuShortcut>⌘N</DropdownMenuShortcut>);
    const shortcut = screen.getByText("⌘N");
    expect(shortcut.style.direction).toBe("ltr");
    expect(shortcut.className).toContain("font-mono");
  });
});
