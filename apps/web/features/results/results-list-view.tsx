import { AppIcon } from "@/components/ui/app-icon";
import Link from "next/link";
import type { Schema } from "@didban/api-client";
import { ArrowUpLeft, UploadCloud } from "lucide-react";
import { PageHeader } from "@/features/companies/company-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableRowHeader,
} from "@/components/ui/table";

export type ManifestListItem = {
  id: string;
  date: string;
  published: string;
  period: string;
  limited: boolean;
};
export function ResultsListView({
  company,
  items,
  more,
  busy,
  onMore,
}: {
  company: Schema<"Company">;
  items: ManifestListItem[];
  more: boolean;
  busy: boolean;
  onMore: () => void;
}) {
  const href = (id: string) => `/companies/${company.id}/results/${id}`;
  return (
    <section className="motion-safe:animate-reveal">
      <PageHeader
        icon="ChartNoAxesCombined"
        title="نتایج مالی"
        description={company.name}
        action={
          <Button asChild variant="secondary">
            <Link href={`/companies/${company.id}/uploads`}>
              <UploadCloud size={18} aria-hidden />
              بارگذاری فایل
            </Link>
          </Button>
        }
      />
      {!items.length ? (
        <EmptyState
          icon="ChartNoAxesCombined"
          title="نتیجه‌ای آماده نیست"
          description="پس از پردازش فایل‌ها، نسخه نتایج اینجا نمایش داده می‌شود."
        />
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>دوره مالی</TableHead>
                  <TableHead>تا تاریخ</TableHead>
                  <TableHead>زمان تولید نسخه</TableHead>
                  <TableHead>دامنه</TableHead>
                  <TableHead>
                    <span className="sr-only">مشاهده</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableRowHeader>{item.period}</TableRowHeader>
                    <TableCell>{item.date}</TableCell>
                    <TableCell>{item.published}</TableCell>
                    <TableCell>
                      <Badge tone={item.limited ? "warning" : "success"}>
                        {item.limited ? "محدود" : "کامل"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button asChild variant="ghost">
                        <Link href={href(item.id)}>
                          مشاهده نسخه
                          <ArrowUpLeft size={16} aria-hidden />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="space-y-4 md:hidden">
            {items.map((item) => (
              <article
                key={item.id}
                className="rounded-panel border border-border bg-surface p-5"
              >
                <div className="flex flex-wrap justify-between gap-3">
                  <h2 className="font-medium">{item.period}</h2>
                  <Badge tone={item.limited ? "warning" : "success"}>
                    {item.limited ? "محدود" : "کامل"}
                  </Badge>
                </div>
                <p className="mt-4 text-muted">تا {item.date}</p>
                <p className="mt-2 text-xs text-muted">
                  تولید: {item.published}
                </p>
                <Button asChild variant="ghost" className="mt-3">
                  <Link href={href(item.id)}>
                    مشاهده نسخه
                    <ArrowUpLeft size={16} aria-hidden />
                  </Link>
                </Button>
              </article>
            ))}
          </div>
          {more ? (
            <div className="mt-6 text-center">
              <Button variant="secondary" disabled={busy} onClick={onMore}>
                <AppIcon name="ChevronsDown" />
                {busy ? "در حال دریافت…" : "نسخه‌های بیشتر"}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
