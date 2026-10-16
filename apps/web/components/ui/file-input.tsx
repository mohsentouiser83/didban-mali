"use client";

import { useId, useRef } from "react";
import { cn } from "@/lib/utils";

import { Button } from "./button";
import { Input, type InputProps } from "./input";

type FileInputProps = Omit<InputProps, "type" | "value" | "defaultValue" | "size"> & {
  fileName?: string;
};

export function FileInput({ id, fileName, disabled, className, "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy, "aria-describedby": ariaDescribedBy, ...props }: FileInputProps) {
  const generatedId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <Input {...props} ref={inputRef} type="file" tabIndex={-1} className="hidden"
        id={`${id ?? generatedId}-native`} disabled={disabled} aria-hidden="true" />
      <Button type="button" variant="outline" id={id ?? generatedId} disabled={disabled}
        aria-label={ariaLabel} aria-labelledby={ariaLabelledBy} aria-describedby={ariaDescribedBy} aria-invalid={props["aria-invalid"]}
        className={cn("w-full min-w-0 justify-center", className)}
        onClick={() => inputRef.current?.click()}>
        <span className="truncate">{fileName || "انتخاب فایل"}</span>
      </Button>
    </>
  );
}
