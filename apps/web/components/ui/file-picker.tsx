"use client";
import { useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import { Button, cx } from "./button";
export function FilePicker({
  onFiles,
  disabled = false,
  label = "انتخاب فایل‌ها",
}: {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  label?: string;
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
        if (!disabled) onFiles(Array.from(e.dataTransfer.files));
      }}
      className={cx(
        "flex flex-col items-center gap-4 rounded-summary border border-dashed p-7 text-center transition-colors duration-200 motion-reduce:transition-none",
        dragging ? "border-primary bg-accent" : "border-border bg-surface",
      )}
    >
      <input
        ref={input}
        type="file"
        multiple
        accept=".csv,.xls,.xlsx"
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
      <span className="flex size-14 items-center justify-center rounded-panel bg-accent text-primary">
        <UploadCloud size={26} aria-hidden />
      </span>
      <p className="font-heading text-lg font-medium">
        فایل‌ها را اینجا رها کنید
      </p>
      <p className="text-xs text-muted">
        Excel و CSV · تا ۱۰ فایل و حدود ۲۰ هزار ردیف
      </p>
      <Button onClick={() => input.current?.click()} disabled={disabled}>
        {label}
      </Button>
    </div>
  );
}
