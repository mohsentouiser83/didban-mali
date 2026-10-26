from datetime import date
from decimal import Decimal
from typing import Any
from uuid import UUID

from app.findings.rules.base import BaseFindingRule, FindingCandidate, FindingEvidenceSpec
from app.findings.titles import unmatched_title


class UnmatchedBankTransactionRule(BaseFindingRule):
    rule_code = "unmatched_bank_transaction"
    default_severity = "medium"
    category = "cash_and_bank"

    async def evaluate(self, context: Any) -> list[FindingCandidate]:
        candidates: list[FindingCandidate] = []
        company_id: UUID = context.company_id
        as_of_date: date = context.as_of_date
        unmatched_banks = context.unmatched_bank_transactions
        policy = context.policies.get(self.rule_code, {})
        thresholds = policy.get("thresholds", {})
        min_days = int(thresholds.get("min_days_unmatched", 0))
        large_threshold = Decimal(str(thresholds.get("large_threshold_irr", 2_000_000_000)))

        for b in unmatched_banks:
            days_open = (as_of_date - b.booking_date).days
            # Skip if newer than threshold or if handled by large transaction rule
            if days_open < min_days or abs(b.amount_irr) >= large_threshold:
                continue

            severity = "high" if abs(b.amount_irr) >= Decimal(500_000_000) else self.default_severity
            severity = policy.get("severity_override") or severity

            fp = f"{company_id}:{self.rule_code}:{b.id}"
            amt_str = f"{abs(b.amount_irr):,.0f}"

            candidates.append(
                FindingCandidate(
                    fingerprint=fp,
                    rule_code=self.rule_code,
                    category=self.category,
                    severity=severity,
                    title_fa=unmatched_title("bank_transaction", b.amount_irr),
                    summary_fa=(
                        f"تراکنش بانکی به مبلغ {amt_str} ریال با شرح «{b.description}» "
                        f"در تاریخ {b.booking_date} ({days_open} روز پیش) ثبت شده؛ هنوز تطبیق تأییدشده ندارد."
                    ),
                    financial_impact_irr=abs(b.amount_irr),
                    source_entity_type="bank_transaction",
                    source_entity_id=b.id,
                    period_start=b.booking_date,
                    period_end=b.booking_date,
                    evidence_items=[
                        FindingEvidenceSpec(
                            ordinal=1,
                            evidence_type="source_record",
                            title_fa="اطلاعات تراکنش بانکی منبع",
                            description_fa="مشخصات تراکنش ثبت‌شده در صورت‌حساب بانک",
                            payload={
                                "transaction_id": str(b.id),
                                "source_row_id": str(b.source_row_id),
                                "amount_irr": str(b.amount_irr),
                                "booking_date": b.booking_date.isoformat(),
                                "description": b.description,
                                "reference": b.reference,
                                "days_open": days_open,
                            },
                        )
                    ],
                )
            )
        return candidates


class UnmatchedAccountingEntryRule(BaseFindingRule):
    rule_code = "unmatched_accounting_entry"
    default_severity = "medium"
    category = "cash_and_bank"

    async def evaluate(self, context: Any) -> list[FindingCandidate]:
        candidates: list[FindingCandidate] = []
        company_id: UUID = context.company_id
        as_of_date: date = context.as_of_date
        unmatched_journals = context.unmatched_journal_lines
        policy = context.policies.get(self.rule_code, {})
        thresholds = policy.get("thresholds", {})
        min_days = int(thresholds.get("min_days_unmatched", 0))
        large_threshold = Decimal(str(thresholds.get("large_threshold_irr", 2_000_000_000)))

        for j in unmatched_journals:
            days_open = (as_of_date - j["entry_date"]).days
            net_amt = abs(Decimal(j["net_amount_irr"]))
            if days_open < min_days or net_amt >= large_threshold:
                continue

            severity = policy.get("severity_override") or self.default_severity
            fp = f"{company_id}:{self.rule_code}:{j['id']}"
            amt_str = f"{net_amt:,.0f}"

            candidates.append(
                FindingCandidate(
                    fingerprint=fp,
                    rule_code=self.rule_code,
                    category=self.category,
                    severity=severity,
                    title_fa=unmatched_title("journal_line", net_amt),
                    summary_fa=(
                        f"سطر سند حسابداری به مبلغ {amt_str} ریال با شرح «{j['description']}» "
                        f"در تاریخ {j['entry_date']} ثبت شده؛ هنوز تطبیق تأییدشده ندارد."
                    ),
                    financial_impact_irr=net_amt,
                    source_entity_type="journal_line",
                    source_entity_id=j["id"],
                    period_start=j["entry_date"],
                    period_end=j["entry_date"],
                    evidence_items=[
                        FindingEvidenceSpec(
                            ordinal=1,
                            evidence_type="source_record",
                            title_fa="مشخصات سطر سند حسابداری",
                            description_fa="اطلاعات سطر معین حسابداری نقد و بانک",
                            payload={
                                "journal_line_id": str(j["id"]),
                                "source_row_id": str(j["source_row_id"]),
                                "document_number": j.get("document_number"),
                                "entry_id": str(j["entry_id"]),
                                "debit_irr": str(j["debit_irr"]),
                                "credit_irr": str(j["credit_irr"]),
                                "entry_date": j["entry_date"].isoformat(),
                                "description": j["description"],
                                "counterparty_name": j.get("counterparty_name"),
                                "days_open": days_open,
                            },
                        )
                    ],
                )
            )
        return candidates


