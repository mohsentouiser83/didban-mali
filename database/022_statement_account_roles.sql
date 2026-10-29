-- Extend balance-sheet coverage; existing assignments, provenance and evidence stay intact.
BEGIN;
SET search_path=app,pg_catalog;
ALTER TABLE account_role_versions DROP CONSTRAINT account_role_versions_role_check;
ALTER TABLE account_role_versions ADD CONSTRAINT account_role_versions_role_check CHECK (role IN (
 'bank','cash','trade_ar','other_ar','trade_ap','loan_payable','tax_payable',
 'payroll_payable','other_liability','inventory','capital','revenue','other_income',
 'expense','cogs','income_tax_expense','vat_receivable','vat_payable','unknown',
 'fixed_asset','other_asset','contra_asset','other_equity'
));
COMMIT;
