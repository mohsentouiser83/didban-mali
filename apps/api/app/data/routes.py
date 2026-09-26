from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.companies.dependencies import CurrentCompanyAccess
from app.data.schemas import (
    ActionableHealthIssue,
    DataOverviewResponse,
    DataQualityResponse,
    QualityIssueGroup,
    QuarantinedRowItem,
    RecordLineageResponse,
    SourceCardHealth,
)
from app.financial.models import (
    BankTransaction,
    JournalEntry,
    JournalLine,
    SalesInvoice,
)
from app.identity.dependencies import DbSession
from app.imports.models import (
    DataSource,
    ImportBatch,
    ImportStatus,
    IssueSeverity,
    MappingVersion,
    SourceFile,
    SourceKind,
    SourceRow,
    ValidationIssue,
)

router = APIRouter(prefix="/companies/{company_id}/data", tags=["data-foundation"])

SOURCE_TITLES = {
    SourceKind.ACCOUNTING: "حسابداری",
    SourceKind.BANK: "گردش بانکی",
    SourceKind.SALES: "فروش و صورتحساب",
}

ISSUE_TITLES = {
    "REQUIRED_VALUE_MISSING": "مقدار الزامی خالی",
    "INVALID_DATE": "تاریخ نامعتبر یا ناخوانا",
    "INVALID_MONEY": "مبلغ نامعتبر یا غیرقابل تبدیل",
    "FORMULA_NOT_ALLOWED": "فرمول اکسل محاسبه‌نشده",
    "NEGATIVE_LEDGER_AMOUNT": "مبلغ بدهکار یا بستانکار منفی",
    "BOTH_DEBIT_AND_CREDIT": "ثبت هم‌زمان بدهکار و بستانکار در یک ردیف",
    "ENTRY_ID_MISSING": "شماره سند مفقود",
    "NEGATIVE_BANK_COMPONENT": "مبلغ واریز یا برداشت منفی",
    "BOTH_DEPOSIT_AND_WITHDRAWAL": "ثبت هم‌زمان واریز و برداشت",
    "DUE_DATE_MISSING": "تاریخ سررسید ثبت نشده",
    "CUSTOMER_IDENTIFIER_MISSING": "شناسه ملی یا کد اقتصادی مشتری مفقود است",
}


