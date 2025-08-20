// Minimal flat ESLint config specific to functions (isolated from repo root)
import tsParser from "@typescript-eslint/parser";

export default [
  {
    files: ["**/*.ts", "**/*.js"],
    ignores: ["lib/**", "generated/**", "node_modules/**"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2021,
      sourceType: "module",
    },
    rules: {
      // Keep minimal to avoid plugin/version incompatibilities
      "no-unused-vars": "warn",
      "no-empty": "warn",
    },
  },
];
