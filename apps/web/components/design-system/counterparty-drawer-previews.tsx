"use client";
import { DetailGroup, DetailField, fieldIcon } from "@/components/ui/field-layout";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { MoneyDisplay } from "@/components/ui/financial";
import { ReceivablesCustomers } from "@/components/product/receivables-customers";
import { PayableEntries } from "@/components/product/payable-entries";
import type { PeriodReport } from "@/lib/financial-periods";
import type { api } from "@/lib/product-api";

const report: PeriodReport["receivables"] = {
  opening_balance_irr: "0", closing_balance_irr: "90071992547409931", sales_irr: "90071992547409931", receipts_irr: "0", overdue_irr: "0", history_complete: true, warnings: [], buckets: [],
  customers: [{ counterparty_id: "preview", name: "مشتری نمونه با نام طولانی برای بررسی هم‌ترازی و نمایش کامل", national_id: null, total_outstanding_irr: "90071992547409931", overdue_amount_irr: "0", overdue_ratio: 0, avg_delay_days: 0, risk_level: "low", risk_score: 0, recommended_action: "", buckets: { not_due: "0", "1_30": "0", "31_60": "0", "61_90": "0", "90_plus": "0", due_date_missing: "90071992547409931" }, open_invoices_count: 1 }],
  invoices: [{ id: "preview", invoice_no: "INV-PREVIEW-1405-12000000000000000001", counterparty_name: "مشتری نمونه", counterparty_id: "preview", issue_date: "2026-10-01", due_date: null, gross_amount_irr: "90071992547409931", paid_amount_irr: "0", remaining_amount_irr: "90071992547409931", delay_days: 0, bucket_key: "due_date_missing", status: null }],
};
const entriesRequest: typeof api = async <T,>(): Promise<T> => ({ as_of_date: "2026-10-07", items: [{ id: "preview", entry_number: "JV-1405-120000000000000001", entry_date: "2026-10-07", description: "شرح آزمایشی طولانی سند خدمات فنی و پشتیبانی تجهیزات شرکت نمونه برای بررسی کوتاه‌نمایی و tooltip", debit_irr: "0", credit_irr: "90071992547409931", estimated_due_date: null }] }) as T;

export function CounterpartyDrawerPreviews() {
  const [customer, setCustomer] = useState(false);
  const [vendor, setVendor] = useState(false);
  return <div className="grid min-w-0 gap-4">
    <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setCustomer(value => !value)}>آزمایش جزئیات مشتری</Button><Button variant="outline" onClick={() => setVendor(true)}>آزمایش اسناد تأمین‌کننده</Button></div>
    {customer && <ReceivablesCustomers companyId="preview" asOfDate="2026-10-07" periodReport={report} title="مشتریان نمونه" />}
    <Drawer size="wide" open={vendor} onOpenChange={setVendor} title="تأمین‌کننده — نمونه">
      <DetailGroup><DetailField icon={fieldIcon("مانده بدهی")} label="مانده بدهی"><MoneyDisplay amount="90071992547409931" currency="ریال" direction="neutral" /></DetailField></DetailGroup>
      {vendor && <PayableEntries companyId="preview" counterpartyId="preview" asOfDate="2026-10-07" request={entriesRequest} />}
    </Drawer>
  </div>;
}
