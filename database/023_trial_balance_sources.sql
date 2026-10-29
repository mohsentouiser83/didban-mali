BEGIN;
SET search_path=app,pg_catalog;
ALTER TABLE interpretation_versions DROP CONSTRAINT interpretation_versions_source_kind_check;
ALTER TABLE interpretation_versions ADD CONSTRAINT interpretation_versions_source_kind_check CHECK (source_kind IN ('ledger','trial_balance','bank','sales_invoices','purchase_invoices','settlements','moadian_sales','moadian_purchases','planned_payments','receipt_history'));
ALTER TABLE account_role_versions DROP CONSTRAINT account_role_versions_role_check;
ALTER TABLE account_role_versions ADD CONSTRAINT account_role_versions_role_check CHECK (role IN ('bank','cash','cash_equivalent','trade_ar','other_ar','trade_ap','loan_payable','tax_payable','payroll_payable','other_liability','inventory','capital','revenue','other_income','expense','cogs','income_tax_expense','vat_receivable','vat_payable','unknown','fixed_asset','other_asset','contra_asset','other_equity'));
COMMIT;
