"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Plus,
  Search,
  RefreshCw,
  Wifi,
  Key,
  Copy,
} from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Drawer, DrawerFooter, DrawerDetails, DrawerForm } from "@/components/ui/drawer";
import { api } from "@/lib/product-api";
import type {
  Company,
  IntegrationConnection,
  IntegrationProvider,
  IntegrationSyncJob,
  ConnectionTestResult,
  AgentKeyResponse,
} from "@/lib/product-types";
import { SelectField, SelectOption } from "./select-field";
import { SettingsConfirm } from "./settings-confirm";
import { toJalaliDate } from "@/lib/date-utils";
import page from "./cashflow-overview.module.css";
import table from "./receivables-customers.module.css";
import styles from "./reports-workspace.module.css";
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
            <div className={table.search}>
              <Search className="size-4" />
              <Input
                aria-label="جستجوی اتصال‌ها"
                placeholder="نام اتصال یا سیستم"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
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
          <div className={table.empty} role="alert">
            <p>{error}</p>
            <Button variant="outline" onClick={() => void load(true)}>
              تلاش دوباره
            </Button>
          </div>
        ) : loading ? (
          <div className="p-6 space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <div className={table.scroll}>
            <table className={table.table}>
              <thead>
                <tr>
                  <th scope="col">نام اتصال</th>
                  <th scope="col">سیستم</th>
                  <th scope="col">وضعیت</th>
                  <th scope="col">آخرین دریافت</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((connection) => (
                  <tr key={connection.id}>
                    <td>
                      <Button
                        variant="ghost"
                        className={table.customer}
                        onClick={() => setSelected(connection.id)}
                      >
                        {connection.name}
                      </Button>
                    </td>
                    <td>{providers[connection.provider]}</td>
                    <td>{statuses[connection.status] ?? "نامشخص"}</td>
                    <td>
                      {connection.last_sync_at
                        ? toJalaliDate(connection.last_sync_at)
                        : "هنوز دریافت نشده"}
                    </td>
                  </tr>
                ))}
                {!visible.length && (
                  <tr>
                    <td colSpan={4} className={table.empty}>
                      {search
                        ? "اتصالی پیدا نشد."
                        : "هنوز اتصالی ثبت نشده است."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <Drawer
        open={adding}
        onOpenChange={(open) => {
          if (!busy) setAdding(open);
        }}
        title="افزودن اتصال"
        description="اطلاعات اتصال را از مسئول نرم‌افزار حسابداری یا سرویس بانکی دریافت کنید."
      >
        {adding && (
          <DrawerForm onSubmit={create}>
            <div>
              <label htmlFor="connection-provider">سیستم</label>
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
              <label htmlFor="connection-name">نام اتصال</label>
              <Input
                id="connection-name"
                name="name"
                required
                disabled={busy}
              />
            </div>
            {provider === "sepidar" ? (
              <div>
                <label htmlFor="server-url">آدرس سرویس سپیدار</label>
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
                  <label htmlFor="bank-name">نام بانک</label>
                  <Input
                    id="bank-name"
                    name="bank_name"
                    required
                    disabled={busy}
                  />
                </div>
                <div>
                  <label htmlFor="account-number">شماره حساب</label>
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
              <label htmlFor="connection-token">کلید دسترسی</label>
              <Input
                id="connection-token"
                name="token"
                type="password"
                autoComplete="off"
                required
                disabled={busy}
              />
            </div>
            <p className={styles.caption}>
              پس از ثبت، اتصال را آزمایش کنید و دریافت اطلاعات را شروع کنید.
            </p>
            {formError && (
              <p className={styles.error} role="alert">
                {formError}
              </p>
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
function ConnectionDetail({
  companyId,
  connection,
  manage,
  onClose,
  onReload,
}: {
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
      setJobs(await api<IntegrationSyncJob[]>(`${path}/jobs`));
    } catch {
      setHistoryError(true);
    } finally {
      setLoading(false);
    }
  }, [path]);
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
        await api(path, { method: "DELETE" });
        setRemoving(false);
        onClose();
      } else if (kind === "test") {
        const result = await api<ConnectionTestResult>(`${path}/test`, {
          method: "POST",
        });
        if (result.success) setMessage(result.message_fa);
        else setError(result.message_fa);
      } else if (kind === "agent-key")
        setKey(
          await api<AgentKeyResponse>(`${path}/agent-key`, { method: "POST" }),
        );
      else {
        await api(`${path}/sync`, {
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
        <DrawerDetails>
          <div>
            <dt>آخرین دریافت</dt>
            <dd>
              {connection.last_sync_at
                ? toJalaliDate(connection.last_sync_at)
                : "هنوز دریافت نشده"}
            </dd>
          </div>
          <div>
            <dt>رکوردهای آخرین دریافت</dt>
            <dd>{number.format(connection.last_sync_record_count)}</dd>
          </div>
          <div>
            <dt>فاصله دریافت خودکار</dt>
            <dd>{number.format(connection.sync_interval_minutes)} دقیقه</dd>
          </div>
        </DrawerDetails>
        {connection.last_error_message && (
          <p className={styles.error}>{connection.last_error_message}</p>
        )}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className={styles.note} role="status">
            {message}
          </p>
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
          <h3 className={styles.subtitle}>تاریخچه دریافت</h3>
          {historyError ? (
            <div role="alert">
              <p className={styles.error}>تاریخچه دریافت نشد.</p>
              <Button variant="outline" onClick={() => void history()}>
                تلاش دوباره
              </Button>
            </div>
          ) : loading ? (
            <Skeleton className="h-24 w-full" />
          ) : jobs.length ? (
            jobs.map((job) => (
              <article key={job.id} className={`${table.invoice} mb-4`}>
                <div className={table.invoiceHeading}>
                  <h4>{jobLabels[job.status]}</h4>
                  <span>{toJalaliDate(job.started_at ?? job.created_at)}</span>
                </div>
                <p className={styles.caption}>
                  {number.format(job.records_imported)} رکورد دریافت‌شده ·{" "}
                  {number.format(job.records_rejected)} رکورد ردشده
                </p>
                {job.error_message && (
                  <p className={styles.error}>{job.error_message}</p>
                )}
              </article>
            ))
          ) : (
            <p className={styles.caption}>هنوز اطلاعاتی دریافت نشده است.</p>
          )}
        </section>
        {manage && connection.provider !== "bank_direct" && (
          <section>
            <h3 className={styles.subtitle}>همگام‌ساز محلی</h3>
            <p className={styles.caption}>
              برای اتصال نرم‌افزار نصب‌شده در شرکت، این کلید را در اختیار مسئول
              راه‌اندازی قرار دهید.
            </p>
            {key ? (
              <>
                <Input
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
                <p className={styles.caption}>{key.instructions_fa}</p>
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
            <p className={styles.caption} role="status">
              در حال انجام…
            </p>
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
      <SettingsConfirm
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
