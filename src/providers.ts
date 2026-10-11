import type { ReadCoverage } from "./dashboard-types.js";
import type { ClientNode, Model } from "./html.js";

export type WorkProvider = "jira" | "linear" | "notion";

export interface ProviderOptions {
  provider: WorkProvider;
  /** Jira project key, Linear project UUID, or Notion data source UUID. */
  scope: string;
  token: string;
  /** Jira Cloud site origin. Authorization is Basic (email:API token) for Jira. */
  site?: string;
  state?: "open" | "all";
  budget?: number;
  maxPages?: number;
  /** Notion status/select property and exact completed option names. */
  statusProperty?: string;
  closedStatuses?: string[];
  fetch?: typeof globalThis.fetch;
}

type Json = Record<string, unknown>;
function object(value: unknown): Json {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid provider response: expected object");
  return value as Json;
}
function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("Invalid provider response: expected list");
  return value;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value)
    throw new Error("Invalid provider response: expected text");
  return value;
}
function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}
function webUrl(value: unknown): string {
  const url = new URL(text(value));
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error("Provider URLs must be credential-free HTTPS");
  return url.href;
}

export function jiraOrigin(site: string): string {
  const url = new URL(webUrl(site));
  if (
    !url.hostname.endsWith(".atlassian.net") ||
    url.port ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error("Jira requires a Cloud site origin: https://your-site.atlassian.net");
  return url.origin;
}

export function providerScope(
  options: Pick<ProviderOptions, "provider" | "scope" | "site">,
): string {
  if (options.provider === "jira") {
    if (!/^[A-Z][A-Z0-9_]*$/.test(options.scope)) throw new Error("Jira requires a project key");
    return `${new URL(jiraOrigin(options.site ?? "")).hostname}:${options.scope}`;
  }
  if (!/^(?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i.test(options.scope))
    throw new Error(
      `${options.provider} requires a ${options.provider === "linear" ? "project" : "data source"} UUID`,
    );
  const id = options.scope.replaceAll("-", "").toLowerCase();
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}

const LINEAR_QUERY = `query ProjectIssues($project: String!, $after: String, $first: Int!, $filter: IssueFilter) {
  project(id: $project) { id name url issues(first: $first, after: $after, filter: $filter) {
    nodes { id identifier title url description creator { name } state { name type }
      parent { id } children(first: 100) { nodes { id } pageInfo { hasNextPage } }
      relations(first: 100) { nodes { id type relatedIssue { id } } pageInfo { hasNextPage } }
      inverseRelations(first: 100) { nodes { id type issue { id } } pageInfo { hasNextPage } }
    } pageInfo { hasNextPage endCursor }
  } }
}`;

/** Read-only, bounded project collection into the existing portable dashboard model. */
export async function collectProvider(options: ProviderOptions): Promise<Model> {
  const scope = providerScope(options);
  const budget = options.budget ?? 1000;
  const maxPages = options.maxPages ?? 100;
  for (const [name, value] of [
    ["budget", budget],
    ["maxPages", maxPages],
  ] as const)
    if (!Number.isInteger(value) || value < 1 || value > 1000)
      throw new Error(`${name} must be an integer from 1 to 1000`);
  if (!options.token.trim()) throw new Error(`${options.provider} credentials are required`);
  const provider = options.provider;
  const identity = `${provider}:${scope}`;
  const nodes: Model["nodes"] = {};
  const warnings = new Set<string>();
  const reads: ReadCoverage[] = [];
  let label = scope;
  let scopeUrl = "";
  let cursor: string | undefined;
  const cursors = new Set<string>();
  let complete = false;
  let pages = 0;
  const request = async (url: string, body?: Json) => {
    let response: Response;
    try {
      response = await (options.fetch ?? globalThis.fetch)(url, {
        method: body ? "POST" : "GET",
        headers: {
          Authorization:
            provider === "jira"
              ? `Basic ${options.token}`
              : provider === "notion"
                ? `Bearer ${options.token}`
                : options.token,
          "Content-Type": "application/json",
          ...(provider === "notion" ? { "Notion-Version": "2025-09-03" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new Error(`${provider} request failed (network, timeout, or redirect)`);
    }
    // Do not echo provider bodies: they can contain private data or credentials.
    if (!response.ok)
      throw new Error(
        `${provider} HTTP ${response.status}${response.status === 429 ? "; rate limited, retry later" : "; check credentials and scope permissions"}`,
      );
    let value: unknown;
    try {
      value = await response.json();
    } catch {
      throw new Error(`${provider} returned invalid JSON`);
    }
    return object(value);
  };
  const key = (id: string) =>
    provider === "jira"
      ? `jira:${new URL(options.site ?? "").hostname}:${id}`
      : `${provider}:${id.replaceAll("-", "").toLowerCase()}`;
  const node = (
    id: string,
    title: string,
    url: string,
    state: string,
    stateLabel?: string,
  ): ClientNode => ({
    key: key(id),
    repo: scope,
    identifier: id,
    kind: "Issue",
    title,
    url: webUrl(url),
    state,
    stateLabel,
    depth: 0,
    seed: true,
    flags: [],
    mentionedBy: [],
    external: [],
    out: [],
    in: [],
    overlaps: [],
    read: { fetched: true, coverage: [] },
  });
  const edge = (
    n: ClientNode,
    target: string,
    via: string,
    id: string,
    hierarchy = false,
    directed = hierarchy,
  ) => {
    const to = key(target);
    if (to !== n.key && !n.out.some((e) => e.to === to && e.via === via))
      n.out.push({
        to,
        via,
        ...(directed ? { undirected: false } : {}),
        evidence: { kind: hierarchy ? "hierarchy" : "relation", id },
      });
  };
  const external = (n: ClientNode, value: unknown) => {
    if (typeof value !== "string") return;
    for (const match of value.matchAll(/https:\/\/[^\s<>"\])]+/g)) {
      try {
        const url = webUrl(match[0]);
        if (url !== n.url && !n.external.includes(url)) n.external.push(url);
      } catch {
        /* Ignore malformed links in user-authored text. */
      }
    }
  };

  if (provider === "notion") {
    const source = await request(`https://api.notion.com/v1/data_sources/${scope}`);
    label =
      list(source.title)
        .map((part) => optionalText(object(part).plain_text) ?? "")
        .join("") || scope;
    const database = optionalText(object(source.parent).database_id);
    if (database) scopeUrl = `https://www.notion.so/${database.replaceAll("-", "")}`;
  }
  while (pages < maxPages && Object.keys(nodes).length < budget) {
    // Keep Linear's three nested first:100 connections below its query complexity limit.
    const first = Math.min(provider === "linear" ? 10 : 100, budget - Object.keys(nodes).length);
    let items: unknown[];
    let more: boolean;
    let next: string | undefined;
    if (provider === "jira") {
      const origin = jiraOrigin(options.site ?? "");
      label = options.scope;
      scopeUrl = `${origin}/issues/?jql=${encodeURIComponent(`project = "${options.scope}"`)}`;
      const result = await request(`${origin}/rest/api/3/search/jql`, {
        jql: `project = "${options.scope}"${options.state === "all" ? "" : " AND statusCategory != Done"} ORDER BY key ASC`,
        maxResults: first,
        fields: ["summary", "status", "reporter", "issuelinks", "parent", "description"],
        ...(cursor ? { nextPageToken: cursor } : {}),
      });
      items = list(result.issues);
      if (typeof result.isLast !== "boolean") throw new Error("Invalid Jira pagination");
      more = !result.isLast;
      next = optionalText(result.nextPageToken);
      for (const raw of items) {
        const issue = object(raw);
        const id = text(issue.key);
        const fields = object(issue.fields);
        const status = object(fields.status);
        const category = text(object(status.statusCategory).key);
        const n = node(
          id,
          text(fields.summary),
          `${origin}/browse/${id}`,
          category === "done" ? "CLOSED" : "OPEN",
          text(status.name),
        );
        n.stateType = category;
        if (fields.reporter) n.author = optionalText(object(fields.reporter).displayName);
        if (fields.parent) edge(n, text(object(fields.parent).key), "parent", id, true);
        for (const rawLink of list(fields.issuelinks ?? [])) {
          const link = object(rawLink);
          const inward = link.inwardIssue;
          const target = object(inward ?? link.outwardIssue);
          const type = object(link.type);
          edge(
            n,
            text(target.key),
            text(inward ? type.inward : type.outward),
            text(link.id),
            false,
            type.inward !== type.outward,
          );
        }
        external(n, JSON.stringify(fields.description));
        nodes[n.key] = n;
      }
    } else if (provider === "linear") {
      const result = await request("https://api.linear.app/graphql", {
        query: LINEAR_QUERY,
        variables: {
          project: scope,
          after: cursor ?? null,
          first,
          filter:
            options.state === "all" ? {} : { state: { type: { nin: ["completed", "canceled"] } } },
        },
      });
      if (result.errors !== undefined && list(result.errors).length)
        throw new Error("Linear GraphQL query failed; check project access and API schema");
      const project = object(object(result.data).project);
      label = text(project.name);
      scopeUrl = webUrl(project.url);
      const connection = object(project.issues);
      items = list(connection.nodes);
      const page = object(connection.pageInfo);
      if (typeof page.hasNextPage !== "boolean") throw new Error("Invalid Linear pagination");
      more = page.hasNextPage;
      next = optionalText(page.endCursor);
      for (const raw of items) {
        const issue = object(raw);
        const state = object(issue.state);
        const type = text(state.type);
        const n = node(
          text(issue.id),
          text(issue.title),
          text(issue.url),
          ["completed", "canceled"].includes(type) ? "CLOSED" : "OPEN",
          text(state.name),
        );
        n.identifier = text(issue.identifier);
        n.stateType = type;
        if (issue.creator) n.author = optionalText(object(issue.creator).name);
        if (issue.parent) edge(n, text(object(issue.parent).id), "parent", text(issue.id), true);
        for (const name of ["children", "relations", "inverseRelations"]) {
          const connection = object(issue[name]);
          const truncated = object(connection.pageInfo).hasNextPage;
          if (typeof truncated !== "boolean")
            throw new Error("Invalid Linear relationship pagination");
          const read: ReadCoverage = {
            source: name,
            pages: 1,
            complete: !truncated,
            ...(truncated ? { reason: "page-limit" as const } : {}),
          };
          n.read?.coverage.push(read);
          if (truncated)
            warnings.add(`Relationships truncated for ${n.identifier} (${name}, first 100).`);
          for (const rawLink of list(connection.nodes)) {
            const link = object(rawLink);
            if (name === "children") edge(n, text(link.id), "child", text(issue.id), true);
            else
              edge(
                n,
                text(object(name === "relations" ? link.relatedIssue : link.issue).id),
                `${name === "inverseRelations" ? "inverse:" : ""}${text(link.type)}`,
                text(link.id),
                false,
                link.type === "blocks",
              );
          }
        }
        external(n, issue.description);
        nodes[n.key] = n;
      }
    } else {
      const result = await request(`https://api.notion.com/v1/data_sources/${scope}/query`, {
        page_size: first,
        ...(cursor ? { start_cursor: cursor } : {}),
        sorts: [{ timestamp: "created_time", direction: "ascending" }],
      });
      items = list(result.results);
      if (typeof result.has_more !== "boolean") throw new Error("Invalid Notion pagination");
      more = result.has_more;
      next = optionalText(result.next_cursor);
      if (result.request_status && object(result.request_status).type === "incomplete")
        warnings.add("Notion query result limit reached; inventory is incomplete.");
      for (const raw of items) {
        const page = object(raw);
        if (page.object !== "page")
          throw new Error("Notion source returned a non-page; use a task data source, not a wiki");
        const properties = object(page.properties);
        const titleProperty = Object.values(properties)
          .map(object)
          .find((p) => p.type === "title");
        if (!titleProperty) throw new Error("Notion task page has no title property");
        const title =
          list(titleProperty.title)
            .map((part) => optionalText(object(part).plain_text) ?? "")
            .join("") || "Untitled";
        const statusProperty = properties[options.statusProperty ?? "Status"];
        const property = statusProperty ? object(statusProperty) : undefined;
        const status = property && (property.status ?? property.select);
        const stateLabel = status ? text(object(status).name) : undefined;
        const state = stateLabel
          ? (options.closedStatuses ?? ["Done"]).includes(stateLabel)
            ? "CLOSED"
            : "OPEN"
          : "UNKNOWN";
        const n = node(text(page.id), title, text(page.url), state, stateLabel);
        n.archived = page.archived === true || page.in_trash === true;
        n.author = page.created_by ? optionalText(object(page.created_by).id) : undefined;
        if (!stateLabel)
          warnings.add("Some Notion pages have no mapped status; their state is UNKNOWN.");
        for (const [name, rawProperty] of Object.entries(properties)) {
          const p = object(rawProperty);
          if (p.type === "relation") {
            const truncated = p.has_more === true;
            n.read?.coverage.push({
              source: `relation:${name}`,
              pages: 1,
              complete: !truncated,
              ...(truncated ? { reason: "page-limit" as const } : {}),
            });
            if (truncated)
              warnings.add(`Notion relation truncated for ${page.id} (${name}, first 25).`);
            for (const rawLink of list(p.relation))
              edge(n, text(object(rawLink).id), name, text(p.id));
          }
          if (p.type === "url") external(n, p.url);
          if (p.type === "rich_text")
            for (const part of list(p.rich_text)) {
              const richText = object(part);
              external(n, richText.plain_text);
              external(n, richText.href);
            }
        }
        // Filtering after collection preserves correct pagination/budget coverage.
        nodes[n.key] = n;
      }
    }
    pages++;
    if (Object.keys(nodes).length > budget)
      throw new Error("Provider exceeded requested page size");
    if (!more) {
      complete = true;
      break;
    }
    if (!next || cursors.has(next)) throw new Error(`Invalid ${provider} pagination cursor`);
    cursors.add(next);
    cursor = next;
  }
  reads.push({
    source: "inventory",
    pages,
    complete,
    ...(!complete
      ? {
          reason:
            Object.keys(nodes).length >= budget ? ("node-limit" as const) : ("page-limit" as const),
        }
      : {}),
  });
  if (!complete)
    warnings.add(
      `Inventory stopped at ${Object.keys(nodes).length} items / ${pages} pages; increase --budget or --max-pages.`,
    );
  if (provider === "notion" && options.state !== "all")
    for (const [key, n] of Object.entries(nodes))
      if (n.state === "CLOSED" || n.archived) delete nodes[key];
  const missing = new Set(
    Object.values(nodes).flatMap((n) => n.out.filter((e) => !nodes[e.to]).map((e) => e.to)),
  );
  if (missing.size)
    warnings.add(
      `${missing.size} relationship endpoints are outside the captured scope; no recursive reads were performed.`,
    );
  for (const n of Object.values(nodes)) n.read?.coverage.push(...reads);
  return buildProviderModel({
    id: identity,
    repo: scope,
    label,
    url: scopeUrl,
    provider: {
      id: provider,
      name: { jira: "Jira", linear: "Linear", notion: "Notion" }[provider],
      logo: "",
      repoUrl: scopeUrl,
      signals: [],
      views: ["explore", "swarm"],
      metrics: ["links"],
      filters: [],
    },
    nodes,
    coverage: {
      complete: complete && !warnings.size,
      generatedAt: new Date().toISOString(),
      maxDepth: 0,
      messages: [
        "Project inventory and structural relationships only; no recursive expansion, comments, PR review, or heat signals.",
        "Completeness is relative to API-visible items, not inaccessible or archived work.",
      ],
      warnings: [...warnings],
    },
  });
}

/** Shared model assembly for live work providers and local snapshot adapters. */
export function buildProviderModel(
  input: Pick<Model, "id" | "repo" | "label" | "url" | "provider" | "nodes" | "coverage">,
): Model {
  const { nodes } = input;
  // Only captured endpoints form the graph. Unread/out-of-scope links stay as evidence.
  for (const n of Object.values(nodes)) {
    n.in = [];
  }
  for (const n of Object.values(nodes)) {
    for (const e of n.out) {
      const target = nodes[e.to];
      if (target) target.in.push({ from: n.key, via: e.via, evidence: e.evidence });
    }
  }
  const unseen = new Set(Object.keys(nodes));
  const groups: Model["groups"] = [];
  while (unseen.size) {
    const start = unseen.values().next().value as string;
    const members: string[] = [];
    const queue = [start];
    unseen.delete(start);
    for (const current of queue) {
      members.push(current);
      const n = nodes[current];
      for (const neighbor of [...n.out.map((e) => e.to), ...n.in.map((e) => e.from)])
        if (unseen.delete(neighbor)) queue.push(neighbor);
    }
    groups.push({
      label: nodes[start].title,
      subtitle: `${members.length} related items`,
      members,
    });
  }
  return {
    ...input,
    nodes,
    seeds: Object.keys(nodes),
    groups,
    cleanup: [],
    grouping: "components",
    stats: {
      nodes: Object.keys(nodes).length,
      edges: Object.values(nodes).reduce((total, n) => total + n.out.length, 0),
    },
  };
}
