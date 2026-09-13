import logging
from datetime import UTC, datetime
from typing import Annotated
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, File, Form, Header, HTTPException, Query, Request, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from starlette.concurrency import run_in_threadpool
from starlette.responses import StreamingResponse
from uuid6 import uuid7

from app.audit.service import record_audit_event
from app.companies.models import CompanyAccess, CompanyRole
from app.core.config import settings
from app.financial.tasks import normalize_import_task
from app.identity.dependencies import CsrfProtected, CurrentUser, DbSession
from app.imports.mapping import (
    ALTERNATIVE_REQUIRED_FIELDS,
    REQUIRED_FIELDS,
    ParsedTable,
    RowIssue,
    TableParseError,
    column_fingerprint,
    coverage_for,
    download_to_seekable,
    parse_table,
    raw_row_hash,
    suggest_mapping,
    transform_and_validate_row,
    validate_mapping_fields,
    validate_transforms,
)
from app.imports.models import (
    DataSource,
    FileScanStatus,
    ImportBatch,
    ImportStatus,
    IssueSeverity,
    MappingProfile,
    MappingVersion,
    SourceFile,
    SourceKind,
    SourceRow,
    ValidationIssue,
)
from app.imports.schemas import (
    ImportBatchResponse,
    ImportPreviewResponse,
    IssuesPage,
    MappingRequest,
    MappingResponse,
    MappingSuggestion,
    PreviewIssue,
    PreviewRow,
    UploadPolicyResponse,
    ValidationIssueResponse,
    ValidationResponse,
)
from app.imports.storage import get_storage, iter_object
from app.imports.tasks import inspect_upload
from app.imports.validation import receive_and_validate

router = APIRouter(prefix="/companies/{company_id}/imports", tags=["imports"])
logger = logging.getLogger(__name__)
UPLOAD_ROLES = {CompanyRole.OWNER, CompanyRole.FINANCE_MANAGER, CompanyRole.ADVISOR}


async def _access(session: DbSession, company_id: UUID, user_id: UUID) -> CompanyAccess:
    access = await session.scalar(
        select(CompanyAccess).where(
            CompanyAccess.company_id == company_id,
            CompanyAccess.user_id == user_id,
        )
    )
    if access is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="شرکت پیدا نشد.")
    return access


def _response(
    batch: ImportBatch,
    source_file: SourceFile,
    source: DataSource,
) -> ImportBatchResponse:
    return ImportBatchResponse(
        id=batch.id,
        company_id=batch.company_id,
        source_kind=source.kind,
        source_label=source.label,
        status=batch.status,
        stage=batch.stage,
        progress=batch.progress,
        original_name=source_file.original_name,
        size_bytes=source_file.size_bytes,
        mime_type=source_file.mime_type,
        sha256=source_file.sha256,
        scan_status=source_file.scan_status,
        scan_result=source_file.scan_result,
        duplicate_detected=source_file.duplicate_of_id is not None,
        failure_code=batch.failure_code,
        failure_message=batch.failure_message,
        retryable=batch.retryable,
        sheet_name=batch.sheet_name,
        header_row=batch.header_row,
        row_count=batch.row_count,
        accepted_count=batch.accepted_count,
        rejected_count=batch.rejected_count,
        coverage=batch.coverage_json,
        created_at=batch.created_at,
    )


async def _batch_row(
    session: DbSession,
    company_id: UUID,
    batch_id: UUID,
    *,
    for_update: bool = False,
) -> tuple[ImportBatch, SourceFile, DataSource] | None:
    statement = (
        select(ImportBatch, SourceFile, DataSource)
        .join(SourceFile, SourceFile.id == ImportBatch.file_id)
        .join(DataSource, DataSource.id == ImportBatch.source_id)
        .where(ImportBatch.id == batch_id, ImportBatch.company_id == company_id)
    )
    if for_update:
        statement = statement.with_for_update(of=ImportBatch)
    row = (await session.execute(statement)).one_or_none()
    if row is None:
        return None
    batch, source_file, source = row
    return batch, source_file, source


