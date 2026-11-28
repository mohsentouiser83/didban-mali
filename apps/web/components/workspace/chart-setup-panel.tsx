"use client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Form } from "@/components/ui/form";
import { FormMessage, RequiredIndicator } from "@/components/ui/field";
import { SingleFilePicker } from "@/components/ui/single-file-picker";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmptyCell,
  TableRowHeader,
} from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { useChartSetup } from "@/hooks/use-accounting-setup";
import {
  ACCOUNT_NATURE_OPTIONS,
  type AccountNature,
} from "@/lib/accounting";
import {
  ACCOUNT_LEVEL_OPTIONS,
  type AccountLevel,
} from "@/lib/account-catalogue";
import { persian } from "@/lib/utils";
export function ChartSetupPanel({ onImported }: { onImported: () => void }) {
  const c = useChartSetup(onImported);
  return (
    <Form
      onSubmit={(event) => {
        event.preventDefault();
        void c.preview();
      }}
      fieldErrors={c.command.error?.fields}
    >
      <div className="flex flex-wrap gap-3">
        <Button
          variant="secondary"
          busy={c.command.busy}
          onClick={() => void c.loadTemplate()}
        >
          الگوی خدماتی قابل تغییر
        </Button>
        <SingleFilePicker
          accept=".csv,.xlsx"
          label="فایل کدینگ CSV / XLSX"
          busy={c.command.busy}
          onFile={(file) => void c.loadFile(file)}
        />
      </div>
      <FormMessage error>{c.command.error?.message}</FormMessage>
      {c.total > 0 && (
        <div className="mt-5 space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span>{persian(c.total)} حساب</span>
            <Badge tone="success">{persian(c.total - c.invalidCount)} {c.previewId ? "ردیف آماده ورود" : "ردیف آماده بررسی"}</Badge>
            {c.invalidCount > 0 && (
              <Badge tone="danger">{persian(c.invalidCount)} ردیف خطادار</Badge>
            )}
          </div>
          <Table toolbar={false} title="ردیف‌های فایل کدینگ">
            <TableHeader>
              <TableRow>
                <TableHead columnFilter={c.columnFilter("code")}>کد حساب <RequiredIndicator /></TableHead>
                <TableHead columnFilter={c.columnFilter("name")}>نام حساب <RequiredIndicator /></TableHead>
                <TableHead columnFilter={c.columnFilter("level")}>سطح حساب</TableHead>
                <TableHead columnFilter={c.columnFilter("parent")}>کد حساب بالادست</TableHead>
                <TableHead columnFilter={c.columnFilter("nature")}>ماهیت حساب <RequiredIndicator /></TableHead>
                <TableHead columnFilter={c.columnFilter("active")}>فعال</TableHead>
                <TableHead columnFilter={c.columnFilter("status")}>اعتبارسنجی</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {c.visibleRows.length === 0 && <TableEmptyCell colSpan={7} title="ردیفی با این فیلترها پیدا نشد" />}
              {c.visibleRows.map((row) => (
                <TableRow key={row.index}>
                  <TableRowHeader>
                    <Input
                      required
                      aria-label={`کد حساب ردیف ${row.index + 1}`}
                      dir="ltr"
                      maxLength={100}
                      value={row.code}
                      disabled={c.command.busy}
                      onChange={(e) =>
                        c.change(row.index, { code: e.target.value })
                      }
                    />
                  </TableRowHeader>
                  <TableCell>
                    <Input
                      required
                      aria-label={`نام حساب ردیف ${row.index + 1}`}
                      maxLength={150}
                      value={row.name}
                      disabled={c.command.busy}
                      onChange={(e) =>
                        c.change(row.index, { name: e.target.value })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Select label={`سطح حساب ردیف ${row.index + 1}`}
                      value={row.level || "unclassified"} disabled={c.command.busy}
                      options={[{ value: "unclassified", label: "تعیین‌نشده" }, ...ACCOUNT_LEVEL_OPTIONS]}
                      onValueChange={(level) => c.change(row.index, { level: level === "unclassified" ? null : level as AccountLevel, parent_code: null })} />
                  </TableCell>
                  <TableCell>
                    {row.parentRequired || row.level === "detail" ? <div className="flex items-center gap-2">
                      <Input required={row.parentRequired} aria-label={`کد حساب بالادست ردیف ${row.index + 1}`} dir="ltr"
                        maxLength={100} value={row.parent_code || ""} disabled={c.command.busy}
                        onChange={(event) => c.change(row.index, { parent_code: event.target.value || null })} />
                      {row.parentRequired && <RequiredIndicator />}
                    </div> : "—"}
                  </TableCell>
                  <TableCell>
                    <Select
                      aria-required
                      label={`ماهیت حساب ردیف ${row.index + 1}`}
                      value={row.nature ?? "debit"}
                      disabled={c.command.busy}
                      onValueChange={(nature) =>
                        c.change(row.index, {
                          nature: nature as AccountNature,
                        })
                      }
                      options={ACCOUNT_NATURE_OPTIONS}
                    />
                  </TableCell>
                  <TableCell>
                    <Checkbox
                      id={`chart-active-${row.index}`}
                      label={`حساب ${row.index + 1} فعال`}
                      checked={row.active}
                      disabled={c.command.busy}
                      onCheckedChange={(active) =>
                        c.change(row.index, { active })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    {row.error ? (
                      <Badge tone="danger">{row.error}</Badge>
                    ) : (
                      <Badge tone={c.previewId ? "success" : "neutral"}>{c.previewId ? "آماده ورود" : "آماده بررسی"}</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination
            page={c.page}
            total={c.filteredTotal}
            pageSize={c.pageSize}
            onPrevious={c.previousPage}
            onNext={c.nextPage}
          />
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" busy={c.command.busy} type="submit">
              بررسی و پیش‌نمایش
            </Button>
            <Button
              busy={c.command.busy}
              disabled={!c.previewId}
              onClick={() => void c.apply()}
            >
              تأیید ورود حساب‌ها
            </Button>
          </div>
        </div>
      )}
    </Form>
  );
}
