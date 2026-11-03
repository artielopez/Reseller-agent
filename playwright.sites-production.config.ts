import { defineConfig } from "@playwright/test";
import cloud from "./playwright.cloud.config";

// Exercise the already-built artifact, unchanged from its production package.
// Synthetic sessions select the compiled public project's storage-key namespace;
// context-level guards block all backend traffic unless a fixture fulfills it.
process.env.RESELLER_COMPILED_TEST = "1";
export default defineConfig(cloud, {
  use: { baseURL: "http://127.0.0.1:3020" },
  webServer: {
    cwd: ".sites/reseller-agent-cloud",
    command: "npm run start -- --port 3020",
    url: "http://127.0.0.1:3020",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
