"use client";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import type { useLedgerAccounts } from "@/hooks/use-ledger-accounts";
import { ACCOUNT_LEVEL_OPTIONS } from "@/lib/account-catalogue";

export function AccountFilters({ view }: { view: ReturnType<typeof useLedgerAccounts> }) {
  return (
    <div className="mb-5 flex flex-wrap items-end gap-3">
      <div className="w-full sm:w-52">
        <Field id="account-category-filter" label="فیلتر نقد و بانک">
          <Select
            id="account-category-filter"
            value={view.categoryFilter}
            onValueChange={(val) =>
              view.setCategoryFilter(val as "all" | "treasury")
            }
            options={[
              { value: "all", label: "همه حساب‌ها" },
              { value: "treasury", label: "بانک، صندوق و تنخواه" },
            ]}
          />
        </Field>
      </div>
      <div className="w-full sm:w-44">
        <Field id="account-level-filter" label="سطح حساب">
          <Select id="account-level-filter" value={view.levelFilter} onValueChange={view.setLevelFilter}
            options={[{ value: "all", label: "همه سطح‌ها" }, ...ACCOUNT_LEVEL_OPTIONS, { value: "unclassified", label: "تعیین‌نشده" }]} />
        </Field>
      </div>
      {view.canFilterParent && <div className="w-full sm:w-64">
        <Field id="account-parent-filter" label="حساب بالادست">
          <Select id="account-parent-filter" value={view.parentFilter} onValueChange={view.setParentFilter}
            searchable searchPlaceholder="جستجوی حساب بالادست..."
            disabled={view.catalogue.loading || !!view.catalogue.error}
            options={[{ value: "all", label: "همه حساب‌ها" }, ...view.filterParentOptions]} />
        </Field>
      </div>}
      {view.filtersActive && <Button variant="ghost" onClick={view.resetFilters}>پاک‌کردن فیلترها</Button>}
    </div>
  );
}
