import {
  BooksIcon,
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
  | "company"
  | "owner"
  | "installation_admin"
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
    title: "حسابداری",
    description: "اسناد، حساب‌ها، دوره‌ها و ابعاد مالی",
    icon: BooksIcon,
    hub: "/settings/accounting",
    items: [
      {
        key: "accounting",
        href: "/accounting",
        label: "اسناد حسابداری",
        description: "پیش‌نویس، ثبت نهایی و اصلاح سند",
        icon: BooksIcon,
        permission: "company",
        keywords: [
          "پیش‌نویس",
          "سند حسابداری",
          "دفتر",
          "ثبت نهایی",
          "عملیات مالی",
          "کالا",
          "انبار",
          "برگشت",
          "جایگزین",
        ],
      },
      {
        key: "accounts",
        href: "/settings/accounts",
        label: "کدینگ حساب‌ها",
        description: "تعریف و مدیریت حساب‌های شرکت",
        icon: BooksIcon,
        permission: "company",
        keywords: ["کدینگ", "حساب", "دفتر", "نقش حساب", "طبقه‌بندی"],
      },
      {
        key: "periods",
        href: "/settings/periods",
        label: "دوره‌های مالی",
        description: "تعریف، قفل و بستن دوره‌های مالی",
        icon: CalendarBlankIcon,
        permission: "company",
        keywords: [
          "تاریخ",
          "دوره مقایسه",
          "افتتاحیه",
          "اختتامیه",
          "قفل",
          "اسناد پایان",
        ],
      },
      {
        key: "dimensions",
        href: "/settings/dimensions",
        label: "پروژه، شعبه و مرکز هزینه",
        description: "مدیریت پروژه‌ها، شعبه‌ها و مراکز هزینه",
        icon: BuildingsIcon,
        permission: "company",
        keywords: ["پروژه", "شعبه", "مرکز هزینه"],
      },
    ],
  },
  {
    key: "documents",
    title: "فایل‌ها و منابع",
    description: "بارگذاری، پردازش و نگهداری مدارک",
    icon: FilesIcon,
    hub: "/settings/documents",
    items: [
      {
        key: "uploads",
        href: "/uploads",
        label: "بارگذاری و پردازش منابع",
        description: "ورود فایل و پیگیری مراحل پردازش",
        icon: UploadSimpleIcon,
        permission: "company",
        keywords: ["فایل", "بارگذاری", "Excel", "CSV"],
      },
      {
        key: "sources",
        href: "/sources",
        label: "فایل‌ها و مدارک",
        description: "مشاهده، دریافت و بایگانی اصل فایل‌ها",
        icon: FilesIcon,
        permission: "company",
        keywords: ["بایگانی", "فایل", "دانلود", "منابع و اصل اسناد"],
      },
    ],
  },
  {
    key: "automation",
    title: "خودکارسازی و هوش مصنوعی",
    description: "قواعد، الگوها و تنظیمات مدل",
    icon: CpuIcon,
    hub: "/settings/automation",
    items: [
      {
        key: "automation-rules",
        href: "/settings/rules",
        label: "قواعد خودکار",
        description: "تعریف شرط و اقدام برای پردازش اطلاعات مالی",
        icon: BooksIcon,
        permission: "company",
        keywords: ["قاعده", "خودکار", "قانون"],
      },
      {
        key: "learning",
        href: "/settings/learning",
        label: "الگوهای آموخته‌شده",
        description: "استفاده دوباره از اصلاحات معتبر",
        icon: BooksIcon,
        permission: "company",
        keywords: ["یادگیری", "نگاشت", "الگو", "حافظه اصلاحات"],
      },
      {
        key: "model",
        href: "/settings/model",
        label: "مدل هوش مصنوعی",
        description: "اتصال و تنظیم مدل هوش مصنوعی",
        icon: CpuIcon,
        permission: "installation_admin",
        keywords: ["تعرفه", "مدل", "model", "کلید اتصال", "بودجه نصب"],
      },
    ],
  },
  {
    key: "company-access",
    title: "شرکت و کاربران",
    description: "اطلاعات شرکت، کاربران و ماژول‌ها",
    icon: BuildingsIcon,
    hub: "/settings/company-access",
    items: [
      {
        key: "company",
        href: "/settings/company",
        label: "شرکت",
        description: "مدیریت اطلاعات شرکت",
        icon: BuildingsIcon,
        permission: "company_or_admin",
        keywords: ["سازمان"],
      },
      {
        key: "members",
        href: "/settings/members",
        label: "اعضا و دسترسی",
        description: "مدیریت کاربران و مجوزهای شرکت",
        icon: UsersThreeIcon,
        permission: "owner",
        keywords: ["مجوز", "تأیید گزارش", "حساب کاربری"],
      },
      {
        key: "employees",
        href: "/employees",
        label: "کارمندان",
        description: "مدیریت اطلاعات کارکنان",
        icon: UsersThreeIcon,
        permission: "company",
      },
      {
        key: "modules",
        href: "/settings/modules",
        label: "ماژول‌های شرکت",
        description: "فعال یا غیرفعال‌کردن بخش‌های شرکت",
        icon: SquaresFourIcon,
        permission: "company",
        keywords: ["فعال", "غیرفعال", "حقوق", "بیمه", "مالیات"],
      },
    ],
  },
  {
    key: "connections",
    title: "اتصال‌ها",
    description: "حساب تلگرام و بله",
    icon: PlugsConnectedIcon,
    standalone: true,
    items: [
      {
        key: "connections",
        href: "/settings/connections",
        label: "اتصال‌ها",
        icon: PlugsConnectedIcon,
        permission: "company",
        keywords: ["تلگرام", "بله", "بات", "ربات", "telegram", "bale"],
      },
    ],
  },
  {
    key: "usage",
    title: "مصرف و هزینه",
    description: "مصرف و سقف هزینه شرکت",
    icon: CoinsIcon,
    standalone: true,
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
