# issue-graph

Find related issues and pull requests before you start work. For humans and agents.

<p>
  <a href="https://vercel.com/labs#active-experiments"><img alt="Vercel Labs Experiment" src="https://img.shields.io/badge/LABS-EXPERIMENT-0a0a0a.svg?style=for-the-badge&amp;logo=Vercel&amp;labelColor=000000" height="28"></a>
  <a href="https://www.npmjs.com/package/issue-graph"><img alt="npm version: issue-graph" src="https://img.shields.io/npm/v/issue-graph.svg?style=for-the-badge&amp;labelColor=000000" height="28"></a>
  <a href="LICENSE"><img alt="License: Apache-2.0" src="https://img.shields.io/badge/license-Apache--2.0-blue.svg?style=for-the-badge&amp;labelColor=000000" height="28"></a>
</p>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://issue-graph.dev/readme-hero-dark.png">
  <img alt="issue-graph: open issues and pull requests from vercel-labs/portless grouped into five root-cause clusters, such as proxy port allocation and TLS trust" src="https://issue-graph.dev/readme-hero-light.png">
</picture>

This is **[edmundmiller/issue-graph](https://github.com/edmundmiller/issue-graph)**, a fork of Vercel Labs' issue-graph. It traces GitHub issues/PRs and adds read-only Jira, Linear, Notion, and optional Beads JSONL inventories. **The npm package `issue-graph@latest` and issue-graph.dev are upstream, not this fork.**

The native `linear` command now follows issue neighborhoods or captures full projects, with read-only browser login, API credentials, attachment links, and optional GitHub lookups. The fork's existing `open linear:PROJECT_UUID` inventory remains supported. Both preserve native status and report coverage limits.

## Start here

Use Git, npm, and **Node.js 24 LTS** for the source build (20.19+ or 22.12+ also supported). The runtime needs Node 20+. On macOS/Linux, build and install **this fork** into a dedicated prefix; no sudo or registry publication is needed. Run these commands in a new directory:

```bash
git clone https://github.com/edmundmiller/issue-graph.git issue-graph-fork
cd issue-graph-fork
npm exec --yes --package=pnpm@10.34.5 -- pnpm install --frozen-lockfile
npm exec --yes --package=pnpm@10.34.5 -- pnpm pack --pack-destination .fork-pack
npm install --global --prefix "$HOME/.local/issue-graph-fork" ./.fork-pack/issue-graph-0.6.0.tgz
export PATH="$HOME/.local/issue-graph-fork/bin:$PATH"
hash -r
issue-graph --help
issue-graph schema
issue-graph skills get core --full
```

`pack` builds the CLI and static dashboard. Verify that `schema` lists `commands.open.workProviders.providers` as `jira`, `linear`, `notion`, `beads`. Use `command -v issue-graph` to check that you are running the dedicated prefix, not an older upstream executable. In later shells repeat the `export PATH` line, or use `$HOME/.local/issue-graph-fork/bin/issue-graph` explicitly. Keep the checkout to update it; the installed CLI works outside it. On Windows, use `node dist/bin.js` from the built checkout rather than these POSIX PATH instructions.

### Credentials-free first result

From the cloned checkout, import the included three-issue fixture:

```bash
ISSUE_GRAPH_HOME="$PWD/.fork-demo" issue-graph open beads:demo --input examples/beads/issues.jsonl --state all
ISSUE_GRAPH_HOME="$PWD/.fork-demo" issue-graph query beads:demo --view explore --json --no-open
```

Expect three native string IDs (`demo-task`, `demo-prerequisite`, `demo-epic`), `blocked`/`in_progress`/`open` statuses, and two directed dependencies. Coverage is complete **for these fixture records**, not a freshness or readiness guarantee. The query writes a local HTML dashboard and returns its exact `viewUrl`; use `--open` instead of `--no-open` on a machine with a browser opener. No provider credentials, `gh`, `br`, or `bd` are needed. For your own project, change the scope and pass its tracked `.beads/issues.jsonl` path; the input is never modified.

See [provider setup and limits](#work-providers-in-this-fork) for live inventories. GitHub queries separately require [GitHub CLI](https://cli.github.com) and `gh auth login`; Jira, Linear, and Notion provider reads do not use `gh` authentication. Native `linear --github` additionally uses `gh` to read attached GitHub issues and PRs.

Trace public [agent-browser issue #1113](https://github.com/vercel-labs/agent-browser/issues/1113) without saving a snapshot:

```bash
issue-graph graph vercel-labs/agent-browser#1113 --depth 1 --budget 12 --no-save
```

At the 2026-09-22 capture, issue #1113 was closed, [PR #1137](https://github.com/vercel-labs/agent-browser/pull/1137) was merged, [regression #1148](https://github.com/vercel-labs/agent-browser/issues/1148) was closed, and follow-ups [#1371](https://github.com/vercel-labs/agent-browser/issues/1371) and [#1607](https://github.com/vercel-labs/agent-browser/issues/1607) were open. Check the open follow-ups before assuming the fix covers them.

Check missing references and crawl limits in the report. Each run queries GitHub, so results can change. [Capture details](apps/docs/content/docs/graph.mdx).

### Update the fork installation

```bash
git pull --ff-only
npm exec --yes --package=pnpm@10.34.5 -- pnpm install --frozen-lockfile
npm exec --yes --package=pnpm@10.34.5 -- pnpm pack --pack-destination .fork-pack
npm install --global --prefix "$HOME/.local/issue-graph-fork" ./.fork-pack/issue-graph-0.6.0.tgz
```

Use `issue-graph --help` to check the commands supported by your installed release.

Run updates from your fork checkout. For reproducible installs, check out a reviewed commit before packing. If the package version changes, use the new tarball filename printed by `pack`. Do not update this fork with `npm install issue-graph@latest`.

## Quick start

From a GitHub repository checkout:

```bash
issue-graph
# -> captures open issues and PRs, then opens the dashboard
```

Pass a repository, or one or more items, to choose the scope:

```bash
issue-graph open vercel-labs/portless
issue-graph graph vercel-labs/agent-browser#1113 --depth 1
```

For Linear, connect once in the browser, then capture an issue neighborhood or a whole project:

```bash
issue-graph linear login
issue-graph linear ENG-123 --workspace your-workspace --open
issue-graph linear --project 12345678-1234-1234-1234-123456789abc --open
```

The full walkthrough is in [Get started](apps/docs/content/docs/get-started.mdx).

## How it works

Each run starts from seeds, such as open issues, a label, or specific items, and follows references up to a depth and node budget you set. An item with many references is fetched but not expanded further. The report lists missing references, failed reads, and crawl limits, so you can see what the graph does not cover.

The dashboard groups items into connected components by default. Your agent can propose root-cause clusters instead: `issue-graph cluster` prints the task, and `cluster --apply` loads the answer. The dashboard has four views: Explore, Impact, Swarm, and Rank. For GitHub, Rank orders open work by Heat, a weighted score of discussion activity with weights you control.

Runs save locally under `~/.issue-graph/`, and `issue-graph dashboard` shows every saved run with a project switcher. `issue-graph query` filters a saved capture from the CLI and returns a link to the exact dashboard view. See [Dashboard](apps/docs/content/docs/dashboard.mdx).

## Work providers in this fork

The `open <provider:scope>` inventories below are fork features. Native `linear` issue and project graphs are described separately in [Linear](apps/docs/content/docs/linear.mdx). Build with `pnpm install --frozen-lockfile && pnpm build`, then run `node dist/bin.js` in place of `issue-graph` below. All collectors are read-only with respect to the provider. Credentials belong in your process environment or secret manager, never command arguments, scoring config, captures, or chat.

```bash
# Jira Cloud: set JIRA_URL, JIRA_EMAIL and JIRA_API_TOKEN in your environment.
issue-graph open jira:ENG --state all -o jira-model.json
issue-graph query jira:your-site.atlassian.net:ENG --view explore --open

# Legacy Linear project inventory: set LINEAR_API_KEY (personal API key) or LINEAR_ACCESS_TOKEN (OAuth).
issue-graph open linear:12345678-1234-1234-1234-123456789abc
issue-graph query linear:12345678-1234-1234-1234-123456789abc --view swarm --metric links --open

# Notion: set NOTION_API_TOKEN and share the task database with the integration.
issue-graph open notion:12345678-1234-1234-1234-123456789abc \
  --status-property Status --closed-status Done --closed-status Cancelled

# Optional Beads: read compatible tracked JSONL, no br/bd binary required.
issue-graph open beads:my-project --input .beads/issues.jsonl --state all
issue-graph query beads:my-project --view explore --open
```

| Provider | Scope and configuration | Captured evidence |
| --- | --- | --- |
| Jira | Uppercase project key; `JIRA_URL=https://your-site.atlassian.net`, `JIRA_EMAIL`, **unscoped** `JIRA_API_TOKEN`. Cloud REST v3 only; no Server/Data Center, scoped-token gateway, or OAuth flow. The account needs Browse Projects and any relevant issue-security access. | Summary, reporter, native workflow label/category, parent and directed issue links; URLs from descriptions. |
| Linear (`open`) | Project UUID (from a project link's Copy project ID action); personal key with read access to the project/team, or an existing OAuth token with read permission. This inventory does not use the `linear login` session or refresh tokens. | Title, creator, workflow label/type, parent/children, outgoing and inverse typed relations, description URLs. |
| Notion | **Data source UUID**, not database UUID. With API version `2025-09-03`, retrieve the parent database to find its `data_sources[].id`; share it and related databases with a read-content integration. | Task page titles, creator IDs, status/select labels, relation properties and URL/rich-text property links. No page-body blocks, comments, formulas, rollups, or wiki traversal. |
| Beads (optional) | Stable project name and compatible tracked JSONL, default `.beads/issues.jsonl`; no credentials, `br`, or `bd` binary required. | String bead IDs, native status, priority (0–4), issue type, directed typed dependencies with attribution. Empty web links and no synthetic numbers. |

`open <provider:scope> --help` lists supported options. These `open` inventories print a **raw normalized dashboard model** (JSON by default), save a provider-qualified latest model unless `--no-save`, and accept `-o PATH.json` for an explicit export. They do not launch a browser; follow with `query --open` or `dashboard`. `query --input model.json` also works. Jira's saved/query identity includes the site hostname; use the returned `id` unchanged. Linear and Notion UUIDs are canonicalized. `auth status` reports GitHub and native Linear connection state; it does not validate Jira, Notion, or the legacy Linear inventory credentials. `graph`, `rank`, `cluster`, `reconcile`, and `plan` remain GitHub-only.

The default inventory is unclosed work (`--state all` includes completed items). Notion maps the `Status` status/select property by exact option name: `Done` is closed by default; repeated `--closed-status` replaces that default. Configure every completed/cancelled option; all other nonempty options are open. Missing status is `UNKNOWN`, retained with a warning. Notion's `--budget` counts pages scanned **before** state filtering, so a budget dominated by completed tasks can produce few or zero open items.

All providers preserve native `stateLabel`; `OPEN` is a coarse unclosed classification, **not readiness**. Beads `blocked`, `deferred`, `in_progress`, `pinned`, and `hooked` remain unclosed; `tombstone` is archived and excluded unless `--state all`. Beads priority is separate metadata, not Heat; no readiness calculation, scheduler, or priority ranking is provided. The originating tracker remains authoritative for readiness and mutations. **JSONL can lag database-backed changes until exported/flushed.** `br`/`bd` can optionally produce a fresh export, but the importer never invokes either or reads a database; snapshot coverage certifies only imported records, not freshness. A `blocks` dependency goes from `issue_id` to `depends_on_id` (dependent → prerequisite), and `parent-child` goes child → parent.

Beads compatibility is format-based, not inferred from a CLI name: one issue object per line with string `id`, `title`, and `status`; optional `priority` (integer 0–4), `issue_type`, `created_by`, and `dependencies`. Each dependency must contain matching `issue_id`, string `depends_on_id`, and nonempty string `type`; optional `created_by`/`created_at` attribution is retained. Additional fields are ignored. Unknown/custom statuses keep their native label but map to UNKNOWN with a coverage warning, not guessed readiness. Verified with a real beads_rust export (718 records, 197 dependencies) and a schema-derived `bd` fixture from [steveyegge/beads's Issue/Dependency definitions](https://github.com/steveyegge/beads/blob/7477ec1352d9380b692773bc3c2e66ae2e60ae37/internal/types/types.go) and [flat JSONL exporter](https://github.com/steveyegge/beads/blob/7477ec1352d9380b692773bc3c2e66ae2e60ae37/cmd/bd/export.go). `bd`'s `_type: "issue"` wrapper is flat and accepted; `_type: "memory"` records are excluded and counted in coverage. Other record types/malformed records fail explicitly. This is not a guarantee for every tracker version or arbitrary JSONL. `runs list` shows qualified model identities; `runs rm beads:my-project` removes only that saved model, never the source export.

For these `open` inventories, coverage is explicit: default `--budget 1000`, `--max-pages 100`, each configurable from 1 to 1000. The legacy Linear inventory fetches 10 issues per request to stay within its GraphQL complexity limit; nested relationships are capped at 100 each. Notion inline relations stop at the API's first 25, with truncation flagged. Missing/out-of-scope endpoints stay as typed links but are not recursively read or rendered as invented nodes. Inventory caps, relationship truncation, unknown status, missing endpoints, and Notion query-limit signals make coverage incomplete and exit 1; complete scoped captures exit 0, invalid usage exits 2. HTTP/GraphQL failures stop collection without replacing a saved capture; no automatic retries. Requests time out after 30 seconds and refuse redirects. API permissions, archived items omitted by APIs, and concurrent edits prevent a claim of global or transactional completeness. None of these providers invents discussion Heat, PR reviews, file overlaps, or GitHub closing semantics.

These inventories expose Explore and Swarm with Links only, not Impact/Blast (which would imply unblocking semantics) or Depth (there is no recursive traversal). Graph arrows retain source → target dependency/hierarchy direction; Jira links with identical inward/outward labels, Linear non-blocking associations, and Notion relation properties are rendered without arrows. Notion rich-text hyperlinks and page mentions are external links, not dependencies.

### Slack Lists assessment (optional, not implemented)

Slack now exposes [`slackLists.items.list`](https://docs.slack.dev/reference/methods/slackLists.items.list): read-only POST with bot or user `lists:read`, cursor pagination, archived-item selection, and optional column schema (`include_list`). It requires a **paid Slack workspace**, list access, and is Tier 2 (20+ requests/minute). A capture adapter is technically feasible without browser scraping.

Its useful niche is lightweight Slack-native follow-up tracking. However, list columns are arbitrary: title, status, owner, completion, and any dependency links need explicit schema mapping; list records are not inherently issue/dependency objects. It adds little graph value when Slack merely links to Jira/Linear/Notion tasks. Defer it until a real list schema and permitted test workspace are available. If added, keep it opt-in, retain native fields and honest coverage, and do not request `lists:write` or block other providers.

## For AI agents

Install the fork CLI using [Start here](#start-here). Agents can read [AGENTS.md](AGENTS.md) directly and load bundled guidance through the installed CLI; a separate skill installer is optional:

```bash
npx skills@latest add edmundmiller/issue-graph
```

Choose your agent and project scope, preserving any local skill changes. Do not use the upstream repository or issue-graph.dev as a fallback for this fork. The [repository skill](skills/issue-graph/SKILL.md) checks the installed fork's schema and loads its bundled guide. Skill installation does not install the CLI or authenticate providers.

Before operational commands, load and read the guidance bundled with the installed CLI:

```bash
issue-graph skills get core
issue-graph skills get core --full
```

Use `--full` for workflow references, `issue-graph skills list` for available guides, and command-specific `--help` for syntax. If the CLI or guidance is missing, report the error and ask for an authorized setup correction. See [Agents](apps/docs/content/docs/agents.mdx) for setup.

Use `issue-graph cluster owner/repo` to print a root-cause clustering task for the calling agent, then `issue-graph cluster owner/repo --apply answer.json` (or `-` for stdin) to load its answer. For cron or CI, `--agent claude` or `--agent codex` sends it to an installed headless agent. Review the payload and the agent's permissions and data policy before using private repository evidence; the CLI runs Claude without tools or MCP servers and Codex in a read-only sandbox, but Codex still loads its configured MCP servers.

## Commands

Run `issue-graph --help` for the full list, or `issue-graph <command> --help` for one command.

| Group | Commands | Docs |
| --- | --- | --- |
| Map work | `open`, `graph`, `linear` | [Graph](apps/docs/content/docs/graph.mdx), [Linear](apps/docs/content/docs/linear.mdx) |
| Prioritize | `rank`, `cluster`, `reconcile`, `plan` | [Backlog](apps/docs/content/docs/backlog.mdx), [Agents](apps/docs/content/docs/agents.mdx) |
| Dashboard | `dashboard`, `query`, `runs`, `config` | [Dashboard](apps/docs/content/docs/dashboard.mdx) |
| Pull requests | `status` | [Status](apps/docs/content/docs/status.mdx) |
| Setup | `auth`, `schema`, `skills` | [Reference](apps/docs/content/docs/reference.mdx) |

## Library

To consume the fork library, install the locally built `.fork-pack/issue-graph-0.6.0.tgz` in your application with `npm install /absolute/path/to/the/tarball`; `npm install issue-graph@latest` selects upstream. It separates the runtime-agnostic core (`issue-graph`, including `collectProvider` and `beadsModel`) from shell (`issue-graph/transport/shell`, using `gh`) and HTTP (`issue-graph/transport/http`, using `fetch` plus a token) transports. Native Linear also has `issue-graph/transport/linear` for API credentials. See [Library](apps/docs/content/docs/library.mdx) for ESM imports and server-side credential handling.

## Documentation

Browse documentation source in this checkout for fork changes. [issue-graph.dev/docs](https://issue-graph.dev/docs) is the upstream website and may not describe this fork:

- [Get started](apps/docs/content/docs/get-started.mdx): installation, authentication, and a first result
- [Graph](apps/docs/content/docs/graph.mdx): depth, caps, snapshots, and HTML
- [Dashboard](apps/docs/content/docs/dashboard.mdx): filters, exact links, replay, and scoring defaults
- [Linear](apps/docs/content/docs/linear.mdx): native issue/project graphs, authentication, and attachments
- [Status](apps/docs/content/docs/status.mdx): counts, coverage, and history
- [Backlog](apps/docs/content/docs/backlog.mdx): reconcile and plan
- [Agents](apps/docs/content/docs/agents.mdx): skill setup and optional clustering
- [Library](apps/docs/content/docs/library.mdx): core, shell, and HTTP integrations
- [Security](apps/docs/content/docs/security.mdx): permissions and private data
- [Reference](apps/docs/content/docs/reference.mdx): commands and output contracts
- [Changelog](CHANGELOG.md): release notes

## Limits and privacy

Depth, node budgets, permissions, and API limits affect coverage. Check the linked code and current behavior before you close an issue or merge a PR.

Saved runs, HTML exports, and cluster prompts can contain private repository metadata, and anyone with an export can read the data embedded in it. See [Security](apps/docs/content/docs/security.mdx) and [vulnerability reporting](SECURITY.md).

## Source development

The source repository is public. Use Node.js 20.19.x or 22.12+ (24 recommended) and pnpm. Live GitHub queries also need GitHub CLI authentication; other providers use their own setup. Follow [Contributing](CONTRIBUTING.md#setup) for setup.

To update a clean source checkout:

```bash
git pull --ff-only
pnpm install --frozen-lockfile
pnpm build
pnpm link --global
```

Contributor checks:

```bash
pnpm check
pnpm test:package
```

`pnpm build` emits the Node CLI and library in `dist`. Package verification tests a packed local installation, or an existing archive in supplied-tarball mode. See [Contributing](CONTRIBUTING.md#release-process) for the retained-artifact release process. To compare transports against live GitHub data, use `pnpm exec tsx scripts/verify-transports.ts <number> <owner/repo> <depth>` with appropriate access.

### Local website development

From the repository root, start the docs website on a fixed local port:

```bash
pnpm dev:docs --hostname 127.0.0.1 --port 3399
```

Validate the production build separately. The HTTP suite checks production cache behavior, which differs from the development server:

```bash
pnpm check:docs
pnpm build:docs
pnpm --filter @issue-graph/docs test:ci
```

The last command starts and stops its own test server. For a manual browser session or audit, stop the development server and run `pnpm --filter @issue-graph/docs start --hostname 127.0.0.1 --port 3399`. In another terminal:

```bash
DOCS_TEST_URL=http://127.0.0.1:3399 pnpm test:docs:routes
DOCS_TEST_URL=http://127.0.0.1:3399 pnpm audit:docs
```

The agent-readability audit may follow production canonical URLs from a localhost start URL. Check its destinations when comparing local changes. [is-agentic.com](https://is-agentic.com) requires a publicly reachable URL.

### Dashboard development

`apps/dashboard` is the Next.js dashboard used by `open`, `dashboard`, `cluster --apply`, and `query`. Its React host mounts the original dashboard renderer and CSS, preserving its layout, graphs, and animations. The renderer lives in `src/dashboard-view.js`; filters, ranking, graph metrics, and URL state share the CLI core. `src/html.ts` retains the programmatic HTML exporter using the same renderer. `apps/docs` remains the documentation site.

Run `bun run dev:dashboard` and choose a normalized capture JSON locally. The browser does not upload it. `bun run build` includes the static Next.js export in the CLI package; end users do not need to run a Next.js server. `bun run test` prepares the same dashboard build before testing saved views.

## License

Apache-2.0
