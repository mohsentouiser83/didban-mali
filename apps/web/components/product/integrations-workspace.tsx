"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileCheck2,
  FileSpreadsheet,
  HardDrive,
  Landmark,
  Layers,
  Network,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Wifi,
  WifiOff,
} from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader, StatusChip, toPersianDigits } from "@/components/ui/financial";
import { api } from "@/lib/product-api";
import type {
  Company,
  ConnectionStatus,
  ConnectionTestResult,
  IntegrationConnection,
  IntegrationProvider,
  IntegrationSyncJob,
} from "@/lib/product-types";

interface IntegrationsWorkspaceProps {
  company: Company;
}

const statusMap: Record<ConnectionStatus, { label: string; status: string }> = {
  connected: { label: "متصل", status: "ready" },
  syncing: { label: "در حال همگام‌سازی", status: "processing" },
  reauth_required: { label: "نیازمند احراز هویت مجدد", status: "needs_review" },
  error: { label: "دارای خطا", status: "failed" },
  inactive: { label: "غیرفعال", status: "dismissed" },
  disconnected: { label: "قطع‌شده", status: "dismissed" },
};

export function IntegrationsWorkspace({ company }: IntegrationsWorkspaceProps) {
  const [connections, setConnections] = useState<IntegrationConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [selectedConn, setSelectedConn] = useState<IntegrationConnection | null>(null);
  const [syncJobs, setSyncJobs] = useState<IntegrationSyncJob[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [newConnOpen, setNewConnOpen] = useState(false);

  // New connection form
  const [provider, setProvider] = useState<IntegrationProvider>("sepidar");
  const [connName, setConnName] = useState("");
  const [serverUrl, setServerUrl] = useState("http://sepidar.local:8080/api/v1");
  const [apiToken, setApiToken] = useState("");
  const [accountNumber, setAccountNumber] = useState("410088992211");
  const [bankName, setBankName] = useState("بانک ملت");

  const loadConnections = async () => {
    try {
      setLoading(true);
      const data = await api<IntegrationConnection[]>(`/companies/${company.id}/integrations`);
      setConnections(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Failed to load connections:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConnections();
  }, [company.id]);

  const handleTestConnection = async (connId: string) => {
    setTestingId(connId);
    try {
      const res = await api<ConnectionTestResult>(`/companies/${company.id}/integrations/${connId}/test`, {
        method: "POST",
      });
      await loadConnections();
      alert(res.message_fa);
    } catch (e: any) {
      alert(e.message || "خطا در تست اتصال");
    } finally {
      setTestingId(null);
    }
  };

  const handleTriggerSync = async (connId: string) => {
    setSyncingId(connId);
    try {
      await api<IntegrationSyncJob>(`/companies/${company.id}/integrations/${connId}/sync`, {
        method: "POST",
        body: JSON.stringify({ sync_type: "manual" }),
      });
      await loadConnections();
    } catch (e: any) {
      alert(e.message || "خطا در تحریک همگام‌سازی");
    } finally {
      setSyncingId(null);
    }
  };

  const handleOpenHistory = async (conn: IntegrationConnection) => {
    setSelectedConn(conn);
    setHistoryOpen(true);
    try {
      const jobs = await api<IntegrationSyncJob[]>(`/companies/${company.id}/integrations/${conn.id}/jobs`);
      setSyncJobs(jobs);
    } catch (e) {
      console.error("Failed to load sync jobs:", e);
    }
  };

  const handleCreateConnection = async () => {
    try {
      const config = provider === "sepidar" ? { server_url: serverUrl } : { bank_name: bankName, account_number: accountNumber };
      const credentials = provider === "sepidar" ? { api_token: apiToken } : { api_key: apiToken };
      await api(`/companies/${company.id}/integrations`, {
        method: "POST",
        body: JSON.stringify({
          provider,
          name: connName || (provider === "sepidar" ? "سپیدار سیستم مرکزی" : `حساب شرکتی ${bankName}`),
          config,
          credentials,
          sync_interval_minutes: 1440,
        }),
      });
      setNewConnOpen(false);
      setConnName("");
      setApiToken("");
      await loadConnections();
    } catch (e: any) {
      alert(e.message || "خطا در ثبت اتصال جدید");
    }
  };

  const handleDeleteConnection = async (connId: string) => {
    if (!confirm("آیا از حذف این اتصال اطمینان دارید؟")) return;
    try {
      await api(`/companies/${company.id}/integrations/${connId}`, {
        method: "DELETE",
      });
      await loadConnections();
    } catch (e: any) {
      alert(e.message || "خطا در حذف اتصال");
    }
  };

  return (
    <div dir="rtl" className="space-y-6">
      <PageHeader
        title="مرکز اتصال‌ها و یکپارچه‌سازی مالی"
        description="زیرساخت عملیاتی همگام‌سازی خودکار داده‌های مالی از نرم‌افزارهای حسابداری و سامانه‌های بانکی"
        badge={
          <span className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
            <Network className="h-3.5 w-3.5" />
            اتصال کانونیکال
          </span>
        }
        primaryAction={
          <Button size="sm" onClick={() => setNewConnOpen(true)} className="text-xs font-bold gap-1.5 h-8">
            <Plus className="h-3.5 w-3.5" />
            افزودن اتصال جدید
          </Button>
        }
        secondaryActions={
          <Button asChild size="sm" variant="outline" className="text-xs gap-1.5 h-8">
            <Link href={`/companies/${company.id}/data`}>
              <FileSpreadsheet className="h-3.5 w-3.5" />
              بارگذاری دستی اکسل (پشتیبان)
            </Link>
          </Button>
        }
      />

      {/* Observability Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3.5 shadow-xs">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
            <CheckCircle2 className="h-4 w-4" />
          </div>
          <div>
            <div className="text-base font-extrabold font-mono text-foreground">
              {toPersianDigits(connections.filter((c) => c.status === "connected").length)} اتصال
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">اتصال‌های فعال و پایدار</div>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3.5 shadow-xs">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
            <RefreshCw className="h-4 w-4" />
          </div>
          <div>
            <div className="text-base font-extrabold font-mono text-foreground">
              {toPersianDigits(
                connections.reduce((acc, c) => acc + (c.last_sync_record_count || 0), 0)
              )}{" "}
              رکورد
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">دریافت خودکار در ۲۴ ساعت گذشته</div>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3.5 shadow-xs">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shrink-0">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div>
            <div className="text-base font-extrabold font-mono text-foreground">تکرارناپذیر (Idempotent)</div>
            <div className="text-xs text-muted-foreground mt-0.5">ردیابی دقیق شجره داده تا منبع</div>
          </div>
        </div>
      </div>

      {/* Connections Grid */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-foreground">سیستم‌های مالی و بانکی متصل</h3>

        {loading ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-xs text-muted-foreground">
            در حال بارگذاری وضعیت اتصال‌ها...
          </div>
        ) : connections.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center space-y-3">
            <HardDrive className="h-8 w-8 text-muted-foreground mx-auto" />
            <div className="text-sm font-bold text-foreground">هنوز اتصالی برقرار نشده است</div>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              جهت حذف فرآیند بارگذاری دستی اکسل، اتصال به نرم‌افزار حسابداری (سپیدار) یا گردش حساب‌های بانکی را فعال نمایید.
            </p>
            <Button size="sm" onClick={() => setNewConnOpen(true)} className="text-xs gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              ایجاد اولین اتصال
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {connections.map((conn) => {
              const statusCfg = statusMap[conn.status as ConnectionStatus] || {
                label: conn.status,
                tone: "neutral",
              };
              const isSepidar = conn.provider === "sepidar";

              return (
                <Card key={conn.id} className="border-border bg-card shadow-xs flex flex-col justify-between">
                  <CardHeader className="pb-3 border-b border-border/50">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-foreground shrink-0">
                          {isSepidar ? <FileCheck2 className="h-4 w-4" /> : <Landmark className="h-4 w-4" />}
                        </div>
                        <div>
                          <CardTitle className="text-sm font-bold text-foreground">{conn.name}</CardTitle>
                          <CardDescription className="text-xs text-muted-foreground">
                            {isSepidar ? "نرم‌افزار حسابداری سپیدار سیستم" : "گردش حساب بانکی شرکتی"}
                          </CardDescription>
                        </div>
                      </div>
                      <StatusChip status={statusCfg.status} label={statusCfg.label} />
                    </div>
                  </CardHeader>

                  <CardContent className="pt-3 pb-3 space-y-2.5 text-xs text-muted-foreground">
                    {conn.last_error_message && (
                      <Alert variant="destructive" className="py-2 text-[11px]">
                        <AlertTriangle className="h-3.5 w-3.5 ml-1" />
                        <span>{conn.last_error_message}</span>
                      </Alert>
                    )}

                    <div className="flex items-center justify-between border-b border-border/40 pb-2">
                      <span>آخرین همگام‌سازی:</span>
                      <strong className="text-foreground font-mono">
                        {conn.last_sync_at ? new Date(conn.last_sync_at).toLocaleTimeString("fa-IR") : "—"}
                      </strong>
                    </div>

                    <div className="flex items-center justify-between border-b border-border/40 pb-2">
                      <span>رکوردهای همگام‌شده دوره اخیر:</span>
                      <strong className="text-foreground font-mono">
                        {toPersianDigits(conn.last_sync_record_count)} سطر
                      </strong>
                    </div>

                    <div className="flex items-center justify-between">
                      <span>دوره تکرار زمان‌بندی:</span>
                      <strong className="text-foreground">
                        هر {toPersianDigits(conn.sync_interval_minutes / 60)} ساعت
                      </strong>
                    </div>
                  </CardContent>

                  <CardFooter className="pt-2 border-t border-border/50 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 text-xs gap-1.5"
                        disabled={testingId === conn.id}
                        onClick={() => handleTestConnection(conn.id)}
                      >
                        <Wifi className="h-3 w-3" />
                        {testingId === conn.id ? "در حال تست..." : "تست اتصال"}
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1.5"
                        disabled={syncingId === conn.id}
                        onClick={() => handleTriggerSync(conn.id)}
                      >
                        <RefreshCw className={`h-3 w-3 ${syncingId === conn.id ? "animate-spin" : ""}`} />
                        {syncingId === conn.id ? "در حال سینک..." : "همگام‌سازی فوری"}
                      </Button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => handleOpenHistory(conn)}
                      >
                        تاریخچه Sync
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:bg-destructive/10"
                        onClick={() => handleDeleteConnection(conn.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Sync History Dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-2xl font-sans" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground">
              تاریخچه همگام‌سازی — {selectedConn?.name}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              سوابق اجرای چرخه‌های دریافت خودکار داده و گزارش موارد نادیده‌گرفته‌شده تکراری
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[360px] overflow-y-auto">
            {syncJobs.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                هیچ سابقه‌ای برای این اتصال ثبت نشده است.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">زمان شروع</TableHead>
                    <TableHead className="text-xs">نوع اجرا</TableHead>
                    <TableHead className="text-xs">وضعیت</TableHead>
                    <TableHead className="text-xs text-left">دریافتی / واردشده</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {syncJobs.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell className="text-xs font-mono">
                        {job.started_at ? new Date(job.started_at).toLocaleTimeString("fa-IR") : "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {job.sync_type === "scheduled" ? "خودکار شبانه" : "دستی"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={job.status === "completed" ? "success" : "danger"}
                          className="text-[10px]"
                        >
                          {job.status === "completed" ? "موفق" : "ناموفق"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-mono text-left">
                        {toPersianDigits(job.records_imported)} از {toPersianDigits(job.records_received)} سطر
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* New Connection Dialog */}
      <Dialog open={newConnOpen} onOpenChange={setNewConnOpen}>
        <DialogContent className="max-w-md font-sans" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground">افزودن اتصال مالی جدید</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              انتخاب سامانه مبدا جهت همگام‌سازی پایدار با پایپ‌لاین کانونیکال دیدبان
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-2">
            <div>
              <label className="text-xs font-bold text-foreground mb-1 block">نوع ارائه‌دهنده:</label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value as IntegrationProvider)}
                className="w-full h-8 text-xs rounded-md border border-input bg-background px-2.5"
              >
                <option value="sepidar">سپیدار سیستم (Sepidar V1)</option>
                <option value="bank_direct">صورتحساب مستقیم بانکی (Bank Feed V1)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-foreground mb-1 block">نام نمایشی اتصال:</label>
              <Input
                placeholder={provider === "sepidar" ? "سپیدار سیستم دفتر مرکزی" : "حساب جاری بانک ملت"}
                value={connName}
                onChange={(e) => setConnName(e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            {provider === "sepidar" ? (
              <>
                <div>
                  <label className="text-xs font-bold text-foreground mb-1 block">آدرس وب‌سرویس / سرور سپیدار:</label>
                  <Input
                    value={serverUrl}
                    onChange={(e) => setServerUrl(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-foreground mb-1 block">توکن دسترسی (API Token):</label>
                  <Input
                    type="password"
                    placeholder="••••••••••••••••"
                    value={apiToken}
                    onChange={(e) => setApiToken(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="text-xs font-bold text-foreground mb-1 block">نام بانک:</label>
                  <Input
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-foreground mb-1 block">شماره حساب شرکتی:</label>
                  <Input
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-foreground mb-1 block">کلید دسترسی وب‌سرویس استعلام:</label>
                  <Input
                    type="password"
                    placeholder="••••••••••••••••"
                    value={apiToken}
                    onChange={(e) => setApiToken(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setNewConnOpen(false)} className="text-xs">
              انصراف
            </Button>
            <Button size="sm" onClick={handleCreateConnection} className="text-xs font-bold">
              ثبت و فعال‌سازی اتصال
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
