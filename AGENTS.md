# Using this fork

This repository is **edmundmiller/issue-graph**, not the upstream npm release. When asked to install/use it, follow README.md's **Start here** from this repository: clone this URL, install locked dependencies with pnpm 10.34.5, pack the source (which builds the CLI/dashboard), and install that tarball into the dedicated user prefix. Node.js 24 LTS is recommended for builds. Do not substitute `npx issue-graph@latest`, `npm install issue-graph@latest`, vercel-labs/issue-graph, or issue-graph.dev: those select upstream.

Before operational use:

1. Run the fork executable's `schema`. Check `commands.open.workProviders.providers` includes jira, linear, notion, beads.
2. Read `skills get core --full` from that executable, not a remembered guide.
3. Run the README's credentials-free Beads example with `examples/beads/issues.jsonl` and an isolated `ISSUE_GRAPH_HOME`.
4. Read `open <provider:scope> --help` before live collection. Obtain scope and credentials from authorized environment/secrets; never print or request tokens in chat. If credentials are absent, report the missing variable names and stop that live collection; offline Beads/query still work.

Jira Cloud needs JIRA_URL, JIRA_EMAIL, and an unscoped JIRA_API_TOKEN. Legacy `open linear:PROJECT_UUID` needs LINEAR_API_KEY or LINEAR_ACCESS_TOKEN. Native `linear` commands accept these credentials or a read-only MCP login session from `linear login`; use `linear --help` for issue and project capture. Notion needs NOTION_API_TOKEN and a shared task data source UUID (not a database UUID), with exact status/select mapping. GitHub alone needs authenticated `gh`.

Provider collection is read-only. Beads reads compatible tracked JSONL; no br, bd, or SQLite is required or accessed. JSONL can lag changes until exported or flushed. Preserve string identifiers, native statuses, and typed dependency direction. Unclosed does not mean ready; priority is not Heat. Slack Lists is optional and not implemented. Inspect coverage warnings and capabilities; never claim live verification from fixtures or availability from `--help`.

Provider-qualified `open` returns a normalized model and saves the latest capture unless `--no-save`. Query the returned model `id` offline with `query <id> --view explore --json --no-open`. Return its exact `viewUrl` plus coverage and native status findings. Views need their sibling `_next/` assets. Local paths are not public URLs; do not invent a web endpoint.

# Contributing

Use existing normalized model/query interfaces, keep provider mutations out of scope, and follow CONTRIBUTING.md. Run `pnpm check`, `pnpm check:docs`, and `pnpm test:package` for changes to collection, installation, or bundled guides. Keep tests with their features. Do not publish, push, or merge without the user's authorization for the current task.

Use pnpm for repository commands and Biome for JavaScript, TypeScript, and JSON. Keep changes focused and preserve unrelated local work. Do not add coauthor trailers or comments that restate the code. Avoid emojis and decorative dashes in prose, and do not hard-wrap Markdown.

## Writing

Use the `technical-writer` skill (`.agents/skills/technical-writer/SKILL.md`) when you write or edit prose for this repo, including docs pages, READMEs, changelog entries, commit messages, PR descriptions, and issues.

## Documentation

When a change affects what users or agents can do, update these in the same change:

1. `apps/docs/content/docs/`: the docs site pages, which hold the full details
2. `README.md`: only when install, the quick start, or the commands table changes. The README links to the docs site instead of repeating it
3. `skill-data/core/SKILL.md` and `skill-data/core/references/workflows.md`: the guidance bundled with the CLI. See [Skill maintenance](CONTRIBUTING.md#skill-maintenance)
4. Command `--help` text and `issue-graph schema` when flags, outputs, or limits change

Do not edit generated files. The docs changelog comes from the root `CHANGELOG.md` through `pnpm --filter @issue-graph/docs sync:changelog`. `next dev` writes `apps/docs/AGENTS.md` and `apps/docs/CLAUDE.md`; they are committed so the tree stays clean.

## Checks

Run `pnpm check` before you push. For docs changes, also run `pnpm check:docs` and `pnpm build:docs`, and run `pnpm audit:docs` against a local production build when page structure changes. For packaging changes, run `pnpm test:package`. [Contributing](CONTRIBUTING.md) has the full list.

## Releases

A release is a pull request that changes the `package.json` version and the matching notes in `CHANGELOG.md`; merging it to `main` starts `release.yml`. Never retry an ambiguous publication by publishing again. If npm accepted the package but verification or the GitHub Release failed, rerun the failed jobs of the original run, as described in [Contributing](CONTRIBUTING.md#manual-verification-and-recovery).