class PotentialDuplicateTransactionRule(BaseFindingRule):
    rule_code = "potential_duplicate_transaction"
    default_severity = "high"
    category = "cash_and_bank"

    async def evaluate(self, context: Any) -> list[FindingCandidate]:
        candidates: list[FindingCandidate] = []
        company_id: UUID = context.company_id
        duplicate_matches = context.duplicate_matches
        policy = context.policies.get(self.rule_code, {})
        severity = policy.get("severity_override") or self.default_severity

        for m in duplicate_matches:
            target_id = m.bank_transaction_id or m.journal_entry_id
            if not target_id:
                continue
            fp = f"{company_id}:{self.rule_code}:{target_id}"
            amt = abs(Decimal(str(m.evidence_json.get("bank", m.evidence_json.get("accounting", {})).get("amount_irr", "0"))))

            candidates.append(
                FindingCandidate(
                    fingerprint=fp,
                    rule_code=self.rule_code,
                    category=self.category,
                    severity=severity,
                    title_fa="تراکنش مشکوک به تکرار در صورت‌حساب مالی",
                    summary_fa=(
                        "تراکنش با شناسه یا مشخصات یکسان و مبلغ مشابه در بازه زمانی کوتاه مجدداً ثبت شده "
                        "که نشان‌دهنده احتمال تکرار در بارگذاری یا پرداخت مجدد است."
                    ),
                    financial_impact_irr=Decimal(str(amt)) if amt else None,
                    source_entity_type="bank_transaction" if m.bank_transaction_id else "journal_entry",
                    source_entity_id=target_id,
                    period_start=context.as_of_date,
                    period_end=context.as_of_date,
                    reconciliation_match_id=m.id,
                    evidence_items=[
                        FindingEvidenceSpec(
                            ordinal=1,
                            evidence_type="reconciliation_detail",
                            title_fa="شواهد تطبیق تکراری",
                            description_fa="جزئیات شناسایی تکرار توسط موتور تطبیق بانکی",
                            payload=m.evidence_json,
                        )
                    ],
                )
            )

        # 2. Check unmatched bank transactions with same amount and date
        seen_banks: dict[tuple[object, ...], Any] = {}
        for b in context.unmatched_bank_transactions:
            key = (b.bank_account_id, b.amount_irr, b.booking_date,
                   getattr(b, "source_transaction_id", None), getattr(b, "running_balance_irr", None))
            if key in seen_banks:
                other = seen_banks[key]
                fp = f"{company_id}:{self.rule_code}:{b.id}"
                candidates.append(
                    FindingCandidate(
                        fingerprint=fp,
                        rule_code=self.rule_code,
                        category=self.category,
                        severity=severity,
                        title_fa="تراکنش مشکوک به تکرار در صورت‌حساب بانکی",
                        summary_fa=(
                            f"تراکنش به مبلغ {abs(b.amount_irr):,.0f} ریال در تاریخ {b.booking_date} "
                            f"با تراکنش دیگری با مشخصات مشابه تکرار شده است."
                        ),
                        financial_impact_irr=abs(b.amount_irr),
                        source_entity_type="bank_transaction",
                        source_entity_id=b.id,
                        period_start=b.booking_date,
                        period_end=b.booking_date,
                        evidence_items=[
                            FindingEvidenceSpec(
                                ordinal=1,
                                evidence_type="source_record",
                                title_fa="مشخصات تراکنش‌های تکراری",
                                description_fa="تراکنش‌های بانکی با مبلغ و تاریخ یکسان در صورت‌حساب",
                                payload={
                                    "bank_transaction_id": str(b.id),
                                    "source_row_id": str(b.source_row_id),
                                    "duplicate_of_id": str(other.id),
                                    "amount_irr": str(b.amount_irr),
                                    "date": b.booking_date.isoformat(),
                                    "description": b.description,
                                },
                            )
                        ],
                    )
                )
            else:
                seen_banks[key] = b
        return candidates


