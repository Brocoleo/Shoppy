import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/.expo/**",
      "**/build/**",
      "**/placeholders/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["supabase/**/*.mjs"],
    languageOptions: { globals: globals.node },
  },
  {
    // Los scripts de auditoría ejecutan Node y funciones dentro de Chrome.
    files: ["docs/auditoria-web-*/**/*.{cjs,mjs}"],
    languageOptions: { globals: { ...globals.node, ...globals.browser, axe: "readonly" } },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
