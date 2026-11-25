import { defineConfig } from "@playwright/test";
import cloud from "./playwright.cloud.config";
import compiled from "./playwright.sites-production.config";
// Unlike the ordinary cloud contracts, these checks exercise a real worker.
const sites = process.env.RESELLER_PWA_SITES === "1";
process.env.RESELLER_COMPILED_TEST = sites ? "1" : "0";
export default defineConfig(sites ? compiled : cloud, {
  testDir: "./e2e-pwa",
  use: { serviceWorkers: "allow" },
});
