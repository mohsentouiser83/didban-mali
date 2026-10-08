import React from "react";
import {
  CheckCircle2,
  Clock,
  Ban,
  CheckCheck,
  MessageSquarePlus,
  X,
} from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toPersianDigits } from "./money-display";

export interface ReviewActionBarProps
  extends React.HTMLAttributes<HTMLDivElement> {
  selectedCount?: number;
  onConfirm?: () => void;
  onFollowUp?: () => void;
  onResolve?: () => void;
  onDismiss?: () => void;
  onAddNote?: () => void;
  onClear?: () => void;
  disabled?: boolean;
}

export function ReviewActionBar({
  selectedCount = 0,
  onConfirm,
  onFollowUp,
  onResolve,
  onDismiss,
  onAddNote,
  onClear,
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
        "fixed bottom-6 inset-x-4 sm:inset-x-auto sm:start-1/2 sm:-translate-x-1/2 z-30 flex flex-wrap items-center justify-between gap-3 rounded-[var(--ds-card-radius)] border border-[var(--ds-border)] bg-[var(--ds-card)]/95 p-3 shadow-[var(--ds-shadow-lg)]  transition-all duration-300",
        className,
      )}
      {...props}
    >
      {selectedCount > 0 && (
        <div className="flex items-center gap-2 ps-2 pe-3 border-e border-[var(--ds-border)]">
          <span className="grid size-6 place-items-center rounded-full bg-primary text-primary-foreground text-xs font-mono font-bold">
            {toPersianDigits(selectedCount)}
          </span>
          <span className="text-xs font-bold text-foreground">
            مورد انتخاب‌شده
          </span>
          {onClear && (
            <Button
              size="icon"
              variant="ghost"
              className="size-6 text-muted-foreground hover:text-foreground ms-1"
              onClick={onClear}
              title="لغو انتخاب‌ها"
            >
              <X className="size-3.5" />
            </Button>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        {onConfirm && (
          <Button
            size="sm"
            variant="outline"
            disabled={disabled}
            className="gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
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
            className="gap-1.5 border-ds-warning/30 text-ds-warning hover:bg-ds-warning/10"
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
            className="gap-1.5 bg-ds-success text-white hover:bg-ds-success"
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
            className="gap-1.5 text-muted-foreground hover:text-foreground"
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
            className="gap-1.5 text-muted-foreground hover:text-destructive"
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
