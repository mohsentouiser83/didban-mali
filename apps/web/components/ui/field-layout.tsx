import { ReceiptIcon, type Icon } from "@phosphor-icons/react";
import { TruncatedText } from "./tooltip";
export function DetailField({
  label,
  value,
  icon: IconComponent = ReceiptIcon,
}: {
  label: string;
  value: React.ReactNode;
  icon?: Icon;
}) {
  return (
    <div className="h-16 min-w-0 rounded-control border border-border px-3 py-2">
      <dt className="flex items-center gap-2 text-xs leading-4 text-muted">
        <IconComponent size={16} aria-hidden className="text-primary" />
        {label}
      </dt>
      <dd className="mt-1 min-w-0 leading-6 tabular-nums">
        {typeof value === "string" ? <TruncatedText>{value}</TruncatedText> : value}
      </dd>
    </div>
  );
}
export function DetailGroup({ children }: { children: React.ReactNode }) {
  return <dl className="space-y-3">{children}</dl>;
}
