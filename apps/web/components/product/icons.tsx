import { cn } from "@/lib/utils";

export function Mark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "mark relative inline-flex items-end justify-center gap-1 size-8 p-1.5 rounded-xl bg-foreground overflow-hidden border border-border shadow-sm shrink-0",
        className
      )}
      aria-hidden="true"
    >
      <i className="w-1 rounded-full bg-background h-2 opacity-55" />
      <i className="w-1 rounded-full bg-background h-3.5" />
      <i className="w-1 rounded-full bg-primary h-5" />
    </span>
  );
}

export type ProductIconName = "home" | "company" | "shield" | "exit" | "plus" | "users" | "upload" | "file" | "download" | "arrow" | "check" | "alert" | "bell" | "table" | "layers" | "chart" | "calendar" | "activity" | "reconcile" | "bank" | "tune" | "chevron" | "findings" | "evidence" | "target" | "trash";

export function Icon({ name, className }: { name: ProductIconName; className?: string }) {
  const paths = {
    home: <><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10M9 20v-6h6v6"/></>,
    company: <><path d="M4 21V5h10v16M14 9h6v12M8 9h2M8 13h2M8 17h2M17 13h1M17 17h1"/></>,
    shield: <><path d="M12 3 4 6v5c0 5 3.4 8.5 8 10 4.6-1.5 8-5 8-10V6l-8-3Z"/><path d="m9 12 2 2 4-4"/></>,
    exit: <><path d="M10 17l5-5-5-5M15 12H3M14 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    upload: <><path d="M12 16V3M7 8l5-5 5 5"/><path d="M5 13v7h14v-7"/></>,
    file: <><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5M9 13h6M9 17h6"/></>,
    download: <><path d="M12 3v13M7 11l5 5 5-5"/><path d="M5 21h14"/></>,
    arrow: <><path d="m15 18-6-6 6-6"/></>,
    check: <><path d="m5 12 4 4L19 6"/></>,
    alert: <><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.7 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z"/></>,
    bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></>,
    table: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16"/></>,
    layers: <><path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/></>,
    chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/><path d="m4 7 6-4 6 7 5-4"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
    activity: <><path d="M3 12h4l2-7 4 14 2-7h6"/></>,
    reconcile: <><path d="M7 7h11l-3-3M17 17H6l3 3"/><path d="m18 7-3 3M6 17l3-3"/></>,
    bank: <><path d="m3 9 9-5 9 5M5 10v7M9 10v7M15 10v7M19 10v7M3 20h18"/></>,
    tune: <><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></>,
    chevron: <path d="m9 18 6-6-6-6"/>,
    findings: <><path d="M12 3a9 9 0 1 0 9 9"/><path d="M12 7v5l3 2M16 3h5v5M21 3l-6 6"/></>,
    evidence: <><path d="M5 3h14v18H5z"/><path d="M9 8h6M9 12h6M9 16h4"/></>,
    target: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></>,
    trash: <><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/></>,
  };
  return (
    <svg
      className={cn("icon size-4 stroke-[1.8] stroke-linecap-round stroke-linejoin-round shrink-0", className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
