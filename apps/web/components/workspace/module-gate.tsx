"use client";

/**
 * All modules are permanently open to all customers.
 * Module gating is disabled so that all customers have access to all features.
 */
export function ModuleGate({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
