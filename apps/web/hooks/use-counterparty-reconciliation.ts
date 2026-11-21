"use client";

import { useState } from "react";
import { useWorkspace } from "./workspace";
import { useResource } from "./use-resource";
import { useCommand } from "./use-command";
import { asciiDigits, isoDate } from "@/lib/utils";

export interface CounterpartyCandidate {
  id: string;
  code: string;
  name: string;
  national_id?: string;
  phone?: string;
  credit_limit_irr?: string;
  transaction_count: number;
  debit_total: string;
  credit_total: string;
  current_balance: string;
  direction: "debtor" | "creditor" | "settled";
}

export interface StatementRow {
  date: string;
  reference: string;
  debit: string;
  credit: string;
  description: string;
}

export interface CounterpartyLedgerEntry {
  id: string;
  journal_id?: string;
  journal_sequence?: number;
  date: string;
  reference: string;
  description: string;
  account_code: string;
  debit: string;
  credit: string;
  running_balance: string;
  source_kind: string;
}

export interface CounterpartyLedger {
  counterparty: {
    id: string;
    code: string;
    name: string;
    national_id?: string;
    phone?: string;
    credit_limit_irr?: string;
  };
  entries: CounterpartyLedgerEntry[];
  totals: {
    debit_total: string;
    credit_total: string;
    net_balance: string;
    raw_balance: string;
    direction: "debtor" | "creditor" | "settled";
    entry_count: number;
  };
}

export interface ReconciliationRunResult {
  id: string;
  company_id: string;
  counterparty_id: string;
  party_name: string;
  as_of_date: string;
  book_balance: string;
  statement_balance: string;
  discrepancy: string;
  matched_count: number;
  open_book_count: number;
  open_statement_count: number;
  status: string;
  notes?: string;
  created_at?: string;
  payload: {
    as_of_date: string;
    counterparty: {
      id: string;
      code: string;
      name: string;
    };
    tolerance_days: number;
    matched_items: Array<{
      type: string;
      label: string;
      book_item: CounterpartyLedgerEntry;
      statement_item: StatementRow;
      matched_amount: string;
    }>;
    discrepancy_items: Array<{
      type: string;
      label: string;
      book_item: CounterpartyLedgerEntry;
      statement_item: StatementRow;
      difference: string;
    }>;
    open_in_book: Array<CounterpartyLedgerEntry & { nature: string }>;
    open_in_statement: Array<StatementRow & { id: string; nature: string }>;
    summary: {
      book_debit_total: string;
      book_credit_total: string;
      book_balance: string;
      book_direction: string;
      statement_debit_total: string;
      statement_credit_total: string;
      statement_balance: string;
      discrepancy: string;
      is_fully_reconciled: boolean;
      matched_count: number;
      open_book_count: number;
      open_statement_count: number;
      discrepancy_count: number;
    };
  };
}

export function useCounterpartyReconciliation() {
  const workspace = useWorkspace();
  const [selectedPartyId, setSelectedPartyId] = useState<string>("");
  const [asOfDate, setAsOfDate] = useState<string>(isoDate(new Date()));
  const [toleranceDays, setToleranceDays] = useState<number>(7);
  const [statementRows, setStatementRows] = useState<StatementRow[]>([]);
  const [activeRun, setActiveRun] = useState<ReconciliationRunResult | null>(null);
  const [rawPastedText, setRawPastedText] = useState("");

  const candidates = useResource<{ items: CounterpartyCandidate[] }>(
    workspace.companyPath("counterparties/reconciliation-candidates"),
  );

  const ledger = useResource<CounterpartyLedger>(
    selectedPartyId
      ? workspace.companyPath(`counterparties/${selectedPartyId}/statement-ledger?as_of_date=${asOfDate}`)
      : null,
  );

  const history = useResource<{ items: ReconciliationRunResult[] }>(
    selectedPartyId
      ? workspace.companyPath(`counterparties/reconciliations?counterparty_id=${selectedPartyId}`)
      : workspace.companyPath("counterparties/reconciliations"),
  );

  const reconcileCommand = useCommand();
  const decideCommand = useCommand();

  const parsePastedTable = (text: string) => {
    setRawPastedText(text);
    if (!text.trim()) return;
    const lines = text.trim().split(/\r?\n/);
    const parsed: StatementRow[] = [];
    for (const line of lines) {
      const parts = line.split(/[\t,;]/).map((p) => p.trim());
      if (parts.length >= 3) {
        // format: [date, reference, debit, credit, description] or [date, reference, amount, description]
        const rawDate = asciiDigits(parts[0] || "");
        const ref = parts[1] || "";
        const p2 = asciiDigits(parts[2]?.replace(/[,\s]/g, "") || "0");
        const p3 = parts[3] ? asciiDigits(parts[3]?.replace(/[,\s]/g, "") || "0") : "0";
        const desc = parts[4] || parts[3] || "";

        // If 4 parts: date, ref, amount, desc (assume credit if positive or check deb/cred)
        parsed.push({
          date: rawDate,
          reference: ref,
          debit: p2,
          credit: p3,
          description: desc,
        });
      }
    }
    if (parsed.length > 0) {
      setStatementRows(parsed);
    }
  };

  const addManualRow = (row: StatementRow) => {
    setStatementRows((prev) => [...prev, row]);
  };

  const removeRow = (index: number) => {
    setStatementRows((prev) => prev.filter((_, i) => i !== index));
  };

  const clearRows = () => {
    setStatementRows([]);
    setRawPastedText("");
  };

  const executeReconcile = async () => {
    if (!selectedPartyId || !asOfDate) return;
    const result = await reconcileCommand.run<ReconciliationRunResult>(
      workspace.companyPath("counterparties/reconcile"),
      {
        body: {
          counterparty_id: selectedPartyId,
          as_of_date: asOfDate,
          tolerance_days: toleranceDays,
          statement_rows: statementRows,
        },
      },
    );
    if (result) {
      setActiveRun(result);
      void history.refresh();
    }
    return result;
  };

  const decideRun = async (runId: string, status: "reviewed" | "disputed" | "completed", notes: string) => {
    const result = await decideCommand.run(
      workspace.companyPath(`counterparties/reconciliations/${runId}/decide`),
      {
        body: {
          run_id: runId,
          status,
          notes,
        },
      },
    );
    if (result && activeRun?.id === runId) {
      setActiveRun((prev) => prev ? { ...prev, status, notes } : null);
    }
    void history.refresh();
    return result;
  };

  return {
    workspace,
    selectedPartyId,
    setSelectedPartyId,
    asOfDate,
    setAsOfDate,
    toleranceDays,
    setToleranceDays,
    statementRows,
    setStatementRows,
    rawPastedText,
    parsePastedTable,
    addManualRow,
    removeRow,
    clearRows,
    candidates,
    ledger,
    history,
    activeRun,
    setActiveRun,
    reconcileCommand,
    decideCommand,
    executeReconcile,
    decideRun,
  };
}
