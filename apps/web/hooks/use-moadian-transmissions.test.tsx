import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import type { MoadianFiscalForm } from "@/lib/moadian-transmissions";
import { useMoadianTransmissions } from "./use-moadian-transmissions";

vi.mock("./workspace", () => ({
  useWorkspace: () => ({ companyPath: (path: string) => "/companies/company/" + path }),
}));
vi.mock("@/components/ui/sonner", () => ({ notify: { success: vi.fn() } }));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  api: vi.fn(),
}));

const base = "/companies/company/moadian/transmissions";
const taxId = "AA12340000000000000001";
const invoice = {
  id: "sale-id",
  version: 4,
  reference: "فروش-۱",
  party_id: "خریدار",
  date: "2026-10-13",
  amount: "123400",
  status: "available",
  source: { kind: "sale_goods", journal_id: "journal" },
};
const fiscal: MoadianFiscalForm = {
  tax_id: taxId,
  issued_time: "10:15",
  buyer_type: "legal",
  buyer_tax_number: "10000000000",
  item_tax_id: "1234567890123",
  unit_code: "1627",
  vat_treatment: "exempt",
  vat_evidence: "مبنای مستند معافیت",
};
const preview = {
  invoice_id: invoice.id,
  invoice_version: invoice.version,
  invoice_reference: invoice.reference,
  invoice_date: invoice.date,
  amount: invoice.amount,
  tax_id: taxId,
  seller_tax_number: "10000000001",
  digest: "approved-packet-digest",
};
const resultRow = {
  id: "transmission",
  invoice_id: invoice.id,
  invoice_version: invoice.version,
  invoice_reference: invoice.reference,
  status: "unknown",
  can_inquire: true,
  can_retry: false,
  error_codes: [],
  created_at: "2026-10-13T10:15:00+03:30",
};

beforeEach(() => {
  vi.mocked(api).mockReset().mockImplementation(async (path, options) => {
    if (path.endsWith("/candidates")) return { items: [invoice] };
    if (path.endsWith("/preview")) return preview;
    if (options?.method === "POST") return resultRow;
    return { configured: true, can_submit: true, items: [], next_cursor: null };
  });
});

it("sends only the reviewed fiscal payload and discards the approval when an input changes", async () => {
  const { result } = renderHook(useMoadianTransmissions);
  await waitFor(() => expect(result.current.canSend).toBe(true));
  act(() => result.current.show());
  await waitFor(() => expect(result.current.invoiceOptions).toHaveLength(1));
  act(() => {
    result.current.selectInvoice(invoice.id);
    for (const [field, value] of Object.entries(fiscal))
      result.current.change(field as keyof MoadianFiscalForm, value);
  });

  await act(async () => { await result.current.submit(); });
  expect(vi.mocked(api).mock.calls.some(([path, options]) => path === base && options?.method === "POST"))
    .toBe(false);
  await act(async () => { await result.current.prepare(); });
  expect(result.current.review?.digest).toBe(preview.digest);
  const firstPreview = vi.mocked(api).mock.calls.find(([path]) => path.endsWith("/preview"))?.[1]?.body;
  expect(firstPreview).toMatchObject({
    invoice_id: invoice.id,
    invoice_version: 4,
    issued_at: "2026-10-13T10:15:00+03:30",
    tax_id: taxId,
  });
  expect(firstPreview).not.toHaveProperty("amount");

  act(() => result.current.change("vat_evidence", "مستند به‌روز"));
  expect(result.current.review).toBeUndefined();
  await act(async () => { await result.current.submit(); });
  expect(vi.mocked(api).mock.calls.some(([path, options]) => path === base && options?.method === "POST"))
    .toBe(false);

  await act(async () => { await result.current.prepare(); });
  await act(async () => { await result.current.submit(); });
  const lastPreview = vi.mocked(api).mock.calls.filter(([path]) => path.endsWith("/preview")).at(-1)?.[1]?.body;
  expect(api).toHaveBeenCalledWith(base, expect.objectContaining({
    key: expect.any(String),
    body: { ...(lastPreview as object), digest: preview.digest },
  }));
  expect(result.current.open).toBe(false);
});

it("asks for inquiry on unknown delivery while a retry requires server eligibility and user confirmation", async () => {
  const { result } = renderHook(useMoadianTransmissions);
  await waitFor(() => expect(result.current.resource.data).toBeDefined());

  act(() => result.current.confirmRetry(resultRow));
  expect(result.current.retryTarget).toBeUndefined();
  act(() => result.current.retry());
  expect(vi.mocked(api).mock.calls.some(([path]) => path.endsWith("/retry"))).toBe(false);
  act(() => result.current.inquire(resultRow));
  await waitFor(() => expect(api).toHaveBeenCalledWith(base + "/transmission/inquiry",
    expect.objectContaining({ method: "POST", body: {} })));
  await waitFor(() => expect(result.current.rowCommand.busy).toBe(false));

  act(() => result.current.confirmRetry({ ...resultRow, status: "not_sent", can_retry: true }));
  expect(vi.mocked(api).mock.calls.some(([path]) => path.endsWith("/retry"))).toBe(false);
  act(() => result.current.retry());
  await waitFor(() => expect(api).toHaveBeenCalledWith(base + "/transmission/retry",
    expect.objectContaining({ method: "POST", body: {} })));
});

it("pages through saved transmissions by server cursor and refreshes from the latest page", async () => {
  const cursor = "opaque+/=";
  vi.mocked(api).mockImplementation(async (path) => ({
    configured: true,
    can_submit: true,
    items: [path.includes("&cursor=") ? { ...resultRow, id: "older" } : resultRow],
    next_cursor: path.includes("&cursor=") ? null : cursor,
  }));

  const { result } = renderHook(useMoadianTransmissions);
  await waitFor(() => expect(result.current.rows[0]?.id).toBe(resultRow.id));
  expect(result.current.pagination.hasNext).toBe(true);
  act(() => result.current.pagination.nextPage());
  await waitFor(() => expect(result.current.rows[0]?.id).toBe("older"));
  expect(api).toHaveBeenCalledWith(base + "?limit=25&cursor=opaque%2B%2F%3D", expect.anything());
  expect(result.current.pagination.hasPrevious).toBe(true);
  expect(result.current.pagination.hasNext).toBe(false);

  act(() => result.current.pagination.previousPage());
  await waitFor(() => expect(result.current.rows[0]?.id).toBe(resultRow.id));
  act(() => result.current.pagination.nextPage());
  await waitFor(() => expect(result.current.rows[0]?.id).toBe("older"));
  act(() => result.current.refreshHistory());
  await waitFor(() => expect(result.current.rows[0]?.id).toBe(resultRow.id));
  expect(result.current.pagination.hasPrevious).toBe(false);
});
