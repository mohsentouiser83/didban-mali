import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

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
      "components/ui/textarea.tsx",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...["button", "input", "textarea", "select"].flatMap((tag) => [
          {
            selector: `JSXOpeningElement[name.name='${tag}']`,
            message: `Use the shared UI component instead of a raw <${tag}>.`,
          },
          {
            selector: `JSXSelfClosingElement[name.name='${tag}']`,
            message: `Use the shared UI component instead of a raw <${tag}>.`,
          },
        ]),
      ],
    },
  },
]);
