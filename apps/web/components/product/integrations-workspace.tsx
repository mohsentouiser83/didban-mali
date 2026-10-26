"use client";
import { SearchInput } from "@/components/ui/search-input";
import { DetailGroup, ControlLabel, fieldIcon, DetailField } from "@/components/ui/field-layout";
import { FormMessage } from "@/components/ui/form";
import { StatusBadge } from "@/components/ui/financial/status-badge";
import { ErrorState, EmptyState, StatusMessage, LoadingState } from "@/components/ui/financial";

import { TableEmptyCell, Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Plus, RefreshCw, Wifi, Key, Copy } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Drawer, DrawerFooter, DrawerForm } from "@/components/ui/drawer";
import { api } from "@/lib/product-api";
import type { Company, IntegrationConnection, IntegrationProvider, IntegrationSyncJob, ConnectionTestResult, AgentKeyResponse } from "@/lib/product-types";
import { SelectField, SelectOption } from "./select-field";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toJalaliDate } from "@/lib/date-utils";
import page from "./cashflow-overview.module.css";
import table from "./receivables-customers.module.css";
const providers: Record<IntegrationProvider, string> = {
  sepidar: "سپیدار",
  bank_direct: "حساب بانکی",
  rahkaran: "راهکاران",
};
const statuses: Record<string, string> = {
  connected: "متصل",
  syncing: "در حال دریافت",
  reauth_required: "نیازمند احراز هویت",
  error: "خطای اتصال",
  inactive: "غیرفعال",
  disconnected: "قطع‌شده",
};
const jobLabels: Record<string, string> = {
  queued: "در صف",
  running: "در حال اجرا",
  completed: "موفق",
  failed: "ناموفق",
  partial: "دریافت ناقص",
};
const number = new Intl.NumberFormat("fa-IR");
export function IntegrationsWorkspace({ company }: { company: Company }) {
  return <Connections key={company.id} company={company} />;
}
function Connections({ company }: { company: Company }) {
  const [connections, setConnections] = useState<IntegrationConnection[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [search, setSearch] = useState(""),
    [adding, setAdding] = useState(false),
    [selected, setSelected] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [formError, setFormError] = useState("");
  const [provider, setProvider] = useState<IntegrationProvider>("sepidar");
  const manage = company.role === "owner" || company.role === "finance_manager";
  const load = useCallback(
    async (initial = false) => {
      if (initial) setLoading(true);
      setError("");
      try {
        setConnections(
          await api<IntegrationConnection[]>(
            `/companies/${company.id}/integrations`,
          ),
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "اتصال‌ها دریافت نشدند.");
      } finally {
        setLoading(false);
      }
    },
    [company.id],
  );
  useEffect(() => {
    void load(true);
  }, [load]);
  const pending = connections.some(
    (connection) => connection.status === "syncing",
  );
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => void load(), 4000);
    return () => clearInterval(timer);
  }, [pending, load]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setFormError("");
    const data = new FormData(event.currentTarget),
      token = String(data.get("token")).trim();
    try {
      await api(`/companies/${company.id}/integrations`, {
        method: "POST",
        body: JSON.stringify({
          provider,
          name: String(data.get("name")).trim(),
          config:
            provider === "sepidar"
              ? { server_url: String(data.get("server_url")).trim() }
              : {
                  bank_name: String(data.get("bank_name")).trim(),
                  account_number: String(data.get("account_number")).trim(),
                },
          credentials:
            provider === "sepidar" ? { api_token: token } : { api_key: token },
          sync_interval_minutes: 1440,
        }),
      });
      setAdding(false);
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "اتصال ثبت نشد.");
    } finally {
      setBusy(false);
    }
  }
  const visible = connections.filter((connection) =>
    `${connection.name} ${providers[connection.provider]}`.includes(
      search.trim(),
    ),
  );
  const current = connections.find((connection) => connection.id === selected);
  return (
    <div className={page.page} dir="rtl">
      <h1>اتصال به سیستم‌های مالی و بانکی</h1>
      <section className={table.section}>
        <div className={table.heading}>
          <h2>اتصال‌های شرکت</h2>
          <div className={table.controls}>
            <SearchInput label="جستجوی اتصال‌ها" className="w-full sm:w-56"
                placeholder="نام اتصال یا سیستم"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
               />
            {manage && (
              <Button
                onClick={() => {
                  setFormError("");
                  setProvider("sepidar");
                  setAdding(true);
                }}
              >
                <Plus className="size-4" />
                افزودن اتصال
              </Button>
            )}
          </div>
        </div>
        {error ? (
          <ErrorState onRetry={() => void load(true)}  variant="compact">
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
                  <TableHead scope="col">نام اتصال</TableHead>
                  <TableHead scope="col">سیستم</TableHead>
                  <TableHead scope="col">وضعیت</TableHead>
                  <TableHead scope="col">آخرین دریافت</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((connection) => (
                  <TableRow key={connection.id} onActivate={() => setSelected(connection.id)}>
                    <TableCell>
                      <Button
                        variant="ghost"
                        className="h-auto min-h-11 max-w-80 justify-start whitespace-normal px-0 text-start font-normal"
                        onClick={() => setSelected(connection.id)}
                      >
                        {connection.name}
                      </Button>
                    </TableCell>
                    <TableCell>{providers[connection.provider]}</TableCell>
                    <TableCell><StatusBadge status={connection.status} label={statuses[connection.status] ?? "نامشخص"} /></TableCell>
                    <TableCell>
                      {connection.last_sync_at
                        ? toJalaliDate(connection.last_sync_at)
                        : "هنوز دریافت نشده"}
                    </TableCell>
                  </TableRow>
                ))}
                {!visible.length && (
                  <TableRow>
                    <TableEmptyCell colSpan={4} className="h-40 p-0 text-center text-muted-foreground">
                      {search
                        ? "اتصالی پیدا نشد."
                        : "هنوز اتصالی ثبت نشده است."}
                    </TableEmptyCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
      <Drawer
        open={adding}
        onOpenChange={(open) => {
          if (!busy) setAdding(open);
        }}
        title="افزودن اتصال"

      >
        {adding && (
          <DrawerForm onSubmit={create}>
            <div>
              <ControlLabel htmlFor="connection-provider" icon={fieldIcon("سیستم")}>سیستم</ControlLabel>
              <SelectField
                id="connection-provider"
                value={provider}
                disabled={busy}
                onChange={(e) =>
                  setProvider(e.target.value as IntegrationProvider)
                }
              >
                <SelectOption value="sepidar">سپیدار</SelectOption>
                <SelectOption value="bank_direct">حساب بانکی</SelectOption>
              </SelectField>
            </div>
            <div>
              <ControlLabel htmlFor="connection-name" icon={fieldIcon("نام اتصال")}>نام اتصال</ControlLabel>
              <Input
                id="connection-name"
                name="name"
                required
                disabled={busy}
              />
            </div>
            {provider === "sepidar" ? (
              <div>
                <ControlLabel htmlFor="server-url" icon={fieldIcon("آدرس سرویس سپیدار")}>آدرس سرویس سپیدار</ControlLabel>
                <Input
                  id="server-url"
                  name="server_url"
                  type="url"
                  dir="ltr"
                  required
                  disabled={busy}
                />
              </div>
            ) : (
              <>
                <div>
                  <ControlLabel htmlFor="bank-name" icon={fieldIcon("نام بانک")}>نام بانک</ControlLabel>
                  <Input
                    id="bank-name"
                    name="bank_name"
                    required
                    disabled={busy}
                  />
                </div>
                <div>
                  <ControlLabel htmlFor="account-number" icon={fieldIcon("شماره حساب")}>شماره حساب</ControlLabel>
                  <Input
                    id="account-number"
                    name="account_number"
                    dir="ltr"
                    required
                    disabled={busy}
                  />
                </div>
              </>
            )}
            <div>
              <ControlLabel htmlFor="connection-token" icon={fieldIcon("کلید دسترسی")}>کلید دسترسی</ControlLabel>
              <Input
                id="connection-token"
                name="token"
                type="password"
                autoComplete="off"
                required
                disabled={busy}
              />
            </div>
            {formError && (
              <FormMessage>{formError}</FormMessage>
            )}
            <DrawerFooter>
              <Button type="submit" disabled={busy}>
                {busy ? "در حال ثبت…" : "ثبت اتصال"}
              </Button>
            </DrawerFooter>
          </DrawerForm>
        )}
      </Drawer>
      {current && (
        <ConnectionDetail
          key={current.id}
          companyId={company.id}
          connection={current}
          manage={manage}
          onClose={() => setSelected(null)}
          onReload={load}
        />
      )}
    </div>
  );
}
export function ConnectionDetail({
  companyId,
  connection,
  manage,
  onClose,
  onReload,
  request = api,
}: {
  request?: typeof api;
  companyId: string;
  connection: IntegrationConnection;
  manage: boolean;
  onClose: () => void;
  onReload: () => Promise<void>;
}) {
  const [jobs, setJobs] = useState<IntegrationSyncJob[]>([]),
    [loading, setLoading] = useState(true),
    [historyError, setHistoryError] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [removing, setRemoving] = useState(false),
    [key, setKey] = useState<AgentKeyResponse | null>(null);
  const path = `/companies/${companyId}/integrations/${connection.id}`;
  const history = useCallback(async () => {
    setLoading(true);
    setHistoryError(false);
    try {
      setJobs(await request<IntegrationSyncJob[]>(`${path}/jobs`));
    } catch {
      setHistoryError(true);
    } finally {
      setLoading(false);
    }
  }, [path, request]);
  useEffect(() => {
    void history();
  }, [history, connection.last_sync_at]);
  const jobsPending = jobs.some(
    (job) => job.status === "queued" || job.status === "running",
  );
  useEffect(() => {
    if (!jobsPending) return;
    const timer = setInterval(() => {
      void history();
      void onReload();
    }, 4000);
    return () => clearInterval(timer);
  }, [jobsPending, history, onReload]);
  async function action(kind: "test" | "sync" | "agent-key" | "delete") {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (kind === "delete") {
        await request(path, { method: "DELETE" });
        setRemoving(false);
        onClose();
      } else if (kind === "test") {
        const result = await request<ConnectionTestResult>(`${path}/test`, {
          method: "POST",
        });
        if (result.success) setMessage(result.message_fa);
        else setError(result.message_fa);
      } else if (kind === "agent-key")
        setKey(
          await request<AgentKeyResponse>(`${path}/agent-key`, { method: "POST" }),
        );
      else {
        await request(`${path}/sync`, {
          method: "POST",
          body: JSON.stringify({ sync_type: "manual" }),
        });
        setMessage("درخواست دریافت اطلاعات ثبت شد.");
      }
      await onReload();
      if (kind !== "delete") await history();
    } catch (e) {
      setRemoving(false);
      setError(e instanceof Error ? e.message : "عملیات انجام نشد.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Drawer
        open
        onOpenChange={(open) => {
          if (!open && !busy) onClose();
        }}
        title={connection.name}
        description={`${providers[connection.provider]} · ${statuses[connection.status] ?? "نامشخص"}`}
      >
        <DetailGroup>
          <DetailField icon={fieldIcon("آخرین دریافت")} label="آخرین دریافت">
              {connection.last_sync_at
                ? toJalaliDate(connection.last_sync_at)
                : "هنوز دریافت نشده"}
            </DetailField>
          <DetailField icon={fieldIcon("رکوردهای آخرین دریافت")} label="رکوردهای آخرین دریافت">{number.format(connection.last_sync_record_count)}</DetailField>
          <DetailField icon={fieldIcon("فاصله دریافت خودکار")} label="فاصله دریافت خودکار">{number.format(connection.sync_interval_minutes)} دقیقه</DetailField>
        </DetailGroup>
        {connection.last_error_message && (
          <ErrorState variant="inline" role="note">{connection.last_error_message}</ErrorState>
        )}
        {error && (
          <FormMessage>{error}</FormMessage>
        )}
        {message && (
          <FormMessage variant="success">
            {message}
          </FormMessage>
        )}
        {manage && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void action("test")}
            >
              <Wifi className="size-4" />
              آزمایش اتصال
            </Button>
            <Button
              disabled={busy || connection.status === "syncing" || jobsPending}
              onClick={() => void action("sync")}
            >
              <RefreshCw className="size-4" />
              دریافت اطلاعات
            </Button>
          </div>
        )}
        <section>
          <h3 className="mb-4 text-sm font-medium">تاریخچه دریافت</h3>
          {historyError ? (
            <ErrorState onRetry={() => void history()} variant="compact">
              <ErrorState variant="inline">تاریخچه دریافت نشد.</ErrorState>

            </ErrorState>
          ) : loading ? (
            <Skeleton className="h-24 w-full" />
          ) : jobs.length ? (
            jobs.map((job) => (
              <article key={job.id} className="mb-5 grid min-w-0 gap-4 border-b border-border/70 pb-5 last:border-0">
                <DetailGroup>
                  <DetailField icon={fieldIcon("وضعیت")} label="وضعیت"><StatusBadge status={job.status} label={jobLabels[job.status]} /></DetailField>
                  <DetailField icon={fieldIcon("تاریخ دریافت")} label="تاریخ دریافت">{toJalaliDate(job.started_at ?? job.created_at)}</DetailField>
                  <DetailField icon={fieldIcon("رکورد دریافت‌شده")} label="رکورد دریافت‌شده">{number.format(job.records_imported)}</DetailField>
                  <DetailField icon={fieldIcon("رکورد ردشده")} label="رکورد ردشده">{number.format(job.records_rejected)}</DetailField>
                </DetailGroup>
                {job.error_message && (
                  <ErrorState variant="inline" role="note">{job.error_message}</ErrorState>
                )}
              </article>
            ))
          ) : (
            <EmptyState variant="inline">هنوز اطلاعاتی دریافت نشده است.</EmptyState>
          )}
        </section>
        {manage && connection.provider !== "bank_direct" && (
          <section>
            <h3 className="mb-4 text-sm font-medium">همگام‌ساز محلی</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              برای اتصال نرم‌افزار نصب‌شده در شرکت، این کلید را در اختیار مسئول
              راه‌اندازی قرار دهید.
            </p>
            {key ? (
              <>
                <ControlLabel htmlFor="sync-agent-key" icon={fieldIcon("کلید همگام‌ساز")}>کلید همگام‌ساز</ControlLabel>
                <Input
                  id="sync-agent-key"
                  aria-label="کلید همگام‌ساز"
                  type="password"
                  readOnly
                  dir="ltr"
                  value={key.agent_key}
                />
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(key.agent_key);
                      setMessage("کلید کپی شد.");
                    } catch {
                      setError("کپی کلید انجام نشد.");
                    }
                  }}
                >
                  <Copy className="size-4" />
                  کپی کلید
                </Button>
                <p className="text-sm leading-relaxed text-muted-foreground">{key.instructions_fa}</p>
              </>
            ) : (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void action("agent-key")}
              >
                <Key className="size-4" />
                دریافت کلید همگام‌ساز
              </Button>
            )}
          </section>
        )}
        <DrawerFooter>
          {busy && (
            <LoadingState  variant="inline">
              در حال انجام…
            </LoadingState>
          )}
          {manage && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setRemoving(true)}
            >
              حذف اتصال
            </Button>
          )}
        </DrawerFooter>
      </Drawer>
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title="حذف اتصال"
        description="دریافت بعدی اطلاعات از این اتصال متوقف می‌شود."
        busy={busy}
        onConfirm={() => void action("delete")}
      />
    </>
  );
}
