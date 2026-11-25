"""4-level account hierarchy, 2/4/6/8-digit code pattern, auto-coding, and leaf posting guards."""

import io
from datetime import date

import openpyxl
import pytest
from sqlalchemy import select

from didban import models as m
from didban.account_catalogue_service import catalogue_filters, enrich_accounts
from didban.accounting_models import Account, AccountHierarchy
from didban.accounting_service import save_account, save_draft
from didban.accounting_setup_service import import_chart, parse_chart, preview_chart, update_mode
from didban.errors import DomainError
from didban.posting_service import post_batch, preview
from didban.workflow import serialize_fact


def create(db, context, code, level="group", parent=None):
    return save_account(db, context['company'].id, context['users']['owner'], {
        'code': code, 'name': f'حساب {code or level}', 'level': level, 'parent_id': parent,
    })


def test_four_level_pattern_codes_and_auto_generation(db_session, test_company_context):
    db, c = db_session, test_company_context
    grp = create(db, c, None, 'group')
    assert grp['code'] == '01' and grp['level'] == 'group' and grp['postable'] is False
    gen = create(db, c, None, 'general', grp['id'])
    assert gen['code'] == '0101' and gen['level'] == 'general' and gen['postable'] is True
    gen2 = create(db, c, '0105', 'general', grp['id'])
    assert gen2['code'] == '0105'
    # Next auto-generated general skips past max existing sibling
    gen3 = create(db, c, None, 'general', grp['id'])
    assert gen3['code'] == '0106'

    sub = create(db, c, None, 'subsidiary', gen['id'])
    assert sub['code'] == '010101' and sub['level'] == 'subsidiary'
    detail = create(db, c, None, 'detail', sub['id'])
    assert detail['code'] == '01010101' and detail['level'] == 'detail'

    # Parent status updates dynamically once children exist
    enriched_gen = enrich_accounts(db, c['company'].id, [serialize_fact(db.get(Account, gen['id']))])[0]
    assert enriched_gen['has_children'] is True and enriched_gen['postable'] is False
    enriched_sub = enrich_accounts(db, c['company'].id, [serialize_fact(db.get(Account, sub['id']))])[0]
    assert enriched_sub['has_children'] is True and enriched_sub['postable'] is False
    enriched_det = enrich_accounts(db, c['company'].id, [serialize_fact(db.get(Account, detail['id']))])[0]
    assert enriched_det['has_children'] is False and enriched_det['postable'] is True

    # Invalid patterns and duplicate codes are rejected
    for bad_code, level, parent in [
        ('1', 'group', None),
        ('111', 'group', None),
        ('ab', 'group', None),
        ('12', 'general', grp['id']),
        ('0201', 'general', grp['id']),  # Wrong group prefix
        ('01011', 'subsidiary', gen['id']),
        ('010201', 'subsidiary', gen['id']),  # Wrong general prefix
        ('0101011', 'detail', sub['id']),
        ('01010201', 'detail', sub['id']),  # Wrong subsidiary prefix
    ]:
        with pytest.raises(DomainError) as error:
            create(db, c, bad_code, level, parent)
        assert error.value.code == 'invalid_account_code_pattern'

    with pytest.raises(DomainError) as error:
        create(db, c, '01', 'group')
    assert error.value.code == 'duplicate_account_code'

    changed = save_account(db, c['company'].id, c['users']['owner'], {'name': 'ویرایش'}, grp['id'], grp['version'])
    assert changed['code'] == '01' and changed['level'] == 'group'
    with pytest.raises(DomainError) as error:
        save_account(db, c['company'].id, c['users']['owner'], {'code': '02'}, grp['id'], changed['version'])
    assert error.value.code == 'account_code_immutable'


