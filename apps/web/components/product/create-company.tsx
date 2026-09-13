"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { api } from "@/lib/product-api";
import type { Company } from "@/lib/product-types";

import { Icon } from "./icons";

export function CreateCompany({ onCreated, compact = false }: { onCreated?: (company: Company) => void; compact?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const data = new FormData(event.currentTarget);
    try {
      const company = await api<Company>("/companies", { method: "POST", body: JSON.stringify({ legal_name: data.get("legal_name"), national_id: data.get("national_id") || null, fiscal_year_start_month: Number(data.get("fiscal_year_start_month")) }) });
      onCreated?.(company);
      router.replace(`/companies/${company.id}/overview`);
      router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "شرکت ساخته نشد."); }
    finally { setBusy(false); }
  }
  return <form className={compact ? "company-form compact" : "company-form"} onSubmit={submit}>
    <label>نام حقوقی شرکت<input name="legal_name" required minLength={2} placeholder="مثلاً راهکار تجارت آریا" /></label>
    <label>شناسه ملی <span>(اختیاری)</span><input name="national_id" inputMode="numeric" dir="ltr" minLength={8} placeholder="۱۴۰۰۱۲۳۴۵۶۷" /></label>
    <label>ماه شروع سال مالی<select name="fiscal_year_start_month" defaultValue="1">{Array.from({ length: 12 }, (_, index) => <option value={index + 1} key={index + 1}>ماه {new Intl.NumberFormat("fa-IR").format(index + 1)}</option>)}</select></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="primary-button" disabled={busy}><Icon name="plus" />{busy ? "در حال ساخت…" : "ایجاد شرکت"}</button>
  </form>;
}
