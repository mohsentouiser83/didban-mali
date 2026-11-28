"use client";

import { useRef, useState, type ChangeEvent } from "react";
import {
  ArrowClockwiseIcon,
  CameraIcon,
  TrashIcon,
  UserCircleIcon,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { ErrorState, LoadingState } from "@/components/ui/content-states";
import { Field, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { notify } from "@/components/ui/sonner";
import { useBotConnections } from "@/hooks/use-bot-connections";
import { useWorkspace } from "@/hooks/workspace";
import { api, ApiError, type User } from "@/lib/api";
import type { BotConnection } from "@/lib/bot-connections";
import { BotProviderPanel } from "./bot-provider-panel";
import { NoCompany, PageHeader, Panel } from "./page-parts";

export function ProfileView() {
  const workspace = useWorkspace();
  const botController = useBotConnections();

  if (!workspace.user) return <LoadingState label="در حال دریافت اطلاعات کاربر" />;

  return (
    <ProfileContent
      workspace={workspace}
      botView={botController}
      key={workspace.user.id + (workspace.company?.id || "")}
    />
  );
}

function ProfileContent({
  workspace,
  botView,
}: {
  workspace: ReturnType<typeof useWorkspace>;
  botView: ReturnType<typeof useBotConnections>;
}) {
  const user = workspace.user!;
  const [name, setName] = useState(user.name);
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string>();
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState<string>();
  const [disconnect, setDisconnect] = useState<BotConnection>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSaveName = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError("نام و نام‌خانوادگی نمی‌تواند خالی باشد.");
      return;
    }
    setNameError(undefined);
    setSavingName(true);
    try {
      const res = await api<{ user: User }>("/auth/profile", {
        method: "PATCH",
        body: { name: trimmed },
      });
      workspace.updateUser(res.user);
      setName(res.user.name);
      notify.success("نام کاربر با موفقیت به‌روزرسانی شد.");
    } catch (err) {
      setNameError(err instanceof Error ? err.message : "خطا در ذخیره نام کاربر");
    } finally {
      setSavingName(false);
    }
  };

  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset input so the same file can be re-selected if needed
    event.target.value = "";

    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setImageError("فرمت فایل باید PNG، JPG یا WebP باشد.");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setImageError("حجم تصویر نباید بیشتر از ۲ مگابایت باشد.");
      return;
    }

    setImageError(undefined);
    setUploadingImage(true);

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const dataUrl = reader.result as string;
        const res = await api<{ user: User }>("/auth/profile", {
          method: "PATCH",
          body: { avatar: dataUrl },
        });
        workspace.updateUser(res.user);
        notify.success("تصویر نمایه با موفقیت ثبت شد.");
      } catch (err) {
        setImageError(
          err instanceof ApiError && err.status === 413
            ? "حجم تصویر بسیار زیاد است (حداکثر ۲ مگابایت)."
            : err instanceof Error
              ? err.message
              : "خطا در بارگذاری تصویر نمایه",
        );
      } finally {
        setUploadingImage(false);
      }
    };
    reader.onerror = () => {
      setImageError("خطا در خواندن فایل تصویر.");
      setUploadingImage(false);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveAvatar = async () => {
    setImageError(undefined);
    setUploadingImage(true);
    try {
      const res = await api<{ user: User }>("/auth/profile", {
        method: "PATCH",
        body: { avatar: "" },
      });
      workspace.updateUser(res.user);
      notify.success("تصویر نمایه حذف شد.");
    } catch (err) {
      setImageError(err instanceof Error ? err.message : "خطا در حذف تصویر نمایه");
    } finally {
      setUploadingImage(false);
    }
  };

  const roleLabel =
    workspace.company?.role === "owner"
      ? "مالک شرکت"
      : workspace.company?.role === "finance_manager"
        ? "مدیر مالی"
        : workspace.company?.role === "advisor"
          ? "مشاور مالی"
          : "بیننده";

  return (
    <>
      <PageHeader title="پروفایل کاربری" icon={UserCircleIcon} />

      <div className="space-y-6">
        {/* User Info & Avatar Panel */}
        <Panel title="اطلاعات و تصویر نمایه">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-8">
            {/* Avatar & Upload Controls */}
            <div className="flex flex-col items-center gap-3 self-center sm:self-start">
              <div className="relative">
                {user.avatar ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={user.avatar}
                    alt={user.name}
                    className="size-24 rounded-full border-2 border-border object-cover shadow-sm sm:size-28"
                  />
                ) : (
                  <div
                    aria-hidden
                    className="grid size-24 place-items-center rounded-full bg-primary-soft text-3xl font-bold text-primary ring-2 ring-border sm:size-28"
                  >
                    {Array.from(user.name.trim())[0] || "ک"}
                  </div>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleFileSelect}
              />

              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button
                  variant="secondary"
                  busy={uploadingImage}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <CameraIcon size={16} aria-hidden />
                  {user.avatar ? "تغییر عکس" : "بارگذاری عکس"}
                </Button>
                {user.avatar && (
                  <Button
                    variant="ghost"
                    disabled={uploadingImage}
                    onClick={() => void handleRemoveAvatar()}
                    className="text-danger hover:bg-danger-soft hover:text-danger"
                  >
                    <TrashIcon size={16} aria-hidden />
                    حذف عکس
                  </Button>
                )}
              </div>
              {imageError && <FormMessage error>{imageError}</FormMessage>}
            </div>

            {/* Profile Form */}
            <div className="flex-1 space-y-4">
              <Form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleSaveName();
                }}
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="profile-name" label="نام و نام‌خانوادگی">
                    <Input
                      id="profile-name"
                      required
                      maxLength={100}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      disabled={savingName}
                    />
                  </Field>
                  <Field id="profile-email" label="آدرس ایمیل">
                    <Input
                      id="profile-email"
                      value={user.email}
                      disabled
                      dir="ltr"
                      className="bg-canvas font-mono"
                    />
                  </Field>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-xs text-muted">سطح دسترسی:</span>
                  {workspace.company && (
                    <Badge tone="primary">{roleLabel}</Badge>
                  )}
                  {user.installation_admin && (
                    <Badge tone="warning">مدیر کل سامانه</Badge>
                  )}
                </div>

                {nameError && <FormMessage error>{nameError}</FormMessage>}

                <div className="pt-2">
                  <Button type="submit" busy={savingName}>
                    ذخیره تغییرات
                  </Button>
                </div>
              </Form>
            </div>
          </div>
        </Panel>

        {/* Bot Connections Section */}
        <Panel
          title="اتصال به بات‌های پیام‌رسان"
          action={
            <Button
              variant="secondary"
              disabled={botView.busy || botView.loading}
              onClick={botView.refresh}
            >
              <ArrowClockwiseIcon size={16} aria-hidden />
              به‌روزرسانی وضعیت
            </Button>
          }
        >
          {workspace.company ? (
            <div className="space-y-4">
              {botView.loading ? (
                <LoadingState label="در حال دریافت اتصال‌ها" variant="panels" />
              ) : botView.error ? (
                <ErrorState message={botView.error.message} onRetry={botView.refresh} />
              ) : (
                <div className="grid items-start gap-5 lg:grid-cols-2">
                  {botView.cards.map((card) => (
                    <BotProviderPanel
                      key={card.provider}
                      card={card}
                      busy={botView.busy}
                      pendingAction={
                        botView.pendingAction?.provider === card.provider
                          ? botView.pendingAction.kind
                          : undefined
                      }
                      onCreate={() => void botView.create(card.provider)}
                      onCopy={() => void botView.copy(card.provider)}
                      onConfirm={(connection) => void botView.confirm(connection)}
                      onDisconnect={(connection) => {
                        botView.clearError();
                        setDisconnect(connection);
                      }}
                    />
                  ))}
                </div>
              )}

              {!disconnect && botView.operationError && (
                <div className="mt-4">
                  <FormMessage error>{botView.operationError.message}</FormMessage>
                </div>
              )}

              <ConfirmDialog
                open={!!disconnect}
                onOpenChange={(open) => {
                  if (!open) setDisconnect(undefined);
                }}
                title={
                  disconnect?.state === "active" ? "قطع اتصال حساب" : "لغو اتصال ناتمام"
                }
                busy={botView.busy}
                onConfirm={() => {
                  if (disconnect)
                    void botView.revoke(disconnect).then((success) => {
                      if (success) setDisconnect(undefined);
                    });
                }}
              >
                <p className="text-sm leading-7">
                  {disconnect?.state === "active"
                    ? "دسترسی این حساب به بات قطع شود؟"
                    : "درخواست اتصال این حساب لغو شود؟"}
                </p>
              </ConfirmDialog>
            </div>
          ) : (
            <NoCompany />
          )}
        </Panel>
      </div>
    </>
  );
}
