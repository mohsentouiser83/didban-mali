"use client";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableHeader,
  TableRow,
  TableHead,
  TableCell,
  TableRowHeader,
} from "@/components/ui/table";
import { FormMessage } from "@/components/ui/field";
import { amount, displayDate, persian } from "@/lib/utils";
import type { usePosting } from "@/hooks/use-posting";
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>حساب</TableHead>
                  <TableHead>طرف حساب</TableHead>
                  <TableHead>بدهکار (ریال)</TableHead>
                  <TableHead>بستانکار (ریال)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {item.snapshot.lines.map((line, index) => (
                  <TableRow key={index}>
                    <TableRowHeader>
                      {line.code} · {line.name}
                    </TableRowHeader>
                    <TableCell>{line.party_id || "—"}</TableCell>
                    <TableCell>{amount(line.debit)}</TableCell>
                    <TableCell>{amount(line.credit)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
