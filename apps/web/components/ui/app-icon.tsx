import {
  Activity,
  Archive,
  ArrowDownToLine,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  ArrowUpLeft,
  Banknote,
  BookOpen,
  Building2,
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  ChartNoAxesCombined,
  ChartPie,
  ChevronLeft,
  ChevronRight,
  ChevronsDown,
  Check,
  CircleCheck,
  CircleHelp,
  CircleX,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  Coins,
  Columns3,
  Database,
  Download,
  Eye,
  FileCheck2,
  FileClock,
  FileSearch,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  GitCompareArrows,
  History,
  KeyRound,
  Layers3,
  Link2,
  ListFilter,
  ListPlus,
  LockKeyhole,
  LogIn,
  Mail,
  MessageCircle,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  TrendingUp,
  Undo2,
  UploadCloud,
  UserRound,
  UserRoundCheck,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { cx } from "./button";

const icons = {
  Activity,
  Archive,
  ArrowDownToLine,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  ArrowUpLeft,
  Banknote,
  BookOpen,
  Building2,
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  ChartNoAxesCombined,
  ChartPie,
  ChevronLeft,
  ChevronRight,
  ChevronsDown,
  Check,
  CircleCheck,
  CircleHelp,
  CircleX,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  Coins,
  Columns3,
  Database,
  Download,
  Eye,
  FileCheck2,
  FileClock,
  FileSearch,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  GitCompareArrows,
  History,
  KeyRound,
  Layers3,
  Link2,
  ListFilter,
  ListPlus,
  LockKeyhole,
  LogIn,
  Mail,
  MessageCircle,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  TrendingUp,
  Undo2,
  UploadCloud,
  UserRound,
  UserRoundCheck,
  Users,
  Wallet,
  X,
} as const;
export type AppIconName = keyof typeof icons;

/** Decorative icons accompany visible text; labels remain the accessible name. */
export function AppIcon({
  name,
  className,
  size = 18,
}: {
  name: AppIconName;
  className?: string;
  size?: number;
}) {
  const Icon = icons[name];
  return (
    <Icon
      size={size}
      strokeWidth={1.75}
      aria-hidden="true"
      focusable="false"
      className={cx("shrink-0", className)}
    />
  );
}

export function IconTile({
  name,
  compact = false,
}: {
  name: AppIconName;
  compact?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-control bg-accent text-primary",
        compact ? "size-8" : "size-11",
      )}
    >
      <AppIcon name={name} size={compact ? 17 : 22} />
    </span>
  );
}
