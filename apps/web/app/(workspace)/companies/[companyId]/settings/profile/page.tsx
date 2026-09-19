"use client";

import Link from "next/link";
import { Icon } from "@/components/product/icons";
import { useWorkspace } from "@/components/product/workspace-provider";

export default function CompanyProfilePage() {
  const { company } = useWorkspace();
  return (
    <section className="company-card company-profile-page p-6 rounded-2xl border border-border/80 bg-card shadow-sm space-y-6 max-w-3xl">
      <div className="card-heading flex items-start justify-between gap-4 pb-4 border-b border-border/70">
        <div className="space-y-1">
          <span className="overline inline-block text-xs font-semibold text-primary">مشخصات پایه</span>
          <h3 className="text-lg font-bold text-foreground">پروفایل شرکت</h3>
          <p className="text-xs text-muted-foreground">اطلاعات مرجع این فضای کاری و مرز امنیتی داده‌ها.</p>
        </div>
        <span className="role role-owner px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
          {company.currency}
        </span>
      </div>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
        <div className="p-3.5 rounded-xl border border-border/70 bg-card/60 space-y-1">
          <dt className="text-muted-foreground">نام حقوقی</dt>
          <dd className="font-semibold text-foreground text-sm">{company.legal_name}</dd>
        </div>
        <div className="p-3.5 rounded-xl border border-border/70 bg-card/60 space-y-1">
          <dt className="text-muted-foreground">شناسه ملی</dt>
          <dd dir="ltr" className="font-mono font-semibold text-foreground text-sm">{company.national_id ?? "—"}</dd>
        </div>
        <div className="p-3.5 rounded-xl border border-border/70 bg-card/60 space-y-1">
          <dt className="text-muted-foreground">شروع سال مالی</dt>
          <dd className="font-semibold text-foreground text-sm">ماه {new Intl.NumberFormat("fa-IR").format(company.fiscal_year_start_month)}</dd>
        </div>
        <div className="p-3.5 rounded-xl border border-border/70 bg-card/60 space-y-1">
          <dt className="text-muted-foreground">منطقه زمانی</dt>
          <dd dir="ltr" className="font-mono font-semibold text-foreground text-sm">{company.timezone}</dd>
        </div>
      </dl>
      <div className="profile-footer pt-2">
        <Link className="secondary-button inline-flex items-center gap-2 text-xs" href={`/companies/${company.id}/settings/members`}>
          <Icon name="users" />
          مدیریت اعضا
        </Link>
      </div>
    </section>
  );
}
