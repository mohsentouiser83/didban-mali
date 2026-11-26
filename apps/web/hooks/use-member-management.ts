"use client";
import { useState } from "react";
import {
  listItems,
  type Member,
  type ResourceList,
  type User,
} from "@/lib/api";
import type { AccountingPermission } from "@/lib/accounting";
import { memberRoles } from "@/lib/members";
import { useWorkspace } from "./workspace";
import { useResource } from "./use-resource";
import { useCommand } from "./use-command";
function normalized(value: string) {
  return value
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\u200c/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
export function useMemberManagement() {
  const workspace = useWorkspace();
  const members = useResource<ResourceList<Member>>(
    workspace.companyPath("members"),
  );
  const users = useResource<ResourceList<User>>(
    workspace.user?.installation_admin ? "/admin/users" : null,
  );
  const permissions = useResource<ResourceList<AccountingPermission>>(
    workspace.company?.role === "owner"
      ? workspace.companyPath("accounting/permissions")
      : null,
  );
  const command = useCommand(),
    accessCommand = useCommand();
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [validation, setValidation] = useState("");
  const [adding, setAdding] = useState(false);
  const [method, setMethod] = useState("existing");
  const [userId, setUserId] = useState("");
  const [newRole, setNewRole] = useState("viewer");
  const [account, setAccount] = useState({ name: "", email: "", password: "" });
  const [selected, setSelected] = useState<Member | null>(null);
  const [value, setValue] = useState({
    role: "viewer",
    active: true,
    approve_financial_report: false,
  });
  const [accessValue, setAccessValue] = useState({
    post_journal: false,
    reopen_period: false,
    view_payroll: false,
  });
  const [permission, setPermission] = useState<AccountingPermission>();
  const accessDirty =
    !!permission &&
    (permission.post_journal !== accessValue.post_journal ||
      permission.reopen_period !== accessValue.reopen_period ||
      Boolean(permission.view_payroll) !== accessValue.view_payroll);
  const membershipDirty =
    !!selected &&
    (selected.role !== value.role ||
      selected.active !== value.active ||
      selected.approve_financial_report !== value.approve_financial_report);
  function openMember(member: Member) {
    command.clearError();
    accessCommand.clearError();
    setSelected(member);
    setValue({
      role: member.role,
      active: member.active,
      approve_financial_report: member.approve_financial_report,
    });
    const permission = listItems(permissions.data).find(
      (item) => item.membership_id === member.id,
    );
    setPermission(permission);
    setAccessValue({
      post_journal: permission?.post_journal || false,
      reopen_period: permission?.reopen_period || false,
      view_payroll: permission?.view_payroll || false,
    });
  }
  async function add() {
    if (command.busy || workspace.company?.role !== "owner") return;
    setValidation("");
    if (
      method === "new" &&
      !userId &&
      (!account.name.trim() ||
        !account.email.trim() ||
        account.password.length < 12)
    ) {
      setValidation("نام، ایمیل و رمز حداقل ۱۲ کاراکتری را وارد کنید.");
      return;
    }
    let recipient = userId;
    if (method === "new" && !recipient) {
      const created = await command.run<User>("/admin/users", {
        body: {
          name: account.name.trim(),
          email: account.email.trim(),
          password: account.password,
        },
      });
      if (!created) return;
      recipient = created.id;
      setUserId(recipient);
      setAccount({ name: "", email: "", password: "" });
      users.refresh();
    }
    if (!recipient.trim()) {
      setValidation("حساب کاربر را انتخاب کنید.");
      return;
    }
    await command.run(
      workspace.companyPath("members"),
      { body: { user_id: recipient.trim(), role: newRole } },
      () => {
        setAdding(false);
        members.refresh();
        permissions.refresh();
      },
      "عضو به شرکت اضافه شد.",
    );
  }
  function saveMember() {
    if (!selected || !membershipDirty || workspace.company?.role !== "owner")
      return;
    const body = {
      role: value.role,
      active: value.active,
      ...(["owner", "advisor"].includes(value.role)
        ? { approve_financial_report: value.approve_financial_report }
        : {}),
    };
    void command.run<Member>(
      workspace.companyPath(`members/${selected.id}`),
      { method: "PATCH", version: selected.version, body },
      (updated) => {
        setSelected(null);
        members.refresh();
        permissions.refresh();
        void workspace.refreshCompanies();
        // The next edit starts from the current server version, never an old local draft.
        setValue({
          role: updated.role,
          active: updated.active,
          approve_financial_report: updated.approve_financial_report,
        });
      },
      "اطلاعات عضو ذخیره شد.",
    );
  }
  function saveAccess() {
    if (
      !selected ||
      !permission ||
      !accessDirty ||
      membershipDirty ||
      workspace.company?.role !== "owner"
    )
      return;
    void accessCommand.run<AccountingPermission>(
      workspace.companyPath(`accounting/permissions/${selected.id}`),
      {
        method: "PATCH",
        version: permission.version,
        body: accessValue,
      },
      () => {
        permissions.refresh();
        setSelected(null);
      },
      "دسترسی‌های حسابداری ذخیره شد.",
    );
  }
  const lastActiveOwnerId = (() => {
    const activeOwners = listItems(members.data).filter((m) => m.role === "owner" && m.active);
    return activeOwners.length === 1 ? activeOwners[0].id : null;
  })();

  return {
    workspace,
    members,
    users,
    permissions,
    lastActiveOwnerId,
    command,
    accessCommand,
    validation,
    adding,
    method,
    userId,
    newRole,
    account,
    selected,
    value,
    accessValue,
    permission,
    membershipDirty,
    accessDirty,
    allRows: (() => {
      const all = listItems(members.data).map((member) => ({
        ...member,
        roleLabel:
          memberRoles.find((role) => role.value === member.role)?.label ||
          "نامشخص",
      }));
      return all;
    })(),
    get rows() {
      const all = listItems(members.data).map((member) => ({
        ...member,
        roleLabel:
          memberRoles.find((role) => role.value === member.role)?.label ||
          "نامشخص",
      }));
      return all.filter((member) => {
        if (roleFilter !== "all" && member.role !== roleFilter) return false;
        if (statusFilter === "active" && !member.active) return false;
        if (statusFilter === "inactive" && member.active) return false;
        if (query.trim()) {
          const term = normalized(query);
          const nameMatch = member.name
            ? normalized(member.name).includes(term)
            : false;
          const emailMatch = member.email
            ? normalized(member.email).includes(term)
            : false;
          const roleMatch = normalized(member.roleLabel).includes(term);
          const idMatch = member.user_id
            ? normalized(member.user_id).includes(term)
            : false;
          if (!nameMatch && !emailMatch && !roleMatch && !idMatch) return false;
        }
        return true;
      });
    },
    query,
    setQuery,
    roleFilter,
    setRoleFilter,
    statusFilter,
    setStatusFilter,
    hasActiveFilters: Boolean(
      query.trim() || roleFilter !== "all" || statusFilter !== "all",
    ),
    resetFilters: () => {
      setQuery("");
      setRoleFilter("all");
      setStatusFilter("all");
    },
    totalMembers: listItems(members.data).length,
    userSearchQuery,
    setUserSearchQuery,
    get userOptions() {
      return listItems(users.data).map((user) => ({
        value: user.id,
        label: `${user.name} (${user.email})`,
      }));
    },
    get filteredUserOptions() {
      const options = listItems(users.data).map((user) => ({
        value: user.id,
        label: `${user.name} (${user.email})`,
      }));
      if (!userSearchQuery.trim()) return options;
      const term = normalized(userSearchQuery);
      return options.filter((opt) => normalized(opt.label).includes(term));
    },
    canCreateAccount: !!workspace.user?.installation_admin,
    openAdd: () => {
      setValidation("");
      command.clearError();
      setAdding(true);
      setMethod("existing");
      setUserId("");
      setUserSearchQuery("");
      setNewRole("viewer");
      setAccount({ name: "", email: "", password: "" });
    },
    closeAdd: () => {
      if (!command.busy) setAdding(false);
    },
    closeMember: () => {
      if (!command.busy && !accessCommand.busy) setSelected(null);
    },
    setMethod: (method: string) => {
      setMethod(method);
      setUserId("");
      command.clearError();
    },
    setUserId,
    setNewRole,
    setAccount,
    setAccessValue,
    setRole: (role: string) =>
      setValue((current) => ({
        ...current,
        role,
        approve_financial_report: false,
      })),
    change: (patch: Partial<typeof value>) =>
      setValue((current) => ({ ...current, ...patch })),
    openMember,
    add,
    saveMember,
    saveAccess,
  };
}
