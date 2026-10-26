"""Shared command context and exact payment input validation."""

from ..errors import ApiError
from ..domain.financial.common import amount, decimal_text, LIMIT


def current_manifest(conn, company):
    return conn.execute(
        "SELECT m.*,d.session_id FROM app.company_dataset_heads h JOIN app.result_manifests m ON m.company_id=h.company_id AND m.dataset_revision_id=h.dataset_revision_id JOIN app.dataset_revisions d ON d.company_id=m.company_id AND d.id=m.dataset_revision_id WHERE h.company_id=%s AND m.status='published' ORDER BY m.created_at DESC,m.id DESC LIMIT 1",
        (company,),
    ).fetchone()


def payment_value(body, previous=None):
    if "unit" in body and "total_amount" not in body:
        raise ApiError(
            422, "amount_required_with_unit", "واحد را همراه مبلغ وارد کنید."
        )
    try:
        value = amount(
            body.get("total_amount", str(previous["total_amount"]) if previous else "0")
        )
        if body.get("unit", "IRR") == "IRT":
            value *= 10
        if value <= 0 or value >= LIMIT:
            raise ValueError()
        return decimal_text(value)
    except (ValueError, ArithmeticError):
        raise ApiError(422, "invalid_amount", "مبلغ معتبر و مثبت وارد کنید.") from None