def _mapping_response(version: MappingVersion) -> MappingResponse:
    metadata = version.mapping_json
    return MappingResponse(
        id=version.id,
        import_batch_id=version.import_batch_id,
        version=version.version,
        mapping=metadata["fields"],
        transforms=version.transforms_json,
        currency_unit=metadata["currency_unit"],
        calendar=metadata["calendar"],
        sheet_name=metadata["sheet_name"],
        header_row=metadata["header_row"],
        column_fingerprint=metadata["column_fingerprint"],
        confirmed_at=version.confirmed_at,
    )


def _load_table(
    object_key: str,
    extension: str,
    sheet_name: str | None,
    header_row: int,
    limit: int | None,
) -> ParsedTable:
    body = get_storage().open(object_key)
    stream = download_to_seekable(body)
    try:
        return parse_table(
            stream,
            extension,
            sheet_name=sheet_name,
            header_row=header_row,
            limit=limit,
        )
    finally:
        stream.close()


def _require_clean(source_file: SourceFile) -> None:
    if source_file.scan_status != FileScanStatus.CLEAN:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="فقط فایل تأییدشده در بررسی امنیتی قابل پردازش است.",
        )


def _require_upload_role(access: CompanyAccess) -> None:
    if access.role not in UPLOAD_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="اجازه تغییر واردسازی برای این شرکت را ندارید.",
        )


@router.get("/policy", response_model=UploadPolicyResponse)
async def upload_policy(
    company_id: UUID,
    session: DbSession,
    current_user: CurrentUser,
) -> UploadPolicyResponse:
    await _access(session, company_id, current_user.id)
    return UploadPolicyResponse(
        allowed_extensions=[".csv", ".xlsx"],
        maximum_size_bytes=settings.upload_max_bytes,
        malware_scan_required=True,
        macro_enabled_files_allowed=False,
    )


@router.get("", response_model=list[ImportBatchResponse])
async def list_imports(
    company_id: UUID,
    session: DbSession,
    current_user: CurrentUser,
) -> list[ImportBatchResponse]:
    await _access(session, company_id, current_user.id)
    rows = (
        await session.execute(
            select(ImportBatch, SourceFile, DataSource)
            .join(SourceFile, SourceFile.id == ImportBatch.file_id)
            .join(DataSource, DataSource.id == ImportBatch.source_id)
            .where(ImportBatch.company_id == company_id)
            .order_by(ImportBatch.created_at.desc())
            .limit(50)
        )
    ).all()
    return [_response(batch, source_file, source) for batch, source_file, source in rows]


