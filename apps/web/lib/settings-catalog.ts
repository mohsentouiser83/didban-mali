import {
  BooksIcon,
  BuildingsIcon,
  FilesIcon,
  CalendarBlankIcon,
  HashIcon,
  UsersThreeIcon,
  type Icon,
} from "@phosphor-icons/react";
import type { Company } from "./api";

type Permission =
  | "company"
  | "owner"
  | "company_or_admin";

export interface SettingsDestination {
  key: string;
  href: string;
  label: string;
  icon: Icon;
  permission: Permission;
  description?: string;
  keywords?: string[];
}

export interface SettingsCategory {
  key: string;
  title: string;
  description: string;
  icon: Icon;
  hub?: string;
  standalone?: boolean;
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
    key: "accounting",
    title: "تعاریف مالی و حسابداری",
    description: "کدینگ سرفصل‌ها، طرف‌حساب‌ها، دوره‌های مالی، مرکز حساب‌ها و شماره‌گذاری",
    icon: BooksIcon,
    hub: "/settings/accounting",
    items: [
      {
        key: "accounts",
        href: "/settings/accounts",
        label: "کدینگ حساب‌ها",
        description: "ساختار سرفصل‌ها و حساب‌های معین و تفصیلی",
        icon: BooksIcon,
        permission: "company",
        keywords: [
          "کدینگ",
          "حساب‌ها",
          "سرفصل",
          "کل",
          "معین",
          "تفصیلی",
          "accounts",
          "chart of accounts",
        ],
      },
      {
        key: "counterparties",
        href: "/commercial/counterparties",
        label: "طرف‌حساب‌ها",
        description: "مدیریت مشتریان و تأمین‌کنندگان",
        icon: UsersThreeIcon,
        permission: "company",
        keywords: ["طرف حساب", "مشتریان", "تامین کنندگان", "تأمین‌کنندگان", "counterparties"],
      },
      {
        key: "periods",
        href: "/settings/periods",
        label: "دوره‌های مالی",
        description: "مدیریت سال‌ها و دوره‌های مالی فعال و بسته",
        icon: CalendarBlankIcon,
        permission: "company",
        keywords: [
          "دوره",
          "دوره‌های مالی",
          "سال مالی",
          "بستن دوره",
          "periods",
          "fiscal years",
        ],
      },
      {
        key: "dimensions",
        href: "/settings/dimensions",
        label: "مرکز حساب‌ها",
        description: "پروژه، شعبه و مرکز هزینه",
        icon: BuildingsIcon,
        permission: "company",
        keywords: [
          "ابعاد",
          "پروژه",
          "شعبه",
          "مرکز هزینه",
          "dimensions",
          "projects",
          "branches",
          "cost centers",
        ],
      },
      {
        key: "numbering",
        href: "/settings/numbering",
        label: "شماره‌گذاری",
        description: "الگو، پیشوند و شماره شروع موجودیت‌ها و اسناد",
        icon: HashIcon,
        permission: "company",
        keywords: [
          "شماره‌گذاری",
          "شماره گذاری",
          "کدگذاری",
          "سریال",
          "پیشوند",
          "پسوند",
          "001",
          "numbering",
          "سیستم شماره گذاری",
        ],
      },
    ],
  },
  {
    key: "company-access",
    title: "شرکت و دسترسی",
    description: "مدیریت کاربران، مجوزها و پرونده شرکت",
    icon: BuildingsIcon,
    hub: "/settings/company-access",
    items: [
      {
        key: "members",
        href: "/settings/members",
        label: "دسترسی و کاربران",
        description: "مدیریت کاربران و مجوزهای شرکت",
        icon: UsersThreeIcon,
        permission: "company",
        keywords: [
          "دسترسی",
          "اعضا",
          "کاربران",
          "مجوز",
          "تأیید گزارش",
          "members",
          "access",
        ],
      },
      {
        key: "company",
        href: "/settings/company",
        label: "اطلاعات شرکت",
        description: "مشخصات ثبتی و تنظیمات سازمانی شرکت",
        icon: BuildingsIcon,
        permission: "company_or_admin",
        keywords: ["شرکت", "سازمان", "شناسه", "company"],
      },
    ],
  },
  {
    key: "documents",
    title: "اسناد",
    description: "آرشیو فایل‌ها و مدارک شرکت",
    icon: FilesIcon,
    standalone: true,
    items: [
      {
        key: "documents",
        href: "/settings/documents",
        label: "اسناد",
        icon: FilesIcon,
        permission: "company",
        keywords: ["بارگذاری", "آرشیو", "منابع", "اکسل", "مدارک بات", "نوبت پردازش"],
      },
    ],
  },
];

function permitted(permission: Permission, access: SettingsAccess) {
  switch (permission) {
    case "owner":
      return access.hasCompany && access.role === "owner";
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
  if (pathname === category.hub) return true;
  const matches = settingsCatalog.flatMap((group) =>
    group.items.filter((item) => pathname === item.href || pathname.startsWith(item.href + "/")),
  ).sort((first, second) => second.href.length - first.href.length);
  return category.items.some((item) => item.key === matches[0]?.key);
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
  const results: SettingsSearchResult[] = [];
  for (const category of categories) {
    for (const item of category.items) {
      const match =
        normalized(item.label).includes(term) ||
        (item.description && normalized(item.description).includes(term)) ||
        normalized(category.title).includes(term) ||
        item.keywords?.some((keyword) => normalized(keyword).includes(term));
      if (match) {
        results.push({
          key: item.key,
          href: item.href,
          label: item.label,
          categoryTitle: category.title,
          icon: item.icon,
        });
      }
    }
  }
  return results;
}
