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
  BellRing,
  Building2,
  Calendar,
  Check,
  CheckCheck,
  ChevronDown,
  Compass,
  Layers,
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
  PopoverTrigger,
} from "@/components/ui/popover";
import { useSidebar } from "@/components/ui/sidebar";
import type { Company, InAppAlert } from "@/lib/product-types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type IconMotion =
  | "menu"
  | "company"
  | "chevron"
  | "search"
  | "settings"
  | "bell"
  | "tour"
  | "support"
  | "calendar"
  | "more"
  | "check"
  | "plus"
  | "layers";

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
    badge?: number;
  }
>(({ label, icon, motion, badge, className, ...props }, ref) => (
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
    {!!badge && badge > 0 && (
      <span className="header-alert-count" aria-hidden="true">
        {badge > 99 ? "۹۹+" : badge.toLocaleString("fa-IR")}
      </span>
    )}
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
  base: string;
  pathname: string;
  settingsItems: HeaderSettingsItem[];
  alerts: InAppAlert[];
  unreadCount: number;
  activeAlertCount: number;
  onSwitchCompany: (id: string) => void;
  onSearch: () => void;
  onTour: () => void;
  onSupport: () => void;
  onMarkAllRead: () => Promise<void>;
};

export function ProductHeader({
  company,
  companies,
  base,
  pathname,
  settingsItems,
  alerts,
  unreadCount,
  activeAlertCount,
  onSwitchCompany,
  onSearch,
  onTour,
  onSupport,
  onMarkAllRead,
}: ProductHeaderProps) {
  const { toggleSidebar, open, openMobile, isMobile } = useSidebar();
  const [companyOpen, setCompanyOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState("");
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

  async function markRead() {
    setReading(true);
    setReadError("");
    try {
      await onMarkAllRead();
    } catch {
      setReadError("ثبت وضعیت اعلان‌ها انجام نشد. دوباره تلاش کنید.");
    } finally {
      setReading(false);
    }
  }

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
            <DropdownMenuItem
              asChild
              className="header-menu-item header-control"
            >
              <Link href="/admin/holding">
                <HeaderIcon icon={Layers} motion="layers" />
                دیدبان هلدینگ
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
              <Popover
                open={alertsOpen}
                onOpenChange={(value) => {
                  setAlertsOpen(value);
                  if (value) setReadError("");
                }}
              >
                <PopoverTrigger asChild>
                  <HeaderAction
                    label={`اعلان‌ها و هشدارهای مالی${unreadCount ? `، ${unreadCount.toLocaleString("fa-IR")} خوانده‌نشده` : ""}`}
                    icon={BellRing}
                    motion="bell"
                    badge={unreadCount || activeAlertCount}
                    className={
                      unreadCount > 0 ? "header-has-alerts" : undefined
                    }
                  />
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  sideOffset={12}
                  className="product-chrome header-alerts-menu"
                  dir="rtl"
                >
                  <div className="header-panel-heading">
                    <strong>اعلان‌ها و هشدارها</strong>
                    {unreadCount > 0 && (
                      <Button
                        variant="surface"
                        size="auto"
                        motion="none"
                        type="button"
                        className="header-control header-read-all"
                        onClick={() => void markRead()}
                        disabled={reading}
                        aria-busy={reading}
                      >
                        <HeaderIcon icon={CheckCheck} motion="check" />
                        {reading ? "در حال ثبت…" : "خواندن همه"}
                      </Button>
                    )}
                  </div>
                  {readError && (
                    <p role="alert" className="header-error">
                      {readError}
                    </p>
                  )}
                  <div className="header-alerts-list">
                    {alerts.length ? (
                      alerts.map((alert) => (
                        <Link
                          key={alert.id}
                          href={
                            alert.finding_id
                              ? `${base}/findings/${alert.finding_id}`
                              : `${base}/overview`
                          }
                          className={cn(
                            "header-alert-row",
                            !alert.is_read && "header-unread",
                          )}
                          onClick={() => setAlertsOpen(false)}
                        >
                          <span
                            className="header-alert-dot"
                            aria-hidden="true"
                          />
                          <span className="min-w-0">
                            <strong>{alert.title_fa}</strong>
                            <span className="header-alert-body">
                              {alert.body_fa || alert.message_fa}
                            </span>
                            <time dateTime={alert.created_at}>
                              {new Intl.DateTimeFormat("fa-IR", {
                                dateStyle: "short",
                                timeStyle: "short",
                                timeZone: "Asia/Tehran",
                              }).format(new Date(alert.created_at))}
                            </time>
                          </span>
                          {!alert.is_read && (
                            <span className="sr-only">خوانده‌نشده</span>
                          )}
                        </Link>
                      ))
                    ) : (
                      <div className="header-alert-empty">
                        <HeaderIcon icon={BellRing} motion="bell" />
                        <strong>اعلانی برای نمایش وجود ندارد</strong>
                        <span>
                          اعلان‌های مالی شما اینجا نمایش داده می‌شوند.
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="header-panel-footer">
                    <Link
                      href={`${base}/findings?tab=alerts`}
                      onClick={() => setAlertsOpen(false)}
                    >
                      همهٔ هشدارها
                    </Link>
                    <Link
                      href={`${base}/actions`}
                      onClick={() => setAlertsOpen(false)}
                    >
                      کارتابل من
                    </Link>
                  </div>
                </PopoverContent>
              </Popover>
              <HeaderAction
                label="تور آشنایی با سامانه"
                icon={Compass}
                motion="tour"
                className="header-desktop-tool"
                onClick={onTour}
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
                      pendingMobileAction.current = onTour;
                    }}
                  >
                    <HeaderIcon icon={Compass} motion="tour" />
                    تور آشنایی با سامانه
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
                      motion={item.href === "#tour" ? "tour" : "settings"}
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
