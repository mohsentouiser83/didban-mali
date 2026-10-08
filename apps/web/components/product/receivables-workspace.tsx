"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Column,
  FinancialDataTable,
  MoneyDisplay,
  PageHeader,
  RiskBadge,
  toPersianDigits,
} from "@/components/ui/financial";
import { toJalaliDate } from "@/lib/date-utils";
import { api } from "@/lib/product-api";
import type {
  Company,
  CustomerReceivableItem,
  CustomersReceivablesResponse,
  InvoicesReceivablesResponse,
  ReceivableInvoiceItem,
  ReceivablesBucketKey,
  ReceivablesRiskLevel,
  ReceivablesSummaryResponse,
} from "@/lib/product-types";
import { SelectField, SelectOption } from "./select-field";
import styles from "./receivables.module.css";

const BUCKET_LABELS: Record<ReceivablesBucketKey, string> = {
  not_due: "هنوز سررسید نشده",
  "1_30": "۱ تا ۳۰ روز",
  "31_60": "۳۱ تا ۶۰ روز",
  "61_90": "۶۱ تا ۹۰ روز",
  "90_plus": "بیش از ۹۰ روز",
  due_date_missing: "سررسید نامشخص",
};
const RISK_LABELS: Record<ReceivablesRiskLevel, string> = {
  critical: "بحرانی",
  high: "بالا",
  medium: "متوسط",
  low: "کم",
};
const RISK_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
const normalize = (value: string) =>
  value
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .trim()
    .toLocaleLowerCase();
const percent = (value: number) =>
  toPersianDigits(value.toFixed(1).replace(".", "٫")) + "٪";

