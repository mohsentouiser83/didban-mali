export interface CounterpartyForm {
  code: string;
  name: string;
  national_id: string;
  economic_code: string;
  phone: string;
  address: string;
  credit_limit_irr: string;
  active: boolean;
}

export type Counterparty = Omit<CounterpartyForm, "national_id" | "economic_code" | "phone" | "address" | "credit_limit_irr"> & {
  id: string;
  version: number;
  national_id: string | null;
  economic_code: string | null;
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
  number: string;
  direction: "sale" | "purchase";
  date: string;
  expiry_date: string;
  party_id: string;
  currency: "IRR" | "TOMAN";
  terms: string;
  lines: ProformaLineForm[];
}

export type Proforma = Omit<ProformaForm, "lines" | "expiry_date" | "terms"> & {
  id: string;
  version: number;
  expiry_date: string | null;
  terms: string | null;
  total_amount: string;
  status: string;
  lines: (Omit<ProformaLineForm, "key" | "quantity" | "item_id"> & {
    line_id: string;
    item_id: string | null;
    quantity: number;
    total: string;
  })[];
};
