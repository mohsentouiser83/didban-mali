import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { Button } from "./button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./dialog";

describe("Dialog Component", () => {
  it("renders trigger and dialog content elements", () => {
    render(
      <Dialog defaultOpen>
        <DialogTrigger asChild><Button>باز کردن پنجره</Button></DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>صدور سند تعدیل</DialogTitle>
            <DialogDescription>مشخصات سند را وارد کنید.</DialogDescription>
          </DialogHeader>
          <div>محتوای فرم</div>
          <DialogFooter>
            <Button>ثبت</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>,
    );

    expect(screen.getByText("صدور سند تعدیل")).toBeDefined();
    expect(screen.getByText("مشخصات سند را وارد کنید.")).toBeDefined();
    expect(screen.getByText("محتوای فرم")).toBeDefined();
    expect(screen.getByText("ثبت")).toBeDefined();
  });
});
