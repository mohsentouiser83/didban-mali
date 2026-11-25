"""Internal identifiers follow tenant numbering and retain assigned values."""
import pytest
from sqlalchemy import select

from didban.accounting_service import save_account
from didban.dimensions_service import save_dimension
from didban.errors import DomainError
from didban.numbering_models import NumberingSystem
from didban.numbering_service import allocate_number, ensure_defaults


def test_accounts_use_manual_codes_without_consuming_historical_rule(db_session, test_company_context):
    c = test_company_context
    company, user = c['company'].id, c['users']['owner']
    ensure_defaults(db_session, company)
    rule = db_session.scalar(select(NumberingSystem).where(
        NumberingSystem.company_id == company, NumberingSystem.entity_type == 'account'))
    rule.prefix, rule.suffix, rule.padding = 'AC-', '-X', 4
    result = save_account(db_session, company, user, {'code': '0010', 'name': 'جدید'})
    assert result['code'] == '0010'
    assert rule.current_number == 1
    updated = save_account(db_session, company, user, {'name': 'ویرایش'}, result['id'], result['version'])
    assert updated['code'] == result['code']
    with pytest.raises(DomainError) as error:
        save_account(db_session, company, user, {'code': 'changed', 'name': 'ویرایش'}, result['id'], updated['version'])
    assert error.value.code == 'account_code_immutable'


def test_inactive_rule_blocks_creation(db_session, test_company_context):
    c = test_company_context
    ensure_defaults(db_session, c['company'].id)
    rule = db_session.scalar(select(NumberingSystem).where(
        NumberingSystem.company_id == c['company'].id, NumberingSystem.entity_type == 'dimension'))
    rule.active = False
    with pytest.raises(DomainError) as error:
        save_dimension(db_session, c['company'].id, c['users']['owner'], {'kind': 'project', 'name': 'پروژه'})
    assert error.value.code == 'numbering_inactive'


def test_allocation_rolls_back_with_transaction(db_session, test_company_context):
    company = test_company_context['company'].id
    ensure_defaults(db_session, company)
    db_session.commit()
    assert allocate_number(db_session, company, 'account') == '001'
    db_session.rollback()
    assert allocate_number(db_session, company, 'account') == '001'


def test_concurrent_allocations_share_no_codes(tmp_path):
    from concurrent.futures import ThreadPoolExecutor

    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session

    from didban.models import Base, Company

    engine = create_engine(f"sqlite:///{tmp_path / 'numbers.db'}", connect_args={"timeout": 10})
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        db.add(Company(id='concurrent', name='ساختگی'))
        db.commit()

    def allocate(_):
        with Session(engine) as db:
            value = allocate_number(db, 'concurrent', 'account')
            db.commit()
            return value

    with ThreadPoolExecutor(max_workers=4) as pool:
        numbers = list(pool.map(allocate, range(8)))
    assert sorted(numbers) == [str(n).zfill(3) for n in range(1, 9)]
    engine.dispose()