@router.post("/uploads", response_model=ImportBatchResponse, status_code=status.HTTP_202_ACCEPTED)
async def upload_file(
    company_id: UUID,
    request: Request,
    session: DbSession,
    current_user: CurrentUser,
    _: CsrfProtected,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=128)],
    file: Annotated[UploadFile, File()],
    source_kind: Annotated[SourceKind, Form()],
    source_label: Annotated[str, Form(min_length=2, max_length=160)],
) -> ImportBatchResponse:
    access = await _access(session, company_id, current_user.id)
    if access.role not in UPLOAD_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="اجازه بارگذاری فایل برای این شرکت را ندارید.",
        )

    normalized_label = source_label.strip()
    if len(normalized_label) < 2:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="عنوان منبع باید دست‌کم دو نویسه داشته باشد.",
        )

    existing = await session.scalar(
        select(ImportBatch).where(
            ImportBatch.company_id == company_id,
            ImportBatch.idempotency_key == idempotency_key,
        )
    )
    if existing is not None:
        row = await _batch_row(session, company_id, existing.id)
        if row is None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="درخواست تکراری است.")
        return _response(*row)

    validated = await receive_and_validate(file)
    source_file = SourceFile(
        id=uuid7(),
        company_id=company_id,
        object_key="",
        original_name=validated.original_name,
        sha256=validated.sha256,
        size_bytes=validated.size_bytes,
        mime_type=validated.mime_type,
        extension=validated.extension,
        uploaded_by=current_user.id,
        metadata_json=validated.metadata,
    )
    source_file.object_key = f"quarantine/{company_id}/{source_file.id}"
    duplicate = await session.scalar(
        select(SourceFile.id)
        .where(SourceFile.company_id == company_id, SourceFile.sha256 == validated.sha256)
        .order_by(SourceFile.created_at)
        .limit(1)
    )
    source_file.duplicate_of_id = duplicate
    source = DataSource(
        id=uuid7(),
        company_id=company_id,
        kind=source_kind,
        label=normalized_label,
        created_by=current_user.id,
    )
    batch = ImportBatch(
        id=uuid7(),
        company_id=company_id,
        source_id=source.id,
        file_id=source_file.id,
        idempotency_key=idempotency_key,
    )
    storage = get_storage()
    try:
        await run_in_threadpool(
            storage.upload,
            source_file.object_key,
            validated.stream,
            validated.mime_type,
            validated.sha256,
        )
        session.add_all([source, source_file])
        await session.flush()
        session.add(batch)
        record_audit_event(
            session,
            action="import.uploaded",
            entity_type="import_batch",
            actor_id=current_user.id,
            entity_id=batch.id,
            company_id=company_id,
            request_id=request.headers.get("X-Request-ID"),
            metadata={
                "size_bytes": validated.size_bytes,
                "sha256": validated.sha256,
                "duplicate": duplicate is not None,
                "source_kind": source_kind.value,
            },
        )
        await session.commit()
    except IntegrityError as exc:
        logger.exception("Import upload metadata violated a database constraint")
        await session.rollback()
        await run_in_threadpool(storage.delete, source_file.object_key)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="کلید تکراری یا رکورد ناسازگار است.",
        ) from exc
    except Exception:
        await session.rollback()
        await run_in_threadpool(storage.delete, source_file.object_key)
        raise
    finally:
        validated.stream.close()

    try:
        inspect_upload.delay(str(batch.id), str(company_id), str(current_user.id))
    except Exception:
        batch.status = ImportStatus.FAILED
        batch.stage = "queue_unavailable"
        batch.progress = 100
        batch.failure_code = "IMPORT_QUEUE_UNAVAILABLE"
        batch.failure_message = "صف پردازش فایل در دسترس نبود."
        batch.retryable = True
        source_file.scan_status = FileScanStatus.FAILED
        source_file.scan_result = "queue_unavailable"
        record_audit_event(
            session,
            action="import.queue_failed",
            entity_type="import_batch",
            actor_id=current_user.id,
            entity_id=batch.id,
            company_id=company_id,
        )
        await session.commit()
    return _response(batch, source_file, source)


@router.get("/{batch_id}", response_model=ImportBatchResponse)
async def get_import(
    company_id: UUID,
    batch_id: UUID,
    session: DbSession,
    current_user: CurrentUser,
) -> ImportBatchResponse:
    await _access(session, company_id, current_user.id)
    row = await _batch_row(session, company_id, batch_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="واردسازی پیدا نشد.")
    return _response(*row)


