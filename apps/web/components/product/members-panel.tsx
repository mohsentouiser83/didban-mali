"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { api } from "@/lib/product-api";
import { type Company, type Member, type Role, roleLabels } from "@/lib/product-types";

import { Icon } from "./icons";

export function MembersPanel({ company, currentUserId }: { company: Company; currentUserId: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState("");
  const load = useCallback(() => api<Member[]>(`/companies/${company.id}/members`).then(setMembers).catch((e: Error) => setError(e.message)), [company.id]);
  useEffect(() => { void load(); }, [load]);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const form = event.currentTarget; const data = new FormData(form);
    try { await api(`/companies/${company.id}/members`, { method: "POST", body: JSON.stringify({ email: data.get("email"), role: data.get("role") }) }); form.reset(); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "عضو افزوده نشد."); }
  }
  async function updateRole(member: Member, role: Role) {
    setError("");
    try { await api(`/companies/${company.id}/members/${member.user_id}`, { method: "PATCH", body: JSON.stringify({ role }) }); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "نقش عضو تغییر نکرد."); }
  }
  async function remove(member: Member) {
    setError("");
    try { await api(`/companies/${company.id}/members/${member.user_id}`, { method: "DELETE" }); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "عضو حذف نشد."); }
  }

  return <section className="members-card" aria-labelledby="members-title">
    <div className="card-heading"><div><span className="overline">کنترل دسترسی</span><h3 id="members-title">اعضای شرکت</h3></div><span className="count-pill">{new Intl.NumberFormat("fa-IR").format(members.length)} نفر</span></div>
    {company.role === "owner" && <form className="member-form" onSubmit={add}><label><span className="sr-only">ایمیل عضو جدید</span><input name="email" type="email" dir="ltr" required placeholder="ایمیل عضو جدید" /></label><label><span className="sr-only">نقش عضو جدید</span><select name="role" defaultValue="viewer"><option value="finance_manager">مدیر مالی</option><option value="advisor">مشاور</option><option value="viewer">مشاهده‌گر</option></select></label><button className="secondary-button"><Icon name="plus" />افزودن</button></form>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="member-list">{members.map((member) => <div className="member-row" key={member.user_id}><span className="avatar">{member.full_name.slice(0, 1)}</span><div><strong>{member.full_name}</strong><small dir="ltr">{member.email}</small></div>{company.role === "owner" ? <div className="member-actions"><label><span className="sr-only">نقش {member.full_name}</span><select className="role-select" value={member.role} onChange={(event) => void updateRole(member, event.target.value as Role)}><option value="owner">مالک</option><option value="finance_manager">مدیر مالی</option><option value="advisor">مشاور</option><option value="viewer">مشاهده‌گر</option></select></label>{member.user_id !== currentUserId && <button className="remove-button" onClick={() => void remove(member)}>حذف</button>}</div> : <span className={`role role-${member.role}`}>{roleLabels[member.role]}</span>}</div>)}</div>
  </section>;
}
