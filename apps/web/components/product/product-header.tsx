"use client";

import Link from "next/link";
import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
} from "react";

import {
  Building2,
  Calendar,
  Check,
  ChevronDown,
  LifeBuoy,
  MoreHorizontal,
  PanelLeft,
  Plus,
  Search,
  Settings,
  type AppIcon,
} from "@/components/ui/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { useSidebar } from "@/components/ui/sidebar";
import type { Company } from "@/lib/product-types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type IconMotion =
  | "menu"
  | "company"
  | "chevron"
  | "search"
  | "settings"
  | "support"
  | "calendar"
  | "more"
  | "check"
  | "plus";

function HeaderIcon({
  icon: Icon,
  motion,
}: {
  icon: AppIcon;
  motion: IconMotion;
}) {
  return (
    <span className="header-icon" data-motion={motion} aria-hidden="true">
      <Icon size={20} />
    </span>
  );
}

const HeaderAction = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    label: string;
    icon: AppIcon;
    motion: IconMotion;
  }
>(({ label, icon, motion, className, ...props }, ref) => (
  <Button
    variant="surface"
    size="auto"
    motion="none"
    ref={ref}
    type="button"
    className={cn("header-control header-action", className)}
    title={label}
    aria-label={label}
    {...props}
  >
    <HeaderIcon icon={icon} motion={motion} />

  </Button>
));
HeaderAction.displayName = "HeaderAction";

export type HeaderSettingsItem = {
  href: string;
  title: string;
  description: string;
  icon: AppIcon;
  onClick?: () => void;
};

type ProductHeaderProps = {
  company: Company;
  companies: Company[];
  pathname: string;
  settingsItems: HeaderSettingsItem[];
  onSwitchCompany: (id: string) => void;
  onSearch: () => void;
  onSupport: () => void;
};

