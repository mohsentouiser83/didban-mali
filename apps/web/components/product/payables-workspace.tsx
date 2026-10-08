"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  VendorPayableItem,
  VendorsPayablesResponse,
  PayablesBucketKey,
  PayablesRiskLevel,
  PayablesSummaryResponse,
} from "@/lib/product-types";
import { SelectField, SelectOption } from "./select-field";
import styles from "./receivables.module.css";

const BUCKET_LABELS: Record<PayablesBucketKey, string> = {
  not_due: "هنوز سررسید نشده",
  "1_30": "۱ تا ۳۰ روز",
  "31_60": "۳۱ تا ۶۰ روز",
  "61_90": "۶۱ تا ۹۰ روز",
  "90_plus": "بیش از ۹۰ روز",
  due_date_missing: "سررسید نامشخص",
};
const RISK_LABELS: Record<PayablesRiskLevel, string> = {
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

export function PayablesWorkspace({ company }: { company: Company }) {
  const [summary, setSummary] = useState<PayablesSummaryResponse | null>(null);
  const [customers, setCustomers] = useState<VendorPayableItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const request = useRef(0);
  const [bucketFilter, setBucketFilter] = useState<"all" | PayablesBucketKey>(
    "all",
  );
  const [riskFilter, setRiskFilter] = useState<"all" | PayablesRiskLevel>(
    "all",
  );
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<VendorPayableItem | null>(null);
  const loadData = useCallback(
    async (reset = false) => {
      const id = ++request.current;
      setLoading(true);
      if (reset) {
        setSummary(null);
        setCustomers([]);
        setErrors([]);
      }
      const results = await Promise.allSettled([
        api<PayablesSummaryResponse>(
          `/companies/${company.id}/payables/summary`,
        ),
        api<VendorsPayablesResponse>(
          `/companies/${company.id}/payables/vendors`,
        ),
      ]);
      if (id !== request.current) return;
      const [sum, cust] = results;
      setSummary(sum.status === "fulfilled" ? sum.value : null);
      setCustomers(cust.status === "fulfilled" ? cust.value.items : []);
      setErrors(
        results.flatMap((result, index) =>
          result.status === "rejected"
            ? [["خلاصه بدهی‌ها", "فهرست تأمین‌کنندگان"][index]]
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
      ),
    [customers, bucketFilter, riskFilter, search],
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
  };
  const hasFilters =
    bucketFilter !== "all" || search !== "" || riskFilter !== "all";
  const customerColumns: Column<VendorPayableItem>[] = [
    {
      key: "name",
      header: "تأمین‌کننده",
      render: (c) => (
        <Button
          variant="surface"
          size="auto"
          motion="none"
          aria-label={`جزئیات بدهی‌ها ${c.name}`}
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
      header: "مانده کل",
      numeric: true,
      render: (c) => (
        <MoneyDisplay
          direction="neutral"
          amount={c.total_payable_irr}
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
      header: "ریسک تأمین",
      render: (c) => <RiskBadge level={c.risk_level} size="sm" />,
    },
    {
      key: "share",
      header: "سهم از کل بدهی‌ها",
      render: (c) => percent(c.share_of_total_payables),
    },
    {
      key: "action",
      header: "بررسی",
      render: (c) => (
        <Button variant="ghost" size="sm" onClick={() => setSelected(c)}>
          جزئیات تعهد
        </Button>
      ),
    },
  ];

  return (
    <div className={styles.page} dir="rtl">
      <PageHeader
        title="بدهی‌ها، با دیدِ زمان پرداخت"
        description="تعهدات سررسیدشده و آتی را ببینید و اولویت پرداخت به تأمین‌کنندگان را بررسی کنید."
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
          aria-label="در حال دریافت بدهی‌ها"
          className={styles.loading}
        >
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-80 w-full" />
        </div>
      ) : (
        summary && (
          <>
            <section className={styles.metrics} aria-label="موقعیت بدهی‌ها">
              <div>
                <h2>کل بدهی‌ها</h2>
                <MoneyDisplay
                  direction="neutral"
                  amount={summary.total_payables_irr}
                  executive
                  size="2xl"
                />
                <p>
                  {toPersianDigits(summary.vendor_count)} تأمین‌کننده دارای
                  مانده
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
                <p>{percent(summary.overdue_ratio * 100)} از کل بدهی‌ها</p>
              </div>
              <div>
                <h2>دوره پرداخت بدهی‌ها</h2>
                <strong>
                  {toPersianDigits(summary.dpo_days)} <small>روز</small>
                </strong>
                <p>برآورد بر اساس خرید اعتباری</p>
              </div>
              <div>
                <h2>تأمین‌کنندگان با ریسک بالا</h2>
                <strong>
                  {toPersianDigits(summary.high_risk_vendor_count)}{" "}
                  <small>تأمین‌کننده</small>
                </strong>
              </div>
            </section>
            <div className={styles.recommendation}>
              <strong>
                فاصله وصول تا پرداخت: {toPersianDigits(summary.ccc_days)} روز
              </strong>
              <p>
                دوره وصول {toPersianDigits(summary.dso_days)} روز و دوره پرداخت{" "}
                {toPersianDigits(summary.dpo_days)} روز است. این فاصله بدون دوره
                گردش موجودی کالا محاسبه شده و چرخه کامل تبدیل نقد نیست.
              </p>
            </div>
            <section
              className={styles.analysis}
              aria-labelledby="payable-aging-title"
            >
              <div className={styles.aging}>
                <div className={styles.sectionHeader}>
                  <div>
                    <h2 id="payable-aging-title">زمان‌بندی تعهدات پرداخت</h2>
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
                        {toPersianDigits(b.vendor_count)} تأمین‌کننده{" "}
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
                aria-labelledby="payable-priority-title"
              >
                <h2 id="payable-priority-title">اولویت بررسی پرداخت</h2>
                <p>بر اساس ریسک و مانده معوق</p>
                {errors.includes("فهرست تأمین‌کنندگان") ? (
                  <p>فهرست تأمین‌کنندگان در دسترس نیست.</p>
                ) : priorities.length === 0 ? (
                  <p className={styles.priorityEmpty}>
                    تأمین‌کننده با مانده معوق در داده‌های فعلی ثبت نشده است.
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
          <h2>خلاصه بدهی‌ها در دسترس نیست</h2>
          <p>داده‌های خرید و پرداخت‌ها را در مرکز داده بررسی کنید.</p>
          <Button asChild>
            <Link href={`/companies/${company.id}/data`}>بررسی داده‌ها</Link>
          </Button>
        </div>
      )}
      {(!loading || summary) && (
        <section className={styles.records} aria-label="جزئیات بدهی‌ها">
          <div className={styles.sectionHeader}>
            <div>
              <h2>تعهدات به تأمین‌کنندگان</h2>
              <p>مانده، سررسید و سهم هر تأمین‌کننده از کل بدهی‌ها</p>
            </div>
            <Button variant="outline" asChild>
              <Link href={`/companies/${company.id}/cashflow`}>
                بررسی توان پرداخت
              </Link>
            </Button>
          </div>
          <div className={styles.filters}>
            <label className={styles.search}>
              <span>جستجوی تأمین‌کننده یا شناسه</span>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="نام یا شناسه تأمین‌کننده"
              />
            </label>
            <label className={styles.riskFilter}>
              <span>ریسک تأمین</span>
              <SelectField
                value={riskFilter}
                onValueChange={(v) => setRiskFilter(v as typeof riskFilter)}
                aria-label="ریسک تأمین"
              >
                <SelectOption value="all">همه ریسک‌ها</SelectOption>
                {Object.entries(RISK_LABELS).map(([key, label]) => (
                  <SelectOption value={key} key={key}>
                    {label}
                  </SelectOption>
                ))}
              </SelectField>
            </label>
            <div className={styles.filterSummary}>
              <span>
                {toPersianDigits(filteredCustomers.length)} نتیجه
                {bucketFilter !== "all"
                  ? ` در بازه ${BUCKET_LABELS[bucketFilter]}`
                  : ""}
              </span>
              {hasFilters && (
                <Button variant="ghost" size="sm" onClick={resetFilters}>
                  پاک‌کردن فیلترها
                </Button>
              )}
            </div>
          </div>
          {errors.includes("فهرست تأمین‌کنندگان") ? (
            <p role="status">
              فهرست تأمین‌کنندگان دریافت نشده است؛ دوباره تلاش کنید.
            </p>
          ) : (
            <FinancialDataTable
              tableAriaLabel="بدهی به تأمین‌کنندگان"
              data={filteredCustomers}
              columns={customerColumns}
              keyExtractor={(c) => c.counterparty_id}
              density="normal"
              emptyMessage={
                hasFilters
                  ? "تأمین‌کننده مطابق این فیلترها پیدا نشد؛ فیلترها را پاک کنید."
                  : "تأمین‌کننده دارای مانده در داده‌های فعلی ثبت نشده است."
              }
            />
          )}
        </section>
      )}
      <p className={styles.footnote}>
        ارزیابی ریسک بر اساس سوابق ثبت‌شده است. پیش از پیگیری، پرداخت‌های جدید و
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
                <RiskBadge
                  level={selected.risk_level}
                  score={selected.risk_score}
                  size="sm"
                />
                <span>
                  {percent(selected.share_of_total_payables)} از کل بدهی‌ها
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
                      amount={selected.total_payable_irr}
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
                        amount={selected.buckets[key as PayablesBucketKey]}
                        compact
                        size="sm"
                      />
                    </dd>
                  </div>
                ))}
              </dl>
              <div className={styles.recommendation}>
                <strong>پیشنهاد پیگیری</strong>
                <p>{selected.recommended_action}</p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSelected(null)}>
                  بستن
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
