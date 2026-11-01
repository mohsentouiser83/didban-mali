"use client";
import { notify } from "@/components/ui/sonner";
import { api, type ProcessingSession, type SourceFile } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useWorkspace } from "./workspace";
export function useUpload() {
  const workspace = useWorkspace();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<
    { name: string; state: "waiting" | "uploading" | "uploaded" | "failed" }[]
  >([]);
  const [error, setError] = useState("");
  const [sessionId, setSessionId] = useState("");
  const lock = useRef(false);
  const upload = async (selected: File[], existingId?: string) => {
    if (lock.current || !workspace.company) return;
    if (!selected.length) return;
    if (selected.length > 10) {
      setError("حداکثر ۱۰ فایل انتخاب کنید.");
      return;
    }
    if (selected.some((file) => !/\.(csv|xlsx|xls)$/i.test(file.name))) {
      setError("فقط Excel و CSV مجاز است.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    setFiles(selected.map((file) => ({ name: file.name, state: "waiting" })));
    let id = existingId || "";
    try {
      if (!id) {
        const session = await api<ProcessingSession>(
          workspace.companyPath("processing-sessions")!,
          { method: "POST", body: { period_id: workspace.periodId || null } },
        );
        id = session.id;
      }
      setSessionId(id);
      const existing = await api<ProcessingSession>(
        workspace.companyPath(`processing-sessions/${id}`)!,
      );
      const ids = (existing.files || []).map((file) => file.id);
      for (let index = 0; index < selected.length; index++) {
        setFiles((previous) =>
          previous.map((file, i) =>
            i === index ? { ...file, state: "uploading" } : file,
          ),
        );
        const body = new FormData();
        body.append("file", selected[index]);
        const file = await api<SourceFile>(
          workspace.companyPath(`processing-sessions/${id}/files`)!,
          { method: "POST", body },
        );
        ids.push(file.id);
        setFiles((previous) =>
          previous.map((file, i) =>
            i === index ? { ...file, state: "uploaded" } : file,
          ),
        );
      }
      const current = await api<ProcessingSession>(
        workspace.companyPath(`processing-sessions/${id}`)!,
      );
      await api(workspace.companyPath(`processing-sessions/${id}/seal`)!, {
        method: "POST",
        body: { file_ids: ids },
        version: current.version,
      });
      router.push(`/uploads/${id}`);
      notify.success("فایل‌ها دریافت شدند.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "بارگذاری انجام نشد.");
      setFiles((previous) =>
        previous.map((file) =>
          file.state === "uploading" ? { ...file, state: "failed" } : file,
        ),
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return { ...workspace, busy, files, error, sessionId, upload };
}
