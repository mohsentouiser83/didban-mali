"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/components/product/workspace-provider";

export default function ImportsPage() {
  const { company } = useWorkspace();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/companies/${company.id}/data`);
  }, [company.id, router]);

  return (
    <div className="py-20 text-center text-xs text-muted-foreground" dir="rtl">
      در حال انتقال به مرکز مدیریت داده‌ها…
    </div>
  );
}
