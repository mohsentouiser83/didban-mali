"use client";
import { Button, ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Hint } from "@/components/ui/tooltip";
import { Field, FormMessage } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/content-states";
import {
  Table, TableHeader, TableHead, TableBody, TableRow, TableRowHeader, TableCell,
} from "@/components/ui/table";
import { CursorPagination } from "@/components/ui/pagination";
import { BotExtractionReview } from "./bot-extraction-review";
import { useBotExtraction, useBotIntakes } from "@/hooks/use-bot-intakes";
import { Panel } from "./page-parts";

export function BotIntakesPanel() {
  const view = useBotIntakes();
  const extraction = useBotExtraction(view.resource.refresh);
  return (
    <>
      <Panel
        title="مدارک دریافت‌شده از بات" className="mt-5"
        action={
          <div className="flex items-center gap-1">
            <Hint label="ارسال مدرک متنی">
              متن را در گفت‌وگوی خصوصی بات با این دستور ارسال کنید:
              <p dir="ltr" className="mt-2 font-mono">/document متن مدرک</p>
            </Hint>
            <Button variant="ghost" onClick={view.resource.refresh}>به‌روزرسانی</Button>
          </div>
        }
      >
        {view.resource.loading ? (
          <LoadingState label="در حال دریافت مدارک بات" />
        ) : view.resource.error ? (
          <ErrorState message={view.resource.error.message} onRetry={view.resource.refresh} />
        ) : view.rows.length ? (
          <>
            <Field id="bot-import-period" label="دورهٔ مقصد پردازش">
              <Select id="bot-import-period" value={view.period} onValueChange={view.setPeriod} options={view.periodOptions} />
            </Field>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>مدرک</TableHead>
                  <TableHead>پیام‌رسان</TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead>عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.rows.map(item => (
                  <TableRow key={item.id}>
                    <TableRowHeader>
                      <p>{item.name}</p>
                      {item.duplicate_original && <Badge tone="warning">اصل مدرک تکراری است</Badge>}
                    </TableRowHeader>
                    <TableCell>{item.providerLabel}</TableCell>
                    <TableCell>{item.stateLabel}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <ButtonLink download href={item.download} variant="ghost">اصل مدرک</ButtonLink>
                        {item.state === "awaiting_import" && view.canImport && (
                          <Button disabled={!view.period} busy={view.command.busy} onClick={() => view.importFile(item)}>
                            ورود به پردازش
                          </Button>
                        )}
                        {item.state === "pending_extraction" && view.canImport && (
                          <Button variant="secondary" disabled={!extraction.status.data?.enabled} busy={extraction.command.busy} onClick={() => extraction.extract(item)}>
                            استخراج و بازبینی
                          </Button>
                        )}
                        {item.state === "awaiting_review" && view.canImport && (
                          <Button variant="secondary" busy={extraction.command.busy} onClick={() => extraction.open(item)}>
                            بازبینی اطلاعات
                          </Button>
                        )}
                        {item.sessionLink && <ButtonLink href={item.sessionLink} variant="secondary">پرونده پردازش</ButtonLink>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <CursorPagination {...view.resource} />
          </>
        ) : <EmptyState title="مدرکی از بات دریافت نشده" />}
        <FormMessage error>{view.command.error?.message}</FormMessage>
        <FormMessage error>{extraction.command.error?.message}</FormMessage>
      </Panel>
      <BotExtractionReview view={extraction} />
    </>
  );
}
