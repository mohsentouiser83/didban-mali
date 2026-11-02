"use client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { Input, Textarea } from "@/components/ui/input";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";
import { Select } from "@/components/ui/select";
import {
  EmptyState,
  ErrorState,
  LoadingState,
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
import { usePeriodTasks, type PeriodTask } from "@/hooks/use-period-tasks";
import { displayDate } from "@/lib/utils";
export function PeriodTasksPanel({
  periodId,
  items,
  closed,
  refresh,
}: {
  periodId: string;
  items: PeriodTask[];
  closed: boolean;
  refresh: () => void;
}) {
  const c = usePeriodTasks(periodId, refresh);
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-medium">موارد اختصاصی دوره</h3>
        {c.canWrite && !closed && (
          <Button variant="secondary" onClick={() => c.edit(null)}>
            افزودن مورد
          </Button>
        )}
      </div>
      {!items.length ? (
        <EmptyState compact title="مورد اختصاصی ثبت نشده" />
      ) : (
        <Table aria-label="موارد اختصاصی چک‌لیست دوره">
          <TableHeader>
            <TableRow>
              <TableHead>مورد</TableHead>
              <TableHead>مسئول</TableHead>
              <TableHead>مهلت</TableHead>
              <TableHead>وضعیت</TableHead>
              <TableHead>عملیات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableRowHeader>
                  {item.title}
                  <Badge tone="neutral">
                    {item.required ? "الزامی" : "اختیاری"}
                  </Badge>
                  {item.completion_reason && (
                    <p className="mt-1 text-sm text-muted">
                      {item.completion_reason}
                    </p>
                  )}
                </TableRowHeader>
                <TableCell>
                  {item.responsible_member_id
                    ? c.members.data?.items.find(
                        (member) =>
                          member.membership_id === item.responsible_member_id,
                      )?.name || "عضو تعیین‌شده"
                    : "—"}
                </TableCell>
                <TableCell>
                  {item.due_date ? displayDate(item.due_date) : "—"}
                </TableCell>
                <TableCell>
                  <Badge tone={item.completed ? "success" : "warning"}>
                    {item.completed ? "انجام‌شده" : "در انتظار"}
                  </Badge>
                </TableCell>
                <TableCell>
                  {c.canWrite && !closed && (
                    <Button variant="ghost" onClick={() => c.edit(item)}>
                      بررسی و ویرایش
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Dialog
        open={c.open}
        onOpenChange={c.setOpen}
        title={c.editing ? "ویرایش مورد چک‌لیست" : "مورد تازهٔ چک‌لیست"}
      >
        <Form
          onSubmit={(e) => {
            e.preventDefault();
            void c.save();
          }}
          fieldErrors={c.command.error?.fields}
        >
          <Field id="task-title" label="عنوان">
            <Input
              id="task-title"
              required
              maxLength={200}
              value={c.form.title}
              onChange={(e) => c.set({ title: e.target.value })}
            />
          </Field>
          <Checkbox
            id="task-required"
            label="انجام این مورد برای بستن دوره الزامی است"
            checked={c.form.required}
            onCheckedChange={(required) => c.set({ required })}
          />
          {c.members.loading ? (
            <LoadingState variant="message" />
          ) : c.members.error ? (
            <ErrorState
              message={c.members.error.message}
              onRetry={c.members.refresh}
            />
          ) : (
            <>
              <Select
                label="مسئول"
                value={c.form.responsible_member_id}
                options={[
                  { value: "", label: "بدون مسئول" },
                  ...(c.members.data?.items || []).map((m) => ({
                    value: m.membership_id,
                    label: m.name,
                  })),
                ]}
                onValueChange={(responsible_member_id) =>
                  c.set({ responsible_member_id })
                }
              />
            </>
          )}
          <Field id="task-due" label="مهلت">
            <PersianDatePicker
              id="task-due"
              value={c.form.due_date}
              onChange={(due_date) => c.set({ due_date })}
              label="مهلت مورد چک‌لیست"
            />
          </Field>
          <Checkbox
            id="task-completed"
            label="انجام شده است"
            checked={c.form.completed}
            onCheckedChange={(completed) => c.set({ completed })}
          />
          {c.editing && (
            <Checkbox
              id="task-active"
              label="در چک‌لیست فعال باشد"
              checked={c.form.active}
              onCheckedChange={(active) => c.set({ active })}
            />
          )}
          <Field
            id="task-reason"
            label={c.form.completed ? "نتیجه بررسی و دلیل تغییر" : "دلیل تغییر"}
          >
            <Textarea
              id="task-reason"
              required
              maxLength={1000}
              value={c.form.reason}
              onChange={(e) => c.set({ reason: e.target.value })}
            />
          </Field>
          <FormMessage error>{c.command.error?.message}</FormMessage>
          <Button type="submit" busy={c.command.busy}>
            ذخیره مورد
          </Button>
        </Form>
      </Dialog>
    </section>
  );
}
