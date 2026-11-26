"use client";

import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import {
  BankIcon,
  BooksIcon,
  PencilSimpleIcon,
  PlusIcon,
  WalletIcon,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusMessage } from "@/components/ui/content-states";
import { Drawer } from "@/components/ui/drawer";
import { Field, FormMessage } from "@/components/ui/field";
import { DetailField, DetailGroup } from "@/components/ui/field-layout";
import { Form } from "@/components/ui/form";
import { AmountInput, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useAccountOptions } from "@/hooks/use-accounting";
import { useCommand } from "@/hooks/use-command";
import { useWorkspace } from "@/hooks/workspace";
import {
  ACCOUNT_LEVEL_OPTIONS,
  accountCodeHint,
  accountLevelLabel,
  isAccountPostable,
  parentAccountLevel,
  suggestAccountCode,
  validateAccountCodePattern,
  type AccountLevel,
} from "@/lib/account-catalogue";
import { amount } from "@/lib/utils";

export type TreasuryType = "bank" | "cash" | "petty_cash";

export interface TreasuryAccountItem {
  id: string;
  kind: TreasuryType;
  name: string;
  account_id: string;
  account_code?: string | null;
  account_name?: string | null;
  account_active?: boolean | null;
  active: boolean;
  bank_name?: string | null;
  account_number?: string | null;
  iban?: string | null;
  branch_name?: string | null;
  branch_code?: string | null;
  custodian_name?: string | null;
  custodian_counterparty_id?: string | null;
  petty_cash_limit_irr?: string | null;
  needs_completion?: boolean;
  version: number;
}

interface TreasuryAccountDrawerProps {
  open: boolean;
  editing?: TreasuryAccountItem | null;
  readOnly?: boolean;
  existingLinkedAccountIds?: string[];
  onClose: () => void;
  onSuccess: () => void;
}

const TYPE_CONFIG: Record<
  TreasuryType,
  { label: string; placeholder: string; defaultCodePrefix: string }
> = {
  bank: {
    label: "بانک",
    placeholder: "مثلاً جاری ملت شعبه مرکزی",
    defaultCodePrefix: "10101",
  },
  cash: {
    label: "صندوق",
    placeholder: "مثلاً صندوق مرکزی",
    defaultCodePrefix: "10102",
  },
  petty_cash: {
    label: "تنخواه‌گردان",
    placeholder: "مثلاً تنخواه‌گردان دفتر مرکزی",
    defaultCodePrefix: "10103",
  },
};