@router.get("/{batch_id}/preview", response_model=ImportPreviewResponse)
async def preview_import(
    company_id: UUID,
    batch_id: UUID,
    session: DbSession,
    current_user: CurrentUser,
    sheet_name: Annotated[str | None, Query(max_length=160)] = None,
    header_row: Annotated[int, Query(ge=1, le=100)] = 1,
) -> ImportPreviewResponse:
    await _access(session, company_id, current_user.id)
    row = await _batch_row(session, company_id, batch_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="واردسازی پیدا نشد.")
    batch, source_file, source = row
    _require_clean(source_file)
    version = await session.scalar(
        select(MappingVersion).where(
            MappingVersion.company_id == company_id,
            MappingVersion.import_batch_id == batch_id,
        )
    )
    if version is not None:
        metadata = version.mapping_json
        sheet_name = metadata["sheet_name"]
        header_row = metadata["header_row"]
    try:
        parsed = await run_in_threadpool(
            _load_table,
            source_file.object_key,
            source_file.extension,
            sheet_name,
            header_row,
            settings.import_preview_rows,
        )
    except TableParseError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc

    fingerprint = column_fingerprint(parsed.columns)
    profile_id = await session.scalar(
        select(MappingProfile.id)
        .where(
            MappingProfile.company_id == company_id,
            MappingProfile.source_kind == source.kind,
            MappingProfile.column_fingerprint == fingerprint,
        )
        .order_by(MappingProfile.created_at.desc())
        .limit(1)
    )
    preview_rows: list[PreviewRow] = []
    mapping_response = _mapping_response(version) if version is not None else None
    for row_number, raw in parsed.rows:
        transformed = None
        issues: list[RowIssue] = []
        if version is not None:
            metadata = version.mapping_json
            transformed, issues = transform_and_validate_row(
                source_kind=source.kind,
                row_number=row_number,
                raw=raw,
                mapping=metadata["fields"],
                transforms=version.transforms_json,
                currency_unit=metadata["currency_unit"],
                calendar=metadata["calendar"],
            )
        preview_rows.append(
            PreviewRow(
                row_number=row_number,
                raw=raw,
                transformed=transformed,
                issues=[PreviewIssue(**issue.__dict__) for issue in issues],
            )
        )
    return ImportPreviewResponse(
        sheets=parsed.sheets,
        selected_sheet=parsed.selected_sheet,
        header_row=header_row,
        columns=parsed.columns,
        column_fingerprint=fingerprint,
        rows=preview_rows,
        suggestions=[
            MappingSuggestion.model_validate(suggestion)
            for suggestion in suggest_mapping(parsed.columns, source.kind)
        ],
        required_fields=list(REQUIRED_FIELDS[source.kind]),
        alternative_required_fields=[
            list(group) for group in ALTERNATIVE_REQUIRED_FIELDS[source.kind]
        ],
        mapping=mapping_response,
        matching_profile_id=profile_id,
    )


@router.put("/{batch_id}/mapping", response_model=MappingResponse)
async def confirm_mapping(
    company_id: UUID,
    batch_id: UUID,
    payload: MappingRequest,
    request: Request,
    session: DbSession,
    current_user: CurrentUser,
    _csrf: CsrfProtected,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=128)],
) -> MappingResponse:
    del idempotency_key
    access = await _access(session, company_id, current_user.id)
    _require_upload_role(access)
    row = await _batch_row(session, company_id, batch_id, for_update=True)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="واردسازی پیدا نشد.")
    batch, source_file, source = row
    _require_clean(source_file)
    existing = await session.scalar(
        select(MappingVersion).where(MappingVersion.import_batch_id == batch_id)
    )
    if existing is not None:
        return _mapping_response(existing)
    if batch.status != ImportStatus.AWAITING_MAPPING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="این واردسازی در وضعیت مناسب برای ثبت نگاشت نیست.",
        )
    try:
        parsed = await run_in_threadpool(
            _load_table,
            source_file.object_key,
            source_file.extension,
            payload.sheet_name,
            payload.header_row,
            1,
        )
    except TableParseError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc
    errors = validate_mapping_fields(source.kind, payload.mapping, parsed.columns)
    errors.extend(validate_transforms(payload.mapping, payload.transforms, payload.currency_unit))
    if errors:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=errors)

    fingerprint = column_fingerprint(parsed.columns)
    metadata = {
        "fields": payload.mapping,
        "currency_unit": payload.currency_unit,
        "calendar": payload.calendar,
        "sheet_name": parsed.selected_sheet,
        "header_row": payload.header_row,
        "column_fingerprint": fingerprint,
    }
    profile: MappingProfile | None = None
    if payload.profile_name is not None:
        profile = await session.scalar(
            select(MappingProfile).where(
                MappingProfile.company_id == company_id,
                MappingProfile.source_kind == source.kind,
                MappingProfile.column_fingerprint == fingerprint,
                MappingProfile.name == payload.profile_name,
            )
        )
        if profile is None:
            profile = MappingProfile(
                id=uuid7(),
                company_id=company_id,
                source_kind=source.kind,
                name=payload.profile_name,
                column_fingerprint=fingerprint,
                mapping_json=metadata,
                transforms_json=payload.transforms,
                created_by=current_user.id,
            )
            session.add(profile)
            await session.flush()
    version = MappingVersion(
        id=uuid7(),
        company_id=company_id,
        profile_id=profile.id if profile else None,
        import_batch_id=batch_id,
        version=1,
        mapping_json=metadata,
        transforms_json=payload.transforms,
        confirmed_by=current_user.id,
        confirmed_at=datetime.now(UTC),
    )
    session.add(version)
    batch.sheet_name = parsed.selected_sheet
    batch.header_row = payload.header_row
    batch.stage = "mapping_confirmed"
    record_audit_event(
        session,
        action="import.mapping_confirmed",
        entity_type="import_batch",
        actor_id=current_user.id,
        entity_id=batch.id,
        company_id=company_id,
        request_id=request.headers.get("X-Request-ID"),
        metadata={"mapping_version": 1, "column_fingerprint": fingerprint},
    )
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        existing = await session.scalar(
            select(MappingVersion).where(MappingVersion.import_batch_id == batch_id)
        )
        if existing is not None:
            return _mapping_response(existing)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="نگاشت قبلاً ثبت شده است."
        ) from exc
    return _mapping_response(version)


