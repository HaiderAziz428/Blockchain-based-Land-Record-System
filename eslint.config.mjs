import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Canonical Next.js hydration gate — too strict for our patterns.
      'react-hooks/set-state-in-effect': 'off',
      // Date.now() / Math.random() in render is fine for display comparisons.
      'react-hooks/purity': 'off',
      // Hoisted-function pattern is intentional in several pages.
      'react-hooks/immutability': 'off',
      // Allow _-prefixed vars/params as intentionally unused.
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Third-party Hardhat / Foundry libraries — not our code
    "lib/**",
    "artifacts/**",
    "cache/**",
    "ignition/**",
  ]),
]);

export default eslintConfig;
