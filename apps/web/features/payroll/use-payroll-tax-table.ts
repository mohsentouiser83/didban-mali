"use client";
import { useState } from "react";
import table from "../../../../contracts/payroll/iran-1405-tax.json";

type Band = { up_to: string; rate: string };
export function usePayrollTaxTable() {
  const [exemption, setExemption] = useState("");
  const [bands, setBands] = useState<Band[]>([{ up_to: "", rate: "" }]);
  const [loaded, setLoaded] = useState(false);
  function load() {
    setExemption(table.monthly_exemption);
    setBands(
      table.monthly_bands_after_exemption.map((b) => ({
        up_to: b.up_to ?? "",
        rate: b.rate,
      })),
    );
    setLoaded(true);
  }
  function update(index: number, field: keyof Band, value: string) {
    setBands((old) =>
      old.map((b, i) => (i === index ? { ...b, [field]: value } : b)),
    );
  }
  return {
    exemption,
    setExemption,
    bands,
    update,
    loaded,
    load,
    add: () => setBands((old) => [...old, { up_to: "", rate: "" }]),
    sourceUrl: table.source.url,
    matchesOfficialTable:
      loaded &&
      exemption === table.monthly_exemption &&
      bands.length === table.monthly_bands_after_exemption.length &&
      bands.every(
        (b, i) =>
          b.up_to === (table.monthly_bands_after_exemption[i].up_to ?? "") &&
          b.rate === table.monthly_bands_after_exemption[i].rate,
      ),
  };
}
