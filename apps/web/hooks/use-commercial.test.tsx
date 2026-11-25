import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api, ApiError } from "@/lib/api";
import { counterpartyForm, proformaForm, useCounterparties, useProformas } from "./use-commercial";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/api")>(),
  api: vi.fn(),
}));
vi.mock("@/hooks/workspace", () => ({
  useWorkspace: () => ({
    company: { id: "c1" },
    companyPath: (resource: string) => `/companies/c1/${resource}`,
  }),
}));

const request = vi.mocked(api);

beforeEach(() => {
  request.mockReset();
  request.mockImplementation(async (path) =>
    path.endsWith("capabilities")
      ? { can_manage_accounts: true, can_prepare: true }
      : { items: [], total: 0 },
  );
});

it("clears optional counterparty fields in a versioned update", async () => {
  const { result } = renderHook(useCounterparties);
  await waitFor(() => expect(result.current.canEdit).toBe(true));
  const row = {
    id: "party", type: "supplier" as const, version: 3, name: "فروشنده", code: "A1", active: true,
    national_id: null, economic_code: null, phone: "02199999999", address: null, credit_limit_irr: "25000",
  };
  act(() => result.current.open(row));
  expect(counterpartyForm(row)).not.toHaveProperty("code");
  const form = { ...counterpartyForm(row), phone: "", credit_limit_irr: "" };
  act(() => result.current.save(form));

  await waitFor(() => expect(request).toHaveBeenCalledWith(
    "/companies/c1/commercial/counterparties/party",
    expect.objectContaining({
      method: "PATCH", version: 3,
      body: expect.objectContaining({ phone: null, credit_limit_irr: null }),
    }),
  ));
});

it("retries an identical proforma request with its original idempotency key and preserves both lines", async () => {
  const written: { body?: unknown; key?: string }[] = [];
  request.mockImplementation(async (path, options) => {
    if (path.endsWith("capabilities")) return { can_prepare: true };
    if (options?.method === "POST") {
      written.push(options);
      if (written.length === 1) throw new ApiError(0, "خطای شبکه", "network_error");
    }
    return { items: [], total: 0 };
  });
  const { result } = renderHook(useProformas);
  await waitFor(() => expect(result.current.canPrepare).toBe(true));
  act(() => result.current.open());
  const form = { ...proformaForm(), party_id: "A1", currency: "TOMAN" as const };
  form.lines = [
    { ...form.lines[0], description: "ردیف اول", unit_price: "10.5" },
    { key: 1, item_id: "", description: "ردیف دوم", quantity: "3", unit_price: "250", discount: "25" },
  ];
  act(() => result.current.save(form));
  await waitFor(() => expect(result.current.command.error?.code).toBe("network_error"));
  act(() => result.current.save(form));

  await waitFor(() => expect(written).toHaveLength(2));
  expect(written[0].body).not.toHaveProperty("number");
  expect(written[0].key).toBeTruthy();
  expect(written[1].key).toBe(written[0].key);
  expect(written[1].body).toMatchObject({
    currency: "TOMAN",
    lines: [
      { quantity: 1, unit_price: "10.5", discount: "0" },
      { quantity: 3, unit_price: "250", discount: "25" },
    ],
  });
});
