"use client";
import { useRef, useState, type Ref } from "react";
import { UploadCloud } from "lucide-react";
import { Button, cx } from "./button";
export function FilePicker({
  onFiles,
  disabled = false,
  label = "انتخاب فایل‌ها",
  accept = ".csv,.xls,.xlsx",
  multiple = true,
  compact = false,
  buttonRef,
}: {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  label?: string;
  accept?: string;
  multiple?: boolean;
  compact?: boolean;
  buttonRef?: Ref<HTMLButtonElement>;
}) {
  const input = useRef<HTMLInputElement>(null),
    [dragging, setDragging] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (!disabled)
          onFiles(
            Array.from(e.dataTransfer.files).slice(0, multiple ? undefined : 1),
          );
      }}
      className={cx(
        compact
          ? "flex flex-col gap-3"
          : "flex flex-col items-center gap-4 rounded-summary border border-dashed p-7 text-center transition-colors duration-200 motion-reduce:transition-none",
        dragging ? "border-primary bg-accent" : "border-border bg-surface",
      )}
    >
      <input
        ref={input}
        type="file"
        multiple={multiple}
        accept={accept}
        className="hidden"
        tabIndex={-1}
        aria-label={label}
        disabled={disabled}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          onFiles(files);
        }}
      />
      {!compact ? (
        <>
          <span className="flex size-14 items-center justify-center rounded-panel bg-accent text-primary">
            <UploadCloud size={26} aria-hidden />
          </span>
          <p className="font-heading text-lg font-medium">
            فایل‌ها را اینجا رها کنید
          </p>
          <p className="text-xs text-muted">
            Excel و CSV · تا ۱۰ فایل و حدود ۲۰ هزار ردیف
          </p>
        </>
      ) : null}
      <Button
        ref={buttonRef}
        type="button"
        onClick={() => input.current?.click()}
        disabled={disabled}
      >
        {compact ? <UploadCloud size={17} aria-hidden /> : null}
        {label}
      </Button>
    </div>
  );
}
