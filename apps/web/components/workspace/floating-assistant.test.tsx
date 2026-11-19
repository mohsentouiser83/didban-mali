import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FloatingAssistant } from "./floating-assistant";

const pushMock = vi.fn();
const setOpenMock = vi.fn();
const sendMock = vi.fn();
const setDraftMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@/hooks/use-floating-assistant", () => ({
  useFloatingAssistant: () => ({
    open: true,
    setOpen: setOpenMock,
    draft: "",
    setDraft: setDraftMock,
    busy: false,
    send: sendMock,
    retry: vi.fn(),
    voice: { phase: "idle", cancel: vi.fn() },
    workspace: {
      company: { id: "comp-1", name: "شرکت نمونه" },
      unit: "IRR",
      companyPath: (p: string) => `/companies/comp-1/${p}`,
      user: { installation_admin: false },
    },
    messages: [
      {
        id: "msg-1",
        role: "assistant",
        text: "تحلیل وصول مطالبات آماده است.",
        reply: {
          answer: "تحلیل وصول مطالبات آماده است.",
          action_cards: [
            {
              id: "card-1",
              title: "مشاهده فاکتورهای سررسید گذشته",
              description: "۳ فاکتور به ارزش ۵۰ میلیون ریال نیاز به پیگیری دارد.",
              action_type: "view_invoice",
              button_text: "مشاهده فاکتور",
              target_path: "invoices?status=overdue",
            },
            {
              id: "card-2",
              title: "ثبت یادآوری وصول",
              action_type: "reminder",
              button_text: "ثبت یادآوری",
              target_path: "/reminders/new",
              variant: "primary",
            },
            {
              id: "card-3",
              title: "تأیید و ثبت نهایی سند",
              action_type: "confirm_post",
              button_text: "تأیید و ثبت نهایی",
              variant: "primary",
              payload: { draft_id: "draft-123" },
            },
            {
              id: "card-4",
              title: "پیشنهاد متن",
              action_type: "suggest_text",
              button_text: "استفاده",
              payload: { text: "هزینه اینترنت ۱ میلیون تومان" },
            },
          ],
          data_table: {
            title: "تراز آزمایشی ۴ ستونی",
            columns: [
              { key: "code", label: "کد حساب", align: "start" },
              { key: "title", label: "سرفصل حساب", align: "start" },
              { key: "debit", label: "بدهکار", align: "end" },
              { key: "credit", label: "بستانکار", align: "end" },
            ],
            rows: [
              { id: "1", code: "101", title: "بانک سامان", debit: "۵۰,۰۰۰,۰۰۰", credit: "۰" },
            ],
            summary: { code: "جمع کل", debit: "۵۰,۰۰۰,۰۰۰", credit: "۰" },
          },
        },
      },
    ],
  }),
}));

describe("FloatingAssistant Action Cards", () => {
  beforeEach(() => {
    pushMock.mockReset();
    setOpenMock.mockReset();
    sendMock.mockReset();
    setDraftMock.mockReset();
  });

  it("renders contextual action cards inside assistant reply", () => {
    render(<FloatingAssistant />);

    expect(
      screen.getByText("مشاهده فاکتورهای سررسید گذشته"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("۳ فاکتور به ارزش ۵۰ میلیون ریال نیاز به پیگیری دارد."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "مشاهده فاکتور: مشاهده فاکتورهای سررسید گذشته",
      }),
    ).toBeInTheDocument();

    expect(screen.getByText("ثبت یادآوری وصول")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "ثبت یادآوری: ثبت یادآوری وصول",
      }),
    ).toBeInTheDocument();
  });

  it("navigates on action card click without closing the drawer/session", () => {
    render(<FloatingAssistant />);

    const button = screen.getByRole("button", {
      name: "مشاهده فاکتور: مشاهده فاکتورهای سررسید گذشته",
    });
    fireEvent.click(button);

    // Navigates to company-scoped path
    expect(pushMock).toHaveBeenCalledWith(
      "/companies/comp-1/invoices?status=overdue",
    );

    // Does NOT close the floating assistant drawer
    expect(setOpenMock).not.toHaveBeenCalled();
  });

  it("handles absolute paths in action cards", () => {
    render(<FloatingAssistant />);

    const reminderButton = screen.getByRole("button", {
      name: "ثبت یادآوری: ثبت یادآوری وصول",
    });
    fireEvent.click(reminderButton);

    expect(pushMock).toHaveBeenCalledWith("/reminders/new");
    expect(setOpenMock).not.toHaveBeenCalled();
  });

  it("triggers confirmation in chat when clicking confirm_post action card", () => {
    render(<FloatingAssistant />);

    const confirmButton = screen.getByRole("button", {
      name: "تأیید و ثبت نهایی: تأیید و ثبت نهایی سند",
    });
    fireEvent.click(confirmButton);

    expect(sendMock).toHaveBeenCalledWith("تأیید کن");
  });

  it("fills draft input when clicking suggest_text action card", () => {
    render(<FloatingAssistant />);

    const suggestButton = screen.getByRole("button", {
      name: "استفاده: پیشنهاد متن",
    });
    fireEvent.click(suggestButton);

    expect(setDraftMock).toHaveBeenCalledWith("هزینه اینترنت ۱ میلیون تومان");
  });

  it("renders assistant data table widget when present", () => {
    render(<FloatingAssistant />);

    expect(screen.getByText("تراز آزمایشی ۴ ستونی")).toBeInTheDocument();
    expect(screen.getByText("بانک سامان")).toBeInTheDocument();
    expect(screen.getByText("کد حساب")).toBeInTheDocument();
    expect(screen.getByText("سرفصل حساب")).toBeInTheDocument();
  });
});
