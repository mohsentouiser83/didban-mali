"use client";
import { useState } from "react";
import {
  CalendarBlankIcon,
  ClockIcon,
  CurrencyCircleDollarIcon,
  HashIcon,
  PlusIcon,
  CheckIcon,
  TextAaIcon,
} from "@phosphor-icons/react";
import { useModelAdministration } from "@/hooks/use-model-administration";
import { listItems } from "@/lib/api";
import { amount, displayDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { ConditionalRegion } from "@/components/ui/conditional-region";
import { Form } from "@/components/ui/form";
import { Field, FormMessage } from "@/components/ui/field";
import { Input, AmountInput } from "@/components/ui/input";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";
import { CursorPagination } from "@/components/ui/pagination";
import { ErrorState, LoadingState } from "@/components/ui/content-states";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableRowHeader,
  TableCell,
  TableEmptyCell,
} from "@/components/ui/table";
import { Panel } from "./page-parts";
const priceFields = [
  { key: "input_per_million", label: "ورودی عادی" },
  { key: "cached_input_per_million", label: "خواندن حافظه نهان" },
  { key: "cache_write_per_million", label: "نوشتن حافظه نهان" },
  { key: "output_per_million", label: "خروجی" },
] as const;
export function ModelTariffPanel({
  controller,
}: {
  controller: ReturnType<typeof useModelAdministration>;
}) {
  const { tariffs, tariffCommand, saveTariff, workspace } = controller;
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState("");
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [maxInput, setMaxInput] = useState("");
  const [maxOutput, setMaxOutput] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  return (
    <>
      <Panel
        title="تعرفه‌های مدل"
        action={
          workspace.canWrite && (
            <Button
              variant="secondary"
              onClick={() => {
                tariffCommand.clearError();
                setOpen(true);
              }}
            >
              <PlusIcon size={17} className="text-primary" aria-hidden />
              تعرفه تازه
            </Button>
          )
        }
      >
        {tariffs.loading ? (
          <LoadingState />
        ) : tariffs.error ? (
          <ErrorState
            message={tariffs.error.message}
            onRetry={tariffs.refresh}
          />
        ) : (
          <ConditionalRegion>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>نسخه تعرفه</TableHead>
                  <TableHead>مدل</TableHead>
                  <TableHead>ورودی / خروجی هر میلیون توکن (USD)</TableHead>
                  <TableHead>شروع اعتبار</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listItems(tariffs.data).length ? (
                  listItems(tariffs.data).map((tariff) => (
                    <TableRow key={tariff.id}>
                      <TableRowHeader>{tariff.price_version}</TableRowHeader>
                      <TableCell>
                        <span dir="ltr">{tariff.model}</span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {amount(tariff.input_per_million)} /{" "}
                        {amount(tariff.output_per_million)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {displayDate(tariff.effective_from)}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableEmptyCell colSpan={4} title="تعرفه‌ای ثبت نشده" />
                )}
              </TableBody>
            </Table>
            <CursorPagination {...tariffs} />
          </ConditionalRegion>
        )}
      </Panel>
      <Drawer title="ثبت نسخه تعرفه" open={open} onOpenChange={setOpen}>
        <Form
          fieldErrors={tariffCommand.error?.fields}
          onSubmit={(event) => {
            event.preventDefault();
            void saveTariff(
              {
                model: "gpt-5.6-luna",
                price_version: version.trim(),
                input_per_million: prices.input_per_million || "",
                cached_input_per_million: prices.cached_input_per_million || "",
                cache_write_per_million: prices.cache_write_per_million || "",
                output_per_million: prices.output_per_million || "",
                max_input_tokens: Number(maxInput),
                max_output_tokens: Number(maxOutput),
                effective_from: `${date}T${time}:00+03:30`,
              },
              () => {
                setOpen(false);
                setVersion("");
                setPrices({});
                setMaxInput("");
                setMaxOutput("");
                setDate("");
                setTime("");
              },
            );
          }}
        >
          <Field
            id="tariff-version"
            name="price_version"
            label="نسخه تعرفه"
            icon={TextAaIcon}
          >
            <Input
              id="tariff-version"
              required
              value={version}
              onChange={(event) => setVersion(event.target.value)}
            />
          </Field>
          <p className="text-sm text-muted">قیمت به USD برای یک میلیون توکن</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {priceFields.map((field) => (
              <Field
                key={field.key}
                id={`tariff-${field.key}`}
                name={field.key}
                label={field.label}
                icon={CurrencyCircleDollarIcon}
              >
                <AmountInput
                  id={`tariff-${field.key}`}
                  required
                  value={prices[field.key] || ""}
                  onValueChange={(value) =>
                    setPrices((previous) => ({
                      ...previous,
                      [field.key]: value,
                    }))
                  }
                />
              </Field>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="tariff-input-tokens"
              name="max_input_tokens"
              label="حداکثر توکن ورودی"
              icon={HashIcon}
              description="۱۶٬۳۸۴ تا ۲۰۰٬۰۰۰"
            >
              <Input
                id="tariff-input-tokens"
                required
                inputMode="numeric"
                pattern="[0-9]+"
                dir="ltr"
                value={maxInput}
                onChange={(event) =>
                  setMaxInput(
                    event.target.value.replace(/[۰-۹]/g, (d) =>
                      String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)),
                    ),
                  )
                }
              />
            </Field>
            <Field
              id="tariff-output-tokens"
              name="max_output_tokens"
              label="حداکثر توکن خروجی"
              icon={HashIcon}
              description="۱ تا ۴٬۰۹۶"
            >
              <Input
                id="tariff-output-tokens"
                required
                inputMode="numeric"
                pattern="[0-9]+"
                dir="ltr"
                value={maxOutput}
                onChange={(event) =>
                  setMaxOutput(
                    event.target.value.replace(/[۰-۹]/g, (d) =>
                      String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)),
                    ),
                  )
                }
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="tariff-effective-date"
              name="effective_from"
              label="تاریخ شروع اعتبار"
              icon={CalendarBlankIcon}
            >
              <PersianDatePicker
                id="tariff-effective-date"
                value={date}
                onChange={setDate}
              />
            </Field>
            <Field
              id="tariff-effective-time"
              label="ساعت (تهران)"
              icon={ClockIcon}
            >
              <Input
                id="tariff-effective-time"
                required
                dir="ltr"
                placeholder="HH:mm"
                pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
                value={time}
                onChange={(event) => setTime(event.target.value)}
              />
            </Field>
          </div>
          <FormMessage error>{tariffCommand.error?.message}</FormMessage>
          <Button type="submit" busy={tariffCommand.busy} disabled={!date}>
            <CheckIcon size={18} aria-hidden />
            ثبت تعرفه
          </Button>
        </Form>
      </Drawer>
    </>
  );
}
