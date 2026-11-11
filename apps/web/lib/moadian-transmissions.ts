export interface MoadianTransmission {
  id: string;
  invoice_id: string;
  invoice_version: number;
  invoice_reference: string;
  tax_id?: string | null;
  uid?: string | null;
  reference_number?: string | null;
  status: string;
  can_inquire: boolean;
  can_retry: boolean;
  error_codes: string[];
  created_at: string;
}

export interface MoadianTransmissions {
  items: MoadianTransmission[];
  configured: boolean;
  can_submit: boolean;
  next_cursor: string | null;
}

export interface MoadianCandidate {
  id: string;
  version: number;
  reference: string;
  date: string;
  amount: string;
  party_id: string;
}

export interface MoadianPreview {
  invoice_id: string;
  invoice_version: number;
  invoice_reference: string;
  invoice_date: string;
  amount: string;
  tax_id: string;
  seller_tax_number: string;
  digest: string;
}

export interface MoadianFiscalForm {
  tax_id: string;
  issued_time: string;
  buyer_type: "" | "natural" | "legal";
  buyer_tax_number: string;
  item_tax_id: string;
  unit_code: string;
  vat_treatment: "" | "exempt" | "zero_rated";
  vat_evidence: string;
}

export type MoadianFiscalPayload = Omit<MoadianFiscalForm, "issued_time"> & {
  invoice_id: string;
  invoice_version: number;
  issued_at: string;
};

const tehran = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Tehran",
  timeZoneName: "longOffset",
});

/** Interpret the entered clock time in Tehran even if the browser is elsewhere. */
export function tehranIssuedAt(date: string, clock: string) {
  if (!/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(clock)) return undefined;
  const wallTime = date + "T" + clock + ":00";
  const naive = new Date(wallTime + "Z");
  if (!Number.isFinite(naive.getTime())) return undefined;
  const offsetFor = (value: Date) =>
    tehran.formatToParts(value).find((part) => part.type === "timeZoneName")?.value.slice(3);
  const offset = offsetFor(naive);
  if (!offset || offsetFor(new Date(wallTime + offset)) !== offset) return undefined;
  return wallTime + offset;
}

type BadgeTone = "neutral" | "success" | "warning" | "danger" | "primary";

const statuses: Record<string, { label: string; tone: BadgeTone }> = {
  queued: { label: "ارسال‌شده، در انتظار نتیجه", tone: "primary" },
  accepted: { label: "پذیرفته‌شده", tone: "success" },
  rejected: { label: "ردشده", tone: "danger" },
  unknown: { label: "نتیجه نامشخص", tone: "warning" },
  not_sent: { label: "ارسال نشده", tone: "warning" },
};

export function moadianStatus(status: string) {
  return statuses[status] ?? { label: "نیازمند بررسی", tone: "warning" as const };
}
