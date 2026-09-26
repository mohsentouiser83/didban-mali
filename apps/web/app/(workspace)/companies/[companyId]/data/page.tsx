"use client";

import { Suspense } from "react";
import { DataCenterWorkspace } from "@/components/product/data-center-workspace";
import { useWorkspace } from "@/components/product/workspace-provider";

export default function DataPage() {
  const { company } = useWorkspace();
  return (
    <Suspense
      fallback={
        <div className="py-20 text-center text-xs text-muted-foreground">
          در حال بارگذاری مرکز داده‌ها…
        </div>
      }
    >
      <DataCenterWorkspace company={company} />
    </Suspense>
  );
}
