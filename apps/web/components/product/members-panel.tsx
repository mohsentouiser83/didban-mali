"use client";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ProductCard } from "./product-card";
import { SelectField, SelectOption } from "./select-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { api } from "@/lib/product-api";
import { type Company, type Member, type Role, roleLabels } from "@/lib/product-types";

import { Icon } from "./icons";

const roleBadgeVariants: Record<Role, string> = {
  owner: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  finance_manager: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  advisor: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  viewer: "bg-muted text-muted-foreground border-border",
};

export function MembersPanel({ company, currentUserId }: { company: Company; currentUserId: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState("");
  const load = useCallback(
    () => api<Member[]>(`/companies/${company.id}/members`).then(setMembers).catch((e: Error) => setError(e.message)),
    [company.id]
  );
  useEffect(() => {
    void load();
  }, [load]);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await api(`/companies/${company.id}/members`, {
        method: "POST",
        body: JSON.stringify({ email: data.get("email"), role: data.get("role") }),
      });
      form.reset();
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "عضو افزوده نشد.");
    }
  }

  async function updateRole(member: Member, role: Role) {
    setError("");
    try {
      await api(`/companies/${company.id}/members/${member.user_id}`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "نقش عضو تغییر نکرد.");
    }
  }

  async function remove(member: Member) {
    setError("");
    try {
      await api(`/companies/${company.id}/members/${member.user_id}`, { method: "DELETE" });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "عضو حذف نشد.");
    }
  }

  return (
    <ProductCard className="members-card p-6 rounded-2xl border border-border bg-card shadow-sm space-y-5" aria-labelledby="members-title">
      <div className="card-heading flex items-center justify-between border-b border-border/60 pb-4">
        <div>
          <span className="overline block text-[11px] font-bold text-primary mb-0.5">کنترل دسترسی</span>
          <h3 id="members-title" className="text-base sm:text-lg font-bold text-foreground">مدیریت اعضای شرکت</h3>
        </div>
        <Badge variant="secondary" className="count-pill text-xs font-mono">
          {new Intl.NumberFormat("fa-IR").format(members.length)} نفر
        </Badge>
      </div>

      {company.role === "owner" && (
        <form className="member-form grid grid-cols-1 sm:grid-cols-[1fr_140px_auto] gap-2.5" onSubmit={add}>
          <label className="sr-only">ایمیل عضو جدید</label>
          <Input
            name="email"
            type="email"
            dir="ltr"
            required
            placeholder="ایمیل عضو جدید"
            className="h-10 text-xs bg-background text-end"
          />
          <label className="sr-only">نقش عضو جدید</label>
          <SelectField name="role" defaultValue="viewer" className="h-10 text-xs">
            <SelectOption value="finance_manager">مدیر مالی</SelectOption>
            <SelectOption value="advisor">مشاور</SelectOption>
            <SelectOption value="viewer">مشاهده‌گر</SelectOption>
          </SelectField>
          <Button type="submit" variant="secondary" className="h-10 text-xs font-bold gap-1.5 px-4 cursor-pointer">
            <Icon name="plus" className="size-3.5" />
            افزودن
          </Button>
        </form>
      )}

      {error && (
        <Alert variant="destructive" className="form-error text-xs p-3" role="alert">
          {error}
        </Alert>
      )}

      <div className="member-list divide-y divide-border/60">
        {members.map((member) => (
          <div className="member-row flex items-center justify-between gap-3 py-3" key={member.user_id}>
            <div className="flex items-center gap-3 min-w-0">
              <Avatar className="avatar size-8 shrink-0">
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                  {member.full_name.slice(0, 1)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <strong className="block truncate text-xs font-bold text-foreground">{member.full_name}</strong>
                <small dir="ltr" className="block truncate text-[11px] text-muted-foreground text-start">
                  {member.email}
                </small>
              </div>
            </div>

            {company.role === "owner" ? (
              <div className="member-actions flex items-center gap-2 shrink-0">
                <label className="sr-only">نقش {member.full_name}</label>
                <SelectField
                  className="role-select h-8 text-[11px] min-w-[100px]"
                  value={member.role}
                  onChange={(event) => void updateRole(member, event.target.value as Role)}
                >
                  <SelectOption value="owner">مالک</SelectOption>
                  <SelectOption value="finance_manager">مدیر مالی</SelectOption>
                  <SelectOption value="advisor">مشاور</SelectOption>
                  <SelectOption value="viewer">مشاهده‌گر</SelectOption>
                </SelectField>
                {member.user_id !== currentUserId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="remove-button h-8 px-2.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive cursor-pointer"
                    onClick={() => void remove(member)}
                  >
                    حذف
                  </Button>
                )}
              </div>
            ) : (
              <Badge variant="outline" className={`role text-xs ${roleBadgeVariants[member.role]}`}>
                {roleLabels[member.role]}
              </Badge>
            )}
          </div>
        ))}
      </div>
    </ProductCard>
  );
}
