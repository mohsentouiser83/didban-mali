"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/product-api";
import type { Company } from "@/lib/product-types";
export function useCreateCompany(onCreated?: (company: Company) => void) {
  const pending = useRef(false);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(data: FormData) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const company = await api<Company>("/companies", {
        method: "POST",
        body: JSON.stringify({
          legal_name: data.get("legal_name"),
          national_id: data.get("national_id") || null,
          fiscal_year_start_month: Number(data.get("fiscal_year_start_month")),
        }),
      });
      onCreated?.(company);
      router.replace(`/companies/${company.id}/overview`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "شرکت ساخته نشد.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return { busy, error, submit };
}
