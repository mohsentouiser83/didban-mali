import type { useCommercialDocuments } from "@/hooks/use-commercial-documents";
import { TrashIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { AmountInput, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { emptyLine } from "@/hooks/use-commercial-documents";
import { amount, persian } from "@/lib/utils";

export function CommercialDocumentLines({ view }: { view: ReturnType<typeof useCommercialDocuments> }) {
  const {
    lines,
    setLines,
    lineErrors,
    setLineErrors,
    goodsItems,
    inventory,
    itemOptions,
    totals,
    clearClientError,
  } = view;
  return (
    <>
      <div className="space-y-3 rounded-xl border border-border p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">ردیف‌های فاکتور</span>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setLines((prev) => [...prev, emptyLine(Date.now())]);
              clearClientError("invoice_discount", "on_account_amount");
            }}
          >
            افزودن ردیف
          </Button>
        </div>
        {lines.map((line, index) => {
          const lErr = lineErrors[line.key] ?? {};
          const rowNumber = persian(index + 1);
          return (
            <div key={line.key} className="space-y-2 rounded-lg border border-border/70 p-2.5">
              <div className="grid gap-2 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-[1fr_1.3fr_1.3fr_.65fr_1fr_1fr]">
                <Select
                  id={`cd-line-${index}-kind`}
                  label={`نوع ردیف ${rowNumber}`}
                  value={line.line_kind}
                  onValueChange={(v) => {
                    const nextKind = v as "goods" | "service";
                    setLines((prev) =>
                      prev.map((r) =>
                        r.key === line.key
                          ? { ...r, line_kind: nextKind, item_id: nextKind === "service" ? "" : r.item_id }
                          : r,
                      ),
                    );
                    setLineErrors((prev) => {
                      const copy = { ...prev };
                      delete copy[line.key];
                      return copy;
                    });
                    clearClientError(
                      "warehouse_id",
                      "revenue_account_id",
                      "cost_account_id",
                      "service_revenue_account_id",
                      "expense_account_id",
                    );
                  }}
                  options={[
                    { value: "goods", label: "کالا" },
                    { value: "service", label: "خدمت" },
                  ]}
                />
                {line.line_kind === "goods" ? (
                  <Select
                    id={`cd-line-${index}-item`}
                    label={`کالای ردیف ${rowNumber}`}
                    aria-invalid={Boolean(lErr.item_id) || undefined}
                    searchable
                    disabled={inventory.loading}
                    placeholder={inventory.loading ? "در حال دریافت کالاها…" : "انتخاب کالا"}
                    value={line.item_id}
                    onValueChange={(v) => {
                      const picked = goodsItems.find((i) => i.id === v);
                      setLines((prev) =>
                        prev.map((r) =>
                          r.key === line.key
                            ? {
                                ...r,
                                item_id: v,
                                description: r.description.trim() ? r.description : picked?.name || "",
                              }
                            : r,
                        ),
                      );
                      setLineErrors((prev) => ({
                        ...prev,
                        [line.key]: { ...prev[line.key], item_id: undefined },
                      }));
                    }}
                    options={itemOptions}
                  />
                ) : (
                  <div className="hidden xl:block" aria-hidden />
                )}
                <Input
                  id={`cd-line-${index}-desc`}
                  aria-label={`شرح ردیف ${rowNumber}`}
                  placeholder="شرح"
                  value={line.description}
                  onChange={(e) =>
                    setLines((prev) => prev.map((r) => (r.key === line.key ? { ...r, description: e.target.value } : r)))
                  }
                />
                <Input
                  id={`cd-line-${index}-qty`}
                  aria-label={`تعداد ردیف ${rowNumber}`}
                  aria-invalid={Boolean(lErr.quantity) || undefined}
                  type="number"
                  min={1}
                  value={line.quantity}
                  onChange={(e) => {
                    setLines((prev) => prev.map((r) => (r.key === line.key ? { ...r, quantity: e.target.value } : r)));
                    setLineErrors((prev) => ({
                      ...prev,
                      [line.key]: { ...prev[line.key], quantity: undefined },
                    }));
                    clearClientError("invoice_discount", "on_account_amount");
                  }}
                />
                <AmountInput
                  id={`cd-line-${index}-price`}
                  aria-label={`فی ردیف ${rowNumber}`}
                  aria-invalid={Boolean(lErr.unit_price) || undefined}
                  placeholder="فی (ریال)"
                  value={line.unit_price}
                  onValueChange={(v) => {
                    setLines((prev) => prev.map((r) => (r.key === line.key ? { ...r, unit_price: v } : r)));
                    setLineErrors((prev) => ({
                      ...prev,
                      [line.key]: { ...prev[line.key], unit_price: undefined },
                    }));
                    clearClientError("invoice_discount", "on_account_amount");
                  }}
                />
                <div className="flex min-w-0 items-center gap-1 [&>input]:min-w-0">
                  <AmountInput
                    id={`cd-line-${index}-disc`}
                    aria-label={`تخفیف ردیف ${rowNumber}`}
                    aria-invalid={Boolean(lErr.line_discount) || undefined}
                    placeholder="تخفیف"
                    value={line.line_discount}
                    onValueChange={(v) => {
                      setLines((prev) => prev.map((r) => (r.key === line.key ? { ...r, line_discount: v } : r)));
                      setLineErrors((prev) => ({
                        ...prev,
                        [line.key]: { ...prev[line.key], line_discount: undefined },
                      }));
                      clearClientError("invoice_discount", "on_account_amount");
                    }}
                  />
                  <Input
                    id={`cd-line-${index}-vat`}
                    aria-label={`نرخ ارزش افزوده ردیف ${rowNumber} (٪)`}
                    placeholder="VAT ٪"
                    inputMode="decimal"
                    className="w-20"
                    value={line.vat_rate_pct ?? "0"}
                    onChange={(e) => {
                      const v = e.target.value;
                      setLines((prev) => prev.map((r) => (r.key === line.key ? { ...r, vat_rate_pct: v } : r)));
                      clearClientError("on_account_amount");
                    }}
                  />
                  {lines.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label="حذف ردیف"
                      onClick={() => {
                        setLines((prev) => prev.filter((r) => r.key !== line.key));
                        setLineErrors((prev) => {
                          const copy = { ...prev };
                          delete copy[line.key];
                          return copy;
                        });
                        clearClientError("invoice_discount", "on_account_amount");
                      }}
                    >
                      <TrashIcon size={16} />
                    </Button>
                  )}
                </div>
              </div>
              {(lErr.item_id || lErr.quantity || lErr.unit_price || lErr.line_discount) && (
                <div className="space-y-1">
                  <FieldError>{lErr.item_id}</FieldError>
                  <FieldError>{lErr.quantity}</FieldError>
                  <FieldError>{lErr.unit_price}</FieldError>
                  <FieldError>{lErr.line_discount}</FieldError>
                </div>
              )}
            </div>
          );
        })}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-canvas/70 px-3 py-2 text-xs">
          <span className="text-muted">
            جمع ناخالص: <span className="tabular-nums text-foreground">{amount(totals.grossTotal.toString())} ریال</span>
            {" · "}
            تخفیف‌ها:{" "}
            <span className="tabular-nums text-foreground">
              {amount((totals.lineDiscountTotal + (totals.invoiceDiscount ?? 0n)).toString())} ریال
            </span>
          </span>
          <span className="font-medium text-foreground">
            مبلغ خالص فاکتور:{" "}
            <span className="tabular-nums text-primary">
              {totals.netTotal !== null ? `${amount(totals.netTotal.toString())} ریال` : "—"}
            </span>
            {totals.vatTotal > 0n && (
              <>
                {" · "}
                ارزش افزوده: <span className="tabular-nums">{amount(totals.vatTotal.toString())} ریال</span>
                {" · "}
                قابل پرداخت:{" "}
                <span className="tabular-nums text-primary">
                  {totals.payableTotal !== null ? `${amount(totals.payableTotal.toString())} ریال` : "—"}
                </span>
              </>
            )}
          </span>
        </div>
      </div>
    </>
  );
}
