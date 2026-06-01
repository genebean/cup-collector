import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import nextPlugin from "@next/eslint-plugin-next";

export default tseslint.config(
  // TypeScript rules
  ...tseslint.configs.recommended,

  // React hooks rules (flat config variant)
  reactHooks.configs.flat.recommended,

  // Next.js core-web-vitals rules (includes recommended)
  {
    plugins: { "@next/next": nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
    },
  },

  // Allow _-prefixed identifiers to be unused (convention for required-but-unused imports)
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", {
        varsIgnorePattern: "^_",
        argsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      }],
      // ESLint v10 rules not inherited via tseslint base — opt in explicitly
      "no-useless-assignment": "error",
      "no-unassigned-vars": "error",
      "preserve-caught-error": "error",
    },
  },

  // Ignore build output, deps, and test infrastructure dirs
  {
    ignores: [".next/**", "node_modules/**", "e2e/**", "playwright/**"],
  },
);