export function ProductHeader({
  company,
  companies,
  pathname,
  settingsItems,
  onSwitchCompany,
  onSearch,
  onSupport,
}: ProductHeaderProps) {
  const { toggleSidebar, open, openMobile, isMobile } = useSidebar();
  const [companyOpen, setCompanyOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [currentDate, setCurrentDate] = useState("");
  const settingsButton = useRef<HTMLButtonElement>(null);
  const moreButton = useRef<HTMLButtonElement>(null);
  const settingsReturnFocus = useRef<HTMLButtonElement | null>(null);
  const pendingMobileAction = useRef<(() => void) | null>(null);

  useEffect(() => {
    const update = () =>
      setCurrentDate(
        new Intl.DateTimeFormat("fa-IR", {
          weekday: "short",
          day: "numeric",
          month: "long",
          timeZone: "Asia/Tehran",
        }).format(new Date()),
      );
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <header className="product-header product-chrome" dir="rtl">
      <div className="header-identity">
        <HeaderAction
          label="باز و بسته‌کردن منو"
          icon={PanelLeft}
          motion="menu"
          onClick={toggleSidebar}
          aria-expanded={isMobile ? openMobile : open}
        />
        <span className="header-divider" aria-hidden="true" />
        <DropdownMenu
          open={companyOpen}
          onOpenChange={setCompanyOpen}
          dir="rtl"
        >
          <DropdownMenuTrigger asChild>
            <Button
              variant="surface"
              size="auto"
              motion="none"
              type="button"
              className="header-control header-company"
              aria-label={`انتخاب شرکت: ${company.legal_name}`}
            >
              <span className="header-company-mark">
                <HeaderIcon icon={Building2} motion="company" />
              </span>
              <span className="header-company-name" title={company.legal_name}>
                {company.legal_name}
              </span>
              <HeaderIcon icon={ChevronDown} motion="chevron" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            sideOffset={12}
            className="product-chrome header-company-menu"
          >
            <DropdownMenuLabel className="header-menu-heading">
              انتخاب شرکت{" "}
              <span>{companies.length.toLocaleString("fa-IR")} شرکت</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <div className="header-company-options">
              {companies.map((item) => (
                <DropdownMenuItem
                  key={item.id}
                  onSelect={() => onSwitchCompany(item.id)}
                  className={cn(
                    "header-menu-item header-control",
                    item.id === company.id && "header-selected",
                  )}
                >
                  <HeaderIcon icon={Building2} motion="company" />
                  <span
                    className="min-w-0 flex-1 truncate"
                    title={item.legal_name}
                  >
                    {item.legal_name}
                  </span>
                  {item.id === company.id && (
                    <>
                      <HeaderIcon icon={Check} motion="check" />
                      <span className="sr-only">شرکت فعال</span>
                    </>
                  )}
                </DropdownMenuItem>
              ))}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              asChild
              className="header-menu-item header-control"
            >
              <Link href="/companies/new">
                <HeaderIcon icon={Plus} motion="plus" />
                تعریف شرکت جدید
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Button
        variant="surface"
        size="auto"
        motion="none"
        type="button"
        className="header-control header-search"
        onClick={onSearch}
        aria-label="جستجو و اجرای دستورات (Ctrl+K)"
      >
        <HeaderIcon icon={Search} motion="search" />
        <span>جستجو در دیدبان مالی…</span>
      </Button>

      <div className="header-tools">
        {currentDate && (
          <div
            className="header-date header-control"
            aria-label={`امروز ${currentDate}`}
          >
            <HeaderIcon icon={Calendar} motion="calendar" />
            <span>{currentDate}</span>
          </div>
        )}
        <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
          <PopoverAnchor asChild>
            <div className="header-actions">
              <HeaderAction
                ref={settingsButton}
                label="تنظیمات و مدیریت سامانه"
                icon={Settings}
                motion="settings"
                className="header-desktop-tool"
                onClick={() => {
                  settingsReturnFocus.current = settingsButton.current;
                  setSettingsOpen(!settingsOpen);
                }}
                aria-haspopup="dialog"
                aria-expanded={settingsOpen}
              />
              <HeaderAction
                label="پشتیبانی و ثبت تیکت"
                icon={LifeBuoy}
                motion="support"
                className="header-desktop-tool"
                onClick={onSupport}
              />
              <DropdownMenu dir="rtl">
                <DropdownMenuTrigger asChild>
                  <HeaderAction
                    ref={moreButton}
                    label="ابزارهای بیشتر"
                    icon={MoreHorizontal}
                    motion="more"
                    className="header-mobile-tool"
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  sideOffset={12}
                  className="product-chrome header-mobile-menu"
                  onCloseAutoFocus={(event) => {
                    const action = pendingMobileAction.current;
                    if (action) {
                      event.preventDefault();
                      pendingMobileAction.current = null;
                      requestAnimationFrame(action);
                    }
                  }}
                >
                  <DropdownMenuItem
                    className="header-control header-menu-item"
                    onSelect={() => {
                      pendingMobileAction.current = () => {
                        settingsReturnFocus.current = moreButton.current;
                        setSettingsOpen(true);
                      };
                    }}
                  >
                    <HeaderIcon icon={Settings} motion="settings" />
                    تنظیمات و مدیریت سامانه
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="header-control header-menu-item"
                    onSelect={() => {
                      pendingMobileAction.current = onSupport;
                    }}
                  >
                    <HeaderIcon icon={LifeBuoy} motion="support" />
                    پشتیبانی و ثبت تیکت
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </PopoverAnchor>
          <PopoverContent
            align="end"
            sideOffset={12}
            className="product-chrome header-settings-menu"
            dir="rtl"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              settingsReturnFocus.current?.focus();
            }}
          >
            <div className="header-panel-heading">
              <strong>تنظیمات و مدیریت</strong>
              <span>{company.legal_name}</span>
            </div>
            <div className="header-settings-list">
              {settingsItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={pathname === item.href ? "page" : undefined}
                  className={cn(
                    "header-control header-settings-item",
                    pathname === item.href && "header-selected",
                  )}
                  onClick={(event) => {
                    setSettingsOpen(false);
                    if (item.onClick) {
                      event.preventDefault();
                      item.onClick();
                    }
                  }}
                >
                  <span className="header-setting-icon">
                    <HeaderIcon
                      icon={item.icon}
                      motion="settings"
                    />
                  </span>
                  <span className="min-w-0">
                    <strong>{item.title}</strong>
                    <span>{item.description}</span>
                  </span>
                </Link>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </header>
  );
}
