import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    ".sites/**",
    ".worker-build/**",
    ".worker-state/**",
    "next-env.d.ts",
    "test-results/**",
    "playwright-report/**",
  ]),
]);
