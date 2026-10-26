"""Build the readable baseline SQL from explicit, fresh domain declarations.

No legacy implementation imports. Run from the repository root with Python 3.12+.
Transaction protocols that cannot be expressed by row constraints are documented
in docs/workflow-contract.fa.md; guards are in database/002_guards.sql.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TABLES: dict[str, tuple[str, bool]] = {}


def table(name: str, body: str, *, scoped: bool = True):
    TABLES[name] = (body.strip(), scoped)


table('users', """
email text NOT NULL UNIQUE CHECK (email = lower(email)),
password_hash text NOT NULL,
display_name text NOT NULL CHECK (length(trim(display_name)) > 0),
is_installation_admin boolean NOT NULL DEFAULT false,
disabled_at timestamptz,
auth_version bigint NOT NULL DEFAULT 1 CHECK (auth_version > 0)
""", scoped=False)
table('installation_settings', """
singleton boolean NOT NULL DEFAULT true UNIQUE CHECK (singleton),
timezone text NOT NULL DEFAULT 'Asia/Tehran',
retention_enabled boolean NOT NULL DEFAULT false,
max_files integer NOT NULL DEFAULT 10 CHECK (max_files BETWEEN 1 AND 10),
max_data_rows integer NOT NULL DEFAULT 20000 CHECK (max_data_rows BETWEEN 1 AND 20000),
max_file_bytes bigint NOT NULL CHECK (max_file_bytes > 0),
max_expanded_bytes bigint NOT NULL CHECK (max_expanded_bytes > 0),
model_secret_reference text,
configured_by uuid NOT NULL REFERENCES users(id)
""", scoped=False)
table('auth_sessions', """
user_id uuid NOT NULL REFERENCES users(id),
token_hash text NOT NULL UNIQUE,
csrf_token_hash text NOT NULL,
expires_at timestamptz NOT NULL,
revoked_at timestamptz
""", scoped=False)
table('identity_tokens', """
user_id uuid NOT NULL REFERENCES users(id),
kind text NOT NULL CHECK (kind IN ('invitation','password_reset')),
token_hash text NOT NULL UNIQUE,
expires_at timestamptz NOT NULL,
consumed_at timestamptz,
issued_by uuid NOT NULL REFERENCES users(id)
""", scoped=False)
table('companies', """
name text NOT NULL CHECK (length(trim(name)) > 0),
timezone text NOT NULL DEFAULT 'Asia/Tehran',
display_unit text NOT NULL DEFAULT 'IRR' CHECK (display_unit IN ('IRR','IRT')),
archived_at timestamptz
""", scoped=False)
table('company_memberships', """
user_id uuid NOT NULL REFERENCES users(id),
role text NOT NULL CHECK (role IN ('owner','finance_manager','advisor_accountant','viewer')),
active boolean NOT NULL DEFAULT true,
UNIQUE (company_id, user_id)
""")
table('permission_grants', """
membership_id uuid NOT NULL,
permission text NOT NULL CHECK (permission = 'approve_financial_report'),
enabled boolean NOT NULL,
changed_by uuid NOT NULL REFERENCES users(id),
reason text NOT NULL CHECK (length(trim(reason)) > 0),
FOREIGN KEY (company_id, membership_id) REFERENCES company_memberships(company_id,id),
UNIQUE (company_id, membership_id, permission)
""")
table('permission_events', """
membership_id uuid NOT NULL,
permission text NOT NULL CHECK (permission = 'approve_financial_report'),
before_enabled boolean NOT NULL,
after_enabled boolean NOT NULL,
actor_id uuid NOT NULL REFERENCES users(id),
reason text NOT NULL,
FOREIGN KEY (company_id, membership_id) REFERENCES company_memberships(company_id,id)
""")
table('financial_periods', """
name text NOT NULL,
starts_on date NOT NULL,
ends_on date NOT NULL,
previous_period_id uuid,
archived_at timestamptz,
CHECK (starts_on <= ends_on),
CHECK (previous_period_id IS DISTINCT FROM id),
FOREIGN KEY (company_id, previous_period_id) REFERENCES financial_periods(company_id,id),
UNIQUE (company_id, name)
""")
table('policy_versions', """
kind text NOT NULL CHECK (kind IN ('financial','forecast','interpretation','matching','upload','retry')),
version integer NOT NULL CHECK (version > 0),
effective_from date NOT NULL,
parameters jsonb NOT NULL CHECK (jsonb_typeof(parameters) = 'object'),
validation_status text NOT NULL CHECK (validation_status IN ('proposed','evaluated','approved')),
actor_id uuid NOT NULL REFERENCES users(id),
UNIQUE (company_id, kind, version)
""")
table('processing_sessions', """
requested_by uuid NOT NULL REFERENCES users(id),
period_id uuid,
as_of_date date,
status text NOT NULL DEFAULT 'receiving' CHECK (status IN ('receiving','sealed','processing','waiting_input','waiting_dependency','completed','completed_limited','failed','cancelled')),
session_version bigint NOT NULL DEFAULT 1 CHECK (session_version > 0),
sealed_at timestamptz,
cancelled_at timestamptz,
FOREIGN KEY (company_id, period_id) REFERENCES financial_periods(company_id,id)
""")
table('source_files', """
sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
original_name text NOT NULL,
object_key text NOT NULL UNIQUE,
byte_size bigint NOT NULL CHECK (byte_size > 0),
format text NOT NULL CHECK (format IN ('csv','xls','xlsx')),
scan_status text NOT NULL CHECK (scan_status IN ('quarantined','scanning','clean','rejected')),
raw_row_count integer CHECK (raw_row_count >= 0),
data_row_count integer CHECK (data_row_count >= 0),
uploaded_by uuid NOT NULL REFERENCES users(id),
archived_at timestamptz,
UNIQUE (company_id, sha256)
""")
table('session_files', """
session_id uuid NOT NULL,
source_file_id uuid NOT NULL,
status text NOT NULL CHECK (status IN ('quarantined','scanning','rejected','pending_interpretation','ready','excluded_overlap')),
FOREIGN KEY (company_id, session_id) REFERENCES processing_sessions(company_id,id),
FOREIGN KEY (company_id, source_file_id) REFERENCES source_files(company_id,id),
UNIQUE (company_id, session_id, source_file_id)
""")
table('interpretation_versions', """
source_file_id uuid NOT NULL,
sheet_name text NOT NULL,
cell_range text NOT NULL,
source_kind text NOT NULL CHECK (source_kind IN ('ledger','bank','sales_invoices','purchase_invoices','settlements','moadian_sales','moadian_purchases','planned_payments','receipt_history')),
unit text CHECK (unit IN ('IRR','IRT')),
calendar text CHECK (calendar IN ('gregorian','jalali','excel_serial')),
mapping jsonb NOT NULL CHECK (jsonb_typeof(mapping) = 'object'),
provenance text NOT NULL CHECK (provenance IN ('proposal','validated_automatic','human')),
policy_id uuid NOT NULL,
supersedes_id uuid,
actor_id uuid REFERENCES users(id),
CHECK (provenance <> 'human' OR actor_id IS NOT NULL),
FOREIGN KEY (company_id, source_file_id) REFERENCES source_files(company_id,id),
FOREIGN KEY (company_id, policy_id) REFERENCES policy_versions(company_id,id),
FOREIGN KEY (company_id, supersedes_id) REFERENCES interpretation_versions(company_id,id)
""")
table('interpretation_controls', """
interpretation_id uuid NOT NULL,
control_key text NOT NULL,
outcome text NOT NULL CHECK (outcome IN ('passed','failed','unknown')),
evidence jsonb NOT NULL,
FOREIGN KEY (company_id, interpretation_id) REFERENCES interpretation_versions(company_id,id),
UNIQUE (company_id, interpretation_id, control_key)
""")
table('source_rows', """
interpretation_id uuid NOT NULL,
row_number integer NOT NULL CHECK (row_number > 0),
raw_values jsonb NOT NULL,
raw_fingerprint text NOT NULL,
FOREIGN KEY (company_id, interpretation_id) REFERENCES interpretation_versions(company_id,id),
UNIQUE (company_id, interpretation_id, row_number)
""")
table('validation_issues', """
source_row_id uuid NOT NULL,
code text NOT NULL,
message_fa text NOT NULL,
impact_state text NOT NULL CHECK (impact_state IN ('known','unknown','not_imported')),
known_impact money_irr,
CHECK ((impact_state = 'known') = (known_impact IS NOT NULL)),
FOREIGN KEY (company_id, source_row_id) REFERENCES source_rows(company_id,id)
""")
table('processing_steps', """
session_id uuid NOT NULL,
step_kind text NOT NULL,
input_fingerprint text NOT NULL,
policy_id uuid NOT NULL,
status text NOT NULL CHECK (status IN ('pending','running','succeeded','limited','waiting_input','waiting_dependency','failed','skipped','cancelled')),
dependency_code text CHECK (dependency_code IN ('model_unavailable','budget_exhausted','storage_unavailable','queue_unavailable')),
lease_owner text,
lease_expires_at timestamptz,
fence bigint NOT NULL DEFAULT 0 CHECK (fence >= 0),
checkpoint jsonb NOT NULL DEFAULT '{}',
FOREIGN KEY (company_id, session_id) REFERENCES processing_sessions(company_id,id),
FOREIGN KEY (company_id, policy_id) REFERENCES policy_versions(company_id,id),
UNIQUE (company_id, session_id, step_kind, input_fingerprint, policy_id)
""")
table('step_dependencies', """
step_id uuid NOT NULL,
depends_on_id uuid NOT NULL,
CHECK (step_id <> depends_on_id),
FOREIGN KEY (company_id, step_id) REFERENCES processing_steps(company_id,id),
FOREIGN KEY (company_id, depends_on_id) REFERENCES processing_steps(company_id,id),
UNIQUE (company_id, step_id, depends_on_id)
""")
table('step_attempts', """
step_id uuid NOT NULL,
attempt_number integer NOT NULL CHECK (attempt_number > 0),
fence bigint NOT NULL,
started_at timestamptz NOT NULL,
finished_at timestamptz,
error_code text,
FOREIGN KEY (company_id, step_id) REFERENCES processing_steps(company_id,id),
UNIQUE (company_id, step_id, attempt_number)
""")
table('processing_issues', """
session_id uuid NOT NULL,
code text NOT NULL,
root_key text NOT NULL,
question_fa text NOT NULL,
answer_kind text NOT NULL CHECK (answer_kind IN ('unit','date','choice','source_coverage','account_mapping','bank_ledger_link','unknown_allowed')),
answer_constraints jsonb NOT NULL,
required boolean NOT NULL DEFAULT true,
opened_session_version bigint NOT NULL,
resolved_at timestamptz,
superseded_at timestamptz,
CHECK (NOT (resolved_at IS NOT NULL AND superseded_at IS NOT NULL)),
FOREIGN KEY (company_id, session_id) REFERENCES processing_sessions(company_id,id)
""")
table('issue_answers', """
issue_id uuid NOT NULL,
actor_id uuid NOT NULL REFERENCES users(id),
expected_session_version bigint NOT NULL,
answer jsonb NOT NULL,
idempotency_key text NOT NULL,
FOREIGN KEY (company_id, issue_id) REFERENCES processing_issues(company_id,id),
UNIQUE (company_id, issue_id, idempotency_key)
""")
table('outbox_events', """
session_id uuid,
event_kind text NOT NULL,
dedupe_key text NOT NULL,
payload jsonb NOT NULL,
published_at timestamptz,
FOREIGN KEY (company_id, session_id) REFERENCES processing_sessions(company_id,id),
UNIQUE (company_id, dedupe_key)
""")
table('idempotency_records', """
actor_id uuid NOT NULL REFERENCES users(id),
route_key text NOT NULL,
key text NOT NULL,
request_hash text NOT NULL,
state text NOT NULL CHECK (state IN ('in_progress','completed')),
response_status integer,
response_body jsonb,
expires_at timestamptz NOT NULL,
UNIQUE (company_id, actor_id, route_key, key)
""")
table('dataset_revisions', """
session_id uuid NOT NULL,
parent_revision_id uuid,
state text NOT NULL CHECK (state IN ('building','sealed','superseded')),
sealed_at timestamptz,
FOREIGN KEY (company_id, session_id) REFERENCES processing_sessions(company_id,id),
FOREIGN KEY (company_id, parent_revision_id) REFERENCES dataset_revisions(company_id,id)
""")
table('logical_records', """
source_namespace text NOT NULL,
source_identity text NOT NULL,
record_kind text NOT NULL,
UNIQUE (company_id, source_namespace, source_identity, record_kind)
""")
table('record_revisions', """
logical_record_id uuid NOT NULL,
source_row_id uuid NOT NULL,
revision_number integer NOT NULL CHECK (revision_number > 0),
content_hash text NOT NULL,
supersedes_id uuid,
FOREIGN KEY (company_id, logical_record_id) REFERENCES logical_records(company_id,id),
FOREIGN KEY (company_id, source_row_id) REFERENCES source_rows(company_id,id),
FOREIGN KEY (company_id, supersedes_id) REFERENCES record_revisions(company_id,id),
UNIQUE (company_id, logical_record_id, revision_number),
UNIQUE (company_id, id, logical_record_id)
""")
table('revision_records', """
dataset_revision_id uuid NOT NULL,
record_revision_id uuid NOT NULL,
logical_record_id uuid NOT NULL,
FOREIGN KEY (company_id, dataset_revision_id) REFERENCES dataset_revisions(company_id,id),
FOREIGN KEY (company_id, record_revision_id, logical_record_id) REFERENCES record_revisions(company_id,id,logical_record_id),
UNIQUE (company_id, dataset_revision_id, logical_record_id)
""")
table('source_coverage', """
dataset_revision_id uuid NOT NULL,
source_kind text NOT NULL,
scope_key text NOT NULL,
starts_on date,
ends_on date,
state text NOT NULL CHECK (state IN ('missing','declared_complete','verified_complete','partial','unknown')),
provenance text NOT NULL CHECK (provenance IN ('user_declaration','independent_control','unknown')),
actor_id uuid REFERENCES users(id),
CHECK (starts_on IS NULL OR ends_on IS NULL OR starts_on <= ends_on),
FOREIGN KEY (company_id, dataset_revision_id) REFERENCES dataset_revisions(company_id,id),
UNIQUE (company_id, dataset_revision_id, source_kind, scope_key)
""")
table('accounts', """
source_namespace text NOT NULL,
code text NOT NULL,
name text NOT NULL,
parent_id uuid,
FOREIGN KEY (company_id, parent_id) REFERENCES accounts(company_id,id),
UNIQUE (company_id, source_namespace, code)
""")
table('account_role_versions', """
account_id uuid NOT NULL,
role text NOT NULL CHECK (role IN ('bank','cash','trade_ar','other_ar','trade_ap','loan_payable','tax_payable','payroll_payable','other_liability','inventory','capital','revenue','other_income','expense','cogs','income_tax_expense','vat_receivable','vat_payable','unknown')),
effective_from date NOT NULL,
provenance text NOT NULL CHECK (provenance IN ('validated_automatic','human')),
policy_id uuid NOT NULL,
evidence jsonb NOT NULL,
control_results jsonb NOT NULL,
actor_id uuid REFERENCES users(id),
supersedes_id uuid,
CHECK (provenance <> 'human' OR actor_id IS NOT NULL),
FOREIGN KEY (company_id, account_id) REFERENCES accounts(company_id,id),
FOREIGN KEY (company_id, policy_id) REFERENCES policy_versions(company_id,id),
FOREIGN KEY (company_id, supersedes_id) REFERENCES account_role_versions(company_id,id)
""")
table('parties', """
display_name text NOT NULL,
national_id text,
tax_identity text
""")
table('party_identities', """
party_id uuid NOT NULL,
source_namespace text NOT NULL,
source_identity text NOT NULL,
FOREIGN KEY (company_id, party_id) REFERENCES parties(company_id,id),
UNIQUE (company_id, source_namespace, source_identity)
""")
table('journal_entries', """
record_revision_id uuid NOT NULL,
entry_on date NOT NULL,
entry_type text NOT NULL CHECK (entry_type IN ('opening','regular','closing_transfer','real_adjustment')),
source_entry_id text NOT NULL,
FOREIGN KEY (company_id, record_revision_id) REFERENCES record_revisions(company_id,id),
UNIQUE (company_id, record_revision_id)
""")
table('journal_lines', """
entry_id uuid NOT NULL,
source_row_id uuid NOT NULL,
account_id uuid NOT NULL,
party_id uuid,
debit money_irr NOT NULL DEFAULT 0 CHECK (debit >= 0),
credit money_irr NOT NULL DEFAULT 0 CHECK (credit >= 0),
CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)),
FOREIGN KEY (company_id, entry_id) REFERENCES journal_entries(company_id,id),
FOREIGN KEY (company_id, source_row_id) REFERENCES source_rows(company_id,id),
FOREIGN KEY (company_id, account_id) REFERENCES accounts(company_id,id),
FOREIGN KEY (company_id, party_id) REFERENCES parties(company_id,id)
""")
table('bank_accounts', """
name text NOT NULL,
source_identity text NOT NULL,
account_number text,
iban text,
UNIQUE (company_id, source_identity)
""")
table('bank_ledger_link_versions', """
bank_account_id uuid NOT NULL,
ledger_account_id uuid NOT NULL,
effective_from date NOT NULL,
actor_id uuid REFERENCES users(id),
provenance text NOT NULL CHECK (provenance IN ('validated_automatic','human')),
FOREIGN KEY (company_id, bank_account_id) REFERENCES bank_accounts(company_id,id),
FOREIGN KEY (company_id, ledger_account_id) REFERENCES accounts(company_id,id)
""")
table('balance_anchors', """
bank_account_id uuid NOT NULL,
record_revision_id uuid NOT NULL,
anchor_on date NOT NULL,
cutoff text NOT NULL CHECK (cutoff IN ('start_of_day','end_of_day')),
balance money_irr NOT NULL,
blocked_amount money_irr CHECK (blocked_amount >= 0),
FOREIGN KEY (company_id, bank_account_id) REFERENCES bank_accounts(company_id,id),
FOREIGN KEY (company_id, record_revision_id) REFERENCES record_revisions(company_id,id)
""")
table('bank_movements', """
bank_account_id uuid NOT NULL,
record_revision_id uuid NOT NULL,
movement_on date NOT NULL,
amount money_irr NOT NULL CHECK (amount <> 0),
reference text,
description text NOT NULL DEFAULT '',
FOREIGN KEY (company_id, bank_account_id) REFERENCES bank_accounts(company_id,id),
FOREIGN KEY (company_id, record_revision_id) REFERENCES record_revisions(company_id,id),
UNIQUE (company_id, record_revision_id)
""")
table('invoices', """
record_revision_id uuid NOT NULL,
party_id uuid NOT NULL,
direction text NOT NULL CHECK (direction IN ('sales','purchase')),
source_invoice_id text NOT NULL,
issued_on date NOT NULL,
due_on date,
gross money_irr NOT NULL CHECK (gross >= 0),
vat money_irr CHECK (vat >= 0),
tax_id text,
opening_snapshot boolean NOT NULL DEFAULT false,
FOREIGN KEY (company_id, record_revision_id) REFERENCES record_revisions(company_id,id),
FOREIGN KEY (company_id, party_id) REFERENCES parties(company_id,id),
UNIQUE (company_id, record_revision_id)
""")
table('invoice_adjustments', """
invoice_id uuid NOT NULL,
record_revision_id uuid NOT NULL,
effective_on date NOT NULL,
amount money_irr NOT NULL,
kind text NOT NULL CHECK (kind IN ('credit','debit','return','cancellation')),
FOREIGN KEY (company_id, invoice_id) REFERENCES invoices(company_id,id),
FOREIGN KEY (company_id, record_revision_id) REFERENCES record_revisions(company_id,id)
""")
table('settlement_events', """
record_revision_id uuid NOT NULL,
party_id uuid,
bank_movement_id uuid,
settled_on date NOT NULL,
direction text NOT NULL CHECK (direction IN ('receipt','payment')),
amount money_irr NOT NULL CHECK (amount > 0),
event_role text NOT NULL CHECK (event_role IN ('financial','calibration_only')),
due_on date,
FOREIGN KEY (company_id, record_revision_id) REFERENCES record_revisions(company_id,id),
FOREIGN KEY (company_id, party_id) REFERENCES parties(company_id,id),
FOREIGN KEY (company_id, bank_movement_id) REFERENCES bank_movements(company_id,id),
UNIQUE (company_id, record_revision_id)
""")
table('settlement_snapshots', """
invoice_id uuid NOT NULL,
record_revision_id uuid NOT NULL,
as_of_date date NOT NULL,
paid_amount money_irr NOT NULL CHECK (paid_amount >= 0),
FOREIGN KEY (company_id, invoice_id) REFERENCES invoices(company_id,id),
FOREIGN KEY (company_id, record_revision_id) REFERENCES record_revisions(company_id,id)
""")
table('snapshot_settlement_events', """
snapshot_id uuid NOT NULL,
settlement_event_id uuid NOT NULL,
FOREIGN KEY (company_id, snapshot_id) REFERENCES settlement_snapshots(company_id,id),
FOREIGN KEY (company_id, settlement_event_id) REFERENCES settlement_events(company_id,id),
UNIQUE (company_id, snapshot_id, settlement_event_id)
""")
table('allocations', """
settlement_event_id uuid NOT NULL,
invoice_id uuid NOT NULL,
dataset_revision_id uuid NOT NULL,
amount money_irr NOT NULL CHECK (amount > 0),
provenance text NOT NULL CHECK (provenance IN ('validated_automatic','human')),
actor_id uuid REFERENCES users(id),
effect_key text NOT NULL,
CHECK (provenance <> 'human' OR actor_id IS NOT NULL),
FOREIGN KEY (company_id, settlement_event_id) REFERENCES settlement_events(company_id,id),
FOREIGN KEY (company_id, invoice_id) REFERENCES invoices(company_id,id),
FOREIGN KEY (company_id, dataset_revision_id) REFERENCES dataset_revisions(company_id,id),
UNIQUE (company_id, effect_key)
""")
table('allocation_reversals', """
allocation_id uuid NOT NULL,
actor_id uuid NOT NULL REFERENCES users(id),
reason text NOT NULL CHECK (length(trim(reason)) > 0),
FOREIGN KEY (company_id, allocation_id) REFERENCES allocations(company_id,id),
UNIQUE (company_id, allocation_id)
""")
table('obligations', """
invoice_id uuid,
party_id uuid,
title text NOT NULL,
FOREIGN KEY (company_id, invoice_id) REFERENCES invoices(company_id,id),
FOREIGN KEY (company_id, party_id) REFERENCES parties(company_id,id),
UNIQUE (company_id, invoice_id)
""")
table('planned_payment_versions', """
obligation_id uuid NOT NULL,
supersedes_id uuid,
scheduled_on date NOT NULL,
total_amount money_irr NOT NULL CHECK (total_amount > 0),
state text NOT NULL CHECK (state IN ('confirmed','cancelled')),
source_row_id uuid,
actor_id uuid REFERENCES users(id),
FOREIGN KEY (company_id, obligation_id) REFERENCES obligations(company_id,id),
FOREIGN KEY (company_id, supersedes_id) REFERENCES planned_payment_versions(company_id,id),
FOREIGN KEY (company_id, source_row_id) REFERENCES source_rows(company_id,id)
""")
table('obligation_settlements', """
obligation_id uuid NOT NULL,
settlement_event_id uuid NOT NULL,
amount money_irr NOT NULL CHECK (amount > 0),
FOREIGN KEY (company_id, obligation_id) REFERENCES obligations(company_id,id),
FOREIGN KEY (company_id, settlement_event_id) REFERENCES settlement_events(company_id,id),
UNIQUE (company_id, obligation_id, settlement_event_id)
""")
table('recurrence_proposals', """
title text NOT NULL,
suggested_amount money_irr NOT NULL CHECK (suggested_amount > 0),
suggested_on date NOT NULL,
evidence jsonb NOT NULL,
state text NOT NULL CHECK (state IN ('proposed','accepted','rejected')),
resulting_obligation_id uuid,
decided_by uuid REFERENCES users(id),
CHECK ((state = 'accepted') = (resulting_obligation_id IS NOT NULL)),
FOREIGN KEY (company_id, resulting_obligation_id) REFERENCES obligations(company_id,id)
""")
table('invoice_snapshots', """
source_row_id uuid NOT NULL,
direction text NOT NULL CHECK (direction IN ('sales','purchase')),
snapshot_role text NOT NULL CHECK (snapshot_role IN ('internal_comparison','portal_comparison')),
tax_id text,
reference_tax_id text,
issued_on date NOT NULL,
gross money_irr CHECK (gross >= 0),
vat money_irr CHECK (vat >= 0),
kind text NOT NULL CHECK (kind IN ('original','correction','cancellation','return','unknown')),
FOREIGN KEY (company_id, source_row_id) REFERENCES source_rows(company_id,id)
""")
table('reference_chains', """
snapshot_id uuid NOT NULL,
reference_snapshot_id uuid,
state text NOT NULL CHECK (state IN ('resolved','needs_review','missing_reference')),
financial_effect money_irr,
FOREIGN KEY (company_id, snapshot_id) REFERENCES invoice_snapshots(company_id,id),
FOREIGN KEY (company_id, reference_snapshot_id) REFERENCES invoice_snapshots(company_id,id),
CHECK (state = 'resolved' OR financial_effect IS NULL)
""")
table('result_manifests', """
dataset_revision_id uuid NOT NULL,
period_id uuid NOT NULL,
as_of_date date NOT NULL,
manifest_hash text NOT NULL CHECK (manifest_hash ~ '^[0-9a-f]{64}$'),
financial_policy_id uuid NOT NULL,
forecast_policy_id uuid NOT NULL,
status text NOT NULL CHECK (status IN ('building','published')),
published_at timestamptz,
FOREIGN KEY (company_id, dataset_revision_id) REFERENCES dataset_revisions(company_id,id),
FOREIGN KEY (company_id, period_id) REFERENCES financial_periods(company_id,id),
FOREIGN KEY (company_id, financial_policy_id) REFERENCES policy_versions(company_id,id),
FOREIGN KEY (company_id, forecast_policy_id) REFERENCES policy_versions(company_id,id),
UNIQUE (company_id, manifest_hash)
""")
table('manifest_dependencies', """
manifest_id uuid NOT NULL,
source_file_id uuid,
role_version_id uuid,
interpretation_id uuid,
bank_link_version_id uuid,
answer_id uuid,
allocation_id uuid,
CHECK (num_nonnulls(source_file_id,role_version_id,interpretation_id,bank_link_version_id,answer_id,allocation_id) = 1),
FOREIGN KEY (company_id, manifest_id) REFERENCES result_manifests(company_id,id),
FOREIGN KEY (company_id, source_file_id) REFERENCES source_files(company_id,id),
FOREIGN KEY (company_id, role_version_id) REFERENCES account_role_versions(company_id,id),
FOREIGN KEY (company_id, interpretation_id) REFERENCES interpretation_versions(company_id,id),
FOREIGN KEY (company_id, bank_link_version_id) REFERENCES bank_ledger_link_versions(company_id,id),
FOREIGN KEY (company_id, answer_id) REFERENCES issue_answers(company_id,id),
FOREIGN KEY (company_id, allocation_id) REFERENCES allocations(company_id,id)
""")
table('calculation_runs', """
manifest_id uuid NOT NULL,
kind text NOT NULL,
formula_version text NOT NULL,
status text NOT NULL CHECK (status IN ('pending','running','succeeded','limited','failed')),
FOREIGN KEY (company_id, manifest_id) REFERENCES result_manifests(company_id,id)
""")
table('evidence', """
manifest_id uuid NOT NULL,
source_row_id uuid,
rule_key text NOT NULL,
calculation jsonb NOT NULL,
FOREIGN KEY (company_id, manifest_id) REFERENCES result_manifests(company_id,id),
FOREIGN KEY (company_id, source_row_id) REFERENCES source_rows(company_id,id)
""")
table('metric_observations', """
manifest_id uuid NOT NULL,
metric_key text NOT NULL,
basis text NOT NULL CHECK (basis IN ('ledger','invoice','bank','comparable_difference')),
scope_key text NOT NULL,
status text NOT NULL CHECK (status IN ('available','limited','estimated','unavailable')),
value money_irr,
reason_codes text[] NOT NULL DEFAULT '{}',
coverage jsonb NOT NULL,
comparison jsonb,
formula_version text NOT NULL,
CHECK ((status = 'unavailable') = (value IS NULL)),
CHECK (status NOT IN ('unavailable','limited') OR cardinality(reason_codes) > 0),
FOREIGN KEY (company_id, manifest_id) REFERENCES result_manifests(company_id,id),
UNIQUE (company_id, manifest_id, metric_key, basis, scope_key)
""")
table('metric_evidence', """
metric_id uuid NOT NULL,
evidence_id uuid NOT NULL,
FOREIGN KEY (company_id, metric_id) REFERENCES metric_observations(company_id,id),
FOREIGN KEY (company_id, evidence_id) REFERENCES evidence(company_id,id),
UNIQUE (company_id, metric_id, evidence_id)
""")
table('reconciliation_runs', """
manifest_id uuid NOT NULL,
kind text NOT NULL CHECK (kind IN ('bank_ledger','bank_invoice','moadian_sales','moadian_purchases')),
policy_id uuid NOT NULL,
FOREIGN KEY (company_id, manifest_id) REFERENCES result_manifests(company_id,id),
FOREIGN KEY (company_id, policy_id) REFERENCES policy_versions(company_id,id)
""")
table('reconciliation_candidates', """
run_id uuid NOT NULL,
settlement_event_id uuid,
bank_movement_id uuid,
invoice_id uuid,
snapshot_id uuid,
classification text NOT NULL CHECK (classification IN ('exact_unique','suggested','ambiguous','unmatched','amount_mismatch','needs_review')),
evidence jsonb NOT NULL,
FOREIGN KEY (company_id, run_id) REFERENCES reconciliation_runs(company_id,id),
FOREIGN KEY (company_id, settlement_event_id) REFERENCES settlement_events(company_id,id),
FOREIGN KEY (company_id, bank_movement_id) REFERENCES bank_movements(company_id,id),
FOREIGN KEY (company_id, invoice_id) REFERENCES invoices(company_id,id),
FOREIGN KEY (company_id, snapshot_id) REFERENCES invoice_snapshots(company_id,id)
""")
table('findings', """
manifest_id uuid NOT NULL,
candidate_id uuid,
code text NOT NULL,
title_fa text NOT NULL,
severity text NOT NULL CHECK (severity IN ('info','warning','error')),
evidence_id uuid NOT NULL,
FOREIGN KEY (company_id, manifest_id) REFERENCES result_manifests(company_id,id),
FOREIGN KEY (company_id, candidate_id) REFERENCES reconciliation_candidates(company_id,id),
FOREIGN KEY (company_id, evidence_id) REFERENCES evidence(company_id,id)
""")
table('decisions', """
finding_id uuid,
candidate_id uuid,
action text NOT NULL CHECK (action IN ('accept','reject','needs_review')),
actor_id uuid NOT NULL REFERENCES users(id),
reason text NOT NULL,
CHECK (num_nonnulls(finding_id,candidate_id) = 1),
FOREIGN KEY (company_id, finding_id) REFERENCES findings(company_id,id),
FOREIGN KEY (company_id, candidate_id) REFERENCES reconciliation_candidates(company_id,id)
""")
table('forecast_days', """
manifest_id uuid NOT NULL,
forecast_on date NOT NULL,
opening money_irr,
expected_in money_irr CHECK (expected_in >= 0),
expected_out money_irr CHECK (expected_out >= 0),
closing money_irr,
status text NOT NULL CHECK (status IN ('estimated','limited','unavailable')),
reason_codes text[] NOT NULL DEFAULT '{}',
assumptions jsonb NOT NULL,
FOREIGN KEY (company_id, manifest_id) REFERENCES result_manifests(company_id,id),
UNIQUE (company_id, manifest_id, forecast_on)
""")
table('report_snapshots', """
manifest_id uuid NOT NULL,
label text NOT NULL DEFAULT 'تولیدشده سامانه' CHECK (label = 'تولیدشده سامانه'),
content_hash text NOT NULL,
content jsonb NOT NULL,
FOREIGN KEY (company_id, manifest_id) REFERENCES result_manifests(company_id,id),
UNIQUE (company_id, manifest_id)
""")
table('report_approvals', """
report_id uuid NOT NULL,
actor_id uuid NOT NULL REFERENCES users(id),
authority text NOT NULL CHECK (authority IN ('finance_manager','explicit_company_permission')),
permission_event_id uuid,
CHECK ((authority = 'explicit_company_permission') = (permission_event_id IS NOT NULL)),
FOREIGN KEY (company_id, report_id) REFERENCES report_snapshots(company_id,id),
FOREIGN KEY (company_id, permission_event_id) REFERENCES permission_events(company_id,id),
UNIQUE (company_id, report_id, actor_id)
""")
table('export_jobs', """
manifest_id uuid NOT NULL,
report_id uuid,
requested_by uuid NOT NULL REFERENCES users(id),
format text NOT NULL CHECK (format IN ('pdf','xlsx','error_csv')),
status text NOT NULL CHECK (status IN ('pending','running','ready','failed')),
object_key text UNIQUE,
sha256 text,
FOREIGN KEY (company_id, manifest_id) REFERENCES result_manifests(company_id,id),
FOREIGN KEY (company_id, report_id) REFERENCES report_snapshots(company_id,id)
""")
table('budget_policies', """
scope_company_id uuid REFERENCES companies(id),
period_kind text NOT NULL CHECK (period_kind IN ('calendar_month','custom')),
ceiling_usd numeric(20,8) NOT NULL CHECK (ceiling_usd >= 0),
changed_by uuid NOT NULL REFERENCES users(id)
""", scoped=False)
table('budget_periods', """
policy_id uuid NOT NULL REFERENCES budget_policies(id),
starts_at timestamptz NOT NULL,
ends_at timestamptz NOT NULL,
reserved_usd numeric(20,8) NOT NULL DEFAULT 0 CHECK (reserved_usd >= 0),
spent_usd numeric(20,8) NOT NULL DEFAULT 0 CHECK (spent_usd >= 0),
ceiling_usd numeric(20,8) NOT NULL CHECK (ceiling_usd >= 0),
CHECK (starts_at < ends_at),
UNIQUE (policy_id, starts_at)
""", scoped=False)
table('model_tariffs', """
provider text NOT NULL,
model_identifier text NOT NULL,
effective_at timestamptz NOT NULL,
currency text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
input_per_million numeric(20,8) NOT NULL CHECK (input_per_million >= 0),
output_per_million numeric(20,8) NOT NULL CHECK (output_per_million >= 0),
UNIQUE (provider, model_identifier, effective_at)
""", scoped=False)
table('model_requests', """
step_id uuid,
manifest_id uuid,
purpose text NOT NULL CHECK (purpose IN ('classify_document','propose_mapping','suggest_account_role','explain_finding','summarize_report','answer_question')),
tariff_id uuid NOT NULL REFERENCES model_tariffs(id),
status text NOT NULL CHECK (status IN ('reserved','running','succeeded','failed')),
billing_status text NOT NULL DEFAULT 'unreserved' CHECK (billing_status IN ('unreserved','held','settled','usage_unknown')),
input_tokens integer CHECK (input_tokens >= 0),
output_tokens integer CHECK (output_tokens >= 0),
actual_cost_usd numeric(20,8) CHECK (actual_cost_usd >= 0),
FOREIGN KEY (company_id, step_id) REFERENCES processing_steps(company_id,id),
FOREIGN KEY (company_id, manifest_id) REFERENCES result_manifests(company_id,id)
""")
table('budget_reservations', """
model_request_id uuid NOT NULL,
budget_period_id uuid NOT NULL REFERENCES budget_periods(id),
reserved_usd numeric(20,8) NOT NULL CHECK (reserved_usd >= 0),
status text NOT NULL CHECK (status IN ('held','settled','released','usage_unknown')),
FOREIGN KEY (company_id, model_request_id) REFERENCES model_requests(company_id,id),
UNIQUE (company_id, model_request_id, budget_period_id)
""")
table('assistant_questions', """
manifest_id uuid NOT NULL,
actor_id uuid NOT NULL REFERENCES users(id),
question text NOT NULL CHECK (length(trim(question)) BETWEEN 1 AND 4000),
answer_fa text,
status text NOT NULL CHECK (status IN ('pending','ready','waiting_dependency','failed')),
evidence_ids uuid[] NOT NULL DEFAULT '{}',
FOREIGN KEY (company_id, manifest_id) REFERENCES result_manifests(company_id,id)
""")
table('notifications', """
user_id uuid NOT NULL REFERENCES users(id),
session_id uuid,
issue_id uuid,
manifest_id uuid,
title_fa text NOT NULL,
read_at timestamptz,
FOREIGN KEY (company_id, session_id) REFERENCES processing_sessions(company_id,id),
FOREIGN KEY (company_id, issue_id) REFERENCES processing_issues(company_id,id),
FOREIGN KEY (company_id, manifest_id) REFERENCES result_manifests(company_id,id)
""")
table('audit_events', """
actor_id uuid REFERENCES users(id),
action text NOT NULL,
entity_type text NOT NULL,
entity_id uuid NOT NULL,
request_id uuid,
safe_details jsonb NOT NULL DEFAULT '{}'
""")
table('operations', """
requested_by uuid NOT NULL REFERENCES users(id),
kind text NOT NULL CHECK (kind IN ('seal_session','retry_session','cancel_session','delete_source')),
entity_id uuid NOT NULL,
status text NOT NULL CHECK (status IN ('accepted','running','succeeded','failed')),
error_code text,
finished_at timestamptz
""")


def build():
    output = ['-- Fresh rebuild baseline; generated by tools/build_schema.py.\nBEGIN;\nCREATE SCHEMA app;\nSET search_path = app, pg_catalog;\n',
              "-- Unconstrained NUMERIC domain rejects excess precision BEFORE typmod rounding.\nCREATE DOMAIN money_irr AS numeric CHECK (VALUE NOT IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) AND abs(VALUE) < 1e32 AND scale(VALUE) <= 6);\n"]
    for name, (body, scoped) in TABLES.items():
        columns = ['id uuid PRIMARY KEY DEFAULT gen_random_uuid()']
        if scoped:
            columns += ['company_id uuid NOT NULL REFERENCES companies(id)']
        columns += ['created_at timestamptz NOT NULL DEFAULT clock_timestamp()', 'row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0)']
        if scoped:
            columns += ['UNIQUE (company_id, id)']
        output.append('CREATE TABLE ' + name + ' (\n  ' + ',\n  '.join(columns) + ',\n  ' + body.replace('\n', '\n  ') + '\n);\n')
    for name, (_, scoped) in TABLES.items():
        if scoped:
            output.append(f'CREATE INDEX {name}_company_cursor ON {name} (company_id, created_at, id);\n')
    output += ["CREATE UNIQUE INDEX open_issue_root ON processing_issues(company_id,session_id,root_key) WHERE resolved_at IS NULL AND superseded_at IS NULL;\n",
               "CREATE INDEX journal_entry_date ON journal_entries(company_id,entry_on,id);\n",
               "CREATE INDEX movement_account_date ON bank_movements(company_id,bank_account_id,movement_on,id);\n",
               "CREATE INDEX allocations_event ON allocations(company_id,settlement_event_id);\n",
               "CREATE INDEX allocations_invoice ON allocations(company_id,invoice_id);\n",
               "CREATE INDEX manifest_file_dependency ON manifest_dependencies(company_id,source_file_id);\n",
               'COMMIT;\n']
    (ROOT / 'database/001_schema.sql').write_text('\n'.join(output))
    import json
    (ROOT / 'contracts/table-catalog.json').write_text(json.dumps({'tables': [{'name': n, 'company_scoped': s} for n, (_, s) in TABLES.items()]}, indent=2)+'\n')
    print(f'Generated {len(TABLES)} tables')


if __name__ == '__main__':
    build()
