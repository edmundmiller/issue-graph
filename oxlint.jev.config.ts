import type { OxlintConfig } from "oxlint";
import baseConfig from "./oxlint.config.ts";
import { martinFowlerJevRules } from "./tools/oxlint/anti-slop/martinfowler/jev-rules.ts";

const base: OxlintConfig = baseConfig;
const questions = Object.fromEntries(
  martinFowlerJevRules.map(({ id }) => [`anti-slop-martinfowler-jev/${id}`, "warn" as const]),
);

// Only this explicitly selected overlay imports the model-backed plugin.
const config: OxlintConfig = {
  ...base,
  jsPlugins: [
    ...(base.jsPlugins ?? []),
    {
      name: "anti-slop-martinfowler-jev",
      specifier: "./tools/oxlint/anti-slop/martinfowler/jev-plugin.ts",
    },
  ],
  rules: { ...base.rules, ...questions },
  overrides: [
    ...(base.overrides ?? []),
    {
      files: ["**/*.test.*", "**/*.spec.*", "test/**", "tests/**"],
      rules: Object.fromEntries(Object.keys(questions).map((name) => [name, "off" as const])),
    },
  ],
};

export default config;
