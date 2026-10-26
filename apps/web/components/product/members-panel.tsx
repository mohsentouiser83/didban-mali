"use client";
import { SearchInput } from "@/components/ui/search-input";
import { ControlLabel, fieldIcon } from "@/components/ui/field-layout";
import { FieldDescription } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form";
import { ErrorState } from "@/components/ui/financial";

import { TableEmptyCell, Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Plus } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Drawer, DrawerFooter, DrawerForm } from "@/components/ui/drawer";
import { api } from "@/lib/product-api";
import { roleLabels, type Company, type Member, type Role } from "@/lib/product-types";
import { SelectField, SelectOption } from "./select-field";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import page from "./cashflow-overview.module.css";
import table from "./receivables-customers.module.css";
const roles = Object.keys(roleLabels) as Role[];
const descriptions: Record<Role, string> = {
  owner: "مدیریت اعضا، اتصال‌ها و اطلاعات مالی شرکت",
  finance_manager: "مدیریت اطلاعات مالی و اتصال‌ها؛ بدون تغییر اعضا",
  advisor: "بررسی و تحلیل اطلاعات مالی؛ بدون مدیریت اعضا و اتصال‌ها",
  viewer: "مشاهده اطلاعات شرکت؛ بدون مدیریت اعضا و اتصال‌ها",
};
export function MembersPanel(props: {
  company: Company;
  currentUserId: string;
}) {
  return <MembersContent key={props.company.id} {...props} />;
}
function MembersContent({
  company,
  currentUserId,
}: {
  company: Company;
  currentUserId: string;
}) {
  const [members, setMembers] = useState<Member[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [search, setSearch] = useState(""),
    [adding, setAdding] = useState(false),
    [selected, setSelected] = useState<Member | null>(null),
    [role, setRole] = useState<Role>("viewer"),
    [busy, setBusy] = useState(false),
    [removing, setRemoving] = useState(false),
    [formError, setFormError] = useState("");
  const owner = company.role === "owner";
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setMembers(await api<Member[]>(`/companies/${company.id}/members`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "اعضا دریافت نشدند.");
    } finally {
      setLoading(false);
    }
  }, [company.id]);
  useEffect(() => {
    void load();
  }, [load]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setFormError("");
    const data = new FormData(event.currentTarget);
    try {
      await api(
        `/companies/${company.id}/members${selected ? `/${selected.user_id}` : ""}`,
        {
          method: selected ? "PATCH" : "POST",
          body: JSON.stringify(
            selected
              ? { role }
              : { email: String(data.get("email")).trim(), role },
          ),
        },
      );
      setAdding(false);
      setSelected(null);
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "تغییرات ذخیره نشد.");
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!selected || busy) return;
    setBusy(true);
    setFormError("");
    try {
      await api(`/companies/${company.id}/members/${selected.user_id}`, {
        method: "DELETE",
      });
      setRemoving(false);
      setSelected(null);
      await load();
    } catch (e) {
      setRemoving(false);
      setFormError(e instanceof Error ? e.message : "عضو حذف نشد.");
    } finally {
      setBusy(false);
    }
  }
  const visible = members.filter((member) =>
    `${member.full_name} ${member.email}`
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase()),
  );
  return (
    <div className={page.page} dir="rtl">
      <h1>اعضا و سطوح دسترسی</h1>
      <section className={table.section}>
        <div className={table.heading}>
          <h2>اعضای شرکت</h2>
          <div className={table.controls}>
            <SearchInput label="جستجوی اعضا" className="w-full sm:w-56"
                placeholder="نام یا ایمیل"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
               />
            {owner && (
              <Button
                onClick={() => {
                  setRole("viewer");
                  setFormError("");
                  setAdding(true);
                }}
              >
                <Plus className="size-4" />
                افزودن عضو
              </Button>
            )}
          </div>
        </div>
        {error ? (
          <ErrorState onRetry={() => void load()}  variant="compact">
            <p>{error}</p>

          </ErrorState>
        ) : loading ? (
          <div className="p-6 space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <div className="min-w-0">
            <Table className="min-w-[640px]" containerClassName="border-0">
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">نام</TableHead>
                  <TableHead scope="col">ایمیل</TableHead>
                  <TableHead scope="col">سطح دسترسی</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((member) => (
                  <TableRow key={member.user_id} onActivate={() => { setSelected(member); setRole(member.role); setFormError(""); }}>
                    <TableCell>
                      <Button
                        variant="ghost"
                        className="h-auto min-h-11 max-w-80 justify-start whitespace-normal px-0 text-start font-normal"
                        onClick={() => {
                          setSelected(member);
                          setRole(member.role);
                          setFormError("");
                        }}
                      >
                        {member.full_name}
                        {member.user_id === currentUserId ? " (شما)" : ""}
                      </Button>
                    </TableCell>
                    <TableCell>
                      <bdi dir="ltr">{member.email}</bdi>
                    </TableCell>
                    <TableCell>{roleLabels[member.role]}</TableCell>
                  </TableRow>
                ))}
                {!visible.length && (
                  <TableRow>
                    <TableEmptyCell colSpan={3} className="h-40 p-0 text-center text-muted-foreground">
                      {search
                        ? "عضوی با این نام یا ایمیل پیدا نشد."
                        : "عضوی ثبت نشده است."}
                    </TableEmptyCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
      <Drawer
        open={adding || !!selected}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setAdding(false);
            setSelected(null);
            setRemoving(false);
          }
        }}
        title={selected ? selected.full_name : "افزودن عضو"}
        description={
          selected
            ? selected.email
            : undefined
        }
      >
        <DrawerForm onSubmit={save}>
          {adding && (
            <div>
              <ControlLabel htmlFor="member-email" icon={fieldIcon("ایمیل")}>ایمیل</ControlLabel>
              <Input
                id="member-email"
                name="email"
                type="email"
                dir="ltr"
                required
                autoComplete="email"
                disabled={busy}
              />
            </div>
          )}
          <div>
            <ControlLabel htmlFor="member-role" icon={fieldIcon("سطح دسترسی")}>سطح دسترسی</ControlLabel>
            <SelectField
              id="member-role"
              aria-describedby="member-role-hint"
              value={role}
              disabled={busy || !owner || selected?.user_id === currentUserId}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              {roles.map((value) => (
                <SelectOption key={value} value={value}>
                  {roleLabels[value]}
                </SelectOption>
              ))}
            </SelectField>
            <FieldDescription id="member-role-hint" className="mt-3">{descriptions[role]}</FieldDescription>
          </div>
          {selected?.user_id === currentUserId && (
            <p className="text-sm leading-relaxed text-muted-foreground">
              برای تغییر دسترسی شما، مالک دیگری باید اقدام کند.
            </p>
          )}
          {formError && (
            <FormMessage>{formError}</FormMessage>
          )}
          <DrawerFooter>
            {owner && selected?.user_id !== currentUserId && (
              <Button type="submit" disabled={busy}>
                {busy
                  ? "در حال ذخیره…"
                  : adding
                    ? "افزودن عضو"
                    : "ذخیره دسترسی"}
              </Button>
            )}
            {owner && selected && selected.user_id !== currentUserId && (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setRemoving(true)}
              >
                حذف عضو
              </Button>
            )}
          </DrawerFooter>
        </DrawerForm>
      </Drawer>
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title="حذف عضو"
        description="دسترسی این عضو به شرکت قطع می‌شود."
        busy={busy}
        onConfirm={() => void remove()}
      />
    </div>
  );
}
