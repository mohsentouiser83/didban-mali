"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SettlementDetails, type SettlementDetailsController } from "@/components/product/settlement-details";
import type { BankCandidate, SettlementDetail } from "@/lib/settlements";

const candidate: BankCandidate = { id: "preview", booking_date: "2026-10-07", description: "شرح طولانی نمونه برای پرداخت خدمات فنی و مهندسی و پشتیبانی تجهیزات شرکت با جزئیات مرجع بانکی و شناسه پیگیری", bank_label: "بانک نمونه — حساب جاری", amount_irr: "10000000", available_amount_irr: "10000000", reason: "مبلغ برابر است" };
const detail: SettlementDetail = { receipt_history_complete: false, invoice: { source_row_id: "preview", key: "preview", direction: "sales", number: "INV-PREVIEW-1405-0001", invoice_no: "1405-1", party_name: "شرکت نمونه خدمات پشتیبانی", issue_date: "2026-10-01", gross_amount_irr: "20000000", allocated_amount_irr: "10000000", unallocated_amount_irr: "10000000", review_reason: null }, candidates: [candidate], allocations: [{ id: "allocation", bank_transaction_id: "preview", amount_irr: "10000000", booking_date: "2026-10-06", description: candidate.description, reversed: false }], transaction_total: 1 };
const noop = () => {};
const action = async () => {};

export function SettlementDrawerPreview() {
  const [open, setOpen] = useState(false);
  const [bank, setBank] = useState<BankCandidate | null>(null);
  const [amount, setAmount] = useState("");
  const [complete, setComplete] = useState(false);
  const [search, setSearch] = useState("");
  const c: SettlementDetailsController = { selected: open ? "preview" : null, open: () => setOpen(false), detail, detailLoading: false, detailError: "", actionError: "", notice: "", busy: false, writable: true, bank, chooseBank: value => { setBank(value); setAmount(value.available_amount_irr); }, amount, setAmount, bankSearch: search, changeBankSearch: setSearch, bankOffset: 0, setBankOffset: noop, complete, setComplete, confirmHistory: action, reverse: action, save: action, retry: noop };
  return <><Button variant="outline" onClick={() => setOpen(true)}>آزمایش drawer تخصیص بانکی</Button><SettlementDetails c={c} /></>;
}
