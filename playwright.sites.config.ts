import { defineConfig } from "@playwright/test";
import cloud from "./playwright.cloud.config";

// Exercise the retained Sites/Vinext adapter using only synthetic Supabase
// responses. This is an owned local test server, not a personal browser session.
export default defineConfig(cloud, {
  use: { baseURL: "http://127.0.0.1:3019" },
  webServer: {
    cwd: ".sites/reseller-agent-cloud",
    command: "npm run dev -- --port 3019",
    url: "http://127.0.0.1:3019",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      NEXT_PUBLIC_DEMO_MODE: "false",
      NEXT_PUBLIC_SUPABASE_URL: "https://reseller-test.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "synthetic-public-key",
      OPENAI_API_KEY: "",
    },
  },
});