@router.get("/overview", response_model=DataOverviewResponse)
async def get_data_overview(
    company_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
) -> DataOverviewResponse:
    del access
    now = datetime.now(UTC)

    sources_health: list[SourceCardHealth] = []
    all_health_issues: list[ActionableHealthIssue] = []
    total_acc = 0
    total_rej = 0
    total_warn = 0

    for kind in (SourceKind.ACCOUNTING, SourceKind.BANK, SourceKind.SALES):
        title = SOURCE_TITLES[kind]

        batches_stmt = (
            select(ImportBatch, SourceFile)
            .join(SourceFile, SourceFile.id == ImportBatch.file_id)
            .join(DataSource, DataSource.id == ImportBatch.source_id)
            .where(ImportBatch.company_id == company_id, DataSource.kind == kind)
            .order_by(ImportBatch.created_at.desc())
        )
        batch_rows = (await session.execute(batches_stmt)).all()

        if not batch_rows:
            sources_health.append(
                SourceCardHealth(
                    source_kind=kind,
                    source_title=title,
                    status="no_data",
                    status_label="بدون داده",
                    last_successful_import=None,
                    accepted_records=0,
                    rejected_records=0,
                    warnings_count=0,
                    estimated_coverage_pct=0,
                    freshness_days=None,
                    freshness_label="هنوز داده‌ای بارگذاری نشده است",
                    usable_for_calculations=False,
                    primary_cta_label="بارگذاری داده",
                    primary_cta_action="upload",
                    summary_notes=[
                        "برای فعال‌سازی گزارش‌ها، نخستین فایل را بارگذاری کنید."
                    ],
                )
            )
            continue

        kind_accepted = sum(b.accepted_count for b, _ in batch_rows)
        kind_rejected = sum(b.rejected_count for b, _ in batch_rows)
        total_acc += kind_accepted
        total_rej += kind_rejected

        batch_ids = [b.id for b, _ in batch_rows]
        warn_count = await session.scalar(
            select(func.count(ValidationIssue.id)).where(
                ValidationIssue.company_id == company_id,
                ValidationIssue.import_batch_id.in_(batch_ids),
                ValidationIssue.severity == IssueSeverity.WARNING,
            )
        ) or 0
        total_warn += warn_count

        completed_batches = [
            b
            for b, _ in batch_rows
            if b.status in (ImportStatus.COMPLETED, ImportStatus.COMPLETED_LIMITED)
        ]
        active_batches = [
            b
            for b, _ in batch_rows
            if b.status
            in (
                ImportStatus.PROCESSING,
                ImportStatus.QUEUED,
                ImportStatus.VALIDATING,
                ImportStatus.INSPECTING,
            )
        ]
        failed_batches = [b for b, _ in batch_rows if b.status == ImportStatus.FAILED]

        last_success = completed_batches[0].created_at if completed_batches else None
        freshness_days = (now - last_success).days if last_success else None

        if freshness_days is None:
            freshness_label = "بدون بارگذاری موفق"
        elif freshness_days == 0:
            freshness_label = "به‌روز (امروز)"
        elif freshness_days == 1:
            freshness_label = "دیروز"
        else:
            freshness_label = f"{freshness_days} روز قبل"

        notes: list[str] = []
        if completed_batches:
            latest = completed_batches[0]
            cov = latest.coverage_json.get("overall", 100) if latest.coverage_json else 100
            cov_pct = int(cov)
            notes.append(f"{kind_accepted:,} رکورد معتبر ثبت‌شده در دفاتر".replace(",", "٬"))
        else:
            cov_pct = 0

        # Determine status and primary CTA
        if active_batches:
            st = "processing"
            st_label = "در حال پردازش"
            cta_lbl = "مشاهده روند"
            cta_act = "history"
            notes.append("یک عملیات ورود داده هم‌اکنون در جریان است.")
        elif failed_batches and not completed_batches:
            st = "error"
            st_label = "دارای خطا"
            cta_lbl = "بررسی خطاها"
            cta_act = "quality"
            notes.append("آخرین تلاش برای بارگذاری فایل با خطا متوقف شد.")
        elif kind_rejected > 0:
            st = "warning"
            st_label = "دارای هشدار"
            cta_lbl = "بررسی خطاها"
            cta_act = "quality"
            rej_formatted = f"{kind_rejected:,}".replace(",", "٬")
            notes.append(f"{rej_formatted} سطر به دلیل نقص اعتبارسنجی رد شده است.")
        elif freshness_days is not None and freshness_days > 30:
            st = "needs_update"
            st_label = "نیازمند به‌روزرسانی"
            cta_lbl = "به‌روزرسانی"
            cta_act = "upload"
            notes.append("بیش از یک ماه از آخرین ورود داده می‌گذرد.")
        elif completed_batches:
            st = "ready"
            st_label = "آماده"
            cta_lbl = "مشاهده جزئیات"
            cta_act = "history"
            notes.append("داده‌ها کاملاً معتبر بوده و در محاسبات لحاظ شده‌اند.")
        else:
            st = "no_data"
            st_label = "بدون داده"
            cta_lbl = "بارگذاری داده"
            cta_act = "upload"

        usable = bool(completed_batches and kind_accepted > 0)

        sources_health.append(
            SourceCardHealth(
                source_kind=kind,
                source_title=title,
                status=st,
                status_label=st_label,
                last_successful_import=last_success,
                accepted_records=kind_accepted,
                rejected_records=kind_rejected,
                warnings_count=warn_count,
                estimated_coverage_pct=cov_pct,
                freshness_days=freshness_days,
                freshness_label=freshness_label,
                usable_for_calculations=usable,
                primary_cta_label=cta_lbl,
                primary_cta_action=cta_act,
                summary_notes=notes,
            )
        )

        # Generate Actionable Health Issues
        if kind_rejected > 0:
            rej_txt = f"{kind_rejected:,}".replace(",", "٬")
            all_health_issues.append(
                ActionableHealthIssue(
                    id=f"rejected-{kind.value}",
                    severity="error",
                    title=f"{rej_txt} رکورد {title} رد شده و در قرنطینه است",
                    description=(
                        "این سطرها به دلیل عدم تطابق ساختار وارد دفاتر نشدند "
                        "و در قرنطینه نگهداری می‌شوند."
                    ),
                    action_label="بررسی رکوردهای ردشده",
                    action_tab="quality",
                    batch_id=batch_rows[0][0].id,
                )
            )

        if freshness_days is not None and freshness_days > 5 and kind == SourceKind.BANK:
            all_health_issues.append(
                ActionableHealthIssue(
                    id="stale-bank",
                    severity="warning",
                    title=f"آخرین داده بانکی مربوط به {freshness_days} روز قبل است",
                    description=(
                        "برای به‌روز نگه‌داشتن جریان نقدینگی، فایل جدید را بارگذاری نمایید."
                    ),
                    action_label="بارگذاری صورتحساب بانک",
                    action_tab="upload",
                    batch_id=None,
                )
            )

        if kind == SourceKind.ACCOUNTING and usable:
            acc_txt = f"{kind_accepted:,}".replace(",", "٬")
            all_health_issues.append(
                ActionableHealthIssue(
                    id="accounting-ready",
                    severity="info",
                    title="فایل حسابداری کامل پردازش شده است",
                    description=f"{acc_txt} آرتیکل سند دفتر کل بدون خطا تراز و ثبت شده است.",
                    action_label="مشاهده تاریخچه اسناد",
                    action_tab="history",
                    batch_id=completed_batches[0].id,
                )
            )

    total_records = total_acc + total_rej
    health_score = round((total_acc / total_records) * 100) if total_records > 0 else 100

    return DataOverviewResponse(
        company_id=company_id,
        sources=sources_health,
        health_issues=all_health_issues,
        total_accepted_records=total_acc,
        total_rejected_records=total_rej,
        total_warnings=total_warn,
        overall_health_score=health_score,
    )


