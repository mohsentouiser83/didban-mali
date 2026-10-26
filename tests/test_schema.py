"""Execute fresh SQL in a disposable DB on an explicitly selected local cluster.

Set DIDBAN_TEST_DSN to a local administrator connection. A random database is
created and dropped; no legacy database is used. The application is NOT exercised.
"""
from __future__ import annotations
import json
import hashlib
import os
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
import unittest
from uuid import uuid4

import psycopg
from psycopg import sql

ROOT=Path(__file__).resolve().parents[1]


def insert(conn, table, **data):
    if 'id' not in data: data['id']=uuid4()
    statement=sql.SQL('INSERT INTO app.{} ({}) VALUES ({}) RETURNING id').format(sql.Identifier(table),sql.SQL(',').join(map(sql.Identifier,data)),sql.SQL(',').join(sql.Placeholder()*len(data)))
    return conn.execute(statement,list(data.values())).fetchone()[0]


def context(conn, actor, company):
    conn.execute('SET LOCAL ROLE didban_app')
    conn.execute('SET LOCAL search_path=app,pg_catalog')
    conn.execute("SELECT set_config('app.user_id',%s,true),set_config('app.company_id',%s,true)",(str(actor),str(company)))


def seed(conn):
    ids={}
    for role in ('owner','finance_manager','advisor_accountant','viewer','other'):
        ids[role]=insert(conn,'users',email=f'{uuid4().hex}@fixture.invalid',password_hash='not-a-real-login',display_name=role)
    ids['company']=insert(conn,'companies',name='شرکت مصنوعی')
    ids['other_company']=insert(conn,'companies',name='شرکت جدا')
    for role in ('owner','finance_manager','advisor_accountant','viewer'):
        ids['m_'+role]=insert(conn,'company_memberships',company_id=ids['company'],user_id=ids[role],role=role)
    insert(conn,'company_memberships',company_id=ids['other_company'],user_id=ids['other'],role='owner')
    ids['period']=insert(conn,'financial_periods',company_id=ids['company'],name='۲۰۲۶/۰۹',starts_on='2026-09-01',ends_on='2026-09-30')
    ids['policy']=insert(conn,'policy_versions',company_id=ids['company'],kind='financial',version=1,effective_from='2026-09-01',parameters='{}',validation_status='proposed',actor_id=ids['owner'])
    ids['session']=insert(conn,'processing_sessions',company_id=ids['company'],requested_by=ids['owner'],status='processing',period_id=ids['period'])
    ids['file']=insert(conn,'source_files',company_id=ids['company'],sha256=uuid4().hex*2,original_name='synthetic.csv',object_key=uuid4().hex,byte_size=10,format='csv',scan_status='clean',uploaded_by=ids['owner'])
    ids['interpretation']=insert(conn,'interpretation_versions',company_id=ids['company'],source_file_id=ids['file'],sheet_name='data',cell_range='A1:D10',source_kind='bank',unit='IRR',calendar='gregorian',mapping='{}',provenance='validated_automatic',policy_id=ids['policy'])
    ids['row']=insert(conn,'source_rows',company_id=ids['company'],interpretation_id=ids['interpretation'],row_number=2,raw_values='{}',raw_fingerprint='fixture-row')
    ids['revision']=insert(conn,'dataset_revisions',company_id=ids['company'],session_id=ids['session'],state='building')
    def record(label):
        logical=insert(conn,'logical_records',company_id=ids['company'],source_namespace='fixture',source_identity=label,record_kind=label)
        return insert(conn,'record_revisions',company_id=ids['company'],logical_record_id=logical,source_row_id=ids['row'],revision_number=1,content_hash=label)
    ids['bank']=insert(conn,'bank_accounts',company_id=ids['company'],name='بانک',source_identity='bank-a')
    ids['movement']=insert(conn,'bank_movements',company_id=ids['company'],bank_account_id=ids['bank'],record_revision_id=record('bank'),movement_on='2026-09-01',amount='100')
    ids['party']=insert(conn,'parties',company_id=ids['company'],display_name='مشتری')
    ids['invoice']=insert(conn,'invoices',company_id=ids['company'],record_revision_id=record('invoice'),party_id=ids['party'],direction='sales',source_invoice_id='00001',issued_on='2026-09-01',gross='100')
    ids['event']=insert(conn,'settlement_events',company_id=ids['company'],record_revision_id=record('event'),party_id=ids['party'],bank_movement_id=ids['movement'],settled_on='2026-09-01',direction='receipt',amount='100',event_role='financial')
    ids['record_for_journal']=record('journal')
    ids['account']=insert(conn,'accounts',company_id=ids['company'],source_namespace='fixture',code='0001',name='نقد')
    ids['manifest']=insert(conn,'result_manifests',company_id=ids['company'],dataset_revision_id=ids['revision'],period_id=ids['period'],as_of_date='2026-09-30',manifest_hash=uuid4().hex*2,financial_policy_id=ids['policy'],forecast_policy_id=ids['policy'],status='building')
    ids['report']=insert(conn,'report_snapshots',company_id=ids['company'],manifest_id=ids['manifest'],content_hash='fixture',content='{}')
    return ids


