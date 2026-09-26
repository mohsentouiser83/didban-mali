"use client";

import { ProductHealthDashboard } from "@/components/product/product-health-dashboard";

export default function AdminProductHealthPage() {
  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <ProductHealthDashboard />
    </div>
  );
}
