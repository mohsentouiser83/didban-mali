"use client";

import { useEffect } from "react";

/** Remove the retired appearance preference for returning users. */
export function LegacyAppearanceCleanup() {
  useEffect(() => {
    try {
      localStorage.removeItem("theme");
    } catch {
      // Appearance stays light when browser storage is unavailable.
    }
  }, []);

  return null;
}
