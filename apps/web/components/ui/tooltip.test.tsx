import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "./tooltip";

describe("Tooltip Component", () => {
  it("renders trigger button and content structure", () => {
    render(
      <TooltipProvider>
        <Tooltip open>
          <TooltipTrigger asChild>
            <button>اطلاعات مالی</button>
          </TooltipTrigger>
          <TooltipContent>
            تراز ۴ ستونی منتهی به شهریور ۱۴۰۵
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );

    const trigger = screen.getByRole("button", { name: "اطلاعات مالی" });
    expect(trigger).toBeDefined();
    expect(screen.getByText("تراز ۴ ستونی منتهی به شهریور ۱۴۰۵")).toBeDefined();
  });

  it("renders with custom className and sideOffset", () => {
    render(
      <TooltipProvider>
        <Tooltip open>
          <TooltipTrigger asChild>
            <button>راهنما</button>
          </TooltipTrigger>
          <TooltipContent className="custom-tooltip-class" sideOffset={12}>
            متن راهنما
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );

    const content = screen.getByText("متن راهنما");
    expect(content.className).toContain("custom-tooltip-class");
  });
});
