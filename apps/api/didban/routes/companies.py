"""Companies HTTP routes."""

from uuid import uuid4

from fastapi import APIRouter, Request
from sqlalchemy import select

from .. import models as m
from .. import schemas as s
from .. import services as service
from ..db import engine
from ..errors import require
from ..http import C, P, access, expected, installation_mutate, mutate
from ..workflow import (
    audit,
    serialize_fact,
)

router = APIRouter()


@router.get(P + "/companies")
def companies(request: Request):
    with access(request) as (db, user, _member):
        rows = db.execute(
            select(m.Company, m.Membership)
            .join(m.Membership, m.Membership.company_id == m.Company.id)
            .where(m.Membership.user_id == user.id, m.Membership.active.is_(True))
            .order_by(m.Company.created_at)
        ).all()
        return {
            "items": [
                serialize_fact(c)
                | {"role": member.role, "approve_financial_report": member.approve_financial_report}
                for c, member in rows
            ]
        }


@router.post(P + "/companies", status_code=201)
def create_company(data: s.CompanyInput, request: Request):
    # A company ID is reserved before opening the tenant transaction.
    company_id = str(uuid4())

    def apply(db, user):
        if engine.dialect.name == "postgresql":
            from sqlalchemy import text

            db.execute(
                text("SELECT set_config('didban.company_id', :company, true)"), {"company": company_id}
            )
        company = m.Company(id=company_id, name=data.name)
        db.add(company)
        db.flush()
        db.add(
            m.Membership(company_id=company.id, user_id=user.id, role="owner", approve_financial_report=False)
        )
        audit(db, company.id, user.id, "company.created", company.id)
        return serialize_fact(company) | {"role": "owner", "approve_financial_report": False}

    return installation_mutate(request, data.model_dump(), apply)


@router.get(C)
def company_detail(company_id: str, request: Request):
    with access(request, company_id) as (db, _user, member):
        return serialize_fact(db.get(m.Company, company_id)) | {
            "role": member.role,
            "approve_financial_report": member.approve_financial_report,
        }


@router.patch(C)
def update_company(company_id: str, data: s.CompanyInput, request: Request):
    def apply(db, user):
        company = db.get(m.Company, company_id)
        service.check_version(company, expected(request))
        company.name, company.version = data.name, company.version + 1
        audit(db, company_id, user.id, "company.updated", company.id, {"name": data.name})
        return serialize_fact(company)

    return mutate(request, company_id, data.model_dump(), "owner", apply)


@router.get(C + "/members")
def members(company_id: str, request: Request):
    with access(request, company_id, "owner") as (db, _user, _member):
        rows = db.execute(
            select(m.Membership, m.User)
            .join(m.User, m.User.id == m.Membership.user_id)
            .where(m.Membership.company_id == company_id)
        ).all()
        return {
            "items": [
                serialize_fact(member) | {"name": user.name, "email": user.email} for member, user in rows
            ]
        }


@router.post(C + "/members", status_code=201)
def create_member(company_id: str, data: s.MemberInput, request: Request):
    def apply(db, user):
        recipient = db.get(m.User, data.user_id)
        require(recipient is not None and recipient.active, "user_not_found", "حساب کاربر پیدا نشد.", 404)
        item = m.Membership(
            company_id=company_id, user_id=data.user_id, role=data.role, approve_financial_report=False
        )
        db.add(item)
        db.flush()
        audit(db, company_id, user.id, "membership.created", item.id, data.model_dump())
        return serialize_fact(item)

    return mutate(request, company_id, data.model_dump(), "owner", apply)


@router.patch(C + "/members/{member_id}")
def update_member(company_id: str, member_id: str, data: s.MemberPatch, request: Request):
    def apply(db, user):
        member = service.get_entity(db, m.Membership, company_id, member_id)
        service.check_version(member, expected(request))
        return service.change_member(db, company_id, user, member, data.model_dump(exclude_none=True))

    return mutate(request, company_id, data.model_dump(exclude_none=True), "owner", apply)