async def _validation_response(
    session: DbSession,
    batch: ImportBatch,
    source_file: SourceFile,
    source: DataSource,
) -> ValidationResponse:
    count_rows = (
        await session.execute(
            select(ValidationIssue.severity, func.count(ValidationIssue.id))
            .where(ValidationIssue.import_batch_id == batch.id)
            .group_by(ValidationIssue.severity)
        )
    ).all()
    counts: dict[IssueSeverity, int] = {severity: count for severity, count in count_rows}
    return ValidationResponse(
        batch=_response(batch, source_file, source),
        issue_counts={severity.value: count for severity, count in counts.items()},
        coverage=batch.coverage_json,
    )


@router.post("/{batch_id}/validate", response_model=ValidationResponse)
async def validate_import(
    company_id: UUID,
    batch_id: UUID,
    request: Request,
    session: DbSession,
    current_user: CurrentUser,
    _csrf: CsrfProtected,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=128)],
) -> ValidationResponse:
    del idempotency_key
    access = await _access(session, company_id, current_user.id)
    _require_upload_role(access)
    row = await _batch_row(session, company_id, batch_id, for_update=True)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="واردسازی پیدا نشد.")
    batch, source_file, source = row
    _require_clean(source_file)
    if batch.stage in {"validation_ready", "ready_for_normalization"}:
        return await _validation_response(session, batch, source_file, source)
    if await session.scalar(
        select(func.count(SourceRow.id)).where(SourceRow.import_batch_id == batch_id)
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="اعتبارسنجی قبلاً ثبت شده است."
        )
    version = await session.scalar(
        select(MappingVersion).where(MappingVersion.import_batch_id == batch_id)
    )
    if version is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="پیش از اعتبارسنجی باید نگاشت ستون‌ها تأیید شود.",
        )
    metadata = version.mapping_json
    try:
        parsed = await run_in_threadpool(
            _load_table,
            source_file.object_key,
            source_file.extension,
            metadata["sheet_name"],
            metadata["header_row"],
            settings.import_max_rows + 1,
        )
    except TableParseError as exc:
        issue = ValidationIssue(
            id=uuid7(),
            company_id=company_id,
            import_batch_id=batch_id,
            severity=IssueSeverity.BLOCKING,
            code="FILE_PARSE_ERROR",
            message=str(exc),
            remedy="ساختار فایل و ردیف عنوان را اصلاح کنید.",
        )
        session.add(issue)
        batch.status = ImportStatus.FAILED
        batch.stage = "validation_failed"
        batch.failure_code = "FILE_PARSE_ERROR"
        batch.failure_message = str(exc)
        record_audit_event(
            session,
            action="import.validation_failed",
            entity_type="import_batch",
            actor_id=current_user.id,
            entity_id=batch.id,
            company_id=company_id,
            request_id=request.headers.get("X-Request-ID"),
            metadata={"failure_code": "FILE_PARSE_ERROR"},
        )
        await session.commit()
        return await _validation_response(session, batch, source_file, source)
    if len(parsed.rows) > settings.import_max_rows:
        session.add(
            ValidationIssue(
                id=uuid7(),
                company_id=company_id,
                import_batch_id=batch_id,
                severity=IssueSeverity.BLOCKING,
                code="ROW_LIMIT_EXCEEDED",
                message="تعداد ردیف‌های فایل از سقف مجاز بیشتر است.",
                remedy="فایل را به چند بخش کوچک‌تر تقسیم کنید.",
            )
        )
        batch.status = ImportStatus.FAILED
        batch.stage = "validation_failed"
        batch.failure_code = "ROW_LIMIT_EXCEEDED"
        batch.failure_message = "تعداد ردیف‌های فایل از سقف مجاز بیشتر است."
        record_audit_event(
            session,
            action="import.validation_failed",
            entity_type="import_batch",
            actor_id=current_user.id,
            entity_id=batch.id,
            company_id=company_id,
            request_id=request.headers.get("X-Request-ID"),
            metadata={"failure_code": "ROW_LIMIT_EXCEEDED"},
        )
        await session.commit()
        return await _validation_response(session, batch, source_file, source)

    batch.status = ImportStatus.VALIDATING
    batch.stage = "full_validation"
    source_rows: list[SourceRow] = []
    pending_issues: list[tuple[UUID, RowIssue]] = []
    accepted = 0
    for row_number, raw in parsed.rows:
        source_row = SourceRow(
            id=uuid7(),
            company_id=company_id,
            import_batch_id=batch_id,
            sheet=parsed.selected_sheet,
            row_number=row_number,
            raw_json=raw,
            raw_hash=raw_row_hash(raw),
        )
        source_rows.append(source_row)
        _, row_issues = transform_and_validate_row(
            source_kind=source.kind,
            row_number=row_number,
            raw=raw,
            mapping=metadata["fields"],
            transforms=version.transforms_json,
            currency_unit=metadata["currency_unit"],
            calendar=metadata["calendar"],
        )
        if not any(
            issue.severity in {IssueSeverity.ERROR, IssueSeverity.BLOCKING} for issue in row_issues
        ):
            accepted += 1
        pending_issues.extend((source_row.id, issue) for issue in row_issues)
    session.add_all(source_rows)
    await session.flush()
    session.add_all(
        [
            ValidationIssue(
                id=uuid7(),
                company_id=company_id,
                import_batch_id=batch_id,
                source_row_id=source_row_id,
                field=issue.field,
                severity=issue.severity,
                code=issue.code,
                message=issue.message,
                raw_value=issue.raw_value,
                remedy=issue.remedy,
            )
            for source_row_id, issue in pending_issues
        ]
    )
    batch.row_count = len(source_rows)
    batch.accepted_count = accepted
    batch.rejected_count = len(source_rows) - accepted
    batch.coverage_json = coverage_for(
        source.kind, row_count=len(source_rows), accepted_count=accepted, mapping=metadata["fields"]
    )
    if not source_rows or not accepted:
        batch.status = ImportStatus.FAILED
        batch.stage = "validation_failed"
        batch.failure_code = "NO_VALID_ROWS"
        batch.failure_message = "هیچ ردیف معتبر برای ادامه پردازش وجود ندارد."
    else:
        batch.status = ImportStatus.AWAITING_MAPPING
        batch.stage = "validation_ready"
    record_audit_event(
        session,
        action="import.validation_completed",
        entity_type="import_batch",
        actor_id=current_user.id,
        entity_id=batch.id,
        company_id=company_id,
        request_id=request.headers.get("X-Request-ID"),
        metadata={"rows": len(source_rows), "accepted": accepted},
    )
    await session.commit()
    return await _validation_response(session, batch, source_file, source)


