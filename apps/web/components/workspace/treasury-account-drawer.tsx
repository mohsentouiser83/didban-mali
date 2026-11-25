"use client";

import { useId, useState } from "react";
import { toast } from "sonner";
import { BankIcon, PlusIcon, WalletIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Field, FormMessage } from "@/components/ui/field";
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
  parentAccountLevel,
  suggestAccountCode,
  validateAccountCodePattern,
  type AccountLevel,
} from "@/lib/account-catalogue";

export type TreasuryType = "bank" | "cash" | "petty_cash";

interface TreasuryAccountDrawerProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const TYPE_CONFIG: Record<
  TreasuryType,
  { label: string; placeholder: string; defaultCodePrefix: string }
> = {
  bank: {
    label: "بانک",
    placeholder: "مثلاً بانک ملت - حساب جاری",
    defaultCodePrefix: "10101",
  },
  cash: {
    label: "صندوق",
    placeholder: "مثلاً صندوق مرکزی یا فروشگاه",
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
  onClose,
  onSuccess,
}: TreasuryAccountDrawerProps) {
  const formId = useId();
  const workspace = useWorkspace();
  const accounts = useAccountOptions(workspace.company?.id || "");
  const command = useCommand();

  const [treasuryType, setTreasuryType] = useState<TreasuryType>("bank");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [parentId, setParentId] = useState("");
  const [level, setLevel] = useState<AccountLevel>("subsidiary");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [iban, setIban] = useState("");
  const [branchName, setBranchName] = useState("");
  const [branchCode, setBranchCode] = useState("");
  const [holderName, setHolderName] = useState("");
  const [pettyLimit, setPettyLimit] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isBank = treasuryType === "bank";
  const isCash = treasuryType === "cash";
  const isPettyCash = treasuryType === "petty_cash";

  // Filter parents to group, general, or subsidiary accounts (treasury accounts themselves are general/subsidiary/detail)
  const requiredParentLevel = parentAccountLevel(level);
  const parentCandidates = accounts.items.filter((item) =>
    requiredParentLevel ? item.level === requiredParentLevel : item.level === "group" || item.level === "general" || item.level === "subsidiary",
  );

  // Sort cash/bank parents to the top
  const sortedParents = [...parentCandidates].sort((a, b) => {
    const aTreasury =
      a.name.includes("بانک") ||
      a.name.includes("نقد") ||
      a.name.includes("صندوق");
    const bTreasury =
      b.name.includes("بانک") ||
      b.name.includes("نقد") ||
      b.name.includes("صندوق");
    if (aTreasury && !bTreasury) return -1;
    if (!aTreasury && bTreasury) return 1;
    return a.code.localeCompare(b.code);
  });

  const parentOptions = sortedParents.map((item) => ({
    value: item.id,
    label: `${item.code} — ${item.name} (${accountLevelLabel(item.level)})`,
  }));

  function handleTypeChange(type: TreasuryType) {
    setTreasuryType(type);
    command.clearError();
  }

  function handleLevelChange(nextLevel: AccountLevel) {
    setLevel(nextLevel);
    setParentId("");
    setCode(nextLevel === "group" ? suggestAccountCode(accounts.items, "group", "") : "");
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
    const nextErrors: Record<string, string> = {};

    const trimmedName = name.trim();
    const trimmedCode = code.trim();
    const selectedParent = accounts.items.find((item) => item.id === parentId);

    if (!trimmedName) {
      nextErrors.name = "نام حساب را وارد کنید.";
    }
    if (level === "group") {
      nextErrors.level = "حساب نقد و بانک نمی‌تواند در سطح گروه باشد؛ سطح کل، معین یا تفصیلی انتخاب کنید.";
    } else if (!parentId) {
      nextErrors.parent_id = "حساب بالادست را انتخاب کنید.";
    }
    const patternError = validateAccountCodePattern(trimmedCode, level, selectedParent?.code);
    if (patternError) {
      nextErrors.code = patternError;
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    void command.run(
      workspace.companyPath("treasury/accounts"),
      {
        method: "POST",
        body: {
          kind: treasuryType,
          name: trimmedName,
          code: trimmedCode,
          level,
          parent_account_id: parentId || null,
          active: true,
          ...(isBank
            ? {
                bank_name: bankName.trim() || null,
                account_number: accountNumber.trim() || null,
                iban: iban.trim() || null,
                branch_name: branchName.trim() || null,
                branch_code: branchCode.trim() || null,
              }
            : {
                custodian_name: holderName.trim() || null,
                ...(isPettyCash && pettyLimit.trim()
                  ? { petty_cash_limit_irr: pettyLimit.trim() }
                  : {}),
              }),
        },
      },
      () => {
        toast.success(
          `${TYPE_CONFIG[treasuryType].label} جدید با موفقیت تعریف شد.`,
        );
        onSuccess();
        onClose();
        // Reset form
        setName("");
        setCode("");
        setBankName("");
        setAccountNumber("");
        setIban("");
        setBranchName("");
        setBranchCode("");
        setHolderName("");
        setPettyLimit("");
        setErrors({});
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
      title="تعریف بانک، صندوق یا تنخواه‌گردان"
      footer={
        <Button
          type="submit"
          form={formId}
          busy={command.busy}
          disabled={command.busy}
        >
          <PlusIcon size={18} aria-hidden />
          ثبت و ذخیره حساب
        </Button>
      }
    >
      <Form
        id={formId}
        fieldErrors={{ ...command.error?.fields, ...errors }}
        onSubmit={handleSubmit}
        className="space-y-4"
      >
        {/* Treasury Type Selector */}
        <div>
          <label className="mb-2 block text-sm font-medium text-main">
            نوع حساب نقد و بانک
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => handleTypeChange("bank")}
              className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3 text-center transition-colors ${
                treasuryType === "bank"
                  ? "border-primary bg-accent/40 font-medium text-primary shadow-sm"
                  : "border-border bg-surface text-secondary hover:border-primary/40 hover:text-main"
              }`}
            >
              <BankIcon size={22} className="text-current" />
              <span className="text-xs">حساب بانکی</span>
            </button>

            <button
              type="button"
              onClick={() => handleTypeChange("cash")}
              className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3 text-center transition-colors ${
                treasuryType === "cash"
                  ? "border-primary bg-accent/40 font-medium text-primary shadow-sm"
                  : "border-border bg-surface text-secondary hover:border-primary/40 hover:text-main"
              }`}
            >
              <WalletIcon size={22} className="text-current" />
              <span className="text-xs">صندوق</span>
            </button>

            <button
              type="button"
              onClick={() => handleTypeChange("petty_cash")}
              className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3 text-center transition-colors ${
                treasuryType === "petty_cash"
                  ? "border-primary bg-accent/40 font-medium text-primary shadow-sm"
                  : "border-border bg-surface text-secondary hover:border-primary/40 hover:text-main"
              }`}
            >
              <WalletIcon size={22} className="text-current" />
              <span className="text-xs">تنخواه‌گردان</span>
            </button>
          </div>
        </div>

        {/* Account Name */}
        <Field
          id="treasury-name"
          name="name"
          label={`نام ${TYPE_CONFIG[treasuryType].label}`}
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

        {/* Level */}
        <Field id="treasury-level" name="level" label="سطح حساب" required>
          <Select
            id="treasury-level"
            value={level}
            options={ACCOUNT_LEVEL_OPTIONS.filter((opt) => opt.value !== "group")}
            disabled={command.busy}
            onValueChange={(val) => handleLevelChange(val as AccountLevel)}
          />
        </Field>

        {/* Parent Account */}
        <Field
          id="treasury-parent"
          name="parent_id"
          label="حساب بالادست"
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

        {/* Account Code */}
        <Field
          id="treasury-code"
          name="code"
          label="کد حساب"
          description={accountCodeHint(level, accounts.items.find((i) => i.id === parentId)?.code) || undefined}
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

        {/* Extra fields based on type */}
        {isBank && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="treasury-bank-name" label="نام بانک (اختیاری)">
              <Input
                id="treasury-bank-name"
                maxLength={120}
                placeholder="مثلاً بانک ملت"
                value={bankName}
                disabled={command.busy}
                onChange={(e) => setBankName(e.target.value)}
              />
            </Field>
            <Field id="treasury-account-number" label="شماره حساب (اختیاری)">
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
            <Field id="treasury-iban" label="شماره شبا (اختیاری)">
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
            <Field id="treasury-branch-name" label="نام شعبه (اختیاری)">
              <Input
                id="treasury-branch-name"
                maxLength={120}
                placeholder="مثلاً شعبه مرکزی"
                value={branchName}
                disabled={command.busy}
                onChange={(e) => setBranchName(e.target.value)}
              />
            </Field>
            <Field id="treasury-branch-code" label="کد شعبه (اختیاری)">
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
              label={isPettyCash ? "نام تنخواه‌دار (اختیاری)" : "مسئول صندوق (اختیاری)"}
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
              <Field id="treasury-petty-limit" label="سقف تنخواه (ریال - اختیاری)">
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

        <div className="rounded-xl border border-border bg-canvas/60 p-3 text-xs text-secondary leading-relaxed">
          حساب‌های ایجاد شده از این بخش، دارای برچسب و نقش{" "}
          <strong className="text-main">
            {TYPE_CONFIG[treasuryType].label}
          </strong>{" "}
          خواهند بود و به عنوان بانک مبدأ یا مقاصد تسویه در کلیه فرم‌های دریافت،
          پرداخت و اسناد مالی در دسترس خواهند بود.
        </div>

        <FormMessage error>{command.error?.message}</FormMessage>
      </Form>
    </Drawer>
  );
}
