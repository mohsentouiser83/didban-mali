"""Shared financial limitations for native reports and read-only explanations."""

REASONS = {
    "zero_opening_prior_history": "با وجود دوره یا اسناد پیشین، مبنای صفر معتبر نیست.",
    "opening_evidence_missing": "مبنای افتتاحیه انتخاب نشده است.",
    "opening_evidence_ambiguous": "چند مبنای افتتاحیه وجود دارد.",
    "opening_source_not_closed": "دورهٔ مبدأ افتتاحیه قفل نیست.",
    "opening_source_changed": "اسناد مبدأ افتتاحیه تغییر کرده‌اند.",
    "opening_scope_incomplete": "افتتاحیه همهٔ حساب‌های دارای مانده را پوشش نمی‌دهد.",
    "nominal_balance_not_closed": "حساب درآمد یا هزینهٔ مبدأ هنوز مانده دارد.",
    "opening_account_roles_invalid": "نقش حساب‌های افتتاحیه کامل یا ترازنامه‌ای نیست.",
    "unclassified_profit_accounts": "نقش برخی حساب‌های گردش سود و زیان مشخص نیست.",
    "unclassified_balance_accounts": "نقش برخی حساب‌های دارای مانده مشخص نیست.",
    "period_accounting_role_conflict": "نقش حساب‌ها با سند بستن یا افتتاحیه سازگار نیست.",
}
