import { defineConfig, globalIgnores } from "eslint/config";
import next from "eslint-config-next/core-web-vitals";
import ts from "eslint-config-next/typescript";
export default defineConfig([
  ...next,
  ...ts,
  globalIgnores([".next/**", "next-env.d.ts"]),
  {
    files: ["app/**/*.tsx", "features/**/*.tsx", "components/shell/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "sonner", message: "Use the shared notifications module." },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "JSXOpeningElement[name.name=/^(button|input|select|textarea|table|dialog)$/]",
          message: "Use shared UI components.",
        },
        {
          selector: "JSXAttribute[name.name='style']",
          message: "Use semantic Tailwind utilities.",
        },
      ],
    },
  },
]);
