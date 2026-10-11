---
name: issue-graph
description: Read-only context for issues, pull requests, and backlogs. Use to trace related work, check PR counts, prioritize follow-ups, filter saved captures, open exact dashboard views, replay triage queries, or compare snapshots.
---

# issue-graph

This skill belongs to **edmundmiller/issue-graph**. Install the fork from its
README's source-pack instructions when setup is authorized. `issue-graph@latest`
and issue-graph.dev select upstream and do not install this fork. Prefer the
dedicated `$HOME/.local/issue-graph-fork/bin/issue-graph` executable if multiple
installations exist.

Before running operational commands, run `issue-graph schema` and check that
`commands.open.workProviders.providers` includes jira, linear, notion, beads.
If it does not, stop and report that the executable is not this fork. Then load
and read the guidance bundled with that CLI:

```bash
issue-graph skills get core
```

Follow the returned core guidance. When detailed workflows or references are needed,
load and read them through the CLI:

```bash
issue-graph skills get core --full
```

Discover available guidance with `issue-graph skills list`. Inspect command syntax
with `issue-graph skills --help`, `issue-graph skills list --help`, or
`issue-graph skills get --help`.

If the executable, skills command, core, or referenced assets are unavailable, stop
and report the CLI/skill mismatch and the observed error. Do not fabricate operational
guidance, fall back to remembered instructions, or automatically install or upgrade
anything. Ask for an explicitly authorized setup correction before proceeding.
