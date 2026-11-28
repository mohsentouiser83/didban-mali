"use client";

import { PlusIcon, RulerIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/content-states";
import { Drawer } from "@/components/ui/drawer";
import { Field, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableHead, TableHeader, TableRow, TableRowHeader } from "@/components/ui/table";
import { useInventoryUnits } from "@/hooks/use-inventory-units";
import { useWorkspace } from "@/hooks/workspace";
import { NoCompany, PageHeader, Panel } from "./page-parts";

export function InventoryUnitsView() {
  const { company } = useWorkspace();
  return company ? <InventoryUnitsSettings key={company.id} /> : <NoCompany />;
}

function InventoryUnitsSettings() {
  const view = useInventoryUnits();
  return (
    <>
      <PageHeader
        title="واحدهای کالا"
        icon={RulerIcon}
        action={view.canAdd && (
          <Button onClick={view.show}>
            <PlusIcon size={18} aria-hidden />
            افزودن واحد
          </Button>
        )}
      />
      <Panel>
        {view.units.loading ? <LoadingState /> : view.units.error ? (
          <ErrorState message={view.units.error.message} onRetry={view.units.refresh} />
        ) : (
          <Table aria-label="واحدهای کالا">
            <TableHeader>
              <TableRow><TableHead>نام واحد</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {view.units.data?.items.map((name) => (
                <TableRow key={name}><TableRowHeader>{name}</TableRowHeader></TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
      <Drawer
        title="افزودن واحد"
        open={view.open}
        onOpenChange={(open) => { if (!open) view.close(); }}
        footer={
          <Button form="add-inventory-unit" type="submit" disabled={!view.canSave} busy={view.command.busy}>
            ذخیره
          </Button>
        }
      >
        <Form
          id="add-inventory-unit"
          fieldErrors={view.command.error?.fields}
          onSubmit={(event) => {
            event.preventDefault();
            view.save();
          }}
        >
          <Field id="inventory-unit-name" name="name" label="نام واحد">
            <Input id="inventory-unit-name" required maxLength={40} value={view.name}
              onChange={(event) => view.change(event.target.value)} />
          </Field>
          <FormMessage error>{view.command.error?.message}</FormMessage>
        </Form>
      </Drawer>
    </>
  );
}
