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

let mockDraft = "";

vi.mock("@/hooks/use-floating-assistant", () => ({
  useFloatingAssistant: () => ({
    open: true,
    setOpen: setOpenMock,
    draft: mockDraft,
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
              title: "پیش‌نویس سند",
              action_type: "navigate",
              button_text: "بررسی سند",
              target_path: "/accounting?review_draft=draft-123",
              variant: "primary",
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

  it("opens the exact draft in accounting for review", () => {
    render(<FloatingAssistant />);

    const confirmButton = screen.getByRole("button", {
      name: "بررسی سند: پیش‌نویس سند",
    });
    fireEvent.click(confirmButton);

    expect(pushMock).toHaveBeenCalledWith("/accounting?review_draft=draft-123");
    expect(sendMock).not.toHaveBeenCalled();
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

  it("renders Telegram-style input buttons: Paperclip at start, Voice at end when empty, Send at end when draft has text", () => {
    // 1. Empty draft -> Paperclip at start, Voice at end
    mockDraft = "";
    const { unmount } = render(<FloatingAssistant />);

    expect(
      screen.getByRole("button", { name: "امکانات و پرسش‌های پیشنهادی" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ضبط ویس" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ارسال پیام" })).not.toBeInTheDocument();

    unmount();

    // 2. Draft has text -> Paperclip at start, Send replaces Voice at end
    mockDraft = "سود خالص امسال چقدر است؟";
    render(<FloatingAssistant />);

    expect(
      screen.getByRole("button", { name: "امکانات و پرسش‌های پیشنهادی" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ارسال پیام" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ضبط ویس" })).not.toBeInTheDocument();
  });
});
