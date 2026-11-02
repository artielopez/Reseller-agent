import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e-cloud",
  fullyParallel: true,
  use: { baseURL: "http://127.0.0.1:3018", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3018",
    url: "http://127.0.0.1:3018",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      NEXT_PUBLIC_DEMO_MODE: "false",
      NEXT_PUBLIC_SUPABASE_URL: "https://reseller-test.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "synthetic-public-key",
    },
  },
});
