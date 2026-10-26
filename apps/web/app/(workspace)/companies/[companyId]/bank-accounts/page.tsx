"use client";
import { BankLedgerLinksWorkspace } from "@/components/product/bank-ledger-links-workspace";
import { useWorkspace } from "@/components/product/workspace-provider";
export default function BankAccountsPage() {
  const { company } = useWorkspace();
  return <BankLedgerLinksWorkspace company={company} />;
}
