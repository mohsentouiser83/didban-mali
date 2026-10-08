"use client";

import { WorkspaceSectionNav } from "@/components/product/workspace-section-nav";
import { useWorkspace } from "@/components/product/workspace-provider";

export default function SectionLayout({ children }: { children: React.ReactNode }) {
  const { company } = useWorkspace();
  const base = `/companies/${company.id}`;
  return <><WorkspaceSectionNav label="داده‌ها و اتصال‌ها" items={[
        { href: `${base}/data`, label: "داده‌ها" },
        { href: `${base}/data/connections`, label: "اتصال‌ها" }
      ]} />{children}</>;
}
