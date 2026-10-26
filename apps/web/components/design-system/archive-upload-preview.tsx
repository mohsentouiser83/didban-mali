"use client";

import { Button } from "@/components/ui/button";
import { ArchiveProcessingDialog } from "@/components/product/archive-processing-dialog";
import { ArchiveUploadView } from "@/components/product/archive-upload-view";
import { useArchiveUploadPreview } from "./use-archive-upload-preview";

export function ArchiveUploadPreview() {
  const preview = useArchiveUploadPreview();
  return <>
    <ArchiveUploadView file={preview.file} fieldError={preview.fieldError} fileControlRef={preview.fileControlRef} result={preview.state}
      onFiles={preview.selectFiles} onSubmit={preview.start} onReset={preview.reset}
      sampleAction={<Button variant="ghost" size="sm" onClick={preview.selectSample}>آزمایش با فایل نمونه</Button>} />
    <ArchiveProcessingDialog open={preview.state === "processing"} onCancel={preview.cancel} />
  </>;
}
