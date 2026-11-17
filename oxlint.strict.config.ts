import type { OxlintConfig } from "oxlint";
import base from "./oxlint.config.ts";

// Complete Core proposal. Standard lint/check remain unchanged pending activation approval.
const config: OxlintConfig = {
  ...base,
  plugins: ["oxc"],
  jsPlugins: [
    ...base.jsPlugins,
    { name: "anti-slop", specifier: "./tools/oxlint/anti-slop/index.ts" },
  ],
  rules: {
    ...base.rules,
    "oxc/no-accumulating-spread": "error",
    "anti-slop/max-ternary-depth": ["error", { maxDepth: 2 }],
    "anti-slop/no-array-filter-map": "error",
    "anti-slop/no-chained-type-assertions": "error",
    "anti-slop/no-conditional-spread": "error",
    "anti-slop/no-disabled-type-assertion-rules": "error",
    "anti-slop/no-known-value-widening": "error",
    "anti-slop/no-module-mocking": "error",
    "anti-slop/no-object-parameters": "error",
    "anti-slop/no-reduce-accumulator-copy": "error",
    "anti-slop/no-reflect-apply": "error",
    "anti-slop/no-reflect-get": "error",
    "anti-slop/no-reprovide-ambient-service": "error",
    "anti-slop/no-runtime-typeof": "error",
    "anti-slop/no-shape-in-symbol-names": "error",
    "anti-slop/no-unknown-parameters": "error",
    "anti-slop/no-unknown-returns": "error",
    "anti-slop/no-unknown-type-aliases": "error",
    "anti-slop/no-unsafe-dictionary-type": "error",
    "anti-slop/no-widen-then-assert": "error",
    "anti-slop/require-readable-spacing": "error",
    "anti-slop/require-safety-comment-for-type-assertion": "error",
  },
};

export default config;
