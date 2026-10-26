"use client";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { api } from "@/lib/product-api";
export function useSupportTicket(companyId: string, onOpenChange: (open: boolean) => void, request: typeof api = api) {
  const pathname = usePathname();
  const [category, setCategory] = useState<
    "P1_CRITICAL" | "P2_HIGH" | "P3_NORMAL" | "P4_QUESTION"
  >("P3_NORMAL");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await request(`/companies/${companyId}/support/tickets`, {
        method: "POST",
        body: JSON.stringify({
          category,
          subject,
          description,
          current_route: pathname,
          safe_diagnostic_json: {
            url: pathname,
            viewport:
              typeof window !== "undefined"
                ? `${window.innerWidth}x${window.innerHeight}`
                : "unknown",
            client_time: new Date().toISOString(),
          },
        }),
      });
      setSuccess(true);

    } catch (err) {
      setError(err instanceof Error ? err.message : "ارسال تیکت با خطا مواجه شد.");
    } finally {
      setSubmitting(false);
    }
  };

  function close(open: boolean) {
    if (submitting) return;
    if (!open && success) { setSuccess(false); setSubject(""); setDescription(""); setError(null); }
    onOpenChange(open);
  }

 return { category, setCategory, subject, setSubject, description, setDescription, submitting, success, error, handleSubmit, close, pathname };
}