export function TreasuryAccountDrawer({
  open,
  editing = null,
  readOnly = false,
  existingLinkedAccountIds = [],
  onClose,
  onSuccess,
}: TreasuryAccountDrawerProps) {
  const formId = useId();
  const workspace = useWorkspace();
  const accounts = useAccountOptions(workspace.company?.id || "");
  const command = useCommand();

  const [treasuryType, setTreasuryType] = useState<TreasuryType>("bank");
  const [linkMode, setLinkMode] = useState<"create_new" | "link_existing">("create_new");
  const [linkedAccountId, setLinkedAccountId] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [parentId, setParentId] = useState("");
  const [level, setLevel] = useState<AccountLevel>("subsidiary");
  const [active, setActive] = useState(true);
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [iban, setIban] = useState("");
  const [branchName, setBranchName] = useState("");
  const [branchCode, setBranchCode] = useState("");
  const [holderName, setHolderName] = useState("");
  const [pettyLimit, setPettyLimit] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    command.clearError();
    setErrors({});
    if (editing) {
      setTreasuryType(editing.kind);
      setName(editing.name || "");
      setActive(editing.active !== false);
      setBankName(editing.bank_name || "");
      setAccountNumber(editing.account_number || "");
      setIban(editing.iban || "");
      setBranchName(editing.branch_name || "");
      setBranchCode(editing.branch_code || "");
      setHolderName(editing.custodian_name || "");
      setPettyLimit(editing.petty_cash_limit_irr || "");
      setLinkedAccountId(editing.account_id);
      setLinkMode("link_existing");
    } else {
      setTreasuryType("bank");
      setLinkMode("create_new");
      setLinkedAccountId("");
      setName("");
      setCode("");
      setParentId("");
      setLevel("subsidiary");
      setActive(true);
      setBankName("");
      setAccountNumber("");
      setIban("");
      setBranchName("");
      setBranchCode("");
      setHolderName("");
      setPettyLimit("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id, editing?.version]);

  const isEditing = Boolean(editing);
  const isBank = treasuryType === "bank";
  const isCash = treasuryType === "cash";
  const isPettyCash = treasuryType === "petty_cash";

  const requiredParentLevel = parentAccountLevel(level);
  const parentCandidates = accounts.items.filter((item) =>
    requiredParentLevel
      ? item.level === requiredParentLevel
      : item.level === "group" || item.level === "general" || item.level === "subsidiary",
  );

  const sortedParents = [...parentCandidates].sort((a, b) => {
    const aTreasury =
      a.name.includes("بانک") || a.name.includes("نقد") || a.name.includes("صندوق");
    const bTreasury =
      b.name.includes("بانک") || b.name.includes("نقد") || b.name.includes("صندوق");
    if (aTreasury && !bTreasury) return -1;
    if (!aTreasury && bTreasury) return 1;
    return a.code.localeCompare(b.code);
  });

  const parentOptions = sortedParents.map((item) => ({
    value: item.id,
    label: `${item.code} — ${item.name} (${accountLevelLabel(item.level)})`,
  }));

  const linkableAccounts = accounts.items.filter((item) => {
    if (!isAccountPostable(item)) return false;
    if (existingLinkedAccountIds.includes(item.id)) return false;
    if (item.role && ![treasuryType, "cash_bank"].includes(item.role)) return false;
    return true;
  });

  const linkableOptions = linkableAccounts.map((item) => ({
    value: item.id,
    label: `${item.code} — ${item.name}`,
  }));

  function handleTypeChange(type: TreasuryType) {
    setTreasuryType(type);
    setLinkedAccountId("");
    command.clearError();
  }

  function handleLevelChange(nextLevel: AccountLevel) {
    setLevel(nextLevel);
    setParentId("");
    setCode("");
    setErrors({});
    command.clearError();
  }

  function handleParentChange(selectedParentId: string) {
    setParentId(selectedParentId);
    const parent = accounts.items.find((item) => item.id === selectedParentId);
    const nextLevel: AccountLevel =
      parent?.level === "group"
        ? "general"
        : parent?.level === "general"
          ? "subsidiary"
          : parent?.level === "subsidiary"
            ? "detail"
            : level;
    setLevel(nextLevel);
    setCode(suggestAccountCode(accounts.items, nextLevel, selectedParentId));
    setErrors({});
    command.clearError();
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (readOnly) return;
    const nextErrors: Record<string, string> = {};
    const trimmedName = name.trim();
    if (!trimmedName) {
      nextErrors.name = "نام نمایشی حساب را وارد کنید.";
    }

    if (!isEditing) {
      if (linkMode === "link_existing") {
        if (!linkedAccountId) {
          nextErrors.account_id = "حساب دفتر متناظر را انتخاب کنید.";
        }
      } else {
        const trimmedCode = code.trim();
        const selectedParent = accounts.items.find((item) => item.id === parentId);
        if (level === "group") {
          nextErrors.level = "حساب خزانه نمی‌تواند در سطح گروه باشد؛ سطح کل، معین یا تفصیلی انتخاب کنید.";
        } else if (!parentId) {
          nextErrors.parent_id = "حساب بالادست را انتخاب کنید.";
        }
        const patternError = validateAccountCodePattern(trimmedCode, level, selectedParent?.code);
        if (patternError) {
          nextErrors.code = patternError;
        }
      }
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const kindPayload = isBank
      ? {
          bank_name: bankName.trim() || null,
          account_number: accountNumber.trim() || null,
          iban: iban.trim() || null,
          branch_name: branchName.trim() || null,
          branch_code: branchCode.trim() || null,
        }
      : {
          custodian_name: holderName.trim() || null,
          ...(isPettyCash
            ? { petty_cash_limit_irr: pettyLimit.trim() || null }
            : {}),
        };

    if (editing) {
      void command.run(
        workspace.companyPath(`treasury/accounts/${editing.id}`),
        {
          method: "PATCH",
          version: editing.version,
          body: {
            name: trimmedName,
            active,
            ...kindPayload,
          },
        },
        () => {
          toast.success(`اطلاعات ${TYPE_CONFIG[treasuryType].label} با موفقیت ذخیره شد.`);
          onSuccess();
          onClose();
        },
      );
      return;
    }

    void command.run(
      workspace.companyPath("treasury/accounts"),
      {
        method: "POST",
        body: {
          kind: treasuryType,
          name: trimmedName,
          active,
          ...(linkMode === "link_existing"
            ? { account_id: linkedAccountId }
            : {
                code: code.trim(),
                level,
                parent_account_id: parentId || null,
              }),
          ...kindPayload,
        },
      },
      () => {
        toast.success(`${TYPE_CONFIG[treasuryType].label} جدید با موفقیت تعریف شد.`);
        onSuccess();
        onClose();
      },
    );
  }

  return (
    <Drawer
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen && !command.busy) {
          onClose();
        }
      }}
      title={
        editing
          ? readOnly
            ? `مشاهده ${TYPE_CONFIG[treasuryType].label}: ${editing.name}`
            : `ویرایش ${TYPE_CONFIG[treasuryType].label}: ${editing.name}`
          : "تعریف بانک، صندوق یا تنخواه‌گردان"
      }
      footer={
        !readOnly ? (
          <Button
            type="submit"
            form={formId}
            busy={command.busy}
            disabled={command.busy}
          >
            {editing ? (
              <PencilSimpleIcon size={18} aria-hidden />
            ) : (
              <PlusIcon size={18} aria-hidden />
            )}
            {editing ? "ذخیره تغییرات" : "ثبت و ذخیره حساب"}
          </Button>
        ) : undefined
      }
    >
      {readOnly && editing ? (
        <div className="space-y-5">
          <DetailGroup>
            <DetailField
              label="نام نمایشی حساب"
              value={editing.name}
              icon={isBank ? BankIcon : WalletIcon}
            />
            <DetailField
              label="نوع حساب"
              value={TYPE_CONFIG[editing.kind].label}
              icon={BooksIcon}
            />
            <DetailField
              label="حساب دفتر متصل"
              value={
                editing.account_code
                  ? `${editing.account_code} — ${editing.account_name}`
                  : editing.account_id
              }
              icon={BooksIcon}
            />
            <DetailField
              label="وضعیت حساب خزانه"
              value={editing.active ? "فعال در دریافت و پرداخت" : "غیرفعال"}
              icon={BooksIcon}
            />
          </DetailGroup>
          {isBank ? (
            <DetailGroup>
              <DetailField label="نام بانک" value={editing.bank_name || "—"} icon={BankIcon} />
              <DetailField label="شماره حساب" value={editing.account_number || "—"} icon={BankIcon} />
              <DetailField label="شماره شبا" value={editing.iban || "—"} icon={BankIcon} />
              <DetailField label="نام شعبه" value={editing.branch_name || "—"} icon={BankIcon} />
              <DetailField label="کد شعبه" value={editing.branch_code || "—"} icon={BankIcon} />
            </DetailGroup>
          ) : (
            <DetailGroup>
              <DetailField
                label={isPettyCash ? "نام تنخواه‌دار" : "مسئول صندوق"}
                value={editing.custodian_name || "—"}
                icon={WalletIcon}
              />
              {isPettyCash && (
                <DetailField
                  label="سقف ریالی تنخواه"
                  value={
                    editing.petty_cash_limit_irr
                      ? `${amount(editing.petty_cash_limit_irr)} ریال`
                      : "بدون سقف"
                  }
                  icon={WalletIcon}
                />
              )}
            </DetailGroup>
          )}
          {editing.account_active === false && (
            <StatusMessage tone="warning">
              حساب دفتر متصل در کدینگ غیرفعال است؛ برای ثبت سند دستی جدید باید وضعیت آن در کدینگ بررسی شود.
            </StatusMessage>
          )}
        </div>
      ) : (
        <Form
          id={formId}
          fieldErrors={{ ...command.error?.fields, ...errors }}
          onSubmit={handleSubmit}
          className="space-y-4"
        >
          {!isEditing && (
            <div>
              <label className="mb-2 block text-sm font-medium text-main">
                نوع حساب خزانه
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { key: "bank", label: "حساب بانکی", icon: BankIcon },
                    { key: "cash", label: "صندوق", icon: WalletIcon },
                    { key: "petty_cash", label: "تنخواه‌گردان", icon: WalletIcon },
                  ] as const
                ).map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleTypeChange(key)}
                    className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3 text-center transition-colors ${
                      treasuryType === key
                        ? "border-primary bg-accent/40 font-medium text-primary shadow-sm"
                        : "border-border bg-surface text-secondary hover:border-primary/40 hover:text-main"
                    }`}
                  >
                    <Icon size={22} className="text-current" />
                    <span className="text-xs">{label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {editing && (
            <div className="rounded-xl border border-border bg-canvas/60 p-3 text-xs space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted">حساب دفتر متصل:</span>
                <Badge tone="neutral">
                  {editing.account_code
                    ? `${editing.account_code} — ${editing.account_name}`
                    : editing.account_id}
                </Badge>
              </div>
              <p className="text-muted">
                ارتباط با حساب دفتر و نوع حساب خزانه پس از ثبت اولیه ثابت می‌ماند.
              </p>
            </div>
          )}

          <Field
            id="treasury-name"
            name="name"
            label={isBank ? "نام نمایشی حساب" : `نام ${TYPE_CONFIG[treasuryType].label}`}
            required
          >
            <Input
              id="treasury-name"
              required
              maxLength={150}
              placeholder={TYPE_CONFIG[treasuryType].placeholder}
              value={name}
              disabled={command.busy}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>

          {!isEditing && (
            <>
              <Field id="treasury-link-mode" label="ارتباط با حساب دفتر" required>
                <Select
                  id="treasury-link-mode"
                  value={linkMode}
                  onValueChange={(val) => {
                    setLinkMode(val as "create_new" | "link_existing");
                    setErrors({});
                    command.clearError();
                  }}
                  options={[
                    { value: "create_new", label: "ایجاد حساب دفتر جدید و اتصال هم‌زمان" },
                    { value: "link_existing", label: "اتصال به یک حساب دفتر موجود" },
                  ]}
                />
              </Field>

              {linkMode === "link_existing" ? (
                <Field
                  id="treasury-existing-account"
                  name="account_id"
                  label="انتخاب حساب دفتر"
                  description="فقط حساب‌های فعال و قابل ثبت سند با نقش متناسب که به خزانه دیگری متصل نیستند نمایش داده می‌شوند."
                  required
                >
                  <Select
                    id="treasury-existing-account"
                    value={linkedAccountId}
                    options={linkableOptions}
                    searchable
                    searchPlaceholder="جستجوی کد یا نام حساب..."
                    disabled={command.busy || accounts.loading}
                    placeholder={
                      accounts.loading ? "در حال دریافت حساب‌ها..." : "انتخاب حساب دفتر"
                    }
                    onValueChange={setLinkedAccountId}
                  />
                </Field>
              ) : (
                <>
                  <Field id="treasury-level" name="level" label="سطح حساب دفتر" required>
                    <Select
                      id="treasury-level"
                      value={level}
                      options={ACCOUNT_LEVEL_OPTIONS.filter((opt) => opt.value !== "group")}
                      disabled={command.busy}
                      onValueChange={(val) => handleLevelChange(val as AccountLevel)}
                    />
                  </Field>
                  <Field
                    id="treasury-parent"
                    name="parent_id"
                    label="حساب بالادست در کدینگ"
                    required
                  >
                    <Select
                      id="treasury-parent"
                      value={parentId}
                      options={parentOptions}
                      searchable
                      searchPlaceholder="جستجوی حساب بالادست..."
                      disabled={command.busy || accounts.loading}
                      placeholder={
                        accounts.loading
                          ? "در حال دریافت حساب‌ها..."
                          : "انتخاب حساب بالادست"
                      }
                      onValueChange={handleParentChange}
                    />
                  </Field>
                  <Field
                    id="treasury-code"
                    name="code"
                    label="کد حساب دفتر"
                    description={
                      accountCodeHint(
                        level,
                        accounts.items.find((i) => i.id === parentId)?.code,
                      ) || undefined
                    }
                    required
                  >
                    <Input
                      id="treasury-code"
                      required
                      dir="ltr"
                      maxLength={100}
                      placeholder={TYPE_CONFIG[treasuryType].defaultCodePrefix}
                      value={code}
                      disabled={command.busy}
                      onChange={(e) => setCode(e.target.value)}
                    />
                  </Field>
                </>
              )}
            </>
          )}

          {isBank && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="treasury-bank-name" label="نام بانک">
                <Input
                  id="treasury-bank-name"
                  maxLength={120}
                  placeholder="مثلاً بانک ملت"
                  value={bankName}
                  disabled={command.busy}
                  onChange={(e) => setBankName(e.target.value)}
                />
              </Field>
              <Field id="treasury-account-number" label="شماره حساب">
                <Input
                  id="treasury-account-number"
                  dir="ltr"
                  maxLength={60}
                  placeholder="مثلاً 0218800990001"
                  value={accountNumber}
                  disabled={command.busy}
                  onChange={(e) => setAccountNumber(e.target.value)}
                />
              </Field>
              <Field id="treasury-iban" label="شماره شبا">
                <Input
                  id="treasury-iban"
                  dir="ltr"
                  maxLength={34}
                  placeholder="IR..."
                  value={iban}
                  disabled={command.busy}
                  onChange={(e) => setIban(e.target.value)}
                />
              </Field>
              <Field id="treasury-branch-name" label="نام شعبه">
                <Input
                  id="treasury-branch-name"
                  maxLength={120}
                  placeholder="مثلاً شعبه مرکزی"
                  value={branchName}
                  disabled={command.busy}
                  onChange={(e) => setBranchName(e.target.value)}
                />
              </Field>
              <Field id="treasury-branch-code" label="کد شعبه">
                <Input
                  id="treasury-branch-code"
                  dir="ltr"
                  maxLength={30}
                  placeholder="مثلاً 1042"
                  value={branchCode}
                  disabled={command.busy}
                  onChange={(e) => setBranchCode(e.target.value)}
                />
              </Field>
            </div>
          )}

          {(isCash || isPettyCash) && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                id="treasury-holder"
                label={isPettyCash ? "نام تنخواه‌دار" : "مسئول صندوق"}
              >
                <Input
                  id="treasury-holder"
                  maxLength={120}
                  placeholder="مثلاً نام همکار یا متصدی"
                  value={holderName}
                  disabled={command.busy}
                  onChange={(e) => setHolderName(e.target.value)}
                />
              </Field>
              {isPettyCash && (
                <Field id="treasury-petty-limit" label="سقف ریالی تنخواه">
                  <AmountInput
                    id="treasury-petty-limit"
                    maxLength={80}
                    value={pettyLimit}
                    disabled={command.busy}
                    onValueChange={setPettyLimit}
                  />
                </Field>
              )}
            </div>
          )}

          {editing && (
            <Checkbox
              id="treasury-active"
              label="حساب خزانه فعال است"
              checked={active}
              disabled={command.busy}
              onCheckedChange={setActive}
            />
          )}

          {editing && !active && (
            <StatusMessage tone="warning">
              با ذخیرهٔ وضعیت غیرفعال، این حساب در ابزارهای جدید دریافت و پرداخت قابل انتخاب نخواهد بود. حساب متناظر در دفتر کل همچنان فعال می‌ماند و سوابق دریافت و پرداخت پیشین قابل پیگیری خواهند بود.
            </StatusMessage>
          )}

          <FormMessage error>{command.error?.message}</FormMessage>
        </Form>
      )}
    </Drawer>
  );
}
