import {
  SquaresFourIcon,
  PlugsConnectedIcon,
  BuildingsIcon,
  CalendarBlankIcon,
  CoinsIcon,
  CpuIcon,
  FilesIcon,
  UploadSimpleIcon,
  UsersThreeIcon,
  type Icon,
} from "@phosphor-icons/react";
import type { Company } from "./api";
type Permission =
  "company" | "owner" | "installation_admin" | "company_or_admin";
export interface SettingsDestination {
  key: string;
  href: string;
  label: string;
  icon: Icon;
  permission: Permission;
  keywords?: string[];
}
export interface SettingsCategory {
  key: string;
  title: string;
  description: string;
  icon: Icon;
  hub?: string;
  items: SettingsDestination[];
  keywords?: string[];
}
export interface SettingsAccess {
  hasCompany: boolean;
  role?: Company["role"];
  installationAdmin: boolean;
}
export interface SettingsSearchResult {
  key: string;
  href: string;
  label: string;
  categoryTitle: string;
  icon: Icon;
}
export const settingsCatalog: SettingsCategory[] = [
  {
    key: "connections", title: "اتصال‌ها", description: "حساب تلگرام و بله", icon: PlugsConnectedIcon,
    items: [{ key: "connections", href: "/settings/connections", label: "اتصال‌ها", icon: PlugsConnectedIcon,
      permission: "company", keywords: ["تلگرام", "بله", "بات", "ربات", "telegram", "bale"] }],
  },
  {
    key: "employees",
    title: "کارکنان",
    description: "مدیریت اطلاعات کارمندان",
    icon: UsersThreeIcon,
    items: [
      { key: "employees", href: "/employees", label: "کارمندان", icon: UsersThreeIcon, permission: "company" },
    ],
  },
  { key: "modules", title: "ماژول‌های شرکت", description: "فعال‌سازی بخش‌ها برای این شرکت", icon: SquaresFourIcon,
    items: [{ key: "modules", href: "/settings/modules", label: "ماژول‌های شرکت", icon: SquaresFourIcon, permission: "company", keywords: ["فعال", "غیرفعال", "حقوق", "بیمه", "مالیات"] }] },
  {
    key: "documents",
    title: "اسناد",
    description: "بارگذاری و مدیریت منابع",
    icon: FilesIcon,
    hub: "/settings/documents",
    items: [
      {
        key: "uploads",
        href: "/uploads",
        label: "اسناد و پردازش",
        icon: UploadSimpleIcon,
        permission: "company",
        keywords: ["فایل", "بارگذاری", "Excel", "CSV"],
      },
      {
        key: "sources",
        href: "/sources",
        label: "منابع و اصل اسناد",
        icon: FilesIcon,
        permission: "company",
        keywords: ["بایگانی", "فایل", "دانلود"],
      },
    ],
  },
  {
    key: "company-access",
    title: "شرکت و دسترسی",
    description: "اطلاعات شرکت، اعضا و مجوزها",
    icon: BuildingsIcon,
    hub: "/settings/company-access",
    items: [
      {
        key: "company",
        href: "/settings/company",
        label: "شرکت",
        icon: BuildingsIcon,
        permission: "company_or_admin",
        keywords: ["سازمان"],
      },
      {
        key: "members",
        href: "/settings/members",
        label: "اعضا و دسترسی",
        icon: UsersThreeIcon,
        permission: "owner",
        keywords: ["مجوز", "تأیید گزارش", "حساب کاربری"],
      },
    ],
  },
  {
    key: "periods",
    title: "دوره‌های مالی",
    description: "مدیریت بازه‌های گزارش",
    icon: CalendarBlankIcon,
    items: [
      {
        key: "periods",
        href: "/settings/periods",
        label: "دوره‌های مالی",
        icon: CalendarBlankIcon,
        permission: "company",
        keywords: ["تاریخ", "دوره مقایسه"],
      },
    ],
  },
  {
    key: "usage",
    title: "مصرف و هزینه",
    description: "مصرف و سقف هزینه شرکت",
    icon: CoinsIcon,
    items: [
      {
        key: "usage",
        href: "/settings/usage",
        label: "مصرف و هزینه",
        icon: CoinsIcon,
        permission: "company",
        keywords: ["بودجه", "سقف شرکت"],
      },
    ],
  },
  {
    key: "model",
    title: "مدل هوش مصنوعی",
    description: "اتصال، تعرفه و بودجه نصب",
    icon: CpuIcon,
    items: [
      {
        key: "model",
        href: "/settings/model",
        label: "مدل هوش مصنوعی",
        icon: CpuIcon,
        permission: "installation_admin",
        keywords: ["تعرفه", "مدل", "model", "کلید اتصال", "بودجه نصب"],
      },
    ],
  },
];
function permitted(permission: Permission, access: SettingsAccess) {
  switch (permission) {
    case "owner":
      return access.hasCompany && access.role === "owner";
    case "installation_admin":
      return access.hasCompany && access.installationAdmin;
    case "company_or_admin":
      return access.hasCompany || access.installationAdmin;
    default:
      return access.hasCompany;
  }
}
export function visibleSettingsCategories(
  access: SettingsAccess,
): SettingsCategory[] {
  return settingsCatalog
    .map((category) => ({
      ...category,
      items: category.items.filter((item) =>
        permitted(item.permission, access),
      ),
    }))
    .filter((category) => category.items.length > 0);
}
export function settingsCategoryDestination(category: SettingsCategory) {
  return category.items.length > 1 && category.hub
    ? category.hub
    : category.items[0].href;
}
export function isSettingsCategoryActive(
  category: SettingsCategory,
  pathname: string,
) {
  return (
    pathname === category.hub ||
    category.items.some(
      (item) => pathname === item.href || pathname.startsWith(item.href + "/"),
    )
  );
}
function normalized(value: string) {
  return value
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\u200c/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
export function searchSettings(
  categories: SettingsCategory[],
  query: string,
): SettingsSearchResult[] {
  const term = normalized(query);
  if (!term) return [];
  const results = new Map<string, SettingsSearchResult>();
  for (const category of categories) {
    if (
      [category.title, ...(category.keywords || [])].some((value) =>
        normalized(value).includes(term),
      )
    ) {
      const href = settingsCategoryDestination(category);
      results.set(href, {
        key: category.key,
        href,
        label: category.title,
        categoryTitle: category.title,
        icon: category.icon,
      });
    }
    for (const item of category.items) {
      if (
        [item.label, ...(item.keywords || [])].some((value) =>
          normalized(value).includes(term),
        ) &&
        !results.has(item.href)
      )
        results.set(item.href, {
          key: item.key,
          href: item.href,
          label: item.label,
          categoryTitle: category.title,
          icon: item.icon,
        });
    }
  }
  return [...results.values()];
}
