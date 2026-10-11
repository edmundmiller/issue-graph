import { describe, expect, test } from "vitest";
import { dashboardQuery } from "./dashboard-query.js";
import { parseModel } from "./model-validation.js";
import { collectProvider, type ProviderOptions } from "./providers.js";

const scope = "12345678-1234-1234-1234-123456789abc";
const connection = (
  nodes: unknown[] = [],
  hasNextPage = false,
  endCursor: string | null = null,
) => ({ nodes, pageInfo: { hasNextPage, endCursor } });
const jiraIssue = (key: string, category = "new", links: unknown[] = []) => ({
  key,
  fields: {
    summary: `Work ${key}`,
    status: {
      name: category === "done" ? "Delivered" : "Queued",
      statusCategory: { key: category },
    },
    reporter: { displayName: "Ada" },
    issuelinks: links,
  },
});
const linearIssue = (id: string, identifier: string, type = "started") => ({
  id,
  identifier,
  title: `Work ${identifier}`,
  url: `https://linear.app/example/issue/${identifier}`,
  creator: { name: "Ada" },
  state: { name: type === "completed" ? "Delivered" : "Building", type },
  children: connection(),
  relations: connection(),
  inverseRelations: connection(),
});
const notionPage = (
  id: string,
  status: string | null,
  relations: unknown[] = [],
  has_more = false,
) => ({
  object: "page",
  id,
  url: `https://www.notion.so/${id.replaceAll("-", "")}`,
  archived: false,
  properties: {
    Name: { type: "title", title: [{ plain_text: `Task ${id}` }] },
    Phase: { type: "select", select: status ? { name: status } : null },
    Related: { id: "rel", type: "relation", relation: relations, has_more },
  },
});
function replies(values: unknown[]): typeof fetch {
  let index = 0;
  return async () => {
    if (index >= values.length) throw new Error("Unexpected extra request");
    return Response.json(values[index++]);
  };
}
const base: ProviderOptions = {
  provider: "jira",
  scope: "ENG",
  site: "https://example.atlassian.net",
  token: "test-token",
  state: "all",
};

