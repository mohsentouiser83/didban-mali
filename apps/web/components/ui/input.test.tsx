import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { Input } from "./input";
import { Textarea } from "./textarea";
import { Label } from "./label";
import { Field, FieldLabel, FieldError, FieldDescription } from "./field";

describe("Input, Textarea & Form Primitives", () => {
  describe("Input Component", () => {
    it("renders default text input", () => {
      render(<Input placeholder="مبلغ ریالی..." />);
      const input = screen.getByPlaceholderText("مبلغ ریالی...");
      expect(input).toBeDefined();
      expect(input.className).toContain("h-11");
    });

    it("renders compact size sm for table filters", () => {
      render(<Input size="sm" placeholder="فیلتر حساب..." />);
      const input = screen.getByPlaceholderText("فیلتر حساب...");
      expect(input.className).toContain("h-9");
    });

    it("sets aria-invalid when isInvalid is true", () => {
      render(<Input isInvalid placeholder="کد پیگیری..." />);
      const input = screen.getByPlaceholderText("کد پیگیری...");
      expect(input.getAttribute("aria-invalid")).toBe("true");
    });

    it("handles disabled state correctly", () => {
      render(<Input disabled placeholder="غیرفعال" />);
      const input = screen.getByPlaceholderText("غیرفعال");
      expect(input.hasAttribute("disabled")).toBe(true);
    });
  });

  describe("Textarea Component", () => {
    it("renders textarea with relaxed line-height and tokens", () => {
      render(<Textarea placeholder="شرح سند..." />);
      const textarea = screen.getByPlaceholderText("شرح سند...");
      expect(textarea).toBeDefined();
      expect(textarea.className).toContain("min-h-[88px]");
      expect(textarea.className).toContain("leading-relaxed");
    });

    it("applies error styling when isInvalid is true", () => {
      render(<Textarea isInvalid placeholder="توضیحات ناقص" />);
      const textarea = screen.getByPlaceholderText("توضیحات ناقص");
      expect(textarea.getAttribute("aria-invalid")).toBe("true");
    });
  });

  describe("Label Component", () => {
    it("renders label text with required star", () => {
      render(<Label required>شناسه شبا</Label>);
      expect(screen.getByText("شناسه شبا")).toBeDefined();
      expect(screen.getByText("*")).toBeDefined();
    });

    it("renders optional indicator when specified", () => {
      render(<Label optional>کد رهگیری</Label>);
      expect(screen.getByText("(اختیاری)")).toBeDefined();
    });
  });

  describe("Field & Validation Components", () => {
    it("renders FieldError with accessible role and message", () => {
      render(
        <Field>
          <FieldLabel>شماره سند</FieldLabel>
          <Input isInvalid />
          <FieldError>شماره سند باید ۶ رقم باشد.</FieldError>
        </Field>,
      );
      const error = screen.getByRole("alert");
      expect(error.textContent).toContain("شماره سند باید ۶ رقم باشد.");
    });

    it("renders FieldDescription helper text", () => {
      render(<FieldDescription>فقط اسناد شهریورماه</FieldDescription>);
      expect(screen.getByText("فقط اسناد شهریورماه")).toBeDefined();
    });
  });
});