def test_four_levels_require_matching_same_company_parent(db_session, test_company_context):
    db, c = db_session, test_company_context
    grp = create(db, c, '11', 'group')
    gen = create(db, c, '1101', 'general', grp['id'])
    sub = create(db, c, '110101', 'subsidiary', gen['id'])
    detail = create(db, c, '11010101', 'detail', sub['id'])
    assert detail['parent_code'] == '110101'
    assert sub['parent_name'] == 'حساب 1101'
    for code, level, parent, expected in [
        ('110101', 'subsidiary', grp['id'], 'invalid_account_parent_level'),
        ('11010101', 'detail', gen['id'], 'invalid_account_parent_level'),
        ('110101', 'subsidiary', detail['id'], 'invalid_account_parent_level'),
        ('1101', 'general', None, 'account_parent_required'),
        ('110101', 'subsidiary', None, 'account_parent_required'),
        ('12', 'group', grp['id'], 'invalid_account_parent'),
    ]:
        with pytest.raises(DomainError) as error:
            create(db, c, code, level, parent)
        assert error.value.code == expected
    foreign = Account(company_id=c['other_company'].id, code='11', name='دیگر')
    db.add(foreign)
    db.flush()
    with pytest.raises(DomainError) as error:
        create(db, c, '1101', 'general', foreign.id)
    assert error.value.status == 404
    with pytest.raises(DomainError) as error:
        save_account(db, c['company'].id, c['users']['owner'], {'level': 'detail', 'parent_id': sub['id']}, grp['id'], grp['version'])
    assert error.value.code == 'account_has_children'
    assert db.get(AccountHierarchy, grp['id']).level == 'group'


def test_posting_blocked_on_group_and_parent_accounts_with_children(db_session, test_company_context):
    db, c = db_session, test_company_context
    owner = c['users']['owner']
    fm = c['users']['finance_manager']
    period = c['period']
    update_mode(db, c['company'].id, owner, 'primary', 1)

    grp = create(db, c, '11', 'group')
    gen_cash = create(db, c, '1101', 'general', grp['id'])
    grp_rev = create(db, c, '41', 'group')
    gen_rev = create(db, c, '4101', 'general', grp_rev['id'])

    # Cannot draft or post to a group account
    with pytest.raises(DomainError) as err:
        save_draft(db, c['company'].id, owner, {
            'period_id': period.id, 'date': date(2026, 4, 1), 'description': 'تست گروه', 'unit': 'IRR',
            'lines': [
                {'account_id': grp['id'], 'party_id': '', 'debit': '100', 'credit': '0'},
                {'account_id': gen_rev['id'], 'party_id': '', 'debit': '0', 'credit': '100'},
            ],
        })
    assert err.value.code == 'non_postable_account'

    # Can draft and post to a general account that has NO subsidiary children yet
    d1 = save_draft(db, c['company'].id, owner, {
        'period_id': period.id, 'date': date(2026, 4, 1), 'description': 'سند کل', 'unit': 'IRR',
        'lines': [
            {'account_id': gen_cash['id'], 'party_id': '', 'debit': '100', 'credit': '0'},
            {'account_id': gen_rev['id'], 'party_id': '', 'debit': '0', 'credit': '100'},
        ],
    })
    prev1 = preview(db, c['company'].id, fm, d1['id'])
    posted = post_batch(db, c['company'].id, fm, [{'draft_id': d1['id'], 'expected_version': d1['version'], 'digest': prev1['digest']}])
    posted_id = posted['items'][0]['id']

    # Now add a subsidiary child under gen_cash -> gen_cash becomes non-postable!
    sub_bank = create(db, c, '110101', 'subsidiary', gen_cash['id'])
    with pytest.raises(DomainError) as err:
        save_draft(db, c['company'].id, owner, {
            'period_id': period.id, 'date': date(2026, 4, 2), 'description': 'سند نامعتبر کل', 'unit': 'IRR',
            'lines': [
                {'account_id': gen_cash['id'], 'party_id': '', 'debit': '200', 'credit': '0'},
                {'account_id': gen_rev['id'], 'party_id': '', 'debit': '0', 'credit': '200'},
            ],
        })
    assert err.value.code == 'non_postable_parent_account'

    # Subsidiary without detail children IS postable
    d2 = save_draft(db, c['company'].id, owner, {
        'period_id': period.id, 'date': date(2026, 4, 2), 'description': 'سند معین', 'unit': 'IRR',
        'lines': [
            {'account_id': sub_bank['id'], 'party_id': '', 'debit': '200', 'credit': '0'},
            {'account_id': gen_rev['id'], 'party_id': '', 'debit': '0', 'credit': '200'},
        ],
    })
    assert d2['state'] == 'draft'

    # Add detail child under sub_bank -> sub_bank becomes non-postable, detail IS postable!
    detail_melli = create(db, c, '11010101', 'detail', sub_bank['id'])
    with pytest.raises(DomainError) as err:
        save_draft(db, c['company'].id, owner, {
            'period_id': period.id, 'date': date(2026, 4, 3), 'description': 'سند نامعتبر معین', 'unit': 'IRR',
            'lines': [
                {'account_id': sub_bank['id'], 'party_id': '', 'debit': '300', 'credit': '0'},
                {'account_id': gen_rev['id'], 'party_id': '', 'debit': '0', 'credit': '300'},
            ],
        })
    assert err.value.code == 'non_postable_parent_account'

    # Also preview/post_batch on d2 (which referenced sub_bank before detail was added) is blocked!
    with pytest.raises(DomainError) as err:
        preview(db, c['company'].id, fm, d2['id'])
    assert err.value.code == 'non_postable_parent_account'

    d3 = save_draft(db, c['company'].id, owner, {
        'period_id': period.id, 'date': date(2026, 4, 3), 'description': 'سند تفصیلی', 'unit': 'IRR',
        'lines': [
            {'account_id': detail_melli['id'], 'party_id': '', 'debit': '300', 'credit': '0'},
            {'account_id': gen_rev['id'], 'party_id': '', 'debit': '0', 'credit': '300'},
        ],
    })
    prev3 = preview(db, c['company'].id, fm, d3['id'])
    assert post_batch(db, c['company'].id, fm, [{'draft_id': d3['id'], 'expected_version': d3['version'], 'digest': prev3['digest']}])['items'][0]['id']

    # Reversing earlier posted journal on gen_cash still succeeds!
    from didban.posting_service import create_reversal
    rev_draft = create_reversal(
        db,
        c['company'].id,
        owner,
        posted_id,
        {'period_id': period.id, 'date': date(2026, 4, 4), 'reason': 'برگشت سند قبلی'},
    )
    rev_prev = preview(db, c['company'].id, fm, rev_draft['id'])
    assert post_batch(db, c['company'].id, fm, [{'draft_id': rev_draft['id'], 'expected_version': rev_draft['version'], 'digest': rev_prev['digest']}])['items'][0]['reversal_of'] == posted_id


