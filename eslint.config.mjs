import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export const sharedRules = {
  complexity: ["error", 8],
  "max-lines": [
    "error",
    { max: 500, skipBlankLines: false, skipComments: false },
  ],
  "max-depth": ["error", 3],
  "max-params": ["error", 4],
  "max-nested-callbacks": ["error", 3],
  "no-console": ["error", { allow: ["warn", "error"] }],
  eqeqeq: ["error", "always", { null: "ignore" }],
  "prefer-const": "error",
  "no-var": "error",
  "no-else-return": "error",
  "no-nested-ternary": "error",
  "no-unneeded-ternary": "error",
  "object-shorthand": "error",
  "@typescript-eslint/no-explicit-any": "error",
  "@typescript-eslint/no-unused-vars": [
    "error",
    { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
  ],
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.{js,cjs,mjs,ts,tsx,mts,cts}"],
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
    rules: {
      ...sharedRules,
      "@next/next/no-img-element": "error",
      "@next/next/no-location-assign-relative-destination": "error",
      "@typescript-eslint/no-unused-expressions": "error",
      "import/no-anonymous-default-export": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
