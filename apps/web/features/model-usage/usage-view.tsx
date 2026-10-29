import { IconTile } from "@/components/ui/app-icon";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { StatCards, StatCard } from "@/components/ui/financial/stat-cards";
export function UsageView({
  title,
  period,
  ceiling,
  reserved,
  spent,
  configured,
  unknown,
  model,
  providerReady,
  adminPath,
  companyScope = false,
}: {
  title: string;
  period: string;
  ceiling: string;
  reserved: string;
  spent: string;
  configured: boolean;
  unknown: boolean;
  model: string | null;
  providerReady: boolean | null;
  adminPath?: string;
  companyScope?: boolean;
}) {
  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-3 font-heading text-[26px] font-medium">
          <IconTile name="Coins" />
          {title}
        </h1>
        {adminPath ? (
          <Link
            className="min-h-11 content-center text-sm text-primary"
            href={adminPath}
          >
            تنظیم سقف هزینه
          </Link>
        ) : null}
      </header>
      <section className="space-y-3 rounded-summary border border-border bg-surface p-5 sm:p-7">
        {providerReady === null ? null : (
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={providerReady ? "success" : "neutral"}>
              {providerReady ? "مدل تنظیم شده" : "مدل تنظیم نشده"}
            </Badge>
            {model ? <bdi className="text-xs text-muted">{model}</bdi> : null}
          </div>
        )}
        <p className="text-xs text-muted">{period}</p>
        {unknown ? (
          <p className="text-sm text-warning">
            مصرف بعضی درخواست‌ها نامشخص است؛ رزرو آن‌ها حفظ شده است.
          </p>
        ) : null}
      </section>
      <StatCards>
        <StatCard
          icon="Coins"
          title="سقف ماهانه نصب"
          value={configured ? ceiling : "—"}
          unit="دلار"
        />
        <StatCard
          icon="Coins"
          title={companyScope ? "هزینه ثبت‌شده شرکت" : "هزینه ثبت‌شده نصب"}
          value={spent}
          unit="دلار"
        />
        <StatCard
          icon="Clock3"
          title={companyScope ? "رزرو جاری شرکت" : "رزرو جاری نصب"}
          value={reserved}
          unit="دلار"
        />
      </StatCards>
    </div>
  );
}
