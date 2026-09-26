from datetime import date
from decimal import Decimal
from typing import Any
from uuid import UUID

from app.findings.rules.base import BaseFindingRule, FindingCandidate, FindingEvidenceSpec


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
        min_days = int(thresholds.get("min_days_unmatched", 7))
        large_threshold = Decimal(str(thresholds.get("large_threshold_irr", 2_000_000_000)))

        for b in unmatched_banks:
            days_open = (as_of_date - b.booking_date).days
            # Skip if newer than threshold or if handled by large transaction rule
            if days_open < min_days or abs(b.amount_irr) >= large_threshold:
                continue

            severity = "high" if abs(b.amount_irr) >= Decimal(500_000_000) else self.default_severity
            severity = policy.get("severity_override") or severity

            fp = f"{company_id}:{self.rule_code}:{b.id}"
            amt_str = f"{abs(b.amount_irr):,}"
            direction_str = "واریز" if b.amount_irr > 0 else "برداشت"

            candidates.append(
                FindingCandidate(
                    fingerprint=fp,
                    rule_code=self.rule_code,
                    category=self.category,
                    severity=severity,
                    title_fa=f"تراکنش بانکی تطبیق‌نشده ({direction_str}) به مبلغ {amt_str} ریال",
                    summary_fa=(
                        f"تراکنش بانکی به مبلغ {amt_str} ریال با شرح «{b.description}» "
                        f"در تاریخ {b.booking_date} ({days_open} روز پیش) ثبت شده اما در دفاتر مالی سندی برای آن یافت نشد."
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
        min_days = int(thresholds.get("min_days_unmatched", 7))
        large_threshold = Decimal(str(thresholds.get("large_threshold_irr", 2_000_000_000)))

        for j in unmatched_journals:
            days_open = (as_of_date - j["entry_date"]).days
            net_amt = abs(Decimal(j["net_amount_irr"]))
            if days_open < min_days or net_amt >= large_threshold:
                continue

            severity = policy.get("severity_override") or self.default_severity
            fp = f"{company_id}:{self.rule_code}:{j['id']}"
            amt_str = f"{net_amt:,}"

            candidates.append(
                FindingCandidate(
                    fingerprint=fp,
                    rule_code=self.rule_code,
                    category=self.category,
                    severity=severity,
                    title_fa=f"سطر سند حسابداری نقد و بانک تطبیق‌نشده به مبلغ {amt_str} ریال",
                    summary_fa=(
                        f"سطر سند حسابداری به مبلغ {amt_str} ریال با شرح «{j['description']}» "
                        f"در تاریخ {j['entry_date']} ثبت شده اما متناظر آن در تراکنش‌های بانکی موجود نیست."
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
            amt = abs(m.evidence_json.get("bank", {}).get("amount_irr", "0"))

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
        seen_banks: dict[tuple[UUID | None, Decimal, date], Any] = {}
        for b in context.unmatched_bank_transactions:
            key = (b.bank_account_id, b.amount_irr, b.booking_date)
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
                            f"تراکنش به مبلغ {abs(b.amount_irr):,} ریال در تاریخ {b.booking_date} "
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
                        title_fa=f"تراکنش تطبیق‌نشده بااهمیت بانکی به مبلغ {amt:,} ریال",
                        summary_fa=(
                            f"تراکنش بانکی به مبلغ بااهمیت {amt:,} ریال در تاریخ {b.booking_date} "
                            f"با شرح «{b.description}» بیش از حد مجاز بدون سند معادل در دفاتر بلاتکلیف مانده است."
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
                        title_fa=f"سطر سند حسابداری تطبیق‌نشده بااهمیت به مبلغ {amt:,} ریال",
                        summary_fa=(
                            f"سند حسابداری نقد و بانک به مبلغ بااهمیت {amt:,} ریال در تاریخ {j['entry_date']} "
                            f"فاقد گردش متناظر در صورت‌حساب بانک است."
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
