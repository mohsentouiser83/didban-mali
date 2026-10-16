"use client";

import { useRef } from "react";

type FocusHandler = (event: Event) => void;
const returnTargets = new WeakMap<HTMLElement, HTMLElement[]>();

/** Controlled overlays can be opened by actions outside a Radix Trigger. */
export function useOverlayFocus(onOpenAutoFocus?: FocusHandler, onCloseAutoFocus?: FocusHandler) {
  const openers = useRef<HTMLElement[]>([]);
  return {
    onOpenAutoFocus(event: Event) {
      const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const parent = opener?.closest<HTMLElement>('[data-slot="dialog-content"], [data-slot="sheet-content"]');
      openers.current = opener ? [opener, ...(parent ? returnTargets.get(parent) ?? [] : [])] : [];
      if (event.target instanceof HTMLElement) returnTargets.set(event.target, openers.current);
      onOpenAutoFocus?.(event);
    },
    onCloseAutoFocus(event: Event) {
      onCloseAutoFocus?.(event);
      const opener = openers.current.find((element) => element.isConnected
        && element !== document.body && element !== document.documentElement
        && !element.matches(":disabled") && !element.closest('[inert], [aria-hidden="true"]'));
      if (!event.defaultPrevented && opener) {
        event.preventDefault();
        opener.focus({ preventScroll: true });
      }
    },
  };
}
