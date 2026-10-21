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
    files: ["supabase/**/*.mjs", "apps/mobile/tests/**/*.mjs", "scripts/*.mjs", "scripts/*.test.mjs", "scripts/local-checkout/**/*.{mjs,cjs}"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["scripts/local-checkout/browser-tools.js"],
    languageOptions: { globals: globals.browser },
  },
  {
    // Scripts que ejecutan codigo DENTRO de Chromium (canvas, WebP, Playwright).
    files: ["scripts/image-quality-*.mjs"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ["scripts/local-checkout/network-guard.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    // Los scripts de auditoría ejecutan Node y funciones dentro de Chrome.
    files: ["docs/auditoria-web-*/**/*.{cjs,mjs}", "docs/checkout-seguridad-*/**/*.{cjs,mjs}"],
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
