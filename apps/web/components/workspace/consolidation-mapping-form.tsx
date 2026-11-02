"use client";
import { Dialog } from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { Field, FormMessage } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import type { useConsolidation } from "@/hooks/use-consolidation";
export function ConsolidationMappingForm({
  view,
}: {
  view: ReturnType<typeof useConsolidation>;
}) {
  return (
    <Dialog
      title="نگاشت طرف‌های درون‌گروهی"
      open={view.mappingOpen}
      onOpenChange={(open) => {
        if (!open) view.closeMapping();
      }}
    >
      <Form
        fieldErrors={view.command.error?.fields}
        onSubmit={(event) => {
          event.preventDefault();
          view.saveMapping();
        }}
      >
        <Field id="map-left-company" label="شرکت اول">
          <Select
            id="map-left-company"
            value={view.mappingValue.left_company}
            onValueChange={(left_company) =>
              view.changeMapping({ left_company })
            }
            options={view.companyOptions}
          />
        </Field>
        <Field
          id="map-left-party"
          label="شناسه شرکت دوم در طرف‌حساب‌های شرکت اول"
        >
          <Input
            id="map-left-party"
            required
            maxLength={100}
            value={view.mappingValue.left_party_id}
            onChange={(event) =>
              view.changeMapping({ left_party_id: event.target.value })
            }
          />
        </Field>
        <Field id="map-right-company" label="شرکت دوم">
          <Select
            id="map-right-company"
            value={view.mappingValue.right_company}
            onValueChange={(right_company) =>
              view.changeMapping({ right_company })
            }
            options={view.companyOptions}
          />
        </Field>
        <Field
          id="map-right-party"
          label="شناسه شرکت اول در طرف‌حساب‌های شرکت دوم"
        >
          <Input
            id="map-right-party"
            required
            maxLength={100}
            value={view.mappingValue.right_party_id}
            onChange={(event) =>
              view.changeMapping({ right_party_id: event.target.value })
            }
          />
        </Field>
        <Checkbox
          id="ownership-full"
          checked={view.mappingValue.ownership_100}
          label="دامنهٔ گروه فقط شرکت‌های با مالکیت کامل ۱۰۰٪ است."
          onCheckedChange={(ownership_100) =>
            view.changeMapping({ ownership_100 })
          }
        />
        <Field id="ownership-note" label="مبنای اظهار مالکیت">
          <Textarea
            id="ownership-note"
            required
            maxLength={500}
            value={view.mappingValue.ownership_note}
            onChange={(event) =>
              view.changeMapping({ ownership_note: event.target.value })
            }
          />
        </Field>
        <FormMessage error>{view.command.error?.message}</FormMessage>
        <Button
          type="submit"
          disabled={!view.mappingValue.ownership_100}
          busy={view.command.busy}
        >
          ثبت نگاشت و اظهار
        </Button>
      </Form>
    </Dialog>
  );
}
