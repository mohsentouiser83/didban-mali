from fastapi import HTTPException

from app.companies.models import CompanyAccess, CompanyRole


def require_financial_writer(access: CompanyAccess) -> None:
    if access.role not in {CompanyRole.OWNER, CompanyRole.FINANCE_MANAGER, CompanyRole.ADVISOR}:
        raise HTTPException(403, "دسترسی ثبت اطلاعات مالی ندارید.")
