import { defineConfig } from "oxlint";

export default defineConfig({
  // Biome owns the existing built-in lint and formatting policy.
  categories: { correctness: "off" },
  plugins: [],
  ignorePatterns: [
    ".agent/**",
    ".agents/**",
    ".amp/**",
    ".claude/**",
    ".codex/**",
    ".continue/**",
    ".cursor/**",
    ".gemini/**",
    ".opencode/**",
    ".pi/**",
    ".roo/**",
    ".windsurf/**",
    "tools/oxlint/**",
    "**/node_modules/**",
    "dist/**",
    "**/.next/**",
    "**/.source/**",
    "apps/dashboard/out/**",
    "**/next-env.d.ts",
    "**/*.generated.*",
  ],
  jsPlugins: [
    {
      name: "anti-slop-martinfowler",
      specifier: "./tools/oxlint/anti-slop/martinfowler/index.ts",
    },
  ],
  rules: {
    "anti-slop-martinfowler/global-data": "warn",
    "anti-slop-martinfowler/long-function": "warn",
    "anti-slop-martinfowler/long-parameter-list": "warn",
    "anti-slop-martinfowler/loops": "warn",
    "anti-slop-martinfowler/message-chains": "off",
    "anti-slop-martinfowler/mutable-data": "warn",
    "anti-slop-martinfowler/mysterious-name": "warn",
    "anti-slop-martinfowler/repeated-switches": "warn",
  },
});
