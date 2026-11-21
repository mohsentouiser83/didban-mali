import {
  BooksIcon,
  BuildingsIcon,
  CalendarBlankIcon,
  HashIcon,
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
    key: "personnel",
    title: "کارمندان و پرسنل",
    description: "پرونده پرسنل و قراردادهای کاری",
    icon: UsersThreeIcon,
    items: [
      {
        key: "employees",
        href: "/settings/employees",
        label: "کارمندان",
        description: "مشخصات فردی، هویتی، بانکی و معافیت‌های قانونی",
        icon: UsersThreeIcon,
        permission: "company",
        keywords: [
          "کارمندان",
          "پرسنل",
          "کارکنان",
          "استخدام",
          "ایثارگر",
          "جانباز",
          "اتباع",
          "معافیت",
          "employees",
          "personnel",
        ],
      },
      {
        key: "contracts",
        href: "/settings/contracts",
        label: "قرارداد کارمندان",
        description: "حقوق پایه، بن، مسکن و شمولیت بیمه و مالیات",
        icon: BooksIcon,
        permission: "company",
        keywords: [
          "قرارداد کارمندان",
          "قراردادهای کار",
          "قراردادها",
          "قرارداد",
          "احکام",
          "حکم",
          "پایه",
          "تمام وقت",
          "پاره وقت",
          "ساعتی",
          "contracts",
        ],
      },
    ],
  },
  {
    key: "access",
    title: "دسترسی",
    description: "مدیریت کاربران و مجوزهای دسترسی",
    icon: UsersThreeIcon,
    items: [
      {
        key: "members",
        href: "/settings/members",
        label: "دسترسی",
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
    ],
  },
  {
    key: "accounts",
    title: "کدینگ حساب‌ها",
    description: "ساختار سرفصل‌ها و حساب‌های معین و تفصیلی",
    icon: BooksIcon,
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
    ],
  },
  {
    key: "periods",
    title: "دوره‌های مالی",
    description: "مدیریت سال‌ها و دوره‌های مالی فعال و بسته",
    icon: CalendarBlankIcon,
    items: [
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
    ],
  },
  {
    key: "dimensions",
    title: "ابعاد مالی",
    description: "پروژه، شعبه و مرکز هزینه",
    icon: BuildingsIcon,
    items: [
      {
        key: "dimensions",
        href: "/settings/dimensions",
        label: "ابعاد مالی",
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
    ],
  },
  {
    key: "numbering",
    title: "شماره‌گذاری",
    description: "الگو، پیشوند و شماره شروع موجودیت‌ها و اسناد",
    icon: HashIcon,
    items: [
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
