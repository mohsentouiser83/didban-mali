"use client";
import { listItems, type ProcessingSession } from "@/lib/api";
import { usePagedResource } from "./use-paged-resource";
import { useUpload } from "./use-upload";
export function useUploadWorkspace() {
  const upload = useUpload();
  const sessions = usePagedResource<ProcessingSession>(
    upload.companyPath("processing-sessions"),
  );
  return {
    ...upload,
    sessions,
    sessionRows: listItems(sessions.data).map((session, index) => ({
      ...session,
      position: sessions.page * 25 + index + 1,
      periodName:
        upload.periods.find((period) => period.id === session.period_id)
          ?.name || "انتخاب نشده",
    })),
  };
}
