# Using this fork

This repository is **edmundmiller/issue-graph**, not the upstream npm release.
When asked to install/use it, follow README.md's **Start here** from this
repository: clone this URL, install locked dependencies with pnpm 10.34.5,
pack the source (which builds the CLI/dashboard), and install that tarball
into the dedicated user prefix. Node.js 24 LTS is recommended for builds.
Do not substitute `npx issue-graph@latest`, `npm install issue-graph@latest`,
vercel-labs/issue-graph, or issue-graph.dev: those select upstream.

Before operational use:

1. Run the fork executable's `schema`. Check
   `commands.open.workProviders.providers` includes jira, linear, notion, beads.
2. Read `skills get core --full` from that executable, not a remembered guide.
3. Run the README's credentials-free Beads example with
   `examples/beads/issues.jsonl` and an isolated `ISSUE_GRAPH_HOME`.
4. Read `open <provider:scope> --help` before live collection. Obtain scope and
   credentials from authorized environment/secrets; never print or request
   tokens in chat. If credentials are absent, report the missing variable names
   and stop that live collection; offline Beads/query still work.

Jira Cloud needs JIRA_URL, JIRA_EMAIL, and an unscoped JIRA_API_TOKEN. Linear
needs LINEAR_API_KEY or LINEAR_ACCESS_TOKEN and a project UUID. Notion needs
NOTION_API_TOKEN and a shared task data source UUID (not a database UUID),
with exact status/select mapping. GitHub alone needs authenticated `gh`.

Provider collection is read-only. Beads reads compatible tracked JSONL; no br,
bd, or SQLite is required or accessed. JSONL can lag changes until exported or
flushed. Preserve string identifiers, native statuses, and typed dependency
direction. Unclosed does not mean ready; priority is not Heat. Slack Lists is
optional and not implemented. Inspect coverage warnings and capabilities;
never claim live verification from fixtures or availability from `--help`.

`open` returns a normalized model and saves the latest capture unless
`--no-save`. Query the returned model `id` offline with
`query <id> --view explore --json --no-open`. Return its exact `viewUrl` plus
coverage and native status findings. Views need their sibling `_next/` assets.
Local paths are not public URLs; do not invent a web endpoint.

# Contributing

Use existing normalized model/query interfaces, keep provider mutations out
of scope, and follow CONTRIBUTING.md. Run `pnpm check`, `pnpm check:docs`, and
`pnpm test:package` for changes to collection, installation, or bundled guides.
Keep tests with their features. Do not publish, push, or merge without the
user's authorization for the current task.
