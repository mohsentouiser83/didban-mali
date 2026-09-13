"use client";

import Link from "next/link";
import { Icon } from "@/components/product/icons";
import { useWorkspace } from "@/components/product/workspace-provider";

export default function CompanyProfilePage() {
  const { company } = useWorkspace();
  return <section className="company-card company-profile-page"><div className="card-heading"><div><span className="overline">مشخصات پایه</span><h3>پروفایل شرکت</h3><p>اطلاعات مرجع این فضای کاری و مرز امنیتی داده‌ها.</p></div><span className="role role-owner">{company.currency}</span></div><dl><div><dt>نام حقوقی</dt><dd>{company.legal_name}</dd></div><div><dt>شناسه ملی</dt><dd dir="ltr">{company.national_id ?? "—"}</dd></div><div><dt>شروع سال مالی</dt><dd>ماه {new Intl.NumberFormat("fa-IR").format(company.fiscal_year_start_month)}</dd></div><div><dt>منطقه زمانی</dt><dd dir="ltr">{company.timezone}</dd></div></dl><div className="profile-footer"><Link className="secondary-button" href={`/companies/${company.id}/settings/members`}><Icon name="users" />مدیریت اعضا</Link></div></section>;
}
