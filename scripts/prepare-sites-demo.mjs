import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// A separate checkout for Sites: never copy credentials, Git metadata or local data.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, ".sites", "reseller-agent-demo");
mkdirSync(target, { recursive: true });
for (const name of ["src", "public"]) {
  rmSync(path.join(target, name), { recursive: true, force: true });
  cpSync(path.join(root, name), path.join(target, name), {
    recursive: true,
    filter: (source) =>
      !source.startsWith(path.join(root, "src", "app", "api")),
  });
}
for (const name of [
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "postcss.config.mjs",
  "eslint.config.mjs",
]) {
  cpSync(path.join(root, name), path.join(target, name));
}
writeFileSync(
  path.join(target, "src/lib/config.ts"),
  `// This hosted demo cannot connect to cloud services or paid AI.
export const demoMode = true;
export const supabaseUrl = "";
export const supabaseKey = "";
export const configurationError = null;
`,
);
writeFileSync(
  path.join(target, "next.config.ts"),
  `import type { NextConfig } from "next";
const config: NextConfig = {
  output: "export",
  trailingSlash: true,
  poweredByHeader: false,
  turbopack: { root: process.cwd() },
};
export default config;
`,
);
const ignore = path.join(target, ".gitignore");
const entries = [
  "node_modules/",
  ".next/",
  "out/",
  ".env*",
  "*.tsbuildinfo",
  "next-env.d.ts",
  "test-results/",
  "playwright-report/",
];
const prior = existsSync(ignore) ? readFileSync(ignore, "utf8") : "";
writeFileSync(
  ignore,
  [...new Set([...prior.split("\n"), ...entries])].filter(Boolean).join("\n") +
    "\n",
);
const commit = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8",
}).trim();
const dirty = execFileSync(
  "git",
  ["status", "--porcelain", "--untracked-files=no"],
  { cwd: root, encoding: "utf8" },
).trim();
writeFileSync(
  path.join(target, "README.md"),
  `# Reseller Agent — Sites demo

Generated from artielopez/Reseller-agent at ${commit}${dirty ? " with local changes" : ""}.
Run the source repository's scripts/prepare-sites-demo.mjs to refresh this checkout.

This is a Next.js static export of the inventory demo. All inventory/photos remain
in the visitor's browser. Templates run locally; there is no cloud sync, paid AI,
message access or sending. The full application's server route is intentionally
excluded. No environment files, secrets or local browser records are copied.

Install locked dependencies with npm ci and build with npm run build. The output
is out/. Sites identity in .openai/hosting.json must be preserved on updates.
`,
);
console.log(`Prepared credential-free demo source: ${target}`);