def test_old_accounts_remain_unclassified_and_filters_cover_whole_catalogue(db_session, test_company_context):
    db, c = db_session, test_company_context
    db.add(Account(id='legacy', company_id=c['company'].id, code='110101', name='قدیمی'))
    db.flush()
    grp = create(db, c, '11', 'group')
    gen = create(db, c, '1101', 'general', grp['id'])
    def accounts(level=None, parent=None):
        rows = list(db.scalars(select(Account).where(Account.company_id == c['company'].id, *catalogue_filters(c['company'].id, level, parent))))
        return enrich_accounts(db, c['company'].id, [serialize_fact(row) for row in rows])
    assert [row['id'] for row in accounts('unclassified')] == ['legacy']
    assert accounts('unclassified')[0]['level'] is None
    assert [row['id'] for row in accounts('general', grp['id'])] == [gen['id']]
    assert not accounts('detail')
    with pytest.raises(DomainError):
        accounts('arbitrary')
    assert db.scalar(select(m.JournalLine.id)) is None


def test_import_resolves_unsorted_parent_codes_and_rejects_bad_hierarchy_before_writing(db_session, test_company_context):
    db, c = db_session, test_company_context
    rows = parse_chart(
        'chart.csv',
        'code,name,level,parent_code\n10010101,تفصیلی,تفصیلی,100101\n100101,معین,معین,1001\n1001,کل,کل,10\n10,گروه,گروه,\n'.encode(),
    )['rows']
    preview_res = preview_chart(db, c['company'].id, c['users']['owner'], rows)
    assert db.scalar(select(Account.id)) is None
    assert import_chart(db, c['company'].id, c['users']['owner'], preview_res['preview_id'])['created_count'] == 4
    detail = db.scalar(select(Account).where(Account.code == '10010101'))
    result = enrich_accounts(db, c['company'].id, [serialize_fact(detail)])[0]
    assert result['level'] == 'detail' and result['parent_code'] == '100101'
    with pytest.raises(DomainError):
        preview_chart(db, c['company'].id, c['users']['owner'], [{'code': '10010102', 'name': 'نامعتبر', 'level': 'detail', 'parent_code': '10'}])
    assert db.scalar(select(Account.id).where(Account.code == '10010102')) is None
    workbook = openpyxl.Workbook()
    workbook.active.append(["code", "name", "level", "parent_code"])
    workbook.active.append(["1001", "فرزند", "general", 10])
    content = io.BytesIO()
    workbook.save(content)
    with pytest.raises(DomainError) as error:
        parse_chart("chart.xlsx", content.getvalue())
    assert error.value.code == "account_code_text_required"