@router.get("/quality", response_model=DataQualityResponse)
async def get_data_quality(
    company_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> DataQualityResponse:
    del access

    # Group validation issues
    group_rows = (
        await session.execute(
            select(
                ValidationIssue.code,
                ValidationIssue.severity,
                ValidationIssue.remedy,
                func.count(ValidationIssue.id).label("issue_count"),
                func.count(func.distinct(ValidationIssue.import_batch_id)).label("batch_count"),
            )
            .where(ValidationIssue.company_id == company_id)
            .group_by(ValidationIssue.code, ValidationIssue.severity, ValidationIssue.remedy)
            .order_by(func.count(ValidationIssue.id).desc())
        )
    ).all()

    groups: list[QualityIssueGroup] = []
    for code, severity, remedy, issue_count, batch_count in group_rows:
        title = ISSUE_TITLES.get(code, code)
        groups.append(
            QualityIssueGroup(
                code=code,
                title=title,
                severity=severity,
                count=issue_count,
                remedy=remedy,
                affected_batches_count=batch_count,
            )
        )

    # Get sample quarantined rows
    quarantined_stmt = (
        select(SourceRow, ImportBatch, SourceFile, DataSource)
        .join(ImportBatch, ImportBatch.id == SourceRow.import_batch_id)
        .join(SourceFile, SourceFile.id == ImportBatch.file_id)
        .join(DataSource, DataSource.id == ImportBatch.source_id)
        .where(
            SourceRow.company_id == company_id,
            SourceRow.id.in_(
                select(ValidationIssue.source_row_id).where(
                    ValidationIssue.company_id == company_id,
                    ValidationIssue.severity.in_([IssueSeverity.BLOCKING, IssueSeverity.ERROR]),
                )
            ),
        )
        .order_by(SourceRow.row_number)
        .limit(limit)
    )
    quarantined_results = (await session.execute(quarantined_stmt)).all()

    quarantined_rows: list[QuarantinedRowItem] = []
    for srow, batch, sfile, sdata in quarantined_results:
        row_issues = (
            await session.scalars(
                select(ValidationIssue).where(
                    ValidationIssue.company_id == company_id,
                    ValidationIssue.source_row_id == srow.id,
                )
            )
        ).all()
        quarantined_rows.append(
            QuarantinedRowItem(
                row_id=srow.id,
                batch_id=batch.id,
                source_filename=sfile.original_name,
                source_kind=sdata.kind,
                sheet=srow.sheet,
                row_number=srow.row_number,
                raw_data=srow.raw_json,
                issues=[
                    {
                        "code": iss.code,
                        "title": ISSUE_TITLES.get(iss.code, iss.code),
                        "message": iss.message,
                        "severity": iss.severity.value,
                        "remedy": iss.remedy,
                    }
                    for iss in row_issues
                ],
            )
        )

    acc = await session.scalar(
        select(func.coalesce(func.sum(ImportBatch.accepted_count), 0)).where(
            ImportBatch.company_id == company_id
        )
    ) or 0
    rej = await session.scalar(
        select(func.coalesce(func.sum(ImportBatch.rejected_count), 0)).where(
            ImportBatch.company_id == company_id
        )
    ) or 0
    warns = await session.scalar(
        select(func.count(ValidationIssue.id)).where(
            ValidationIssue.company_id == company_id,
            ValidationIssue.severity == IssueSeverity.WARNING,
        )
    ) or 0

    tot = acc + rej
    score = round((acc / tot) * 100) if tot > 0 else 100

    return DataQualityResponse(
        company_id=company_id,
        total_records=tot,
        accepted_records=acc,
        warning_records=warns,
        rejected_records=rej,
        health_score_pct=score,
        groups=groups,
        quarantined_rows=quarantined_rows,
    )


@router.get("/lineage/{entity_type}/{record_id}", response_model=RecordLineageResponse)
async def get_record_lineage(
    company_id: UUID,
    entity_type: str,
    record_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
) -> RecordLineageResponse:
    del access

    source_row_id: UUID | None = None
    normalized_fields: dict[str, object] = {}

    if entity_type == "journal_entry":
        entry = await session.scalar(
            select(JournalEntry).where(
                JournalEntry.id == record_id, JournalEntry.company_id == company_id
            )
        )
        if entry is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="سند پیدا نشد.")
        source_row_id = entry.source_row_id
        normalized_fields = {
            "source_entry_key": entry.source_entry_key,
            "entry_date": entry.entry_date.isoformat(),
            "description": entry.description,
            "fiscal_period": entry.fiscal_period,
            "reference": entry.reference,
        }
    elif entity_type == "journal_line":
        line = await session.scalar(
            select(JournalLine).where(
                JournalLine.id == record_id, JournalLine.company_id == company_id
            )
        )
        if line is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="آرتیکل سند پیدا نشد."
            )
        source_row_id = line.source_row_id
        normalized_fields = {
            "entry_id": str(line.entry_id),
            "account_id": str(line.account_id),
            "debit_irr": str(line.debit_irr),
            "credit_irr": str(line.credit_irr),
            "invoice_ref": line.invoice_ref,
        }
    elif entity_type == "bank_transaction":
        tx = await session.scalar(
            select(BankTransaction).where(
                BankTransaction.id == record_id, BankTransaction.company_id == company_id
            )
        )
        if tx is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="تراکنش بانکی پیدا نشد."
            )
        source_row_id = tx.source_row_id
        normalized_fields = {
            "booking_date": tx.booking_date.isoformat(),
            "amount_irr": str(tx.amount_irr),
            "description": tx.description,
            "reference": tx.reference,
            "running_balance_irr": str(tx.running_balance_irr)
            if tx.running_balance_irr is not None
            else None,
        }
    elif entity_type == "sales_invoice":
        inv = await session.scalar(
            select(SalesInvoice).where(
                SalesInvoice.id == record_id, SalesInvoice.company_id == company_id
            )
        )
        if inv is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="فاکتور فروش پیدا نشد."
            )
        source_row_id = inv.source_row_id
        normalized_fields = {
            "invoice_no": inv.invoice_no,
            "issue_date": inv.issue_date.isoformat(),
            "due_date": inv.due_date.isoformat() if inv.due_date else None,
            "gross_amount_irr": str(inv.gross_amount_irr),
            "tax_amount_irr": str(inv.tax_amount_irr) if inv.tax_amount_irr is not None else None,
            "paid_amount_irr": (
                str(inv.paid_amount_irr) if inv.paid_amount_irr is not None else None
            ),
            "status": inv.status,
        }
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"نوع موجودیت نامعتبر است: {entity_type}",
        )

    if source_row_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="پیوند به ردیف منبع مفقود است."
        )

    srow_row = (
        await session.execute(
            select(SourceRow, ImportBatch, SourceFile)
            .join(ImportBatch, ImportBatch.id == SourceRow.import_batch_id)
            .join(SourceFile, SourceFile.id == ImportBatch.file_id)
            .where(SourceRow.id == source_row_id, SourceRow.company_id == company_id)
        )
    ).one_or_none()

    if srow_row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="اطلاعات ردیف فایل منبع یافت نشد."
        )

    srow, batch, sfile = srow_row

    version = await session.scalar(
        select(MappingVersion)
        .where(MappingVersion.import_batch_id == batch.id, MappingVersion.company_id == company_id)
        .order_by(MappingVersion.version.desc())
        .limit(1)
    )

    mapping_summary = version.mapping_json.get("fields", {}) if version else {}
    transforms_applied = version.transforms_json if version else {}

    return RecordLineageResponse(
        company_id=company_id,
        record_id=record_id,
        entity_type=entity_type,
        import_id=batch.id,
        source_file_id=sfile.id,
        source_filename=sfile.original_name,
        source_file_sha256=sfile.sha256,
        source_row_number=srow.row_number,
        sheet_name=srow.sheet,
        raw_values=srow.raw_json,
        mapping_version=version.version if version else 1,
        mapping_summary=mapping_summary,
        transforms_applied=transforms_applied,
        normalized_fields=normalized_fields,
        imported_at=batch.created_at,
    )
