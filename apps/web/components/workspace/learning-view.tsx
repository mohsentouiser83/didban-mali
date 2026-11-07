"use client";
import { Drawer } from "@/components/ui/drawer";
import { BrainIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { CursorPagination } from "@/components/ui/pagination";
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
  TableEmptyCell,
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
      <PageHeader
        icon={BrainIcon}
        title="الگوهای آموخته‌شده"
        action={
          c.capabilities.data?.can_learn && (
            <Button onClick={() => c.load(null)}>الگوی جدید</Button>
          )
        }
      />
      <div className="space-y-5">
        <Panel>
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
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الگو</TableHead>
                    <TableHead>وضعیت</TableHead>
                    <TableHead>عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {c.patterns.data?.items.length ? (
                    c.patterns.data.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableRowHeader>{item.name}</TableRowHeader>
                        <TableCell>
                          <Badge tone={item.enabled ? "success" : "neutral"}>
                            {item.enabled ? "فعال" : "غیرفعال"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="secondary"
                            onClick={() => c.load(item)}
                          >
                            {c.capabilities.data?.can_learn
                              ? "ویرایش"
                              : "مشاهده"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableEmptyCell colSpan={3} title="الگویی ذخیره نشده" />
                  )}
                </TableBody>
              </Table>
              <CursorPagination {...c.patterns} />
            </>
          )}
        </Panel>
        {
          <Drawer
            open={c.editorOpen}
            onOpenChange={(open) => {
              if (!open) c.closeEditor();
            }}
            title={c.local.item ? "جزئیات الگو" : "الگوی جدید"}
          >
            <Form
              onSubmit={(e) => {
                e.preventDefault();
                void c.save();
              }}
              fieldErrors={c.command.error?.fields}
            >
              <fieldset
                className="space-y-4"
                disabled={!c.capabilities.data?.can_learn || c.command.busy}
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
              </fieldset>
              {c.capabilities.data?.can_learn && (
                <Button
                  type="submit"
                  disabled={c.command.busy || (!c.local.item && !c.candidate)}
                >
                  {c.command.busy ? "در حال ذخیره…" : "ذخیره الگو"}
                </Button>
              )}
            </Form>
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
          </Drawer>
        }
      </div>
    </>
  );
}

export function LearningView() {
  const w = useWorkspace();
  if (!w.company) return <NoCompany />;
  return <LearningWorkspace key={`${w.user?.id}:${w.company.id}`} />;
}
