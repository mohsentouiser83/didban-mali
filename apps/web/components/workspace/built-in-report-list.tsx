import { FileTextIcon } from "@phosphor-icons/react";
import { ButtonLink } from "@/components/ui/button";
import { builtInReports } from "@/lib/report-archive-catalog";
import { Panel } from "./page-parts";

export function BuiltInReportList() {
  return (
    <Panel title="گزارش‌های ثابت سامانه">
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {builtInReports.map(({ href, label }) => (
          <li key={href} className="min-w-0">
            <ButtonLink
              href={href}
              variant="secondary"
              className="min-h-11 w-full justify-start"
            >
              <FileTextIcon size={18} aria-hidden />
              {label}
            </ButtonLink>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
