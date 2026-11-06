"use client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Form } from "@/components/ui/form";
import { FormMessage } from "@/components/ui/field";
import { SingleFilePicker } from "@/components/ui/single-file-picker";
import { StatusMessage } from "@/components/ui/content-states";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableRowHeader,
} from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { useChartSetup } from "@/hooks/use-accounting-setup";
import { persian } from "@/lib/utils";
import { DrawerAction } from "@/components/ui/drawer-action";
export function ChartSetupPanel({ onImported }: { onImported: () => void }) {
  const c = useChartSetup(onImported);
  return (
    <div className="mb-5"><DrawerAction title="الگو و ورود کدینگ" action="ورود کدینگ" busy={c.command.busy}>
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
            <StatusMessage tone="primary">
              الگوی اولیه قابل ویرایش است؛ نگاشت قانونی یا ثبت مالی تأییدشده
              نیست. کدهای موجود جایگزین نمی‌شوند.
            </StatusMessage>
            <p>{persian(c.total)} حساب</p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>کد حساب</TableHead>
                  <TableHead>نام حساب</TableHead>
                  <TableHead>فعال</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
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
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pagination
              page={c.page}
              total={c.total}
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
    </DrawerAction></div>
  );
}
