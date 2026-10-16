"use client";

import { useEffect, useRef, type ButtonHTMLAttributes } from "react";
import type { DayButtonProps } from "react-day-picker";

import { Button } from "./button";

export function CalendarDayButton({ day: _day, modifiers, ...props }: DayButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);

  return <Button {...props} ref={ref} type="button" variant="surface" size="auto" />;
}

export function CalendarNavigationButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <Button {...props} type="button" variant="ghost" size="icon-sm" />;
}
