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
  const showDetail = lines.some((line) => line.detail_account_id);
  const showParty = lines.some((line) => line.party_id);
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>حساب</TableHead>
          {showDetail && <TableHead>حساب تفصیلی</TableHead>}
          {showParty && <TableHead>طرف حساب</TableHead>}
          <TableHead>بدهکار (ریال)</TableHead>
          <TableHead>بستانکار (ریال)</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lines.map((line, index) => (
          <TableRow key={index}>
            <TableRowHeader>{line.code} · {line.name}</TableRowHeader>
            {showDetail && (
              <TableCell>
                {line.detail_code ? `${line.detail_code} · ${line.detail_name}` : "—"}
              </TableCell>
            )}
            {showParty && <TableCell>{line.party_id || "—"}</TableCell>}
            <TableCell>{amount(line.debit)}</TableCell>
            <TableCell>{amount(line.credit)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
