import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AssistantView } from "./assistant-view";

const pushMock = vi.fn();
const sendMock = vi.fn();
const resetMock = vi.fn();
const setDraftMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => "/assistant",
}));

let mockDraft = "چک‌های سررسید ماه جاری";

vi.mock("@/hooks/use-floating-assistant", () => ({
  useFloatingAssistant: () => ({
    open: true,
    setOpen: vi.fn(),
    draft: mockDraft,
    setDraft: setDraftMock,
    busy: false,
    send: sendMock,
    reset: resetMock,
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
        text: "تحلیل وصول مطالبات و نقدینگی آماده است.",
        reply: {
          answer: "تحلیل وصول مطالبات و نقدینگی آماده است.",
          action_cards: [
            {
              id: "card-1",
              title: "مشاهده فاکتورهای سررسید گذشته",
              action_type: "view_invoice",
              button_text: "مشاهده فاکتور",
              target_path: "invoices?status=overdue",
            },
          ],
        },
      },
    ],
  }),
}));

describe("AssistantView", () => {
  beforeEach(() => {
    pushMock.mockReset();
    sendMock.mockReset();
    resetMock.mockReset();
    setDraftMock.mockReset();
  });

  it("renders page header and chat messages", () => {
    render(<AssistantView />);
    expect(screen.getByRole("heading", { name: "تحلیل با هوش مصنوعی" })).toBeInTheDocument();
    expect(screen.getByText("تحلیل وصول مطالبات و نقدینگی آماده است.")).toBeInTheDocument();
  });

  it("triggers reset when clicking new conversation button", () => {
    render(<AssistantView />);
    const newChatButton = screen.getByRole("button", { name: "گفت‌وگوی جدید" });
    fireEvent.click(newChatButton);
    expect(resetMock).toHaveBeenCalled();
  });

  it("submits the question using send button", () => {
    render(<AssistantView />);
    const sendButton = screen.getByRole("button", { name: "ارسال پرسش" });
    fireEvent.click(sendButton);
    expect(sendMock).toHaveBeenCalled();
  });

  it("navigates on action card click", () => {
    render(<AssistantView />);
    const actionButton = screen.getByRole("button", {
      name: "مشاهده فاکتور: مشاهده فاکتورهای سررسید گذشته",
    });
    fireEvent.click(actionButton);
    expect(pushMock).toHaveBeenCalledWith("/companies/comp-1/invoices?status=overdue");
  });

  it("renders Telegram-style button layout: attachment at start, send at end when draft has text", () => {
    mockDraft = "وضعیت سود و زیان";
    render(<AssistantView />);

    // Paperclip attachment button at start
    const attachButton = screen.getByRole("button", {
      name: "امکانات و پرسش‌های پیشنهادی",
    });
    expect(attachButton).toBeInTheDocument();

    // Send button at end position
    expect(screen.getByRole("button", { name: "ارسال پرسش" })).toBeInTheDocument();
    // Voice button should not be displayed when draft has text (Telegram dynamic action button)
    expect(screen.queryByRole("button", { name: "ضبط ویس" })).not.toBeInTheDocument();
  });

  it("renders Voice button at end position when draft is empty (Telegram behavior)", () => {
    mockDraft = "";
    render(<AssistantView />);

    // Voice button is displayed at the trailing end
    expect(screen.getByRole("button", { name: "ضبط ویس" })).toBeInTheDocument();
    // Send button is not displayed
    expect(screen.queryByRole("button", { name: "ارسال پرسش" })).not.toBeInTheDocument();
  });
});