def test_http_hierarchy_filters_versions_and_pattern_auto_codes(tmp_path):
    from test_api_delivery import scenario
    scenario(tmp_path, r'''
owner=client_for("owner"); viewer=client_for("viewer")
path=base+"/accounting/accounts"
grp=command(owner,"POST",path,{"name":"گروه دارایی","level":"group"})
assert grp.status_code==201 and grp.json()["code"]=="01"
gen=command(owner,"POST",path,{"name":"کل نقد","level":"general","parent_id":grp.json()["id"]})
assert gen.status_code==201 and gen.json()["code"]=="0101"
sub=command(owner,"POST",path,{"code":"010101","name":"معین بانک","level":"subsidiary","parent_id":gen.json()["id"]})
assert sub.status_code==201 and sub.json()["parent_code"]=="0101"
det=command(owner,"POST",path,{"name":"تفصیلی ملت","level":"detail","parent_id":sub.json()["id"]})
assert det.status_code==201 and det.json()["code"]=="01010101"
assert command(owner,"POST",path,{"code":"999","name":"الگوی غلط","level":"group"}).status_code==422
assert command(viewer,"POST",path,{"code":"02","name":"نامجاز","level":"group"}).status_code==403
assert command(owner,"POST",path,{"code":"01","name":"تکراری","level":"group"}).status_code==409
page=owner.get(path,params={"level":"subsidiary","parent_id":gen.json()["id"],"limit":1}).json()
assert [row["id"] for row in page["items"]]==[sub.json()["id"]]
assert owner.get(path,params={"level":"bad"}).status_code==422
assert command(owner,"PATCH",path+"/"+sub.json()["id"],{"name":"ویرایش","level":"detail","parent_id":grp.json()["id"]},version=1).status_code==422
assert command(owner,"PATCH",path+"/"+sub.json()["id"],{"name":"ویرایش"},version=99).status_code==409
assert command(owner,"PATCH",path+"/"+sub.json()["id"],{"name":"ویرایش"},version=1).json()["code"]=="010101"
''')


