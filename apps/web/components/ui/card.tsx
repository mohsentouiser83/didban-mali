import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-[var(--ds-card-radius)] border border-[var(--ds-card-border)] bg-[var(--ds-card-bg)] text-[var(--ds-foreground)] shadow-[var(--ds-shadow-sm)]", className)} {...props} />;
}
function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1.5 p-5 md:p-6", className)} {...props} />;
}
function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-base font-extrabold md:text-lg", className)} {...props} />;
}
function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-xs leading-6 text-[var(--ds-foreground-soft)]", className)} {...props} />;
}
function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 pb-5 md:px-6 md:pb-6", className)} {...props} />;
}
function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center gap-3 px-5 pb-5 md:px-6 md:pb-6", className)} {...props} />;
}

export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