describe("read-only work provider captures", () => {
  test("Jira joins paginated links with native direction, labels, and site-qualified identity", async () => {
    const link = {
      id: "10",
      type: { inward: "is blocked by", outward: "blocks" },
      inwardIssue: { key: "ENG-2" },
    };
    const model = parseModel(
      await collectProvider({
        ...base,
        fetch: replies([
          {
            issues: [jiraIssue("ENG-1", "indeterminate", [link])],
            isLast: false,
            nextPageToken: "next",
          },
          { issues: [jiraIssue("ENG-2", "done")], isLast: true },
        ]),
      }),
    );
    const a = model.nodes["jira:example.atlassian.net:ENG-1"];
    const b = model.nodes["jira:example.atlassian.net:ENG-2"];
    expect(model.id).toBe("jira:example.atlassian.net:ENG");
    expect(a).toMatchObject({
      state: "OPEN",
      stateLabel: "Queued",
      identifier: "ENG-1",
      author: "Ada",
    });
    expect(b.state).toBe("CLOSED");
    expect(a.out).toEqual([
      {
        to: b.key,
        via: "is blocked by",
        undirected: false,
        evidence: { kind: "relation", id: "10" },
      },
    ]);
    expect(b.in[0]).toMatchObject({ from: a.key, via: "is blocked by" });
    expect(model.groups.map((g) => g.members)).toEqual([[a.key, b.key]]);
    expect(model.coverage?.complete).toBe(true);
    expect(a.read?.coverage).toEqual([{ source: "inventory", pages: 2, complete: true }]);
    expect(dashboardQuery.normalize(model).view).toBe("explore");
    expect(() => dashboardQuery.normalize(model, { view: "rank" })).toThrow("unavailable");
    expect(() => dashboardQuery.normalize(model, { view: "impact" })).toThrow("unavailable");
    expect(model.provider.metrics).toEqual(["links"]);
  });

  test("Linear captures both relation directions and hierarchy without PR/Heat metadata", async () => {
    const requests: number[] = [];
    const a = {
      ...linearIssue("a", "ENG-9"),
      parent: { id: "b" },
      relations: connection([{ id: "r1", type: "blocks", relatedIssue: { id: "b" } }]),
    };
    const b = {
      ...linearIssue("b", "ENG-10", "completed"),
      inverseRelations: connection([{ id: "r1", type: "blocks", issue: { id: "a" } }]),
    };
    const respond = replies([
      {
        data: {
          project: {
            name: "Platform",
            url: "https://linear.app/example/project/platform",
            issues: connection([a], true, "cursor"),
          },
        },
      },
      {
        data: {
          project: {
            name: "Platform",
            url: "https://linear.app/example/project/platform",
            issues: connection([b]),
          },
        },
      },
    ]);
    const model = parseModel(
      await collectProvider({
        provider: "linear",
        scope,
        token: "key",
        state: "all",
        fetch: async (url, init) => {
          requests.push(JSON.parse(String(init?.body)).variables.first);
          return respond(url, init);
        },
      }),
    );
    expect(requests).toEqual([10, 10]);
    expect(model.nodes["linear:a"].out.every((e) => e.undirected === false)).toBe(true);
    expect(model.nodes["linear:a"].out.map((e) => [e.to, e.via, e.evidence?.kind])).toEqual([
      ["linear:b", "parent", "hierarchy"],
      ["linear:b", "blocks", "relation"],
    ]);
    expect(model.nodes["linear:b"].out[0]).toMatchObject({
      to: "linear:a",
      via: "inverse:blocks",
      undirected: false,
    });
    expect(model.nodes["linear:b"]).toMatchObject({
      identifier: "ENG-10",
      state: "CLOSED",
      stateLabel: "Delivered",
    });
    expect(model.nodes["linear:a"].heat).toBeUndefined();
    expect(model.nodes["linear:a"].num).toBeUndefined();
    expect(model.coverage?.complete).toBe(true);
  });

  test("Notion maps custom statuses, retains unknowns, and pages before filtering closed tasks", async () => {
    const model = parseModel(
      await collectProvider({
        provider: "notion",
        scope,
        token: "secret",
        statusProperty: "Phase",
        closedStatuses: ["Shipped"],
        fetch: replies([
          { title: [{ plain_text: "Roadmap" }], parent: { database_id: scope } },
          { results: [notionPage("a", "Shipped")], has_more: true, next_cursor: "n" },
          {
            results: [notionPage("b", null), notionPage("c", "Doing", [{ id: "b" }])],
            has_more: false,
            next_cursor: null,
          },
        ]),
      }),
    );
    expect(Object.keys(model.nodes)).toEqual(["notion:b", "notion:c"]);
    expect(model.nodes["notion:b"].state).toBe("UNKNOWN");
    expect(model.nodes["notion:c"]).toMatchObject({ state: "OPEN", stateLabel: "Doing" });
    expect(model.nodes["notion:c"].out[0]).toEqual({
      to: "notion:b",
      via: "Related",
      evidence: { kind: "relation", id: "rel" },
    });
    expect(model.label).toBe("Roadmap");
    expect(model.coverage?.complete).toBe(false);
    expect(model.coverage?.warnings).toContain(
      "Some Notion pages have no mapped status; their state is UNKNOWN.",
    );
  });

  test("Notion retains labeled hyperlinks and page mentions without inventing dependencies", async () => {
    const page = notionPage("a", "Doing");
    const model = await collectProvider({
      provider: "notion",
      scope,
      token: "key",
      statusProperty: "Phase",
      fetch: replies([
        { title: [], parent: { database_id: scope } },
        {
          results: [
            {
              ...page,
              properties: {
                ...page.properties,
                Notes: {
                  type: "rich_text",
                  rich_text: [
                    {
                      type: "text",
                      plain_text: "Design document",
                      href: "https://example.com/design",
                    },
                    {
                      type: "mention",
                      plain_text: "Related page",
                      href: "https://www.notion.so/other",
                    },
                    {
                      type: "text",
                      plain_text: "https://example.com/design",
                      href: "https://example.com/design",
                    },
                    { type: "text", plain_text: "Unsafe", href: "javascript:alert(1)" },
                  ],
                },
              },
            },
          ],
          has_more: false,
        },
      ]),
    });
    expect(model.nodes["notion:a"].external).toEqual([
      "https://example.com/design",
      "https://www.notion.so/other",
    ]);
    expect(model.nodes["notion:a"].out).toEqual([]);
  });

  test("reports inventory and nested relationship limits instead of claiming complete graphs", async () => {
    const capped = await collectProvider({
      ...base,
      budget: 1,
      fetch: replies([{ issues: [jiraIssue("ENG-1")], isLast: false, nextPageToken: "next" }]),
    });
    expect(capped.coverage?.complete).toBe(false);
    expect(Object.values(capped.nodes)[0].read?.coverage[0]).toMatchObject({
      reason: "node-limit",
      complete: false,
    });
    const exact = await collectProvider({
      ...base,
      budget: 1,
      fetch: replies([{ issues: [jiraIssue("ENG-1")], isLast: true }]),
    });
    expect(exact.coverage?.complete).toBe(true);
    const partial = await collectProvider({
      provider: "linear",
      scope,
      token: "key",
      fetch: replies([
        {
          data: {
            project: {
              name: "Platform",
              url: "https://linear.app/example/project/p",
              issues: connection([
                { ...linearIssue("a", "ENG-1"), children: connection([], true) },
              ]),
            },
          },
        },
      ]),
    });
    expect(partial.coverage?.complete).toBe(false);
    expect(partial.nodes["linear:a"].read?.coverage[0]).toMatchObject({
      source: "children",
      complete: false,
    });
    const notion = await collectProvider({
      provider: "notion",
      scope,
      token: "key",
      state: "all",
      fetch: replies([
        { title: [], parent: { database_id: scope } },
        {
          results: [notionPage("a", "Doing", [{ id: "missing" }], true)],
          has_more: false,
          request_status: { type: "incomplete" },
        },
      ]),
    });
    expect(notion.coverage?.warnings?.join(" ")).toContain("query result limit");
    expect(notion.coverage?.warnings?.join(" ")).toContain("relation truncated");
    expect(notion.coverage?.warnings?.join(" ")).toContain("outside the captured scope");
  });

  test("refuses malformed pagination, GraphQL partial errors, insecure sites, and private error bodies", async () => {
    await expect(
      collectProvider({ ...base, fetch: replies([{ issues: [], isLast: false }]) }),
    ).rejects.toThrow("pagination cursor");
    await expect(
      collectProvider({
        ...base,
        fetch: replies([
          { issues: [], isLast: false, nextPageToken: "same" },
          { issues: [], isLast: false, nextPageToken: "same" },
        ]),
      }),
    ).rejects.toThrow("pagination cursor");
    await expect(
      collectProvider({ ...base, site: "https://attacker.test", fetch: replies([]) }),
    ).rejects.toThrow("Cloud site");
    await expect(
      collectProvider({
        provider: "linear",
        scope,
        token: "key",
        fetch: replies([{ data: {}, errors: [{ message: "private content" }] }]),
      }),
    ).rejects.toThrow("GraphQL query failed");
    await expect(
      collectProvider({
        ...base,
        fetch: async () => new Response("private token", { status: 429 }),
      }),
    ).rejects.toThrow("jira HTTP 429; rate limited, retry later");
    await expect(
      collectProvider({ ...base, fetch: async () => new Response("private token") }),
    ).rejects.toThrow("jira returned invalid JSON");
  });
});
