import {
  cpSync,
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Run the Sites project-setup helper in this directory once before preparation.
// Never copy environment files, Git metadata, personal data or runtime credentials.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, ".sites", "reseller-agent-cloud");
if (!existsSync(path.join(target, "scripts/vite/sites-vite-plugin.ts"))) {
  throw new Error(
    "Initialize the supported Sites Vinext starter in .sites/reseller-agent-cloud first.",
  );
}
for (const name of ["app", "components"]) {
  rmSync(path.join(target, name), { recursive: true, force: true });
  cpSync(path.join(root, "src", name), path.join(target, name), {
    recursive: true,
  });
}
// Retain the starter's request-scoped Sites integration helpers.
cpSync(path.join(root, "src/lib"), path.join(target, "lib"), {
  recursive: true,
});
cpSync(path.join(root, "public"), path.join(target, "public"), {
  recursive: true,
});
const manifest = JSON.parse(
  readFileSync(path.join(target, "package.json"), "utf8"),
);
const application = JSON.parse(
  readFileSync(path.join(root, "package.json"), "utf8"),
);
manifest.name = "reseller-agent-cloud";
for (const name of ["@supabase/supabase-js", "openai", "zod", "lucide-react"]) {
  manifest.dependencies[name] = application.dependencies[name];
}
writeFileSync(
  path.join(target, "package.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
writeFileSync(
  path.join(target, "next.config.ts"),
  `import type { NextConfig } from 'next';
const config: NextConfig = { poweredByHeader: false };
export default config;
`,
);
const commit = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8",
}).trim();
const dirty = execFileSync(
  "git",
  ["status", "--porcelain", "--untracked-files=no"],
  {
    cwd: root,
    encoding: "utf8",
  },
).trim();
writeFileSync(
  path.join(target, "README.md"),
  `# Reseller Agent cloud workspace\n\nApplication source copied from artielopez/Reseller-agent at ${commit}${dirty ? " with local changes" : ""}.\nSites hosts the App Router through its supported Vinext/Cloudflare adapter.\nSupabase Auth, owned database records and private Storage remain the application data boundary.\nThe Sites access gate is additional protection; its identity is not substituted for Supabase auth.\n\nRuntime secrets and local environment files are excluded from source. Browser configuration uses\nonly the public project URL and publishable key. No paid AI is enabled without a server-only key.\nThe separate browser-local demo is unaffected.\n`,
);
console.log(
  "Prepared cloud application source; retained Sites identity and integration.",
);
