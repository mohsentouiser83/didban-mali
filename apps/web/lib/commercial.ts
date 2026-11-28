export const counterpartyEntityKindOptions = [
  { value: "natural_person", label: "حقیقی" },
  { value: "legal_entity", label: "حقوقی" },
  { value: "partnership", label: "مشارکت" },
] as const;
export type CounterpartyEntityKind = typeof counterpartyEntityKindOptions[number]["value"];
export function counterpartyEntityKindLabel(kind?: string | null) {
  const value = kind === "other" ? "partnership" : kind;
  return counterpartyEntityKindOptions.find((option) => option.value === value)?.label ?? "—";
}

export function counterpartyNationalIdLabel(kind?: string | null) {
  if (kind === "natural_person") return "کد ملی";
  if (kind === "legal_entity") return "شناسه ملی";
  return "شناسه ملی ثبت‌شده";
}

export const counterpartyTypeOptions = [
  { value: "supplier", label: "تأمین‌کننده" },
  { value: "customer", label: "مشتری" },
  { value: "employee", label: "کارمند" },
  { value: "other", label: "سایر" },
] as const;
export type CounterpartyType = typeof counterpartyTypeOptions[number]["value"];
export function counterpartyTypeLabel(type: CounterpartyType) {
  return counterpartyTypeOptions.find((option) => option.value === type)?.label ?? "—";
}

export interface CounterpartyForm {
  type: CounterpartyType | "";
  entity_kind: CounterpartyEntityKind;
  roles: CounterpartyType[];
  name: string;
  national_id: string;
  economic_code: string;
  registration_number: string;
  postal_code: string;
  email: string;
  phone: string;
  address: string;
  credit_limit_irr: string;
  active: boolean;
}

export type Counterparty = Omit<
  CounterpartyForm,
  "type" | "entity_kind" | "roles" | "national_id" | "economic_code" | "registration_number" | "postal_code" | "email" | "phone" | "address" | "credit_limit_irr"
> & {
  type: CounterpartyType;
  id: string;
  code: string;
  version: number;
  entity_kind?: CounterpartyEntityKind | "other";
  roles?: CounterpartyType[];
  national_id: string | null;
  economic_code: string | null;
  registration_number?: string | null;
  postal_code?: string | null;
  email?: string | null;
  phone: string | null;
  address: string | null;
  credit_limit_irr: string | null;
};

export function counterpartyFormKind(row?: Counterparty): CounterpartyEntityKind {
  if (!row) return "natural_person";
  if (row.entity_kind === "other") return "partnership";
  return row.entity_kind ?? "partnership";
}

export function counterpartyForm(row?: Counterparty): CounterpartyForm {
  const roles = row?.roles?.length ? row.roles : (row?.type ? [row.type] : []);
  return {
    name: row?.name ?? "",
    type: row?.type ?? "",
    entity_kind: counterpartyFormKind(row),
    roles,
    national_id: row?.national_id ?? "",
    economic_code: row?.economic_code ?? "",
    registration_number: row?.registration_number ?? "",
    postal_code: row?.postal_code ?? "",
    email: row?.email ?? "",
    phone: row?.phone ?? "",
    address: row?.address ?? "",
    credit_limit_irr: row?.credit_limit_irr ?? "",
    active: row?.active ?? true,
  };
}

export function normalizeCounterpartyPayload(form: CounterpartyForm, row?: Counterparty) {
  const { entity_kind, national_id, economic_code, ...fields } = form;
  const roles = fields.roles.length ? fields.roles : (fields.type ? [fields.type] : []);
  const type = fields.type || (roles.length === 1 ? roles[0] : "other");
  const kindChanged = !row || entity_kind !== counterpartyFormKind(row);
  const nationalId = entity_kind === "partnership" ? null : national_id.trim() || null;
  const economicCode = economic_code.trim() || null;
  return {
    ...fields,
    type,
    roles,
    name: fields.name.trim(),
    ...(kindChanged ? { entity_kind, national_id: nationalId } : {}),
    ...(!kindChanged && entity_kind !== "partnership" && nationalId !== row?.national_id ? { national_id: nationalId } : {}),
    ...(!row || economicCode !== row.economic_code ? { economic_code: economicCode } : {}),
    registration_number: fields.registration_number.trim() || null,
    postal_code: fields.postal_code.trim() || null,
    email: fields.email.trim() || null,
    phone: fields.phone.trim() || null,
    address: fields.address.trim() || null,
    credit_limit_irr: fields.credit_limit_irr || null,
  };
}

export interface ProformaLineForm {
  key: number;
  item_id: string;
  description: string;
  quantity: string;
  unit_price: string;
  discount: string;
}

export interface ProformaForm {
  direction: "sale" | "purchase";
  date: string;
  expiry_date: string;
  party_id: string;
  currency: "IRR" | "TOMAN";
  invoice_discount: string;
  terms: string;
  lines: ProformaLineForm[];
}

export type Proforma = Omit<ProformaForm, "lines" | "expiry_date" | "terms"> & {
  number: string;
  id: string;
  version: number;
  expiry_date: string | null;
  terms: string | null;
  total_amount: string;
  invoice_discount?: string;
  status: string;
  party_name?: string | null;
  party_code?: string | null;
  converted_operation_id?: string | null;
  converted_draft_id?: string | null;
  converted_document_id?: string | null;
  converted_document_number?: string | null;
  converted_document_status?: string | null;
  lines: (Omit<ProformaLineForm, "key" | "quantity" | "item_id"> & {
    line_id: string;
    item_id: string | null;
    line_kind?: "goods" | "service";
    quantity: number;
    total: string;
  })[];
};
