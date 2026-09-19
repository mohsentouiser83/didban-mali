import React from "react";
import { CheckCircle2, Clock, Ban, CheckCheck, MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toPersianDigits } from "./money-display";

export interface ReviewActionBarProps extends React.HTMLAttributes<HTMLDivElement> {
  selectedCount?: number;
  onConfirm?: () => void;
  onFollowUp?: () => void;
  onResolve?: () => void;
  onDismiss?: () => void;
  onAddNote?: () => void;
  disabled?: boolean;
}

export function ReviewActionBar({
  selectedCount = 0,
  onConfirm,
  onFollowUp,
  onResolve,
  onDismiss,
  onAddNote,
  disabled = false,
  className,
  ...props
}: ReviewActionBarProps) {
  if (selectedCount <= 0 && !onConfirm && !onFollowUp && !onResolve) {
    return null;
  }

  return (
    <div
      className={cn(
        "fixed bottom-6 inset-x-4 sm:inset-x-auto sm:start-1/2 sm:-translate-x-1/2 z-30 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--ds-border)] bg-[var(--ds-card)]/95 p-3 shadow-xl backdrop-blur-md transition-all duration-300",
        className
      )}
      {...props}
    >
      {selectedCount > 0 && (
        <div className="flex items-center gap-2 ps-2 pe-3 border-e border-[var(--ds-border)]">
          <span className="grid size-6 place-items-center rounded-full bg-primary text-primary-foreground text-xs font-mono font-bold">
            {toPersianDigits(selectedCount)}
          </span>
          <span className="text-xs font-bold text-foreground">مورد انتخاب‌شده</span>
        </div>
      )}

      <div className="flex items-center gap-2">
        {onConfirm && (
          <Button
            size="sm"
            variant="outline"
            disabled={disabled}
            className="gap-1.5 text-xs border-blue-500/30 text-blue-700 hover:bg-blue-500/10 dark:text-blue-400"
            onClick={onConfirm}
          >
            <CheckCircle2 className="size-3.5" />
            تأیید
          </Button>
        )}

        {onFollowUp && (
          <Button
            size="sm"
            variant="outline"
            disabled={disabled}
            className="gap-1.5 text-xs border-amber-500/30 text-amber-700 hover:bg-amber-500/10 dark:text-amber-400"
            onClick={onFollowUp}
          >
            <Clock className="size-3.5" />
            در پیگیری
          </Button>
        )}

        {onResolve && (
          <Button
            size="sm"
            variant="default"
            disabled={disabled}
            className="gap-1.5 text-xs bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={onResolve}
          >
            <CheckCheck className="size-3.5" />
            حل مغایرت
          </Button>
        )}

        {onAddNote && (
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled}
            className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={onAddNote}
          >
            <MessageSquarePlus className="size-3.5" />
            یادداشت
          </Button>
        )}

        {onDismiss && (
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled}
            className="gap-1.5 text-xs text-muted-foreground hover:text-destructive"
            onClick={onDismiss}
          >
            <Ban className="size-3.5" />
            رد / نادیده‌گیری
          </Button>
        )}
      </div>
    </div>
  );
}
