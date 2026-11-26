import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { FormMessage } from "@/components/ui/field";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableRowHeader } from "@/components/ui/table";
import type { ChequeController } from "@/hooks/use-cheques";
import { persian } from "@/lib/utils";

export function ChequeImportPreview({ c }: { c: ChequeController }) {
  const preview = c.importPreview;

  return (
    <Drawer
      open={preview !== null}
      onOpenChange={(open) => { if (!open) c.closeImportPreview(); }}
      title="پیش‌نمایش ورود چک‌ها"
      footer={(
        <Button
          onClick={() => void c.confirmImport()}
          busy={c.importBusy}
          disabled={!preview?.rows.length || preview.rows.some((row) => !row.valid)}
        >
          ثبت چک‌ها
        </Button>
      )}
    >
      {preview?.headerError ? <FormMessage error>{preview.headerError}</FormMessage> : (
        <Table showSearch={false}>
          <TableHeader>
            <TableRow><TableHead>ردیف</TableHead><TableHead>چک</TableHead><TableHead>نتیجه بررسی</TableHead></TableRow>
          </TableHeader>
          <TableBody>{preview?.rows.map((row) => (
            <TableRow key={row.rowNumber}>
              <TableRowHeader>{persian(row.rowNumber)}</TableRowHeader>
              <TableCell>{row.summary}</TableCell>
              <TableCell>{row.error || "آماده ثبت"}</TableCell>
            </TableRow>
          ))}</TableBody>
        </Table>
      )}
    </Drawer>
  );
}
