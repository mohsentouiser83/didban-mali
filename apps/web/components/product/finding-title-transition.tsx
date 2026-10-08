import { ViewTransition } from "react";

export function FindingTitleTransition({
  companyId,
  findingId,
  title,
  as: Tag = "strong",
  className,
}: {
  companyId: string;
  findingId: string;
  title: string;
  as?: "strong" | "h2";
  className?: string;
}) {
  return (
    <ViewTransition
      name={`finding-title-${companyId}-${findingId}`}
      default="none"
      share="finding-title"
    >
      <Tag className={className}>{title}</Tag>
    </ViewTransition>
  );
}