@router.post("/{batch_id}/commit", response_model=ImportBatchResponse)
async def commit_import(
    company_id: UUID,
    batch_id: UUID,
    request: Request,
    session: DbSession,
    current_user: CurrentUser,
    _csrf: CsrfProtected,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=128)],
) -> ImportBatchResponse:
    del idempotency_key
    access = await _access(session, company_id, current_user.id)
    _require_upload_role(access)
    row = await _batch_row(session, company_id, batch_id, for_update=True)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="واردسازی پیدا نشد.")
    batch, source_file, source = row
    if batch.stage == "normalized" and batch.status in {
        ImportStatus.COMPLETED,
        ImportStatus.COMPLETED_LIMITED,
    }:
        return _response(batch, source_file, source)
    if batch.stage == "ready_for_normalization" and batch.status == ImportStatus.QUEUED:
        return _response(batch, source_file, source)
    retryable_normalization = (
        batch.status == ImportStatus.FAILED
        and batch.retryable
        and batch.failure_code in {"NORMALIZATION_FAILED", "NORMALIZATION_QUEUE_UNAVAILABLE"}
    )
    if not retryable_normalization and (
        batch.stage != "validation_ready" or batch.accepted_count < 1
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="اعتبارسنجی موفق پیش از ثبت نهایی الزامی است.",
        )
    blocking = await session.scalar(
        select(func.count(ValidationIssue.id)).where(
            ValidationIssue.import_batch_id == batch_id,
            ValidationIssue.severity == IssueSeverity.BLOCKING,
        )
    )
    if blocking:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="خطای مسدودکننده وجود دارد."
        )
    batch.status = ImportStatus.QUEUED
    batch.stage = "ready_for_normalization"
    batch.failure_code = None
    batch.failure_message = None
    batch.retryable = False
    record_audit_event(
        session,
        action="import.commit_requested",
        entity_type="import_batch",
        actor_id=current_user.id,
        entity_id=batch.id,
        company_id=company_id,
        request_id=request.headers.get("X-Request-ID"),
        metadata={"accepted_rows": batch.accepted_count},
    )
    await session.commit()
    try:
        normalize_import_task.delay(str(batch.id), str(company_id), str(current_user.id))
    except Exception:
        logger.exception("Canonical normalization could not be queued")
        batch.status = ImportStatus.FAILED
        batch.stage = "normalization_queue_unavailable"
        batch.failure_code = "NORMALIZATION_QUEUE_UNAVAILABLE"
        batch.failure_message = "صف نرمال‌سازی در دسترس نبود."
        batch.retryable = True
        await session.commit()
    return _response(batch, source_file, source)


