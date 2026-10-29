import { AppIcon } from "@/components/ui/app-icon";
import { Button } from "@/components/ui/button";
import { Field, Input, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { Dialog } from "@/components/ui/dialog";
import {
  Table,
  TableHead,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  TableRowHeader,
  TableEmptyCell,
} from "@/components/ui/table";

export type ChargeModel = { id: string; time: string; reserved: string };
export function BudgetView({
  ceiling,
  busy,
  error,
  success,
  charges,
  more,
  busyMore,
  onCeiling,
  onSave,
  onSelect,
  onMore,
}: {
  ceiling: string;
  busy: boolean;
  error: string | null;
  success: boolean;
  charges: ChargeModel[];
  more: boolean;
  busyMore: boolean;
  onCeiling: (value: string) => void;
  onSave: () => void;
  onSelect: (id: string) => void;
  onMore: () => void;
}) {
  return (
    <div className="space-y-7">
      <section className="rounded-panel border border-border bg-surface p-5 sm:p-7">
        <Form
          onSubmit={(e) => {
            e.preventDefault();
            onSave();
          }}
          className="space-y-5"
        >
          <Field
            icon="Coins"
            id="model-budget-ceiling"
            label="سقف ماهانه نصب · دلار"
          >
            <Input
              id="model-budget-ceiling"
              dir="ltr"
              inputMode="decimal"
              required
              pattern="(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,8})?"
              value={ceiling}
              onChange={(e) => onCeiling(e.target.value)}
              disabled={busy}
            />
          </Field>
          <FormMessage>{error}</FormMessage>
          {success ? (
            <FormMessage success>سقف هزینه ثبت شد.</FormMessage>
          ) : null}
          <Button type="submit" disabled={busy}>
            <AppIcon name="Save" />
            {busy ? "در حال ثبت…" : "ثبت سقف"}
          </Button>
        </Form>
      </section>
      <section className="space-y-4">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <AppIcon name="Coins" className="text-primary" />
          درخواست‌های نیازمند تعیین هزینه
        </h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>درخواست</TableHead>
              <TableHead>زمان</TableHead>
              <TableHead>رزرو · دلار</TableHead>
              <TableHead>بررسی</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {charges.length ? (
              charges.map((c) => (
                <TableRow key={c.id}>
                  <TableRowHeader>
                    <bdi className="break-all text-xs">{c.id}</bdi>
                  </TableRowHeader>
                  <TableCell>{c.time}</TableCell>
                  <TableCell>{c.reserved}</TableCell>
                  <TableCell>
                    <Button variant="secondary" onClick={() => onSelect(c.id)}>
                      <AppIcon name="Save" />
                      ثبت هزینه واقعی
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableEmptyCell colSpan={4} title="درخواست نامشخصی نیست" />
              </TableRow>
            )}
          </TableBody>
        </Table>
        {more ? (
          <Button onClick={onMore} disabled={busyMore}>
            <AppIcon name="ChevronsDown" />
            نمایش بیشتر
          </Button>
        ) : null}
      </section>
    </div>
  );
}
export function CostReceiptDialog({
  id,
  actual,
  busy,
  error,
  onActual,
  onSubmit,
  onClose,
}: {
  id: string;
  actual: string;
  busy: boolean;
  error: string | null;
  onActual: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      icon="Coins"
      open
      title="ثبت هزینه واقعی"
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <p className="break-all text-xs text-muted">
          <bdi>{id}</bdi>
        </p>
        <Field
          icon="Coins"
          id="model-actual-cost"
          label="هزینه واقعی درخواست · دلار"
        >
          <Input
            id="model-actual-cost"
            required
            inputMode="decimal"
            dir="ltr"
            pattern="(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,8})?"
            value={actual}
            onChange={(e) => onActual(e.target.value)}
            disabled={busy}
          />
        </Field>
        <FormMessage>{error}</FormMessage>
        <Button disabled={busy} type="submit">
          <AppIcon name="Save" />
          {busy ? "در حال ثبت…" : "ثبت هزینه واقعی"}
        </Button>
      </Form>
    </Dialog>
  );
}
