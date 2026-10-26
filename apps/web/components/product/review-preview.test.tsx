import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useState } from "react";
import { Drawer } from "@/components/ui/drawer";
import { ReviewPreview } from "./review-preview";
import type { api } from "@/lib/product-api";
import type { ReviewItem, ReviewPreviewData } from "@/lib/review";

const item = { id: "row", title_fa: "پیشنهاد تطبیق", status: "new", severity: "medium" } as ReviewItem;
const detail: ReviewPreviewData = { title_fa: item.title_fa, status: "new", summary_fa: "تأیید نشده", financial_impact_irr: "90071992547409930", assigned_to_name: null, due_date: null, reconciliation_state: "suggested", can_review_proposals: true, evidence: [], proposals: [
  { id: "first", score: "85", match_type: "one_to_one", payload: { bank: { amount_irr: "90071992547409930", date: "2026-09-12", reference: "B-1" }, accounting: { amount_irr: "90071992547409930", date: "2026-09-12", document_number: "JV-1" } } },
  { id: "second", score: "80", match_type: "one_to_one", payload: { bank: { amount_irr: "90071992547409930" }, accounting: { amount_irr: "90071992547409930", document_number: "JV-2" } } },
] };

function Wrapper({ request, onChanged = () => {} }: { request: typeof api; onChanged?: () => void }) {
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  return <Drawer title={item.title_fa} open={open} onOpenChange={value => { if (!busy) setOpen(value); }} closeDisabled={busy}>
    <ReviewPreview companyId="company" item={item} request={request} onBusyChange={setBusy} onChanged={onChanged} />
  </Drawer>;
}

it("confirms one proposal, guards double submit and disables closing while pending", async () => {
  let finish: () => void = () => {};
  let committed = false;
  const onChanged = vi.fn();
  const request = vi.fn(async (_path: string, options?: RequestInit) => {
    if (options?.method === "POST") { await new Promise<void>(resolve => { finish = resolve; }); committed = true; return { status: "confirmed" }; }
    return committed ? { ...detail, status: "resolved", reconciliation_state: "matched", proposals: [] } : detail;
  });
  render(<Wrapper request={request as typeof api} onChanged={onChanged} />);
  const confirm = await screen.findByRole("button", { name: "تأیید تطبیق پیشنهاد ۱" });
  const comparison = within(screen.getAllByLabelText("مقایسه اسناد دو طرف")[0]);
  expect(comparison.getByRole("region", { name: "طرف بانک" })).toHaveTextContent("B-1");
  expect(comparison.getByRole("region", { name: "طرف حسابداری" })).toHaveTextContent("JV-1");
  fireEvent.click(confirm); fireEvent.click(confirm);
  expect(request.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
  expect(confirm).toBeDisabled();
  expect(screen.getByRole("button", { name: "بستن" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "بستن" }));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  finish();
  expect(await screen.findByText("تطبیق تأیید شد.")).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole("button", { name: "تأیید تطبیق پیشنهاد ۱" })).not.toBeInTheDocument());
  expect(onChanged).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "بستن" })).toBeEnabled();
});

it("rejects just the selected proposal and retains the alternative", async () => {
  let rejected = false;
  const request = vi.fn(async (_path: string, options?: RequestInit) => {
    if (options?.method === "POST") { rejected = true; return { status: "rejected" }; }
    return rejected ? { ...detail, proposals: detail.proposals?.slice(1) } : detail;
  });
  render(<Wrapper request={request as typeof api} />);
  fireEvent.click(await screen.findByRole("button", { name: "رد پیشنهاد ۱" }));
  expect(await screen.findByText("پیشنهاد رد شد.")).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByText("JV-1")).not.toBeInTheDocument());
  expect(screen.getByText("JV-2")).toBeVisible();
  expect(request.mock.calls.find(([, options]) => options?.method === "POST")).toEqual([
    "/companies/company/findings/row/proposals/first/decision", expect.objectContaining({ body: JSON.stringify({ decision: "reject" }) }),
  ]);
});

it("keeps failed decisions actionable and never reports them as a success", async () => {
  const request = vi.fn(async (_path: string, options?: RequestInit) => {
    if (options?.method === "POST") throw Error("پیشنهاد دیگر قابل انتخاب نیست.");
    return detail;
  });
  render(<Wrapper request={request as typeof api} />);
  fireEvent.click(await screen.findByRole("button", { name: "رد پیشنهاد ۱" }));
  expect(await screen.findByText("پیشنهاد دیگر قابل انتخاب نیست.")).toBeInTheDocument();
  expect(screen.queryByText("پیشنهاد رد شد.")).not.toBeInTheDocument();
  expect(screen.getByText("JV-1")).toBeVisible();
  expect(screen.getByRole("button", { name: "رد پیشنهاد ۱" })).toBeEnabled();
});

it("preserves acknowledged success when refresh fails and retries only the read", async () => {
  let committed = false;
  const request = vi.fn(async (_path: string, options?: RequestInit) => {
    if (options?.method === "POST") { committed = true; return { status: "confirmed" }; }
    if (committed) throw Error("offline");
    return detail;
  });
  render(<Wrapper request={request as typeof api} />);
  fireEvent.click(await screen.findByRole("button", { name: "تأیید تطبیق پیشنهاد ۱" }));
  expect(await screen.findByText("جزئیات به‌روز دریافت نشد.")).toBeInTheDocument();
  expect(screen.getByText("تطبیق تأیید شد.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "تلاش دوباره" }));
  await screen.findByText("جزئیات به‌روز دریافت نشد.");
  expect(request.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
});

it("shows comparisons to viewers without decision controls", async () => {
  const request = vi.fn(async () => ({ ...detail, can_review_proposals: false }));
  render(<Wrapper request={request as typeof api} />);
  await screen.findByText("JV-1");
  expect(screen.queryByRole("button", { name: /تأیید تطبیق پیشنهاد/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /رد پیشنهاد/ })).not.toBeInTheDocument();
});
