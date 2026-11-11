import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableRowHeader,
} from "@/components/ui/table";
import type { PostingPreview } from "@/hooks/use-posting";
import { amount } from "@/lib/utils";

export function JournalPostingLines({ lines }: { lines: PostingPreview["snapshot"]["lines"] }) {
  return (
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
        {lines.map((line, index) => (
          <TableRow key={index}>
            <TableRowHeader>{line.code} · {line.name}</TableRowHeader>
            <TableCell>{line.party_id || "—"}</TableCell>
            <TableCell>{amount(line.debit)}</TableCell>
            <TableCell>{amount(line.credit)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
