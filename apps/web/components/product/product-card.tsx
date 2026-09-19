import type { ComponentProps } from "react";

import { Card } from "@/components/ui/card";

/** Keeps section semantics while standardizing product surfaces on shadcn Card. */
export function ProductCard(props: ComponentProps<"section">) {
  return <Card asChild><section {...props} /></Card>;
}
