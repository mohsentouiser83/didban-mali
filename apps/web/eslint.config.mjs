import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const sharedTableRules = ["table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption"].map((tag) => ({
  selector: `JSXOpeningElement[name.name='${tag}']`,
  message: `Use the shared Table components instead of a raw <${tag}>.`,
}));

const sharedControlRules = ["button", "input", "textarea", "select", "dialog", "form"].map((tag) => ({
  selector: `JSXOpeningElement[name.name='${tag}']`,
  message: `Use the shared UI component instead of a raw <${tag}>.`,
}));

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  globalIgnores([".next/**", "coverage/**", "next-env.d.ts"]),
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/exhaustive-deps": "off",
      "react-hooks/purity": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react/no-unescaped-entities": "off",
      "jsx-a11y/role-supports-aria-props": "off",
    },
  },
  {
    files: ["app/**/*.tsx", "components/**/*.tsx"],
    ignores: [
      "**/*.test.tsx",
      "components/ui/button.tsx",
      "components/ui/input.tsx",
      "components/ui/form.tsx",
      "components/ui/textarea.tsx",
      "components/ui/table.tsx",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...sharedControlRules,
        ...sharedTableRules,
      ],
    },
  },
  {
    files: ["app/**/*.tsx", "components/**/*.tsx"],
    ignores: ["**/*.test.tsx", "components/ui/**"],
    rules: {
      "no-restricted-imports": ["error", { paths: [
        { name: "sonner", message: "Use notify and Toaster from the shared ui/sonner component." },
        { name: "recharts", importNames: ["ResponsiveContainer", "CartesianGrid", "XAxis", "YAxis", "Tooltip"], message: "Use the shared financial chart surface, axes, grid and tooltip components." },
        { name: "@radix-ui/react-dropdown-menu", message: "Use the shared UI component for menus, tabs, and tooltips." },
{ name: "@radix-ui/react-context-menu", message: "Use the shared UI component for menus, tabs, and tooltips." },
{ name: "@radix-ui/react-navigation-menu", message: "Use the shared UI component for menus, tabs, and tooltips." },
{ name: "@radix-ui/react-menubar", message: "Use the shared UI component for menus, tabs, and tooltips." },
{ name: "@radix-ui/react-tabs", message: "Use the shared UI component for menus, tabs, and tooltips." },
{ name: "@radix-ui/react-tooltip", message: "Use the shared UI component for menus, tabs, and tooltips." },
        { name: "@radix-ui/react-dialog", message: "Use the shared Dialog, Sheet, or Drawer components." },
        { name: "vaul", message: "Use the shared Drawer component." },
        { name: "react-dom", importNames: ["createPortal"], message: "Compose overlays from the shared Dialog, Sheet, or Drawer components." },
      ] }],
      "no-restricted-syntax": [
        "error",
        ...sharedControlRules,
        ...sharedTableRules,
        {
          selector: "JSXAttribute[name.name='className'][value.value=/field-error|field-hint|form-error/]",
          message: "Use shared FieldError, FieldDescription or FormMessage for form feedback.",
        },
        {
          selector: "JSXOpeningElement[name.name=/^(div|span|p|h[1-6]|a|Button)$/] > JSXAttribute[name.name='title']",
          message: "Use shared Hint or ActionTooltip instead of a native browser title tooltip.",
        },
        {
          selector: "JSXOpeningElement[name.name=/^(div|span|button|Button)$/] > JSXAttribute[name.name='role'][value.value=/^(tab|tablist|menu|menuitem)$/]",
          message: "Use shared Tabs or menu primitives for keyboard and focus behavior.",
        },
        {
          selector: "JSXOpeningElement[name.name=/^(div|p|span|section)$/] > JSXAttribute[name.name='role'][value.value=/^(alert|status)$/]",
          message: "Use ErrorState, EmptyState, LoadingState, StatusMessage or the shared Alert for content feedback.",
        },
        {
          selector: "JSXAttribute[name.name='className'][value.value=/animate-(spin|pulse)|loading-ring/]",
          message: "Use shared Spinner, Skeleton or LoadingState for loading feedback.",
        },
        {
          selector: "JSXOpeningElement[name.name=/^(div|section|aside)$/] > JSXAttribute[name.name='role'][value.value=/^(dialog|alertdialog)$/]",
          message: "Use the shared Dialog, Sheet, or Drawer instead of a hand-built modal.",
        },
        {
          selector: "JSXOpeningElement[name.name='Input'] > JSXAttribute[name.name='type'][value.value=/^(date|datetime-local|month|week|time|checkbox|radio|range|color|file)$/]",
          message: "Use the dedicated shared control (e.g. PersianDatePicker, Checkbox, RadioGroup, or FileInput), not a browser-native Input type.",
        },
      ],
    },
  },
]);
