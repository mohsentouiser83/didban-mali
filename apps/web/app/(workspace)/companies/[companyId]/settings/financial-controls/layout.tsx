"use client";

import { WorkspaceSectionNav } from "@/components/product/workspace-section-nav";
import { useWorkspace } from "@/components/product/workspace-provider";

export default function SectionLayout({ children }: { children: React.ReactNode }) {
  const { company } = useWorkspace();
  const base = `/companies/${company.id}`;
  return <><WorkspaceSectionNav label="تنظیمات کنترل مالی" items={[
        { href: `${base}/settings/financial-controls/policies`, label: "خط‌مشی‌های پایش" },
        { href: `${base}/settings/financial-controls/automations`, label: "چرخه‌های خودکار" }
      ]} />{children}</>;
}
