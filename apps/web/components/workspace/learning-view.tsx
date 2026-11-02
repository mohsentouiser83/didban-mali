"use client";
import { BrainIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  StatusMessage,
} from "@/components/ui/content-states";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableRowHeader,
} from "@/components/ui/table";
import { useWorkspace } from "@/hooks/workspace";
import { useLearningPatterns } from "@/hooks/use-learning-patterns";
import { familyLabels } from "@/lib/automation";
import { NoCompany, PageHeader, Panel } from "./page-parts";
function LearningWorkspace() {
  const c = useLearningPatterns();
  if (!c.workspace.company) return <NoCompany />;
  return (
    <>
      <PageHeader icon={BrainIcon} title="حافظه اصلاحات شرکت" />
      <div className="space-y-5">
        <Panel
          title="الگوهای شرکت"
          action={
            c.capabilities.data?.can_learn && (
              <Button variant="secondary" onClick={() => c.load(null)}>
                الگوی تازه
              </Button>
            )
          }
        >
          {c.patterns.loading || c.capabilities.loading ? (
            <LoadingState />
          ) : c.patterns.error || c.capabilities.error ? (
            <ErrorState
              message={(c.patterns.error || c.capabilities.error)!.message}
              onRetry={() => {
                c.patterns.refresh();
                c.capabilities.refresh();
              }}
            />
          ) : !c.patterns.data?.items.length ? (
            <EmptyState compact title="الگویی ذخیره نشده" />
          ) : (
            <>
              <Select
                label="انتخاب الگوی معتبر"
                value={c.local.item?.id || ""}
                onValueChange={c.selectPattern}
                options={c.patterns.data.items.map((item) => ({
                  value: item.id,
                  label: `${item.name} · ${item.enabled ? "فعال" : "غیرفعال"}`,
                }))}
              />
              <div className="mt-3 flex gap-2">
                <Button
                  variant="ghost"
                  disabled={!c.patterns.hasPrevious}
                  onClick={c.patterns.previousPage}
                >
                  قبلی
                </Button>
                <Button
                  variant="ghost"
                  disabled={!c.patterns.hasNext}
                  onClick={c.patterns.nextPage}
                >
                  بعدی
                </Button>
              </div>
            </>
          )}
        </Panel>
        {c.capabilities.data?.can_learn && (
          <Panel
            title={c.local.item ? "ویرایش الگو" : "یادگیری از اصلاح معتبر"}
          >
            <Form
              onSubmit={(e) => {
                e.preventDefault();
                void c.save();
              }}
              fieldErrors={c.command.error?.fields}
            >
              <Field id="pattern-name" label="نام الگو">
                <Input
                  id="pattern-name"
                  required
                  maxLength={120}
                  disabled={c.command.busy}
                  value={c.local.name}
                  onChange={(e) => c.set({ name: e.target.value })}
                />
              </Field>
              {c.local.item ? (
                <div className="flex items-center gap-3">
                  <Switch
                    label="فعال‌بودن الگو"
                    checked={c.local.enabled}
                    onCheckedChange={(enabled) => c.set({ enabled })}
                    disabled={c.command.busy}
                  />
                  <span>فعال</span>
                </div>
              ) : c.candidates.loading ? (
                <LoadingState />
              ) : c.candidates.error ? (
                <ErrorState
                  message={c.candidates.error.message}
                  onRetry={c.candidates.refresh}
                />
              ) : !c.candidates.data?.items.length ? (
                <EmptyState
                  compact
                  title="اصلاح انسانیِ استفاده‌شده در گزارش موجود نیست"
                />
              ) : (
                <Field id="pattern-source" label="اصلاح انسانی معتبر">
                  <Select
                    id="pattern-source"
                    value={c.local.candidateId}
                    onValueChange={(candidateId) => c.set({ candidateId })}
                    options={c.candidates.data.items.map((item) => ({
                      value: item.id,
                      label: `${item.sheet} · ${familyLabels[item.family] || item.family}`,
                    }))}
                  />
                </Field>
              )}
              {c.command.error && (
                <FormMessage error>{c.command.error.message}</FormMessage>
              )}
              <Button
                type="submit"
                disabled={c.command.busy || (!c.local.item && !c.candidate)}
              >
                {c.command.busy ? "در حال ذخیره…" : "ذخیره الگو"}
              </Button>
            </Form>
          </Panel>
        )}
        {(c.local.item || c.candidate) && (
          <Panel title="نگاشت و منشأ الگو">
            <p className="mb-3 text-muted">
              شیت {c.local.item?.payload.sheet || c.candidate?.sheet} ·{" "}
              {familyLabels[
                c.local.item?.payload.family || c.candidate?.family || ""
              ] || "منبع"}
            </p>
            <Table aria-label="نگاشت معتبر ستون‌ها">
              <TableHeader>
                <TableRow>
                  <TableHead>اطلاعات</TableHead>
                  <TableHead>ستون منبع</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {c.mappingRows.map(({ key, value, label }) => (
                  <TableRow key={key}>
                    <TableRowHeader>{label}</TableRowHeader>
                    <TableCell>{value}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <StatusMessage>
              این الگو کنترل ردیف‌ها و تأیید سند را حذف نمی‌کند.
            </StatusMessage>
          </Panel>
        )}
      </div>
    </>
  );
}

export function LearningView() {
  const w = useWorkspace();
  if (!w.company) return <NoCompany />;
  return <LearningWorkspace key={`${w.user?.id}:${w.company.id}`} />;
}
