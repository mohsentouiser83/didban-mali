"use client";
import { useRef } from "react";
import { Button } from "./button";
export function SingleFilePicker({
  onFile,
  accept,
  disabled,
  busy,
  label = "انتخاب فایل",
}: {
  onFile: (file: File) => void;
  accept: string;
  disabled?: boolean;
  busy?: boolean;
  label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        hidden
        type="file"
        accept={accept}
        disabled={disabled || busy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
          event.target.value = "";
        }}
      />
      <Button
        variant="secondary"
        disabled={disabled}
        busy={busy}
        onClick={() => input.current?.click()}
      >
        {label}
      </Button>
    </>
  );
}
