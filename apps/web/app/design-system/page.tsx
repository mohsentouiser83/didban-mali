import type { Metadata } from "next";

import { Showcase } from "@/components/design-system/showcase";

export const metadata: Metadata = {
  title: "سیستم طراحی | دیدبان مالی",
  description: "نمای زنده سیستم طراحی راست‌به‌چپ دیدبان مالی",
};

export default function DesignSystemPage() {
  return <Showcase />;
}
