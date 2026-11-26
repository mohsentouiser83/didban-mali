export const memberRoles = [
  { value: "owner", label: "مالک" },
  { value: "finance_manager", label: "مدیر مالی" },
  { value: "advisor", label: "مشاور / حسابدار" },
  { value: "viewer", label: "مشاهده‌گر" },
];

export const memberRoleFilterOptions = [
  { value: "all", label: "همه نقش‌ها" },
  ...memberRoles,
];

export const memberStatusFilterOptions = [
  { value: "all", label: "همه وضعیت‌ها" },
  { value: "active", label: "فعال" },
  { value: "inactive", label: "غیرفعال" },
];
