"use client";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CoinsIcon, HashIcon, PackageIcon, StorefrontIcon } from "@phosphor-icons/react";
import { DetailField } from "@/components/ui/field-layout";
import { JournalPostingLines } from "./journal-posting-lines";
import { FormMessage } from "@/components/ui/field";
import { amount, displayDate, persian } from "@/lib/utils";
import type { usePosting } from "@/hooks/use-posting";
import type { InventoryPostingEvidence } from "@/lib/inventory";
export function PostingReviewDialog({
  view,
}: {
  view: ReturnType<typeof usePosting>;
}) {
  return (
    <Dialog
      title={`تأیید ثبت ${persian(view.reviews.length)} سند`}
      open={!!view.reviews.length}
      onOpenChange={(open) => {
        if (!open) view.close();
      }}
      className="sm:max-w-3xl"
    >
      <div className="space-y-5">
        <p className="font-medium">
          جمع اسناد منتخب: {amount(view.total)} ریال
        </p>
        {view.reviews.map((item) => (
          <section key={item.draft_id} className="space-y-3">
            <h3 className="font-medium">
              {item.snapshot.description} · {displayDate(item.snapshot.date)}
            </h3>
            <p className="text-sm text-muted">
              نسخه {persian(item.expected_version)} · جمع بدهکار و بستانکار:{" "}
              {amount(item.total_debit)} ریال
            </p>
            {item.snapshot.inventory && (
              <InventoryPostingDetails movement={item.snapshot.inventory} />
            )}
            <JournalPostingLines lines={item.snapshot.lines} />
          </section>
        ))}
        <FormMessage error>{view.command.error?.message}</FormMessage>
        <Button busy={view.command.busy} onClick={view.post}>
          تأیید و ثبت نهایی همین نسخه‌ها
        </Button>
      </div>
    </Dialog>
  );
}

function InventoryPostingDetails({ movement }: { movement: InventoryPostingEvidence }) {
  const item = [movement.item_code, movement.item_name].filter(Boolean).join(" · ");
  const warehouse = [movement.warehouse_code, movement.warehouse_name].filter(Boolean).join(" · ");
  const quantity = `${movement.quantity > 0 ? "+" : ""}${persian(movement.quantity)}`;
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">اثر بر موجودی با روش اولین وارده، اولین صادره</h4>
      <dl className="grid gap-2 sm:grid-cols-2">
        <DetailField label="کالا" value={item || movement.item_id} icon={PackageIcon} />
        <DetailField label="انبار" value={warehouse || movement.warehouse_id} icon={StorefrontIcon} />
        <DetailField label="تغییر تعداد" value={<bdi>{quantity}</bdi>} icon={HashIcon} />
        <DetailField label="تغییر ارزش موجودی (ریال)" value={<bdi>{amount(movement.value_irr)}</bdi>} icon={CoinsIcon} />
      </dl>
    </div>
  );
}
