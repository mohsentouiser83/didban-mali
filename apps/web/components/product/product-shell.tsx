"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { ThemeToggle } from "@/components/design-system/theme-toggle";
import { api } from "@/lib/product-api";

import { Icon, Mark, type ProductIconName } from "./icons";
import { useWorkspace } from "./workspace-provider";

const pageMeta = [
  { match: "/overview", title: "داشبورد مالی", breadcrumb: "فضای کاری / وضعیت مالی" },
  { match: "/imports", title: "ورود داده‌های مالی", breadcrumb: "فضای کاری / ورود داده" },
  { match: "/financial-model", title: "مدل مالی", breadcrumb: "فضای کاری / نرمال‌سازی و طبقه‌بندی" },
  { match: "/analysis", title: "تحلیل مالی", breadcrumb: "فضای کاری / محاسبات دوره‌ای" },
  { match: "/reconciliation", title: "تطبیق حساب‌ها", breadcrumb: "فضای کاری / بانک و حسابداری" },
  { match: "/findings", title: "یافته‌ها", breadcrumb: "فضای کاری / اولویت و شواهد" },
  { match: "/settings/profile", title: "پروفایل شرکت", breadcrumb: "تنظیمات شرکت / مشخصات پایه" },
  { match: "/settings/members", title: "اعضا و دسترسی‌ها", breadcrumb: "تنظیمات شرکت / اعضا" },
];

export function ProductShell({ children }: { children: React.ReactNode }) {
  const { user, companies, company } = useWorkspace();
  const pathname = usePathname();
  const router = useRouter();
  const base = `/companies/${company.id}`;
  const meta = pathname.includes("/imports/") ? { title: "آماده‌سازی داده", breadcrumb: "ورود داده / نگاشت و اعتبارسنجی" } : pathname.includes("/findings/") ? { title: "پرونده یافته", breadcrumb: "یافته‌ها / اولویت و شواهد" } : pageMeta.find((item) => pathname.endsWith(item.match)) ?? pageMeta[0];
  const links: { href: string; label: string; icon: ProductIconName }[] = [
    { href: `${base}/overview`, label: "داشبورد", icon: "home" },
    { href: `${base}/imports`, label: "ورود داده", icon: "upload" },
    { href: `${base}/financial-model`, label: "مدل مالی", icon: "layers" },
    { href: `${base}/analysis`, label: "تحلیل مالی", icon: "chart" },
    { href: `${base}/reconciliation`, label: "تطبیق حساب‌ها", icon: "reconcile" },
    { href: `${base}/findings`, label: "یافته‌ها", icon: "findings" },
    { href: `${base}/settings/profile`, label: "پروفایل شرکت", icon: "company" },
    { href: `${base}/settings/members`, label: "اعضا و دسترسی‌ها", icon: "users" },
  ];
  async function logout() { try { await api("/auth/logout", { method: "POST" }); } finally { router.replace("/login"); router.refresh(); } }
  function switchCompany(companyId: string) {
    const suffix = pathname.includes("/findings/") ? "/findings" : pathname.slice(base.length) || "/overview";
    router.push(`/companies/${companyId}${suffix}`);
  }

  return <main className="ds-root app-shell">
    <aside className="sidebar">
      <Link className="brand" href={`${base}/overview`}><Mark /><span>دیدبان مالی</span></Link>
      <nav aria-label="منوی اصلی">
        {links.map((link) => { const active = pathname === link.href || (link.href.endsWith("/imports") && pathname.startsWith(`${link.href}/`)); return <Link key={link.href} className={`nav-item${active ? " active" : ""}`} href={link.href} aria-current={active ? "page" : undefined}><Icon name={link.icon} /><span>{link.label}</span></Link>; })}
        <span className="nav-label">ماژول‌های بعدی</span><span className="nav-item disabled"><span className="nav-dot"/>گردش کار بررسی</span><span className="nav-item disabled"><span className="nav-dot"/>گزارش مدیریتی</span>
      </nav>
      <div className="user-box"><span className="avatar">{user.full_name.slice(0, 1)}</span><div><strong>{user.full_name}</strong><small dir="ltr">{user.email}</small></div><button onClick={() => void logout()} title="خروج"><Icon name="exit" /><span className="sr-only">خروج</span></button></div>
    </aside>
    <section className="workspace">
      <header className="topbar"><div><span className="breadcrumb">{meta.breadcrumb}</span><h1>{meta.title}</h1></div><div className="topbar-actions"><ThemeToggle /><div className="company-switcher"><label htmlFor="company-select">شرکت فعال</label><select id="company-select" value={company.id} onChange={(event) => switchCompany(event.target.value)}>{companies.map((item) => <option key={item.id} value={item.id}>{item.legal_name}</option>)}</select><Link className="icon-button" href="/companies/new" title="شرکت جدید"><Icon name="plus" /><span className="sr-only">شرکت جدید</span></Link></div></div></header>
      <div className="content page-stack">{children}</div>
    </section>
  </main>;
}
