import { Home, Building2, ShieldCheck, LogOut, Plus, Users, UploadCloud, FileText, Download, ChevronLeft, Check, AlertTriangle, Bell, Table, Layers, BarChart3, Calendar, Activity, ArrowLeftRight, Landmark, SlidersHorizontal, ChevronRight, ScanSearch, Target, Trash2 } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

export function Mark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "mark inline-flex items-end justify-center gap-1 size-9 p-0.5 shrink-0",
        className
      )}
      aria-hidden="true"
    >
      <i className="w-1.5 rounded-[1px] bg-primary h-8" /><i className="w-1.5 rounded-[1px] bg-primary h-6" /><i className="w-1.5 rounded-[1px] bg-primary h-4" />
    </span>
  );
}

export type ProductIconName = "home" | "company" | "shield" | "exit" | "plus" | "users" | "upload" | "file" | "download" | "arrow" | "check" | "alert" | "bell" | "table" | "layers" | "chart" | "calendar" | "activity" | "reconcile" | "bank" | "tune" | "chevron" | "findings" | "evidence" | "target" | "trash";

const productIcons = {
  home: Home, company: Building2, shield: ShieldCheck, exit: LogOut, plus: Plus, users: Users,
  upload: UploadCloud, file: FileText, download: Download, arrow: ChevronLeft, check: Check,
  alert: AlertTriangle, bell: Bell, table: Table, layers: Layers, chart: BarChart3, calendar: Calendar,
  activity: Activity, reconcile: ArrowLeftRight, bank: Landmark, tune: SlidersHorizontal,
  chevron: ChevronRight, findings: ScanSearch, evidence: FileText, target: Target, trash: Trash2,
};

export function Icon({ name, className }: { name: ProductIconName; className?: string }) {
  const Component = productIcons[name];
  return <Component className={cn("icon size-4 shrink-0", className)} />;
}
