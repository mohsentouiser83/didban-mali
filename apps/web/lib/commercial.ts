export const counterpartyEntityKindOptions = [
  { value: "natural_person", label: "حقیقی" },
  { value: "legal_entity", label: "حقوقی" },
  { value: "other", label: "سایر" },
] as const;
export type CounterpartyEntityKind = typeof counterpartyEntityKindOptions[number]["value"];
export function counterpartyEntityKindLabel(kind?: string | null) {
  return counterpartyEntityKindOptions.find((option) => option.value === kind)?.label ?? "سایر";
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
  entity_kind?: CounterpartyEntityKind;
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
