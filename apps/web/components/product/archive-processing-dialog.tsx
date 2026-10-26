"use client";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { LoadingState } from "@/components/ui/financial/loading-state";
import { Spinner } from "@/components/ui/spinner";

export function ArchiveProcessingDialog({ open, onCancel }: {
  open: boolean;
  onCancel: () => void;
}) {
  return <Dialog open={open} onOpenChange={(value) => { if (!value) onCancel(); }}>
    <DialogContent showCloseButton={false} aria-describedby={undefined} overlayClassName="bg-background/65 backdrop-blur-xl motion-reduce:animate-none"
      className="max-w-md gap-0 border-0 bg-transparent px-6 py-10 text-center shadow-none sm:px-10">
      <LoadingState label="هوش مصنوعی در حال بررسی اسناد است" className="flex items-start justify-center gap-3 text-start">
        <Spinner role="presentation" aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary/60 motion-safe:animate-[spin_3s_linear_infinite]" />
        <div className="min-w-0">
          <DialogTitle className="font-sans text-sm font-normal leading-6"><span>کمی مکث، برای دیدی روشن‌تر</span></DialogTitle>
        </div>
      </LoadingState>
    </DialogContent>
  </Dialog>;
}