@unittest.skipUnless(os.environ.get('DIDBAN_TEST_DSN'),'DIDBAN_TEST_DSN required; no implicit connection to any existing application DB')
class SchemaTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.admin_dsn=os.environ['DIDBAN_TEST_DSN']
        cls.db='didban_contract_'+uuid4().hex[:12]
        with psycopg.connect(cls.admin_dsn,autocommit=True) as admin:
            admin.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(cls.db)))
        cls.dsn=psycopg.conninfo.make_conninfo(cls.admin_dsn,dbname=cls.db)
        with psycopg.connect(cls.dsn,autocommit=True) as conn:
            cls.server_version=conn.execute('SHOW server_version').fetchone()[0]
            for script in sorted((ROOT/'database').glob('*.sql')):
                conn.execute(script.read_text())

    @classmethod
    def tearDownClass(cls):
        with psycopg.connect(cls.admin_dsn,autocommit=True) as admin:
            admin.execute(sql.SQL('DROP DATABASE {} WITH (FORCE)').format(sql.Identifier(cls.db)))

    def setUp(self):
        self.conn=psycopg.connect(self.dsn)
        self.ids=seed(self.conn)

    def tearDown(self):
        self.conn.rollback();self.conn.close()

    def rejected(self, action, code=None):
        with self.assertRaises(psycopg.Error) as caught:
            with self.conn.transaction(): action()
        if code:self.assertEqual(caught.exception.sqlstate,code)

    def test_exact_money_rejects_rounding_and_nonfinite(self):
        self.assertEqual(str(self.conn.execute("SELECT '1234'::app.money_irr").fetchone()[0]),'1234')
        for amount in ('0.0000001','NaN','Infinity','1e32'):
            self.rejected(lambda:self.conn.execute('SELECT %s::app.money_irr',(amount,)),'23514')

    def test_all_company_tables_force_rls_and_runtime_is_restricted(self):
        catalog=json.loads((ROOT/'contracts/table-catalog.json').read_text())
        for t in catalog['tables']:
            if t['company_scoped']:
                flags=self.conn.execute("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=%s::regclass",('app.'+t['name'],)).fetchone()
                self.assertEqual(flags,(True,True),t['name'])
        self.assertEqual(self.conn.execute("SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname='didban_app'").fetchone(),(False,False))
        self.assertFalse(self.conn.execute("SELECT has_table_privilege('didban_app','app.invoices','TRUNCATE')").fetchone()[0])

    def test_company_rls_and_viewer(self):
        context(self.conn,self.ids['viewer'],self.ids['company'])
        self.assertEqual(self.conn.execute('SELECT count(*) FROM app.invoices').fetchone()[0],1)
        self.rejected(lambda:insert(self.conn,'parties',company_id=self.ids['company'],display_name='forbidden'),'42501')
        self.conn.execute("SELECT set_config('app.company_id',%s,true)",(str(self.ids['other_company']),))
        self.assertEqual(self.conn.execute('SELECT count(*) FROM app.invoices').fetchone()[0],0)
        self.rejected(lambda:self.conn.execute('SELECT * FROM app.users'),'42501')

    def test_company_foreign_key(self):
        self.rejected(lambda:insert(self.conn,'invoices',company_id=self.ids['other_company'],record_revision_id=self.ids['record_for_journal'],party_id=self.ids['party'],direction='sales',source_invoice_id='foreign',issued_on='2026-09-01',gross='1'),'23503')

    def test_owner_only_permission_and_approval(self):
        context(self.conn,self.ids['finance_manager'],self.ids['company'])
        self.rejected(lambda:insert(self.conn,'permission_grants',company_id=self.ids['company'],membership_id=self.ids['m_advisor_accountant'],permission='approve_financial_report',enabled=True,changed_by=self.ids['finance_manager'],reason='not allowed'),'42501')
        context(self.conn,self.ids['advisor_accountant'],self.ids['company'])
        self.rejected(lambda:insert(self.conn,'report_approvals',company_id=self.ids['company'],report_id=self.ids['report'],actor_id=self.ids['advisor_accountant'],authority='finance_manager'),'42501')
        context(self.conn,self.ids['owner'],self.ids['company'])
        grant=insert(self.conn,'permission_grants',company_id=self.ids['company'],membership_id=self.ids['m_advisor_accountant'],permission='approve_financial_report',enabled=True,changed_by=self.ids['owner'],reason='explicit')
        self.assertEqual(self.conn.execute('SELECT count(*) FROM app.permission_events').fetchone()[0],1)
        context(self.conn,self.ids['advisor_accountant'],self.ids['company'])
        insert(self.conn,'report_approvals',company_id=self.ids['company'],report_id=self.ids['report'],actor_id=self.ids['advisor_accountant'],authority='finance_manager')
        self.assertEqual(self.conn.execute('SELECT authority FROM app.report_approvals').fetchone()[0],'explicit_company_permission')
        context(self.conn,self.ids['owner'],self.ids['company'])
        self.conn.execute('UPDATE app.permission_grants SET enabled=false,changed_by=%s,reason=%s WHERE id=%s',(self.ids['owner'],'revoke',grant))
        context(self.conn,self.ids['advisor_accountant'],self.ids['company'])
        self.assertFalse(self.conn.execute('SELECT app.can_approve(%s)',(self.ids['company'],)).fetchone()[0])
        self.assertEqual(self.conn.execute('SELECT count(*) FROM app.report_approvals').fetchone()[0],1)

    def test_finance_manager_approval_and_owner_not_automatic(self):
        context(self.conn,self.ids['owner'],self.ids['company'])
        self.assertFalse(self.conn.execute('SELECT app.can_approve(%s)',(self.ids['company'],)).fetchone()[0])
        context(self.conn,self.ids['finance_manager'],self.ids['company'])
        insert(self.conn,'report_approvals',company_id=self.ids['company'],report_id=self.ids['report'],actor_id=self.ids['finance_manager'],authority='finance_manager')

    def test_allocation_capacity_reversal_and_history(self):
        context(self.conn,self.ids['advisor_accountant'],self.ids['company'])
        def allocation(amount,key):
            return insert(self.conn,'allocations',company_id=self.ids['company'],settlement_event_id=self.ids['event'],invoice_id=self.ids['invoice'],dataset_revision_id=self.ids['revision'],amount=amount,provenance='human',actor_id=self.ids['advisor_accountant'],effect_key=key)
        a=allocation('100','A')
        self.rejected(lambda:allocation('1','B'),'23514')
        self.rejected(lambda:self.conn.execute('UPDATE app.allocations SET amount=1 WHERE id=%s',(a,)),'23514')
        insert(self.conn,'allocation_reversals',company_id=self.ids['company'],allocation_id=a,actor_id=self.ids['advisor_accountant'],reason='correction')
        allocation('100','C')
        self.rejected(lambda:insert(self.conn,'allocation_reversals',company_id=self.ids['company'],allocation_id=a,actor_id=self.ids['advisor_accountant'],reason='duplicate'),'23505')

    def test_journal_balance_deferred(self):
        context(self.conn,self.ids['advisor_accountant'],self.ids['company'])
        entry=insert(self.conn,'journal_entries',company_id=self.ids['company'],record_revision_id=self.ids['record_for_journal'],entry_on='2026-09-01',entry_type='regular',source_entry_id='J1')
        insert(self.conn,'journal_lines',company_id=self.ids['company'],entry_id=entry,source_row_id=self.ids['row'],account_id=self.ids['account'],debit='10',credit='0')
        self.rejected(lambda:self.conn.execute('SET CONSTRAINTS ALL IMMEDIATE'),'23514')
        insert(self.conn,'journal_lines',company_id=self.ids['company'],entry_id=entry,source_row_id=self.ids['row'],account_id=self.ids['account'],debit='0',credit='10')
        self.conn.execute('SET CONSTRAINTS ALL IMMEDIATE')

    def test_archive_preserves_source_and_dependencies(self):
        context(self.conn,self.ids['owner'],self.ids['company'])
        self.conn.execute('UPDATE app.source_files SET archived_at=clock_timestamp() WHERE id=%s',(self.ids['file'],))
        self.assertEqual(self.conn.execute('SELECT byte_size FROM app.source_files WHERE id=%s',(self.ids['file'],)).fetchone()[0],10)
        self.rejected(lambda:self.conn.execute('DELETE FROM app.source_files WHERE id=%s',(self.ids['file'],)),'23514')
        self.rejected(lambda:self.conn.execute("UPDATE app.source_files SET object_key='replaced' WHERE id=%s",(self.ids['file'],)),'23514')

    def test_question_barrier_and_stale_worker(self):
        context(self.conn,self.ids['advisor_accountant'],self.ids['company'])
        st=insert(self.conn,'processing_steps',company_id=self.ids['company'],session_id=self.ids['session'],step_kind='parse',input_fingerprint='test',policy_id=self.ids['policy'],status='running',fence=2,lease_expires_at='2099-01-01T00:00:00Z')
        self.conn.execute('SELECT app.assert_checkpoint(%s,1,%s,2)',(self.ids['session'],st))
        self.rejected(lambda:self.conn.execute('SELECT app.assert_checkpoint(%s,1,%s,1)',(self.ids['session'],st)),'40001')
        insert(self.conn,'processing_issues',company_id=self.ids['company'],session_id=self.ids['session'],code='unit_unknown',root_key='unit',question_fa='واحد؟',answer_kind='unit',answer_constraints='{}',required=True,opened_session_version=1)
        status,version=self.conn.execute('SELECT status,session_version FROM app.processing_sessions WHERE id=%s',(self.ids['session'],)).fetchone()
        self.assertEqual((status,version),('waiting_input',2))
        self.rejected(lambda:self.conn.execute('SELECT app.assert_checkpoint(%s,2,%s,2)',(self.ids['session'],st)),'40001')
        self.conn.execute("UPDATE app.processing_sessions SET status='cancelled' WHERE id=%s",(self.ids['session'],))
        self.rejected(lambda:insert(self.conn,'processing_issues',company_id=self.ids['company'],session_id=self.ids['session'],code='late',root_key='late',question_fa='دیررس',answer_kind='unit',answer_constraints='{}',required=True,opened_session_version=2),'40001')

    def test_null_metric_and_published_immutability(self):
        context(self.conn,self.ids['advisor_accountant'],self.ids['company'])
        def metric(value,reasons):
            return insert(self.conn,'metric_observations',company_id=self.ids['company'],manifest_id=self.ids['manifest'],metric_key='profit',basis='ledger',scope_key=uuid4().hex,status='unavailable',value=value,reason_codes=reasons,coverage='{}',formula_version='1')
        self.rejected(lambda:metric('0',['ledger_source_missing']),'23514')
        self.rejected(lambda:metric(None,[]),'23514')
        mid=metric(None,['ledger_source_missing'])
        self.conn.execute("UPDATE app.result_manifests SET status='published',published_at=clock_timestamp() WHERE id=%s",(self.ids['manifest'],))
        self.rejected(lambda:self.conn.execute('UPDATE app.metric_observations SET reason_codes=%s WHERE id=%s',(['fake'],mid)),'23514')
        self.rejected(lambda:self.conn.execute("UPDATE app.report_snapshots SET content='{}' WHERE id=%s",(self.ids['report'],)),'23514')

    def test_last_owner_and_role_human_override(self):
        context(self.conn,self.ids['owner'],self.ids['company'])
        self.rejected(lambda:self.conn.execute("UPDATE app.company_memberships SET active=false WHERE id=%s",(self.ids['m_owner'],)),'23514')
        insert(self.conn,'account_role_versions',company_id=self.ids['company'],account_id=self.ids['account'],role='cash',effective_from='2026-09-01',provenance='human',policy_id=self.ids['policy'],evidence='["row2"]',control_results='{"valid":true}',actor_id=self.ids['owner'])
        self.rejected(lambda:insert(self.conn,'account_role_versions',company_id=self.ids['company'],account_id=self.ids['account'],role='revenue',effective_from='2026-09-01',provenance='validated_automatic',policy_id=self.ids['policy'],evidence='["row2"]',control_results='{"status":"passed","checks":[{"result":"passed"}]}'),'23514')

    def test_automatic_role_requires_passed_controls(self):
        context(self.conn,self.ids['advisor_accountant'],self.ids['company'])
        def role(controls):
            return insert(self.conn,'account_role_versions',company_id=self.ids['company'],account_id=self.ids['account'],role='cash',effective_from='2026-09-01',provenance='validated_automatic',policy_id=self.ids['policy'],evidence='["row2"]',control_results=controls)
        self.rejected(lambda:role('{"status":"passed","checks":[{"result":"failed"}]}'),'23514')
        role('{"status":"passed","checks":[{"code":"fixture_only","result":"passed"}]}')

    def test_sealed_revision_does_not_accept_new_rows(self):
        context(self.conn,self.ids['advisor_accountant'],self.ids['company'])
        self.conn.execute("UPDATE app.dataset_revisions SET state='sealed',sealed_at=clock_timestamp() WHERE id=%s",(self.ids['revision'],))
        self.rejected(lambda:insert(self.conn,'source_coverage',company_id=self.ids['company'],dataset_revision_id=self.ids['revision'],source_kind='ledger',scope_key='all',state='declared_complete',provenance='user_declaration'),'23514')

    def test_budget_reservation_unknown_and_settlement(self):
        policy=insert(self.conn,'budget_policies',period_kind='calendar_month',ceiling_usd='1',changed_by=self.ids['owner'])
        period=insert(self.conn,'budget_periods',policy_id=policy,starts_at='2020-01-01T00:00:00Z',ends_at='2099-01-01T00:00:00Z',ceiling_usd='1')
        tariff=insert(self.conn,'model_tariffs',provider='test',model_identifier='fixture-only',effective_at='2026-01-01T00:00:00Z',input_per_million='1',output_per_million='1')
        a=insert(self.conn,'model_requests',company_id=self.ids['company'],purpose='classify_document',tariff_id=tariff,status='reserved')
        b=insert(self.conn,'model_requests',company_id=self.ids['company'],purpose='classify_document',tariff_id=tariff,status='reserved')
        context(self.conn,self.ids['advisor_accountant'],self.ids['company'])
        self.conn.execute('SELECT app.reserve_model_budget(%s,0.7)',(a,))
        self.rejected(lambda:self.conn.execute('SELECT app.reserve_model_budget(%s,0.4)',(b,)),'23514')
        self.conn.execute('SELECT app.settle_model_budget(%s,NULL)',(a,))
        self.rejected(lambda:self.conn.execute('SELECT app.reserve_model_budget(%s,0.4)',(b,)),'23514')
        self.conn.execute('SELECT app.settle_model_budget(%s,0.2)',(a,))
        self.conn.execute('SELECT app.settle_model_budget(%s,0.2)',(a,))
        self.conn.execute('RESET ROLE')
        self.assertEqual(tuple(map(str,self.conn.execute('SELECT reserved_usd,spent_usd FROM app.budget_periods WHERE id=%s',(period,)).fetchone())),('0E-8','0.20000000'))

    def test_two_concurrent_allocations(self):
        self.conn.commit()  # Isolated synthetic graph, only in this disposable DB.
        gate=Barrier(2)
        def allocate(key):
            try:
                with psycopg.connect(self.dsn) as conn:
                    context(conn,self.ids['advisor_accountant'],self.ids['company'])
                    gate.wait(timeout=5)
                    insert(conn,'allocations',company_id=self.ids['company'],settlement_event_id=self.ids['event'],invoice_id=self.ids['invoice'],dataset_revision_id=self.ids['revision'],amount='100',provenance='human',actor_id=self.ids['advisor_accountant'],effect_key=key)
                return 'committed'
            except psycopg.errors.CheckViolation:
                return 'capacity_conflict'
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures=[pool.submit(allocate,key) for key in ('race-a','race-b')]
            results=[f.result(timeout=15) for f in futures]
        self.assertCountEqual(results,['committed','capacity_conflict'])

    def test_two_concurrent_budget_reservations(self):
        policy=insert(self.conn,'budget_policies',period_kind='calendar_month',ceiling_usd='1',changed_by=self.ids['owner'])
        period=insert(self.conn,'budget_periods',policy_id=policy,starts_at='2020-01-01T00:00:00Z',ends_at='2099-01-01T00:00:00Z',ceiling_usd='1')
        tariff=insert(self.conn,'model_tariffs',provider='test',model_identifier=uuid4().hex,effective_at='2026-01-01T00:00:00Z',input_per_million='1',output_per_million='1')
        requests=[insert(self.conn,'model_requests',company_id=self.ids['company'],purpose='classify_document',tariff_id=tariff,status='reserved') for _ in range(2)]
        self.conn.commit()
        gate=Barrier(2)
        def reserve(request):
            try:
                with psycopg.connect(self.dsn) as conn:
                    context(conn,self.ids['advisor_accountant'],self.ids['company'])
                    gate.wait(timeout=5)
                    conn.execute('SELECT app.reserve_model_budget(%s,0.6)',(request,))
                return 'reserved'
            except psycopg.errors.CheckViolation:
                return 'budget_exhausted'
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures=[pool.submit(reserve,r) for r in requests]
            results=[f.result(timeout=15) for f in futures]
        self.assertCountEqual(results,['reserved','budget_exhausted'])
        self.assertEqual(str(self.conn.execute('SELECT reserved_usd FROM app.budget_periods WHERE id=%s',(period,)).fetchone()[0]),'0.60000000')


if __name__=='__main__':
    suite=unittest.defaultTestLoader.loadTestsFromTestCase(SchemaTests)
    result=unittest.TextTestRunner(verbosity=2).run(suite)
    hashes={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((ROOT/'database').glob('*.sql'))}
    report={'scope':'database_schema_guards_only','tests_run':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'skipped':len(result.skipped),'status':'passed' if result.wasSuccessful() and not result.skipped else 'failed_or_not_run','runtime_http_tests':'not_run','full_financial_engine':'not_implemented','postgres_version':getattr(SchemaTests,'server_version',None),'source_sha256':hashes}
    (ROOT/'docs/database-validation.json').write_text(json.dumps(report,indent=2)+'\n')
    raise SystemExit(0 if result.wasSuccessful() and not result.skipped else 1)
