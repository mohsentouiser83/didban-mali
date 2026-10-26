export const roles = {
  owner: "مالک",
  finance_manager: "مدیر مالی",
  advisor_accountant: "مشاور / حسابدار",
  viewer: "مشاهده‌گر",
};
export const roleOptions = Object.entries(roles).map(([value, label]) => ({
  value,
  label,
}));
