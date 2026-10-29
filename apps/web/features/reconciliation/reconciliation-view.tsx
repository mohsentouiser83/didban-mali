import { AppIcon } from "@/components/ui/app-icon";
import type { ReactNode } from "react";
import { PageHeader } from "@/features/companies/company-view";
import { Select, type Option } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  EmptyState,
  LoadingState,
  StatusMessage,
} from "@/components/ui/states";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableRowHeader,
} from "@/components/ui/table";
import type { CandidateModel } from "./presentation";

export function ReconciliationView({
  title,
  company,
  manifest,
  manifestOptions,
  onManifest,
  direction,
  directionOptions,
  onDirection,
  ready,
  loading,
  missing,
  items,
  onOpen,
  onStart,
  startBusy,
  canOperate,
  more,
  onMore,
  moreBusy,
  error,
  unit,
  moreManifests,
  onMoreManifests,
  manifestBusy,
}: {
  unit: string;
  moreManifests: boolean;
  onMoreManifests: () => void;
  manifestBusy: boolean;
  title: string;
  company: string;
  manifest: string;
  manifestOptions: Option[];
  onManifest: (id: string) => void;
  direction: string;
  directionOptions: Option[];
  onDirection: (id: string) => void;
  ready: boolean;
  loading: boolean;
  missing: string[];
  items: CandidateModel[];
  onOpen: (id: string) => void;
  onStart: () => void;
  startBusy: boolean;
  canOperate: boolean;
  more: boolean;
  onMore: () => void;
  moreBusy: boolean;
  error: ReactNode;
}) {
  return (
    <section className="motion-safe:animate-reveal">
      <PageHeader icon="GitCompareArrows" title={title} description={company} />
      <div className="mb-6 grid gap-4 rounded-panel border border-border bg-surface p-5 sm:grid-cols-2">
        <div>
          <label
            htmlFor="comparison-manifest"
            className="flex items-center gap-2 mb-2 block text-xs font-medium"
          >
            <AppIcon name="Layers3" className="text-primary" />
            نسخه داده
          </label>
          <Select
            id="comparison-manifest"
            value={manifest}
            options={manifestOptions}
            onValueChange={onManifest}
            label="نسخه داده"
          />
          {moreManifests ? (
            <Button
              variant="ghost"
              onClick={onMoreManifests}
              disabled={manifestBusy}
            >
              <AppIcon name="ChevronsDown" />
              {manifestBusy ? "در حال دریافت" : "نسخه‌های بیشتر"}
            </Button>
          ) : null}
        </div>
        {directionOptions.length > 1 ? (
          <div>
            <label
              htmlFor="comparison-direction"
              className="flex items-center gap-2 mb-2 block text-xs font-medium"
            >
              <AppIcon name="GitCompareArrows" className="text-primary" />
              جهت مقایسه
            </label>
            <Select
              id="comparison-direction"
              value={direction}
              options={directionOptions}
              onValueChange={onDirection}
              label="جهت مقایسه"
            />
          </div>
        ) : null}
      </div>
      {error}
      {!manifest ? (
        <EmptyState
          icon="GitCompareArrows"
          title="نتیجه مالی موجود نیست"
          description="ابتدا فایل‌ها را پردازش کنید."
        />
      ) : loading ? (
        <LoadingState layout="table" label="در حال دریافت تطبیق‌ها" />
      ) : !ready ? (
        <EmptyState
          icon="GitCompareArrows"
          title="مقایسه آماده نیست"
          action={
            canOperate ? (
              <Button onClick={onStart} disabled={startBusy}>
                <AppIcon name="GitCompareArrows" />
                {startBusy ? "در حال بررسی" : "آغاز مقایسه"}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {missing.length ? (
            <StatusMessage>
              داده معتبر موجود نیست: {missing.join("، ")}
            </StatusMessage>
          ) : null}
          {items.length ? (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>مرجع</TableHead>
                      <TableHead>نتیجه مقایسه</TableHead>
                      <TableHead>تصمیم</TableHead>
                      <TableHead>اختلاف · {unit}</TableHead>
                      <TableHead>شواهد</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.id}>
                        <TableRowHeader>
                          <bdi>{item.reference}</bdi>
                        </TableRowHeader>
                        <TableCell>
                          <Badge>{item.status}</Badge>
                        </TableCell>
                        <TableCell>{item.decision}</TableCell>
                        <TableCell>
                          <bdi className="tabular-nums">{item.difference}</bdi>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="secondary"
                            onClick={() => onOpen(item.id)}
                          >
                            بررسی
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
                    className="space-y-4 rounded-panel border border-border bg-surface p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <bdi className="break-all font-medium">
                        {item.reference}
                      </bdi>
                      <Badge>{item.status}</Badge>
                    </div>
                    <p className="text-xs text-muted">{item.decision}</p>
                    <Button variant="secondary" onClick={() => onOpen(item.id)}>
                      <AppIcon name="FileSearch" />
                      بررسی شواهد
                    </Button>
                  </article>
                ))}
              </div>
              {more ? (
                <div className="mt-5">
                  <Button
                    variant="secondary"
                    disabled={moreBusy}
                    onClick={onMore}
                  >
                    <AppIcon name="ChevronsDown" />
                    {moreBusy ? "در حال دریافت" : "موارد بیشتر"}
                  </Button>
                </div>
              ) : null}
            </>
          ) : (
            <EmptyState
              icon="GitCompareArrows"
              title="ردیف قابل مقایسه موجود نیست"
            />
          )}
        </>
      )}
    </section>
  );
}
