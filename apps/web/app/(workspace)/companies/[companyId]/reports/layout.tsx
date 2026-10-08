"use client";

import { WorkspaceSectionNav } from "@/components/product/workspace-section-nav";
import { useWorkspace } from "@/components/product/workspace-provider";

export default function SectionLayout({ children }: { children: React.ReactNode }) {
  const { company } = useWorkspace();
  const base = `/companies/${company.id}`;
  return <><WorkspaceSectionNav label="گزارش‌ها و تحلیل" items={[
        { href: `${base}/reports`, label: "گزارش‌ها" },
        { href: `${base}/reports/analysis`, label: "تحلیل صورت‌های مالی" }
      ]} />{children}</>;
}