def test_legacy_three_level_upgrade_preserves_editable_accounts_and_blocks_incompatible_generator(tmp_path):
    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import Session

    from didban import db as db_mod
    from didban.account_catalogue_service import generate_next_code
    from didban.accounting_service import save_account

    db_file = tmp_path / "legacy3.db"
    old_engine = db_mod.engine
    test_engine = create_engine(f"sqlite:///{db_file}", connect_args={"check_same_thread": False})
    db_mod.engine = test_engine
    try:
        # Build a 3-level legacy database prior to 4-level upgrade
        db_mod.Base.metadata.create_all(test_engine)
        with test_engine.begin() as conn:
            conn.execute(text("DROP TABLE accounting_account_hierarchy"))
            conn.execute(
                text(
                    "CREATE TABLE accounting_account_hierarchy ("
                    "company_id VARCHAR(36) NOT NULL, "
                    "account_id VARCHAR(36) NOT NULL PRIMARY KEY, "
                    "level VARCHAR(20) NOT NULL, "
                    "parent_id VARCHAR(36), "
                    "CONSTRAINT account_hierarchy_level CHECK (level IN ('general', 'subsidiary', 'detail')), "
                    "CONSTRAINT account_hierarchy_parent CHECK ((level = 'general' AND parent_id IS NULL) OR (level != 'general' AND parent_id IS NOT NULL)), "
                    "CONSTRAINT account_hierarchy_no_self_parent CHECK (parent_id IS NULL OR parent_id != account_id), "
                    "FOREIGN KEY(company_id, account_id) REFERENCES accounting_accounts (company_id, id), "
                    "FOREIGN KEY(company_id, parent_id) REFERENCES accounting_accounts (company_id, id))"
                )
            )
            conn.execute(text("INSERT INTO companies (id, created_at, name, timezone, version) VALUES ('c1', '2026-01-01 00:00:00', 'شرکت', 'Asia/Tehran', 1)"))
            conn.execute(text("INSERT INTO users (id, created_at, email, name, password_hash, installation_admin, active) VALUES ('u1', '2026-01-01 00:00:00', 'o@test.ir', 'مالک', 'x', 0, 1)"))
            conn.execute(text("INSERT INTO memberships (id, created_at, company_id, user_id, role, approve_financial_report, active, version) VALUES ('m1', '2026-01-01 00:00:00', 'c1', 'u1', 'owner', 1, 1, 1)"))
            conn.execute(text("INSERT INTO accounting_accounts (id, created_at, company_id, code, name, nature, active, version) VALUES ('a1', '2026-01-01 00:00:00', 'c1', '100', 'گروه قدیمی ۱۰۰', 'debit', 1, 1)"))
            conn.execute(text("INSERT INTO accounting_accounts (id, created_at, company_id, code, name, nature, active, version) VALUES ('a2', '2026-01-01 00:00:00', 'c1', '10001', 'کل قدیمی ۱۰۰۰۱', 'debit', 1, 1)"))
            conn.execute(text("INSERT INTO accounting_accounts (id, created_at, company_id, code, name, nature, active, version) VALUES ('a3', '2026-01-01 00:00:00', 'c1', '010', 'بدون سطح با صفر پیشرو', 'debit', 1, 1)"))
            conn.execute(text("INSERT INTO accounting_account_hierarchy (company_id, account_id, level, parent_id) VALUES ('c1', 'a1', 'general', NULL)"))
            conn.execute(text("INSERT INTO accounting_account_hierarchy (company_id, account_id, level, parent_id) VALUES ('c1', 'a2', 'subsidiary', 'a1')"))

        # Run upgrade twice to verify idempotency
        db_mod.initialize()
        db_mod.initialize()

        with Session(test_engine, expire_on_commit=False) as db:
            user = db.get(m.User, "u1")
            h1 = db.get(AccountHierarchy, "a1")
            h2 = db.get(AccountHierarchy, "a2")
            assert h1.level == "group" and h1.code_status == "legacy"
            assert h2.level == "general" and h2.code_status == "legacy"

            # Legacy account "100" must remain visible & editable!
            edited = save_account(db, "c1", user, {"name": "گروه ۱۰۰ ویرایش‌شده"}, "a1", 1)
            assert edited["code"] == "100"
            assert edited["code_status"] == "legacy"
            assert edited["name"] == "گروه ۱۰۰ ویرایش‌شده"
            assert edited["can_add_standard_child"] is False

            # Generator MUST NOT emit invalid "10001" under legacy group "100"
            with pytest.raises(DomainError) as err:
                generate_next_code(db, "c1", "general", "100")
            assert err.value.code == "legacy_parent_code_incompatible"

            # Unclassified leading-zero account remains preserved and editable
            edited_unclassified = save_account(db, "c1", user, {"name": "ویرایش بدون سطح"}, "a3", 1)
            assert edited_unclassified["code"] == "010"
            assert edited_unclassified["level"] is None
    finally:
        db_mod.engine = old_engine
        test_engine.dispose()
