# Vendored anti-slop

- Source: https://github.com/K-Mistele/anti-slop
- Revision: b7c1619b4d51b4815e89ba3700a975a6ec54b8c3
- Original author: Dillon Mulroy, https://github.com/dmmulroy/anti-slop
- Maintained fork: Kyle Mistele, https://github.com/K-Mistele/anti-slop
- Installation: the pinned `skills/install-anti-slop/scripts/install.mjs --jev`, without `--force`, copied the bundled production assets into this previously absent directory. All canonical `src/**/*.test.ts` files and the root MIT license were then copied from that revision. Production source and upstream tests are unchanged.
- Nested ESLint Stylistic license and provenance remain in `vendor/eslint-stylistic/`.
- Jev build: `../oxlint-plugin-jev`, source https://github.com/K-Mistele/oxlint-plugin-jev at fd3e4b1ad3b8fa7c0d08cdc92633e33c7e662f9e. Its package, build, license, and provenance are unchanged.
- Toolchain: exact matching `oxlint` and `@oxlint/plugins` 1.93.0. Version 1.94.0 was rejected by the existing 2-day minimum-release-age policy; no exception was added.

## Local integration policy

Biome 2.5.3 retains its exact original root/docs lint and check scripts and formatting ownership. `lint:oxlint` and the default editor config add only Fowler AST warnings. `lint:strict` explicitly selects `oxlint.strict.config.ts`, the complete Core error proposal plus native accumulating-spread and Fowler warnings. Edmund approved this staged activation split on November 16, 2026: preserve original gates and severities, retain default Fowler advisories, and keep the complete conflicting suite explicit. This approval does not grant permanent exemptions, source migrations, full strict acceptance, or publication. Core rules remain errors, Fowler message-chains stays off, and no source cleanup or suppressions are included. Effect source remains available but is not registered because no workspace manifest declares Effect directly. No Effect diagnostics toolchain is installed.

The normal config does not register or import Jev. `oxlint.jev.config.ts` alone registers Fowler Jev questions at warning severity, with those questions off for test files. The separate changed-file runner defaults to working-tree staged, unstaged, and untracked JS/TS files. Function-target questions filter to changed functions but send those complete functions; file-target questions can send the entire changed file, including untouched functions, up to the snippet limit. No changed-lines-only disclosure guarantee is made. Full Jev and whole-diff review also require explicit commands. Diff review includes hunks, context, summaries, and history. No hook, editor setting, CI job, ordinary lint, or ordinary check invokes semantic review. Running any semantic command requires separate approval to send source and potentially incur cost.

## Future updates

Use the pinned README, install skill, and `skills/install-anti-slop/references/update.md` as a reviewed merge procedure, not an overwrite instruction. Compare this pristine baseline, local rules/tests/options/severities, and the incoming revision. Preserve local policy and ask about semantic conflicts. Replace the Jev build only as a reviewed whole build with its own source pin and license. Keep the matching Oxlint versions and existing dependency age policy. Do not replace Biome, enable Effect transitively, or connect semantic checks to ordinary checks.
