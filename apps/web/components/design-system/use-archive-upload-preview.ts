"use client";

import { useRef, useState } from "react";

export type ArchivePreviewState = "idle" | "processing" | "complete" | "error";
export const archiveLimit = 50 * 1024 * 1024;

/** Local interaction preview only: no upload, extraction, or AI request occurs. */
export function useArchiveUploadPreview() {
  const [file, setFile] = useState<File | null>(null);
  const [fieldError, setFieldError] = useState("");
  const [state, setState] = useState<ArchivePreviewState>("idle");
  const fileControlRef = useRef<HTMLButtonElement>(null);

  function selectFiles(files: File[]) {
    setState("idle");
    setFile(null);
    let message = "";
    if (files.length !== 1) message = "فقط یک فایل ZIP انتخاب کنید.";
    else if (!/\.zip$/i.test(files[0].name)) message = "فایل باید ZIP باشد.";
    else if (!files[0].size || files[0].size > archiveLimit) message = "فایل باید غیرخالی و حداکثر ۵۰ مگابایت باشد.";
    setFieldError(message);
    if (message) fileControlRef.current?.focus();
    else setFile(files[0]);
  }

  function start() {
    if (!file) {
      setFieldError("فایل ZIP را انتخاب کنید.");
      fileControlRef.current?.focus();
      return;
    }
    setState("processing");
  }

  return {
    file, fieldError, state, fileControlRef, selectFiles, start,
    selectSample: () => selectFiles([new File(["Interactive preview only"], "اسناد-مالی-نمونه.zip", { type: "application/zip" })]),
    cancel: () => setState("idle"),
    complete: () => setState("complete"),
    fail: () => setState("error"),
    reset: () => { setFile(null); setFieldError(""); setState("idle"); },
  };
}
