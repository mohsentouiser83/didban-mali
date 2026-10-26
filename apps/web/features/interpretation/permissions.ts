import type { Schema } from "@didban/api-client";

export function canConfigureInterpretation(
  session: Schema<"ProcessingSession">,
  canOperate: boolean,
  previewCount: number,
): boolean {
  return (
    canOperate &&
    session.manifest_id === null &&
    !!session.preparation_finished_at &&
    !["cancelled", "failed", "completed", "completed_limited"].includes(
      session.status,
    ) &&
    previewCount > 0
  );
}