export function ReceivablesWorkspace({ company }: { company: Company }) {
  const [summary, setSummary] = useState<ReceivablesSummaryResponse | null>(
    null,
  );
  const [customers, setCustomers] = useState<CustomerReceivableItem[]>([]);
  const [invoices, setInvoices] = useState<ReceivableInvoiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const request = useRef(0);
  const [bucketFilter, setBucketFilter] = useState<
    "all" | ReceivablesBucketKey
  >("all");
  const [riskFilter, setRiskFilter] = useState<"all" | ReceivablesRiskLevel>(
    "all",
  );
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("customers");
  const [customerFilter, setCustomerFilter] = useState<string | null>(null);
  const [sort, setSort] = useState("priority");
  const [page, setPage] = useState({ key: "", index: 0 });
  const [selected, setSelected] = useState<CustomerReceivableItem | null>(null);
  const [reminder, setReminder] = useState<CustomerReceivableItem | null>(null);
  const [tone, setTone] = useState("friendly");
  const [draft, setDraft] = useState("");
  const [copying, setCopying] = useState(false);

  const loadData = useCallback(
    async (reset = false) => {
      const id = ++request.current;
      setLoading(true);
      if (reset) {
        setSummary(null);
        setCustomers([]);
        setInvoices([]);
        setErrors([]);
      }
      const results = await Promise.allSettled([
        api<ReceivablesSummaryResponse>(
          `/companies/${company.id}/receivables/summary`,
        ),
        api<CustomersReceivablesResponse>(
          `/companies/${company.id}/receivables/customers`,
        ),
        api<InvoicesReceivablesResponse>(
          `/companies/${company.id}/receivables/invoices`,
        ),
      ]);
      if (id !== request.current) return;
      const [sum, cust, inv] = results;
      setSummary(sum.status === "fulfilled" ? sum.value : null);
      setCustomers(cust.status === "fulfilled" ? cust.value.items : []);
      setInvoices(inv.status === "fulfilled" ? inv.value.items : []);
      setErrors(
        results.flatMap((result, index) =>
          result.status === "rejected"
            ? [["خلاصه مطالبات", "فهرست مشتریان", "فهرست فاکتورها"][index]]
            : [],
        ),
      );
      setLoading(false);
    },
    [company.id],
  );
  useEffect(() => {
    setBucketFilter("all");
    setRiskFilter("all");
    setSearch("");
    setSelected(null);
    setCustomerFilter(null);
    setReminder(null);
    void loadData(true);
    return () => {
      request.current++;
    };
  }, [loadData]);

  const filteredCustomers = useMemo(
    () =>
      customers.filter(
        (c) =>
          (riskFilter === "all" || c.risk_level === riskFilter) &&
          (bucketFilter === "all" || Number(c.buckets[bucketFilter]) > 0) &&
          (!normalize(search) ||
            normalize(c.name + " " + (c.national_id ?? "")).includes(
              normalize(search),
            )),
      ).sort((a, b) => sort === "name" ? a.name.localeCompare(b.name, "fa")
        : sort === "delay" ? b.avg_delay_days - a.avg_delay_days
        : sort === "amount" || sort === "amount_asc" ? (Number(bucketFilter === "all" ? b.total_outstanding_irr : b.buckets[bucketFilter]) - Number(bucketFilter === "all" ? a.total_outstanding_irr : a.buckets[bucketFilter])) * (sort === "amount_asc" ? -1 : 1)
        : b.risk_score - a.risk_score || Number(b.overdue_amount_irr) - Number(a.overdue_amount_irr)),
    [customers, bucketFilter, riskFilter, search, sort],
  );
  const filteredInvoices = useMemo(
    () =>
      invoices.filter(
        (inv) =>
          (!customerFilter || inv.counterparty_id === customerFilter) &&
          (bucketFilter === "all" || inv.bucket_key === bucketFilter) &&
          (!normalize(search) ||
            normalize(inv.invoice_no + " " + inv.counterparty_name).includes(
              normalize(search),
            )),
      ).sort((a, b) => sort === "name" ? a.counterparty_name.localeCompare(b.counterparty_name, "fa")
        : sort === "amount" || sort === "amount_asc" ? (Number(b.remaining_amount_irr) - Number(a.remaining_amount_irr)) * (sort === "amount_asc" ? -1 : 1)
        : b.delay_days - a.delay_days || Number(b.remaining_amount_irr) - Number(a.remaining_amount_irr)),
    [invoices, bucketFilter, search, sort, customerFilter],
  );
  const priorities = useMemo(
    () =>
      [...customers]
        .filter((c) => Number(c.overdue_amount_irr) > 0)
        .sort(
          (a, b) =>
            RISK_ORDER[a.risk_level] - RISK_ORDER[b.risk_level] ||
            Number(b.overdue_amount_irr) - Number(a.overdue_amount_irr),
        )
        .slice(0, 3),
    [customers],
  );
  const resetFilters = () => {
    setBucketFilter("all");
    setRiskFilter("all");
    setSearch("");
    setCustomerFilter(null);
  };
  const hasFilters =
    bucketFilter !== "all" ||
    search !== "" ||
    (tab === "customers" && riskFilter !== "all") || customerFilter !== null;
  const openReminder = (customer: CustomerReceivableItem) => {
    setSelected(null);
    setTone("friendly");
    setReminder(customer);
  };
  useEffect(() => {
    if (!reminder) return;
    const amount =
      Number(reminder.overdue_amount_irr) > 0
        ? reminder.overdue_amount_irr
        : reminder.total_outstanding_irr;
    const balance = Number(amount).toLocaleString("fa-IR");
    const intro =
      tone === "friendly"
        ? "با سلام و احترام،"
        : tone === "formal"
          ? "موضوع: پیگیری تسویه مانده حساب"
          : "موضوع: درخواست تعیین زمان تسویه";
    const requestText =
      tone === "urgent"
        ? "خواهشمند است در اولین فرصت، زمان قطعی تسویه را به واحد مالی اعلام فرمایید."
        : tone === "formal"
          ? "خواهشمند است نسبت به بررسی مانده حساب و اعلام برنامه تسویه اقدام فرمایید."
          : "لطفاً مانده حساب را بررسی و زمان پرداخت را به ما اعلام کنید.";
    setDraft(
      `${intro}\nمسئول مالی محترم ${reminder.name}\nبر اساس سوابق فعلی ${company.legal_name}، مبلغ ${balance} ریال از مانده حساب شما ${Number(reminder.overdue_amount_irr) > 0 ? "سررسید گذشته است" : "در انتظار تسویه است"}.\n${requestText}\nدر صورت پرداخت، لطفاً رسید را برای تطبیق ارسال کنید.\nبا سپاس، واحد مالی ${company.legal_name}`,
    );
  }, [reminder, tone, company.legal_name]);
  const copyDraft = async () => {
    setCopying(true);
    try {
      await navigator.clipboard.writeText(draft);
      toast.success("متن یادآوری کپی شد.");
    } catch {
      toast.error("کپی انجام نشد؛ متن را انتخاب و به‌صورت دستی کپی کنید.");
    } finally {
      setCopying(false);
    }
  };

  const tableKey = `${company.id}:${tab}:${bucketFilter}:${riskFilter}:${search}:${sort}:${customerFilter}`;
  const resultCount = tab === "customers" ? filteredCustomers.length : filteredInvoices.length;
  const pageCount = Math.max(1, Math.ceil(resultCount / 20));
  const pageIndex = Math.min(page.key === tableKey ? page.index : 0, pageCount - 1);
  const bucketTotal = bucketFilter === "all" ? null : (tab === "customers" ? filteredCustomers.reduce((sum, customer) => sum + Number(customer.buckets[bucketFilter] ?? 0), 0) : filteredInvoices.reduce((sum, invoice) => sum + Number(invoice.remaining_amount_irr), 0));
  const openCustomerInvoices = (customer: CustomerReceivableItem) => {
    resetFilters();
    setCustomerFilter(customer.counterparty_id);
    setTab("invoices");
    setSelected(null);
    document.getElementById("receivable-cases")?.scrollIntoView({ block: "start", behavior: "instant" });
  };

  const customerColumns: Column<CustomerReceivableItem>[] = [
    {
      key: "name",
      header: "مشتری",
      render: (c) => (
        <Button
          variant="surface"
          size="auto"
          motion="none"
          aria-label={`جزئیات مطالبات ${c.name}`}
          className={styles.customerName}
          onClick={() => setSelected(c)}
        >
          <strong>{c.name}</strong>
          <span>
            {c.national_id
              ? `شناسه ${toPersianDigits(c.national_id)}`
              : "شناسه ثبت نشده"}
          </span>
        </Button>
      ),
    },
    {
      key: "total",
      header: "کل مانده مشتری",
      numeric: true,
      render: (c) => (
        <MoneyDisplay
          direction="neutral"
          amount={c.total_outstanding_irr}
          compact
          size="sm"
        />
      ),
    },
    {
      key: "overdue",
      header: "مانده معوق",
      numeric: true,
      render: (c) => (
        <MoneyDisplay
          direction="neutral"
          amount={c.overdue_amount_irr}
          compact
          size="sm"
        />
      ),
    },
    {
      key: "delay",
      header: "میانگین تأخیر",
      render: (c) => `${toPersianDigits(c.avg_delay_days)} روز`,
    },
    {
      key: "risk",
      header: "ریسک وصول",
      render: (c) => <>{!(c.risk_assessment_incomplete && Number(c.overdue_amount_irr) === 0) && <RiskBadge level={c.risk_level} size="sm" />}{c.risk_assessment_incomplete && <small className={styles.incomplete}>ارزیابی ناقص؛ سررسید نامشخص</small>}</>,
    },
    {
      key: "action",
      header: "پیگیری",
      render: (c) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => openReminder(c)}
          aria-label={`پیش‌نویس یادآوری برای ${c.name}`}
        >
          پیش‌نویس یادآوری
        </Button>
      ),
    },
  ];
  if (bucketFilter !== "all") customerColumns.splice(1, 0, {
    key: "bucket_amount", header: `مانده ${BUCKET_LABELS[bucketFilter]}`, numeric: true,
    render: (customer) => <MoneyDisplay amount={customer.buckets[bucketFilter]} direction="neutral" compact size="sm" />,
  });

  const invoiceColumns: Column<ReceivableInvoiceItem>[] = [
    {
      key: "number",
      header: "شماره فاکتور",
      render: (inv) => toPersianDigits(inv.invoice_no),
    },
    {
      key: "customer",
      header: "مشتری",
      render: (inv) => inv.counterparty_name,
    },
    {
      key: "due",
      header: "سررسید",
      render: (inv) => (inv.due_date ? toJalaliDate(inv.due_date) : "ثبت نشده"),
    },
    {
      key: "bucket",
      header: "وضعیت سررسید",
      render: (inv) =>
        inv.bucket_key === "due_date_missing"
          ? "سررسید نامشخص"
          : inv.bucket_key === "not_due"
            ? "هنوز سررسید نشده"
            : `${toPersianDigits(inv.delay_days)} روز تأخیر`,
    },
    {
      key: "gross",
      header: "مبلغ فاکتور",
      numeric: true,
      render: (inv) => (
        <MoneyDisplay
          direction="neutral"
          amount={inv.gross_amount_irr}
          compact
          size="sm"
        />
      ),
    },
    {
      key: "remaining",
      header: "مانده تسویه‌نشده",
      numeric: true,
      render: (inv) => (
        <MoneyDisplay
          direction="neutral"
          amount={inv.remaining_amount_irr}
          compact
          size="sm"
        />
      ),
    },
  ];

  return (
    <div className={styles.page} dir="rtl">
      <PageHeader
        title="مطالبات، از سررسید تا وصول"
        description="زمان مانده‌ها را ببینید، اولویت پیگیری را مشخص کنید و جزئیات هر مشتری را بررسی کنید."
        statusMetadata={
          summary ? (
            <span>مبنای داده‌ها: {toJalaliDate(summary.as_of_date)}</span>
          ) : undefined
        }
        secondaryActions={
          <Button
            variant="outline"
            disabled={loading}
            onClick={() => loadData()}
          >
            {loading ? "در حال دریافت…" : "به‌روزرسانی"}
          </Button>
        }
        primaryAction={
          <Button asChild>
            <Link href={`/companies/${company.id}/data`}>بررسی داده‌ها</Link>
          </Button>
        }
      />
      {errors.length > 0 && (
        <div role="alert" className={styles.error}>
          <strong>دریافت بخشی از اطلاعات انجام نشد.</strong>
          <p>{errors.join("، ")} در دسترس نیست. دوباره تلاش کنید.</p>
          <Button
            variant="outline"
            disabled={loading}
            onClick={() => loadData()}
          >
            تلاش مجدد
          </Button>
        </div>
      )}
      {loading && !summary ? (
        <div
          role="status"
          aria-label="در حال دریافت مطالبات"
          className={styles.loading}
        >
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-80 w-full" />
        </div>
      ) : (
        summary && (
          <>
            <section className={styles.metrics} aria-label="موقعیت مطالبات">
              <div>
                <h2>کل مطالبات</h2>
                <MoneyDisplay
                  direction="neutral"
                  amount={summary.total_receivables_irr}
                  executive
                  size="2xl"
                />
                <p>
                  {toPersianDigits(summary.customer_count)} مشتری دارای مانده
                </p>
              </div>
              <div>
                <h2>مانده سررسید گذشته</h2>
                <MoneyDisplay
                  direction="neutral"
                  amount={summary.total_overdue_irr}
                  executive
                  size="2xl"
                />
                <p>{percent(summary.overdue_ratio * 100)} از کل مطالبات</p>
              </div>
              <div>
                <h2>دوره وصول مطالبات</h2>
                <strong>
                  {summary.dso_days == null ? "—" : toPersianDigits(String(summary.dso_days).replace(".", "٫"))} {summary.dso_days != null && <small>روز</small>}
                </strong>
                <p>تقریبی؛ بر اساس فروش صورتحساب‌شده</p>
              </div>
              <div>
                <h2>مشتریان با ریسک بالا</h2>
                <strong>
                  {toPersianDigits(summary.high_risk_customer_count)}{" "}
                  <small>مشتری</small>
                </strong>
              </div>
            </section>
            <details className={styles.method}>
              <summary>مبنای دوره وصول و ارزیابی ریسک</summary>
              <p>دوره وصول = (کل مطالبات باز ÷ فروش صورتحساب‌شده در {toPersianDigits(summary.dso_period_days ?? 90)} روز گذشته) × {toPersianDigits(summary.dso_period_days ?? 90)}. فروش نقد و اعتباری جدا نشده‌اند؛ این شاخص تقریبی است. بدون فروش دوره، مقدار قابل محاسبه نیست.</p>
              {summary.dso_warnings?.map((warning) => <p key={warning}>{warning}</p>)}
              <p>تعداد مشتریان با ریسک بالا شامل سطوح بالا و بحرانی است و از همان امتیازهای فهرست مشتریان محاسبه می‌شود.</p>
            </details>
            <section
              className={styles.analysis}
              aria-labelledby="receivable-aging-title"
            >
              <div className={styles.aging}>
                <div className={styles.sectionHeader}>
                  <div>
                    <h2 id="receivable-aging-title">زمان، در ماندهٔ مطالبات</h2>
                    <p>هر بازه را انتخاب کنید تا فهرست پایین صفحه محدود شود.</p>
                  </div>
                  {bucketFilter !== "all" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setBucketFilter("all")}
                    >
                      همه بازه‌ها
                    </Button>
                  )}
                </div>
                <div className={styles.proportion} aria-hidden="true">
                  {summary.buckets
                    .filter((b) => b.share_percentage > 0)
                    .map((b) => (
                      <span
                        key={b.bucket_key}
                        data-bucket={b.bucket_key}
                        style={{ flexGrow: Math.max(0, b.share_percentage) }}
                      />
                    ))}
                </div>
                <div className={styles.buckets}>
                  {summary.buckets.map((b) => (
                    <Button
                      variant="surface"
                      size="auto"
                      motion="none"
                      key={b.bucket_key}
                      className={styles.bucket}
                      data-bucket={b.bucket_key}
                      aria-pressed={bucketFilter === b.bucket_key}
                      onClick={() =>
                        setBucketFilter(
                          bucketFilter === b.bucket_key ? "all" : b.bucket_key,
                        )
                      }
                    >
                      <span>{BUCKET_LABELS[b.bucket_key]}</span>
                      <MoneyDisplay
                        direction="neutral"
                        amount={b.amount_irr}
                        compact
                        size="md"
                      />
                      <small>
                        {toPersianDigits(b.invoice_count)} فاکتور{" "}
                        <span>{percent(b.share_percentage)}</span>
                      </small>
                    </Button>
                  ))}
                </div>
                {summary.buckets.some(
                  (b) =>
                    b.bucket_key === "due_date_missing" &&
                    Number(b.amount_irr) > 0,
                ) && (
                  <p className={styles.footnote}>
                    مانده‌های بدون تاریخ سررسید، معوق محسوب نشده‌اند؛ برای تحلیل
                    دقیق‌تر، تاریخ آن‌ها را تکمیل کنید.
                  </p>
                )}
              </div>
              <aside
                className={styles.priorities}
                aria-labelledby="receivable-priority-title"
              >
                <h2 id="receivable-priority-title">اولویت بررسی وصول</h2>
                <p>بر اساس ریسک و مانده معوق</p>
                {errors.includes("فهرست مشتریان") ? (
                  <p>فهرست مشتریان در دسترس نیست.</p>
                ) : priorities.length === 0 ? (
                  <p className={styles.priorityEmpty}>
                    مشتری با مانده معوق در داده‌های فعلی ثبت نشده است.
                  </p>
                ) : (
                  <ol>
                    {priorities.map((c) => (
                      <li key={c.counterparty_id}>
                        <Button
                          variant="surface"
                          size="auto"
                          motion="none"
                          onClick={() => setSelected(c)}
                        >
                          <strong>{c.name}</strong>
                          <MoneyDisplay
                            direction="neutral"
                            amount={c.overdue_amount_irr}
                            compact
                            size="sm"
                          />
                        </Button>
                        <div>
                          <RiskBadge level={c.risk_level} size="sm" />
                          <span>
                            {toPersianDigits(c.avg_delay_days)} روز تأخیر
                          </span>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </aside>
            </section>
          </>
        )
      )}
      {!loading && !summary && errors.length === 0 && (
        <div className={styles.empty}>
          <h2>خلاصه مطالبات در دسترس نیست</h2>
          <p>داده‌های فروش و دریافت‌ها را در مرکز داده بررسی کنید.</p>
          <Button asChild>
            <Link href={`/companies/${company.id}/data`}>بررسی داده‌ها</Link>
          </Button>
        </div>
      )}
      {(!loading || summary) && (
        <section className={styles.records} aria-label="جزئیات مطالبات" id="receivable-cases">
          <Tabs value={tab} onValueChange={setTab} dir="rtl">
            <div className={styles.sectionHeader}>
              <div>
                <h2>پرونده‌های وصول</h2>
                <p>مانده و سابقه سررسید، در سطح مشتری یا فاکتور</p>
              </div>
              <TabsList>
                <TabsTrigger value="customers">مشتریان</TabsTrigger>
                <TabsTrigger value="invoices">فاکتورهای باز</TabsTrigger>
              </TabsList>
            </div>
            <div className={styles.filters}>
              <label className={styles.search}>
                <span>
                  {tab === "customers"
                    ? "جستجوی مشتری یا شناسه"
                    : "جستجوی مشتری یا شماره فاکتور"}
                </span>
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={
                    tab === "customers"
                      ? "نام یا شناسه مشتری"
                      : "نام مشتری یا شماره فاکتور"
                  }
                />
              </label>
              {tab === "customers" && (
                <label className={styles.riskFilter}>
                  <span>ریسک وصول</span>
                  <SelectField
                    value={riskFilter}
                    onValueChange={(v) => setRiskFilter(v as typeof riskFilter)}
                    aria-label="ریسک وصول"
                  >
                    <SelectOption value="all">همه ریسک‌ها</SelectOption>
                    {Object.entries(RISK_LABELS).map(([key, label]) => (
                      <SelectOption value={key} key={key}>
                        {label}
                      </SelectOption>
                    ))}
                  </SelectField>
                </label>
              )}
              <label className={styles.riskFilter}>
                <span>ترتیب نمایش</span>
                <SelectField value={sort} onValueChange={setSort} aria-label="ترتیب نمایش">
                  <SelectOption value="priority">{tab === "customers" ? "بیشترین ریسک" : "بیشترین تأخیر"}</SelectOption>
                  <SelectOption value="amount">بیشترین مانده</SelectOption>
                  <SelectOption value="amount_asc">کمترین مانده</SelectOption>
                  <SelectOption value="delay">بیشترین تأخیر</SelectOption>
                  <SelectOption value="name">نام مشتری</SelectOption>
                </SelectField>
              </label>
              {customerFilter && <p className={styles.customerScope}>فاکتورهای {customers.find((customer) => customer.counterparty_id === customerFilter)?.name ?? "مشتری انتخاب‌شده"}<Button variant="ghost" size="sm" onClick={() => setCustomerFilter(null)}>همه مشتریان</Button></p>}
              <div className={styles.filterSummary}>
                <span>
                  {toPersianDigits(
                    tab === "customers"
                      ? filteredCustomers.length
                      : filteredInvoices.length,
                  )}{" "}
                  نتیجه
                  {bucketFilter !== "all"
                    ? ` در بازه ${BUCKET_LABELS[bucketFilter]}`
                    : ""}
                </span>
                {bucketTotal != null && <span>جمع مانده بازه: <MoneyDisplay amount={String(bucketTotal)} direction="neutral" executive size="sm" /></span>}
                {hasFilters && (
                  <Button variant="ghost" size="sm" onClick={resetFilters}>
                    پاک‌کردن فیلترها
                  </Button>
                )}
              </div>
            </div>
            <TabsContent value="customers">
              {errors.includes("فهرست مشتریان") ? (
                <p role="status">
                  فهرست مشتریان دریافت نشده است؛ از تلاش مجدد استفاده کنید.
                </p>
              ) : (
                <FinancialDataTable
                  tableAriaLabel="مطالبات مشتریان"
                  data={filteredCustomers.slice(pageIndex * 20, (pageIndex + 1) * 20)}
                  columns={customerColumns}
                  keyExtractor={(c) => c.counterparty_id}
                  density="normal"
                  emptyMessage={
                    hasFilters
                      ? "مشتری مطابق این فیلترها پیدا نشد؛ فیلترها را پاک کنید."
                      : "مشتری دارای مانده در داده‌های فعلی ثبت نشده است."
                  }
                />
              )}
            </TabsContent>
            <TabsContent value="invoices">
              {errors.includes("فهرست فاکتورها") ? (
                <p role="status">
                  فهرست فاکتورها دریافت نشده است؛ از تلاش مجدد استفاده کنید.
                </p>
              ) : (
                <FinancialDataTable
                  tableAriaLabel="فاکتورهای باز مطالبات"
                  data={filteredInvoices.slice(pageIndex * 20, (pageIndex + 1) * 20)}
                  columns={invoiceColumns}
                  keyExtractor={(inv) => inv.id}
                  density="normal"
                  emptyMessage={
                    hasFilters
                      ? "فاکتور مطابق این فیلترها پیدا نشد؛ فیلترها را پاک کنید."
                      : "فاکتور باز در داده‌های فعلی ثبت نشده است."
                  }
                />
              )}
            </TabsContent>
            {bucketFilter !== "all" && tab === "customers" && <p className={styles.footnote}>ستون مانده بازه فقط مبلغ بازه انتخاب‌شده را نشان می‌دهد؛ کل مانده مشتری و مانده معوق شامل تمام بازه‌ها هستند.</p>}
            <nav className={styles.pagination} aria-label="صفحه‌بندی مطالبات">
              <span>{resultCount ? `${toPersianDigits(pageIndex * 20 + 1)} تا ${toPersianDigits(Math.min((pageIndex + 1) * 20, resultCount))} از ${toPersianDigits(resultCount)}` : "۰ نتیجه"} · صفحه {toPersianDigits(pageIndex + 1)} از {toPersianDigits(pageCount)}</span>
              <Button variant="outline" disabled={loading || pageIndex === 0} onClick={() => setPage({ key: tableKey, index: pageIndex - 1 })}>صفحه قبل</Button>
              <Button variant="outline" disabled={loading || pageIndex + 1 >= pageCount} onClick={() => setPage({ key: tableKey, index: pageIndex + 1 })}>صفحه بعد</Button>
            </nav>
          </Tabs>
        </section>
      )}
      <p className={styles.footnote}>
        ارزیابی ریسک بر اساس سوابق ثبت‌شده است. پیش از پیگیری، دریافت‌های جدید و
        صحت مانده حساب را بررسی کنید.
      </p>
      <Dialog
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
      >
        <DialogContent className={styles.detailDialog} dir="rtl">
          <DialogHeader>
            <DialogTitle>{selected?.name}</DialogTitle>
            <DialogDescription>
              جزئیات مانده و پیشنهاد پیگیری بر اساس داده‌های فعلی
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <>
              <div className={styles.detailStatus}>
                {selected.risk_assessment_incomplete && Number(selected.overdue_amount_irr) === 0 ? <span className={styles.incomplete}>ارزیابی ریسک ناقص</span> : <RiskBadge level={selected.risk_level} score={selected.risk_score} size="sm" />}
                <span>
                  {toPersianDigits(selected.open_invoices_count)} فاکتور باز
                </span>
                <span>
                  {toPersianDigits(selected.avg_delay_days)} روز میانگین تأخیر
                </span>
              </div>
              <dl className={styles.balances}>
                <div>
                  <dt>کل مانده</dt>
                  <dd>
                    <MoneyDisplay
                      direction="neutral"
                      amount={selected.total_outstanding_irr}
                      executive
                    />
                  </dd>
                </div>
                <div>
                  <dt>مانده معوق</dt>
                  <dd>
                    <MoneyDisplay
                      direction="neutral"
                      amount={selected.overdue_amount_irr}
                      executive
                    />
                  </dd>
                </div>
              </dl>
              <dl className={styles.detailBuckets}>
                {Object.entries(BUCKET_LABELS).map(([key, label]) => (
                  <div key={key}>
                    <dt>{label}</dt>
                    <dd>
                      <MoneyDisplay
                        direction="neutral"
                        amount={selected.buckets[key as ReceivablesBucketKey]}
                        compact
                        size="sm"
                      />
                    </dd>
                  </div>
                ))}
              </dl>
              {selected.risk_assessment_incomplete && <p role="status" className={styles.incomplete}>بخشی از مانده فاقد سررسید است؛ امتیاز ریسک فقط اطلاعات دارای سررسید را پوشش می‌دهد و کامل نیست.</p>}
              <details className={styles.method}>
                <summary>چرا این امتیاز ریسک؟</summary>
                <p>سهم مانده معوق × ۴۵، امتیاز قدمت (۵، ۱۰، ۲۰ یا ۳۵ برای قدیمی‌ترین بازه معوق) و میانگین تأخیر ÷ ۴ تا سقف ۲۰ امتیاز جمع می‌شوند. امتیاز نهایی از ۱۰۰ است؛ بالا از ۴۵ و بحرانی از ۷۰ یا سهم بیش از ۴۰٪ برای معوق بالای ۹۰ روز. میانگین تأخیر بر اساس تعداد فاکتورهای معوق دارای سررسید است.</p>
                <p>این قواعد مدل‌اند؛ شرایط اعتبار و اقدام بعدی با سیاست شرکت و تأیید مسئول مالی تعیین می‌شود.</p>
              </details>
              <div className={styles.recommendation}>
                <strong>پیشنهاد پیگیری</strong>
                <p>{selected.recommended_action}</p>
              </div>
              <Button variant="outline" disabled={errors.includes("فهرست فاکتورها")} onClick={() => openCustomerInvoices(selected)}>مشاهده فاکتورهای این مشتری</Button>
              {errors.includes("فهرست فاکتورها") && <p>فاکتورها دریافت نشده‌اند؛ پنجره را ببندید و تلاش مجدد را انتخاب کنید.</p>}
              <DialogFooter>
                <Button variant="outline" onClick={() => setSelected(null)}>
                  بستن
                </Button>
                <Button onClick={() => openReminder(selected)}>
                  تهیه پیش‌نویس یادآوری
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!reminder}
        onOpenChange={(open) => !open && setReminder(null)}
      >
        <DialogContent className={styles.detailDialog} dir="rtl">
          <DialogHeader>
            <DialogTitle>یادآوری برای {reminder?.name}</DialogTitle>
            <DialogDescription>
              متن را بررسی و ویرایش کنید، سپس برای ارسال در کانال موردنظر کپی
              کنید.
            </DialogDescription>
          </DialogHeader>
          <label className={styles.tone}>
            <span>لحن پیام</span>
            <SelectField
              aria-label="لحن پیام"
              value={tone}
              onValueChange={setTone}
            >
              <SelectOption value="friendly">دوستانه</SelectOption>
              <SelectOption value="formal">رسمی</SelectOption>
              <SelectOption value="urgent">پیگیری فوری</SelectOption>
            </SelectField>
          </label>
          <label className={styles.draft}>
            <span>متن یادآوری</span>
            <Textarea
              rows={9}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
          </label>
          <p className={styles.footnote}>
            کپی متن، پیام را ارسال نمی‌کند و پیگیری در پرونده ثبت نمی‌شود.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReminder(null)}>
              بستن
            </Button>
            <Button onClick={copyDraft} disabled={copying || !draft.trim()}>
              {copying ? "در حال کپی…" : "کپی متن یادآوری"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
