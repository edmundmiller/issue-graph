import type { ClientNode, Model } from "./html.js";
import { buildProviderModel } from "./providers.js";

/** Import compatible Beads issue JSONL directly; no tracker binary or database access. */
export function beadsModel(
  jsonl: string,
  options: {
    scope: string;
    state?: "open" | "all";
    budget?: number;
    observedAt?: string;
  },
): Model {
  if (!/^[\w.-]+(?:\/[\w.-]+)*$/.test(options.scope))
    throw new Error("Beads requires a stable project scope");
  const budget = options.budget ?? 1000;
  if (!Number.isInteger(budget) || budget < 1 || budget > 1000)
    throw new Error("budget must be an integer from 1 to 1000");
  const nodes: Model["nodes"] = {};
  const warnings = new Set<string>();
  const seen = new Set<string>();
  const key = (id: string) => `beads:${options.scope}:${id}`;
  let excluded = 0;
  let metadata = 0;
  let capped = false;
  for (const [index, line] of jsonl.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw new Error(`Invalid Beads JSONL at line ${index + 1}`);
    }
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error(`Invalid bead at line ${index + 1}`);
    const issue = value as Record<string, unknown>;
    // bd's flat export may include memory records alongside issue records.
    if (issue._type === "memory") {
      metadata++;
      continue;
    }
    if (issue._type !== undefined && issue._type !== "issue")
      throw new Error(`Unsupported Beads record type at line ${index + 1}`);
    if (
      typeof issue.id !== "string" ||
      !/^[\w.-]+$/.test(issue.id) ||
      typeof issue.title !== "string" ||
      typeof issue.status !== "string"
    )
      throw new Error(`Invalid bead identity/title/status at line ${index + 1}`);
    if (seen.has(issue.id)) throw new Error(`Duplicate bead ID: ${issue.id}`);
    seen.add(issue.id);
    const known = [
      "open",
      "in_progress",
      "blocked",
      "deferred",
      "closed",
      "tombstone",
      "pinned",
      "hooked",
    ].includes(issue.status);
    if (!known) warnings.add(`Unknown native status for ${issue.id}: ${issue.status}`);
    if (options.state !== "all" && ["closed", "tombstone"].includes(issue.status)) {
      excluded++;
      continue;
    }
    if (Object.keys(nodes).length >= budget) {
      capped = true;
      continue;
    }
    const n: ClientNode = {
      key: key(issue.id),
      identifier: issue.id,
      repo: options.scope,
      kind: "Issue",
      title: issue.title,
      url: "",
      state:
        issue.status === "closed" || issue.status === "tombstone"
          ? "CLOSED"
          : known
            ? "OPEN"
            : "UNKNOWN",
      stateLabel: issue.status,
      stateType: issue.status,
      archived: issue.status === "tombstone",
      author: typeof issue.created_by === "string" ? issue.created_by : undefined,
      depth: 0,
      seed: true,
      flags: [],
      mentionedBy: [],
      external: [],
      out: [],
      in: [],
      overlaps: [],
      read: { fetched: true, coverage: [{ source: "tracked-jsonl", pages: 1, complete: true }] },
    };
    if (issue.priority !== undefined) {
      if (
        typeof issue.priority !== "number" ||
        !Number.isInteger(issue.priority) ||
        issue.priority < 0 ||
        issue.priority > 4
      )
        throw new Error(`Invalid bead priority: ${issue.id}`);
      n.priority = issue.priority;
    }
    if (typeof issue.issue_type === "string") n.issueType = issue.issue_type;
    if (issue.dependencies !== undefined && !Array.isArray(issue.dependencies))
      throw new Error(`Invalid bead dependencies: ${issue.id}`);
    for (const raw of (issue.dependencies ?? []) as unknown[]) {
      if (!raw || typeof raw !== "object") throw new Error(`Invalid dependency: ${issue.id}`);
      const dep = raw as Record<string, unknown>;
      if (
        dep.issue_id !== issue.id ||
        typeof dep.depends_on_id !== "string" ||
        !/^[\w.-]+$/.test(dep.depends_on_id) ||
        typeof dep.type !== "string" ||
        !dep.type
      )
        throw new Error(`Invalid dependency: ${issue.id}`);
      n.out.push({
        to: key(dep.depends_on_id),
        via: dep.type,
        undirected: false,
        by: typeof dep.created_by === "string" ? dep.created_by : undefined,
        at: typeof dep.created_at === "string" ? dep.created_at : undefined,
        evidence: {
          kind: dep.type === "parent-child" ? "hierarchy" : "relation",
          id: `${issue.id}:${dep.type}:${dep.depends_on_id}`,
        },
      });
    }
    nodes[n.key] = n;
  }
  if (capped) warnings.add(`Snapshot limited to ${budget} included items; increase --budget.`);
  for (const n of Object.values(nodes)) {
    for (const e of n.out)
      if (!nodes[e.to]) warnings.add(`Dependency endpoint not captured: ${e.to}`);
    if (capped && n.read)
      n.read.coverage[0] = {
        source: "tracked-jsonl",
        pages: 1,
        complete: false,
        reason: "node-limit",
      };
  }
  return buildProviderModel({
    id: `beads:${options.scope}`,
    repo: options.scope,
    label: options.scope,
    url: "",
    provider: {
      id: "beads",
      name: "Beads",
      logo: "",
      repoUrl: "",
      signals: [],
      views: ["explore", "swarm"],
      metrics: ["links"],
      filters: [],
    },
    nodes,
    coverage: {
      complete: !warnings.size,
      generatedAt: options.observedAt ?? new Date().toISOString(),
      maxDepth: 0,
      messages: [
        `Read ${seen.size} unique issues from tracked JSONL; excluded ${excluded} closed/tombstone issues and ${metadata} memory records.`,
        "Snapshot only: JSONL may lag database-backed changes until exported/flushed. Freshness and database synchronization are unknown; use the originating tracker for mutations and readiness.",
        "OPEN means unclosed, including blocked and deferred; it does not mean ready. Native priority is not discussion Heat.",
      ],
      warnings: [...warnings],
    },
  });
}
