"use client";

import Link from "next/link";
import { Icon } from "@/components/product/icons";
import { useWorkspace } from "@/components/product/workspace-provider";
import { roleLabels } from "@/lib/product-types";

export default function OverviewPage() {
  const { company } = useWorkspace();
  const base = `/companies/${company.id}`;
  return <>
    <section className="page-intro"><div><span className="overline">مرکز کنترل مالی</span><h2>تصویر روشن از فضای کاری شما</h2><p>شرکت، دسترسی و وضعیت امنیتی را یک‌جا ببینید و وارد جریان کاری بعدی شوید.</p></div><Link className="primary-button intro-action" href={`${base}/imports`}><Icon name="upload" />ورود داده جدید</Link></section>
    <div className="summary-grid"><article><span className="summary-icon"><Icon name="company" /></span><div><small>شرکت فعال</small><strong>{company.legal_name}</strong><p>{company.national_id ? `شناسه ملی ${company.national_id}` : "شناسه ملی ثبت نشده"}</p></div></article><article><span className="summary-icon"><Icon name="shield" /></span><div><small>سطح دسترسی شما</small><strong>{roleLabels[company.role]}</strong><p>کنترل‌شده در API و پایگاه‌داده</p></div></article><article><span className="summary-icon"><Icon name="users" /></span><div><small>وضعیت امنیتی</small><strong>جداسازی فعال</strong><p>نشست چرخشی و محافظت CSRF</p></div></article></div>
    <section className="next-actions" aria-labelledby="next-actions-title"><div><span className="overline">ادامهٔ مسیر</span><h3 id="next-actions-title">اقدام بعدی را انتخاب کنید</h3></div><div className="action-links"><Link href={`${base}/imports`}><Icon name="upload" /><span><strong>ورود داده مالی</strong><small>بارگذاری امن CSV و XLSX</small></span></Link><Link href={`${base}/settings/members`}><Icon name="users" /><span><strong>مدیریت دسترسی‌ها</strong><small>افزودن عضو و تعیین نقش</small></span></Link></div></section>
  </>;
}
