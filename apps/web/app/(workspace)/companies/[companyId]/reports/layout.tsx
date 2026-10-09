"use client";

import { usePathname } from "next/navigation";
import { WorkspaceSectionNav } from "@/components/product/workspace-section-nav";
import { useWorkspace } from "@/components/product/workspace-provider";

export default function SectionLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { company } = useWorkspace();
  const base = `/companies/${company.id}`;
  if (pathname === `${base}/reports`) return <>{children}</>;
  return <><WorkspaceSectionNav label="گزارش‌ها و تحلیل" items={[
        { href: `${base}/reports`, label: "گزارش‌ها" },
        { href: `${base}/reports/analysis`, label: "تحلیل صورت‌های مالی" }
      ]} />{children}</>;
}