@router.get("/{batch_id}/issues", response_model=IssuesPage)
async def list_import_issues(
    company_id: UUID,
    batch_id: UUID,
    session: DbSession,
    current_user: CurrentUser,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> IssuesPage:
    await _access(session, company_id, current_user.id)
    if await _batch_row(session, company_id, batch_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="واردسازی پیدا نشد.")
    total = await session.scalar(
        select(func.count(ValidationIssue.id)).where(ValidationIssue.import_batch_id == batch_id)
    )
    rows = (
        await session.execute(
            select(ValidationIssue, SourceRow.row_number)
            .outerjoin(SourceRow, SourceRow.id == ValidationIssue.source_row_id)
            .where(ValidationIssue.import_batch_id == batch_id)
            .order_by(ValidationIssue.severity, SourceRow.row_number, ValidationIssue.code)
            .offset(offset)
            .limit(limit)
        )
    ).all()
    return IssuesPage(
        items=[
            ValidationIssueResponse(
                id=issue.id,
                row_number=row_number,
                field=issue.field,
                severity=issue.severity,
                code=issue.code,
                message=issue.message,
                raw_value=issue.raw_value,
                remedy=issue.remedy,
            )
            for issue, row_number in rows
        ],
        total=total or 0,
        limit=limit,
        offset=offset,
    )


@router.get("/{batch_id}/download")
async def download_source_file(
    company_id: UUID,
    batch_id: UUID,
    session: DbSession,
    current_user: CurrentUser,
) -> StreamingResponse:
    await _access(session, company_id, current_user.id)
    row = await _batch_row(session, company_id, batch_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="واردسازی پیدا نشد.")
    _, source_file, _ = row
    if source_file.scan_status != FileScanStatus.CLEAN:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="فایل تا پایان موفق بررسی امنیتی قابل دریافت نیست.",
        )
    body = await run_in_threadpool(get_storage().open, source_file.object_key)
    encoded_name = quote(source_file.original_name)
    return StreamingResponse(
        iter_object(body),
        media_type=source_file.mime_type,
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded_name}"},
    )
