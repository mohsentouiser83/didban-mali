"use client";

import { TrashIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Field, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { AmountInput, Input } from "@/components/ui/input";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";
import { Select } from "@/components/ui/select";
import { listItems } from "@/lib/api";
import { ToolInputRow } from "@/hooks/use-treasury-documents";
import type { useTreasuryDocuments } from "@/hooks/use-treasury-documents";

export function TreasuryDocumentEditor({ view }: { view: Pick<ReturnType<typeof useTreasuryDocuments>,
    "workspace" |
    "canCreateParty" |
    "counterparties" |
    "cmd" |
    "createOpen" |
    "setCreateOpen" |
    "createClientError" |
    "setPartyQuickCreateOpen" |
    "setViewingParty" |
    "direction" |
    "setDirection" |
    "docDate" |
    "setDocDate" |
    "partyId" |
    "setPartyId" |
    "description" |
    "setDescription" |
    "tools" |
    "setTools" |
    "cpOptions" |
    "taOptions" |
    "bankMovementOptions" |
    "chequeOptions" |
    "submitCreate"
  > }) {
  const {
    workspace,
    canCreateParty,
    counterparties,
    cmd,
    createOpen,
    setCreateOpen,
    createClientError,
    setPartyQuickCreateOpen,
    setViewingParty,
    direction,
    setDirection,
    docDate,
    setDocDate,
    partyId,
    setPartyId,
    description,
    setDescription,
    tools,
    setTools,
    cpOptions,
    taOptions,
    bankMovementOptions,
    chequeOptions,
    submitCreate,
  } = view;
  return (
    <Drawer
        open={createOpen}
        onOpenChange={(open) => { if (!open && !cmd.busy) setCreateOpen(false); }}
        title="ثبت پیش‌نویس سند دریافت/پرداخت خزانه"
        className="sm:max-w-3xl"
      >
        <Form onSubmit={(e) => { e.preventDefault(); submitCreate(); }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="tr-dir" label="نوع سند" required>
              <Select
                id="tr-dir"
                value={direction}
                onValueChange={(v) => setDirection(v as "receipt" | "payment")}
                options={[{ value: "receipt", label: "دریافت" }, { value: "payment", label: "پرداخت" }]}
              />
            </Field>
            <Field id="tr-date" label="تاریخ" required>
              <PersianDatePicker id="tr-date" value={docDate} onChange={setDocDate} />
            </Field>
            <div className="space-y-1.5">
              <Field id="tr-party" label="طرف حساب" required>
                <Select id="tr-party" searchable value={partyId} onValueChange={setPartyId} options={cpOptions} />
              </Field>
              <div className="flex flex-wrap gap-2">
                {partyId && (
                  <Button
                    variant="ghost"
                    className="min-h-8 px-2 text-xs"
                    onClick={() => {
                      const found = listItems(counterparties.data).find((c) => c.id === partyId);
                      if (found) setViewingParty(found);
                    }}
                  >
                    مشاهده پرونده طرف‌حساب
                  </Button>
                )}
                {canCreateParty && (
                  <Button
                    variant="ghost"
                    className="min-h-8 px-2 text-xs"
                    onClick={() => setPartyQuickCreateOpen(true)}
                  >
                    تعریف طرف‌حساب جدید
                  </Button>
                )}
              </div>
            </div>
            <Field id="tr-desc" label="شرح">
              <Input id="tr-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
          </div>
          <div className="space-y-3 rounded-xl border border-border p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">ابزارهای تسویه</span>
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  setTools((prev) => [
                    ...prev,
                    {
                      key: Date.now(),
                      tool_kind: "cash",
                      treasury_account_id: "",
                      bank_movement_id: "",
                      cheque_id: "",
                      due_date: "",
                      amount: "",
                      reference: "",
                    },
                  ])
                }
              >
                افزودن ابزار
              </Button>
            </div>
            {tools.map((tool, idx) => (
              <div key={tool.key} className="space-y-2 rounded-lg border border-border/70 p-2.5">
                <div className="grid gap-2 sm:grid-cols-4">
                  <Select
                    label={`نوع ابزار ${idx + 1}`}
                    value={tool.tool_kind}
                    onValueChange={(v) =>
                      setTools((prev) =>
                        prev.map((r) =>
                          r.key === tool.key
                            ? { ...r, tool_kind: v as ToolInputRow["tool_kind"], treasury_account_id: "", bank_movement_id: "", cheque_id: "" }
                            : r,
                        ),
                      )
                    }
                    options={[
                      { value: "bank_transfer", label: "حواله بانکی" },
                      { value: "cash", label: "نقد / صندوق" },
                      { value: "cheque", label: "چک" },
                      { value: "card", label: "کارت / کارت‌خوان" },
                      { value: "other", label: "سایر" },
                    ]}
                  />
                  <Select
                    label={tool.tool_kind === "card" ? `کارت‌خوان یا حساب خزانه ${idx + 1}` : `حساب خزانه ${idx + 1}`}
                    searchable
                    value={tool.treasury_account_id}
                    onValueChange={(v) =>
                      setTools((prev) => prev.map((r) => r.key === tool.key ? { ...r, treasury_account_id: v } : r))
                    }
                    options={taOptions(tool.tool_kind)}
                  />
                  <AmountInput
                    aria-label={`مبلغ ابزار ${idx + 1}`}
                    value={tool.amount}
                    onValueChange={(v) =>
                      setTools((prev) => prev.map((r) => r.key === tool.key ? { ...r, amount: v } : r))
                    }
                  />
                  <div className="flex items-center gap-1">
                    <Input
                      aria-label={`شماره پیگیری ${idx + 1}`}
                      placeholder="شماره پیگیری / مدرک"
                      value={tool.reference}
                      onChange={(e) =>
                        setTools((prev) => prev.map((r) => r.key === tool.key ? { ...r, reference: e.target.value } : r))
                      }
                    />
                    {tools.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        aria-label="حذف ابزار"
                        onClick={() => setTools((prev) => prev.filter((r) => r.key !== tool.key))}
                      >
                        <TrashIcon size={16} />
                      </Button>
                    )}
                  </div>
                </div>
                {(tool.tool_kind === "bank_transfer" || tool.tool_kind === "card") && (
                  <Select
                    label={`گردش بانکی ردیف ${idx + 1}`}
                    searchable
                    value={tool.bank_movement_id}
                    onValueChange={(v) =>
                      setTools((prev) => prev.map((r) => r.key === tool.key ? { ...r, bank_movement_id: v } : r))
                    }
                    options={bankMovementOptions}
                  />
                )}
                {tool.tool_kind === "cheque" && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Select
                      label={`چک صیادی ردیف ${idx + 1}`}
                      searchable
                      value={tool.cheque_id}
                      onValueChange={(v) =>
                        setTools((prev) => prev.map((r) => r.key === tool.key ? { ...r, cheque_id: v } : r))
                      }
                      options={chequeOptions}
                    />
                    <PersianDatePicker
                      id={`tool-due-${tool.key}`}
                      value={tool.due_date}
                      onChange={(d) =>
                        setTools((prev) => prev.map((r) => r.key === tool.key ? { ...r, due_date: d } : r))
                      }
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
          <FormMessage error>{createClientError || cmd.error?.message}</FormMessage>
          <Button type="submit" busy={cmd.busy} disabled={!partyId || !workspace.periodId}>
            ثبت پیش‌نویس سند خزانه
          </Button>
        </Form>
      </Drawer>
  );
}
