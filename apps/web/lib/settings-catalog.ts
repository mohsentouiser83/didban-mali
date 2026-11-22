import {
  ArrowsLeftRightIcon,
  BankIcon,
  BellIcon,
  BarcodeIcon,
  BooksIcon,
  BuildingsIcon,
  BrainIcon,
  FilesIcon,
  ShieldCheckIcon,
  SquaresFourIcon,
  CalendarBlankIcon,
  HashIcon,
  PackageIcon,
  PlugsConnectedIcon,
  ReceiptIcon,
  StorefrontIcon,
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
    title: "تعاریف مالی و حسابداری",
    description: "کدینگ سرفصل‌ها، دوره‌های مالی، ابعاد و شماره‌گذاری",
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
      {
        key: "account-roles",
        href: "/settings/account-roles",
        label: "نقش حساب‌ها در صورت‌های مالی",
        icon: BooksIcon,
        permission: "company",
      },
      {
        key: "rules",
        href: "/settings/rules",
        label: "قواعد و پیشنهادهای حسابداری",
        icon: ShieldCheckIcon,
        permission: "company",
        keywords: ["خودکارسازی", "یادگیری", "نگاشت"],
      },
      {
        key: "learning",
        href: "/settings/learning",
        label: "الگوهای ثبت و نگاشت",
        icon: BooksIcon,
        permission: "company",
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
    key: "personnel",
    title: "کارمندان و پرسنل",
    description: "پرونده پرسنل و قراردادهای کاری",
    icon: UsersThreeIcon,
    hub: "/settings/personnel",
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
    key: "company-access",
    title: "شرکت و دسترسی",
    description: "مدیریت کاربران، مجوزها، پرونده شرکت و اتصالات",
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
      {
        key: "modules",
        href: "/settings/modules",
        label: "ماژول‌های شرکت",
        icon: SquaresFourIcon,
        permission: "company",
      },
      {
        key: "model",
        href: "/settings/model",
        label: "مدل هوش مصنوعی و بودجه",
        icon: BrainIcon,
        permission: "installation_admin",
        keywords: ["هزینه مدل", "بودجه", "تعرفه", "AI"],
      },
      {
        key: "connections",
        href: "/settings/connections",
        label: "اتصال‌ها و پیام‌رسان‌ها",
        description: "اتصال حساب تلگرام و بله برای گزارش‌ها و اعلانات",
        icon: PlugsConnectedIcon,
        permission: "company",
        keywords: [
          "تلگرام",
          "بله",
          "بات",
          "ربات",
          "telegram",
          "bale",
          "connections",
        ],
      },
      {
        key: "bot-notifications",
        href: "/settings/connections/notifications",
        label: "اعلان‌های بات",
        icon: BellIcon,
        permission: "company",
      },
    ],
  },
  {
    key: "documents",
    title: "اسناد و پردازش",
    description: "فایل‌های منبع، نوبت‌های پردازش و مدارک بات",
    icon: FilesIcon,
    hub: "/settings/documents",
    items: [
      {
        key: "sources",
        href: "/sources",
        label: "فایل‌های منبع",
        icon: FilesIcon,
        permission: "company",
        keywords: ["بارگذاری", "منابع", "اکسل"],
      },
      {
        key: "processing-sessions",
        href: "/uploads",
        label: "نوبت‌های پردازش",
        icon: CalendarBlankIcon,
        permission: "company",
        keywords: ["سؤال پردازش", "در انتظار پاسخ"],
      },
      {
        key: "bot-documents",
        href: "/settings/connections/documents",
        label: "مدارک بات",
        icon: PlugsConnectedIcon,
        permission: "company",
      },
    ],
  },
  {
    key: "reconciliation",
    title: "میز کار تطبیق و مغایرت",
    description: "مغایرت‌گیری بانک، طرف‌حساب‌ها و سامانه مؤدیان",
    icon: ArrowsLeftRightIcon,
    hub: "/reconciliation",
    items: [
      {
        key: "reconciliation-bank",
        href: "/reconciliation",
        label: "تطبیق بانک و دفتر",
        description: "مغایرت‌گیری گردش حساب با صورت‌حساب بانک",
        icon: BankIcon,
        permission: "company",
        keywords: ["تطبیق", "بانک", "دفتر", "مغایرت", "bank", "reconciliation"],
      },
      {
        key: "reconciliation-counterparties",
        href: "/reconciliation/counterparties",
        label: "تطبیق طرف‌حساب‌ها",
        description: "انطباق مانده معین با صورت‌حساب مشتریان و تأمین‌کنندگان",
        icon: UsersThreeIcon,
        permission: "company",
        keywords: [
          "طرف‌حساب",
          "مشتری",
          "تأمین‌کننده",
          "صورت‌حساب",
          "counterparties",
        ],
      },
      {
        key: "reconciliation-moadian",
        href: "/reconciliation/moadian",
        label: "تطبیق کارپوشه مؤدیان",
        description: "تطبیق فاکتورهای فروش با کارپوشه سازمان امور مالیاتی",
        icon: ReceiptIcon,
        permission: "company",
        keywords: ["مؤدیان", "کارپوشه", "مالیات", "ارزش افزوده", "moadian"],
      },
      {
        key: "review",
        href: "/review",
        label: "موارد نیازمند بررسی",
        icon: ShieldCheckIcon,
        permission: "company",
      },
      {
        key: "native-controls",
        href: "/review/native-controls",
        label: "کنترل‌های دفتر",
        icon: BooksIcon,
        permission: "company",
      },
      {
        key: "expense-changes",
        href: "/review/expense-changes",
        label: "تحلیل تغییر هزینه‌ها",
        icon: FilesIcon,
        permission: "company",
      },
    ],
  },
  {
    key: "inventory",
    title: "انبار و کالا",
    description: "کاتالوگ کالاها، انبارها و کنترل موجودی",
    icon: PackageIcon,
    hub: "/settings/inventory",
    items: [
      {
        key: "inventory-items",
        href: "/accounting/inventory/items",
        label: "کالاها و خدمات",
        description: "تعریف کالاها، واحد سنجش، بارکد و قیمت‌گذاری",
        icon: BarcodeIcon,
        permission: "company",
        keywords: [
          "کالا",
          "کالاها",
          "خدمات",
          "بارکد",
          "قیمت",
          "اجناس",
          "محصول",
          "items",
          "products",
        ],
      },
      {
        key: "inventory-warehouses",
        href: "/accounting/inventory/warehouses",
        label: "انبارها",
        description: "تعریف انبارها و مراکز نگهداری موجودی",
        icon: StorefrontIcon,
        permission: "company",
        keywords: [
          "انبار",
          "انبارها",
          "محل نگهداری",
          "سوله",
          "warehouses",
        ],
      },
      {
        key: "inventory-stock",
        href: "/accounting/inventory",
        label: "موجودی و کاردکس",
        description: "مشاهده موجودی ریالی و تعدادی و کاردکس کالا",
        icon: PackageIcon,
        permission: "company",
        keywords: [
          "موجودی",
          "کاردکس",
          "گردش کالا",
          "انبارداری",
          "stock",
          "inventory",
          "kardex",
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
      return access.installationAdmin;
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
