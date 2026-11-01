"use client";
import type { InstallationModelConfiguration } from "@/lib/api";
import type { useResource } from "@/hooks/use-resource";
import { Badge } from "@/components/ui/badge";
import { ConditionalRegion } from "@/components/ui/conditional-region";
import { ErrorState, LoadingState } from "@/components/ui/content-states";
import { CpuIcon, KeyIcon, PowerIcon } from "@phosphor-icons/react";
import { Panel } from "./page-parts";

export function ModelConnectionPanel({
  configuration,
}: {
  configuration: ReturnType<typeof useResource<InstallationModelConfiguration>>;
}) {
  return (
    <Panel title="مدل مشترک سازمان">
      {configuration.loading ? (
        <LoadingState label="در حال دریافت تنظیمات مدل" />
      ) : configuration.error ? (
        <ErrorState
          message={configuration.error.message}
          onRetry={configuration.refresh}
        />
      ) : configuration.data ? (
        <ConditionalRegion>
          <dl className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-control bg-canvas p-4">
              <dt className="flex items-center gap-2 text-xs text-muted">
                <CpuIcon size={18} className="text-primary" aria-hidden />
                مدل نصب‌شده
              </dt>
              <dd className="mt-2 break-words" dir="ltr">
                {configuration.data.model}
              </dd>
            </div>
            <div className="rounded-control bg-canvas p-4">
              <dt className="flex items-center gap-2 text-xs text-muted">
                <PowerIcon size={18} className="text-primary" aria-hidden />
                فعال‌سازی نصب
              </dt>
              <dd className="mt-2">
                <Badge
                  tone={configuration.data.enabled ? "primary" : "neutral"}
                >
                  {configuration.data.enabled ? "فعال" : "غیرفعال"}
                </Badge>
              </dd>
            </div>
            <div className="rounded-control bg-canvas p-4">
              <dt className="flex items-center gap-2 text-xs text-muted">
                <KeyIcon size={18} className="text-primary" aria-hidden />
                کلید اتصال
              </dt>
              <dd className="mt-2">
                <Badge
                  tone={configuration.data.key_configured ? "primary" : "neutral"}
                >
                  {configuration.data.key_configured ? "تنظیم‌شده" : "تنظیم نشده"}
                </Badge>
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-sm text-muted">
            مدل و اتصال در تنظیمات سرور تعیین می‌شوند؛ دسترسی زنده بررسی نشده است.
          </p>
        </ConditionalRegion>
      ) : null}
    </Panel>
  );
}