class LargeUnreconciledTransactionRule(BaseFindingRule):
    rule_code = "large_unreconciled_transaction"
    default_severity = "critical"
    category = "cash_and_bank"

    async def evaluate(self, context: Any) -> list[FindingCandidate]:
        candidates: list[FindingCandidate] = []
        company_id: UUID = context.company_id
        as_of_date: date = context.as_of_date
        unmatched_banks = context.unmatched_bank_transactions
        unmatched_journals = context.unmatched_journal_lines
        policy = context.policies.get(self.rule_code, {})
        thresholds = policy.get("thresholds", {})
        large_threshold = Decimal(str(thresholds.get("large_threshold_irr", 2_000_000_000)))
        severity = policy.get("severity_override") or self.default_severity

        # Check bank side
        for b in unmatched_banks:
            amt = abs(b.amount_irr)
            if amt >= large_threshold:
                days_open = (as_of_date - b.booking_date).days
                fp = f"{company_id}:{self.rule_code}:bank:{b.id}"
                candidates.append(
                    FindingCandidate(
                        fingerprint=fp,
                        rule_code=self.rule_code,
                        category=self.category,
                        severity=severity,
                        title_fa=unmatched_title("bank_transaction", amt),
                        summary_fa=(
                            f"تراکنش بانکی به مبلغ بااهمیت {amt:,.0f} ریال در تاریخ {b.booking_date} "
                            f"با شرح «{b.description}» هنوز تطبیق تأییدشده ندارد."
                        ),
                        financial_impact_irr=amt,
                        source_entity_type="bank_transaction",
                        source_entity_id=b.id,
                        period_start=b.booking_date,
                        period_end=b.booking_date,
                        evidence_items=[
                            FindingEvidenceSpec(
                                ordinal=1,
                                evidence_type="source_record",
                                title_fa="اطلاعات تراکنش بانکی بااهمیت",
                                description_fa="تراکنش منبع با مبلغ بالاتر از آستانه اهمیت شرکت",
                                payload={
                                    "transaction_id": str(b.id),
                                "source_row_id": str(b.source_row_id),
                                    "amount_irr": str(amt),
                                    "threshold_irr": str(large_threshold),
                                    "days_open": days_open,
                                    "description": b.description,
                                },
                            )
                        ],
                    )
                )

        # Check journal side
        for j in unmatched_journals:
            amt = abs(Decimal(j["net_amount_irr"]))
            if amt >= large_threshold:
                days_open = (as_of_date - j["entry_date"]).days
                fp = f"{company_id}:{self.rule_code}:journal:{j['id']}"
                candidates.append(
                    FindingCandidate(
                        fingerprint=fp,
                        rule_code=self.rule_code,
                        category=self.category,
                        severity=severity,
                        title_fa=unmatched_title("journal_line", amt),
                        summary_fa=(
                            f"سند حسابداری نقد و بانک به مبلغ بااهمیت {amt:,.0f} ریال در تاریخ {j['entry_date']} "
                            f"هنوز تطبیق تأییدشده ندارد."
                        ),
                        financial_impact_irr=amt,
                        source_entity_type="journal_line",
                        source_entity_id=j["id"],
                        period_start=j["entry_date"],
                        period_end=j["entry_date"],
                        evidence_items=[
                            FindingEvidenceSpec(
                                ordinal=1,
                                evidence_type="source_record",
                                title_fa="مشخصات سطر سند حسابداری بااهمیت",
                                description_fa="سطر سند حسابداری با مبلغ بالاتر از آستانه اهمیت",
                                payload={
                                    "journal_line_id": str(j["id"]),
                                "source_row_id": str(j["source_row_id"]),
                                "document_number": j.get("document_number"),
                                    "amount_irr": str(amt),
                                    "threshold_irr": str(large_threshold),
                                    "days_open": days_open,
                                    "description": j["description"],
                                },
                            )
                        ],
                    )
                )

        return candidates


class ReconciliationMismatchRule(BaseFindingRule):
    rule_code = ""
    default_severity = "medium"
    category = "cash_and_bank"

    def __init__(self, rule_code: str, match_status: str, label: str) -> None:
        self.rule_code = rule_code
        self.match_status = match_status
        self.label = label

    async def evaluate(self, context: Any) -> list[FindingCandidate]:
        candidates = []
        policy = context.policies.get(self.rule_code, {})
        for match in context.reconciliation_matches:
            if match.status != self.match_status:
                continue
            bank = match.evidence_json.get("bank", {})
            ledger = match.evidence_json.get("accounting", {})
            identity = bank.get("transaction_id") or ledger.get("journal_line_id")
            counterpart = ledger.get("journal_line_id", "")
            if not identity:
                continue
            difference = abs(Decimal(str(match.amount_difference_irr or 0)))
            summary = (
                f"اختلاف مبلغ بانک و دفتر {difference:,.0f} ریال است."
                if self.rule_code == "amount_mismatch"
                else f"تاریخ ثبت بانک و دفتر {match.date_difference_days or 0} روز فاصله دارد."
            )
            candidates.append(FindingCandidate(
                fingerprint=f"{context.company_id}:{self.rule_code}:{identity}:{counterpart}",
                rule_code=self.rule_code, category=self.category,
                severity=policy.get("severity_override") or self.default_severity,
                title_fa=self.label, summary_fa=summary,
                financial_impact_irr=difference if self.rule_code == "amount_mismatch" else abs(Decimal(str(bank.get("amount_irr", 0)))),
                source_entity_type="bank_transaction" if bank else "journal_line",
                source_entity_id=UUID(str(identity)),
                period_start=context.as_of_date, period_end=context.as_of_date,
                reconciliation_match_id=match.id,
                evidence_items=[FindingEvidenceSpec(
                    ordinal=1, evidence_type="reconciliation_detail", title_fa="مقایسه بانک و دفتر",
                    description_fa=summary, payload=match.evidence_json,
                )],
            ))
        return candidates
