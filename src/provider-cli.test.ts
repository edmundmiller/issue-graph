import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { runNode } from "../tests/node-process.js";
import { runProviderOpen } from "./provider-cli.js";

const dirs: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = 0;
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

test("CLI imports tracked Beads JSONL, saves provider-qualified runs, and queries native metadata", async () => {
  const home = mkdtempSync(join(tmpdir(), "issue-graph-provider-"));
  dirs.push(home);
  const input = join(home, "issues.jsonl");
  const original = JSON.stringify({
    id: "p-a.4",
    title: "Blocked task",
    status: "blocked",
    priority: 1,
    issue_type: "bug",
  });
  writeFileSync(input, original);
  const env = { ...process.env, ISSUE_GRAPH_HOME: home };
  const collect = await runNode(["src/bin.ts", "open", "beads:p", "--input", input], { env });
  expect(collect.code).toBe(0);
  expect(JSON.parse(collect.stdout).id).toBe("beads:p");
  expect(readFileSync(input, "utf8")).toBe(original);
  expect(readdirSync(join(home, "dashboard"))).toHaveLength(1);
  const query = await runNode(["src/bin.ts", "query", "beads:p", "--json", "--no-open"], { env });
  expect(query.code, query.stderr).toBe(0);
  const result = JSON.parse(query.stdout);
  expect(result.items[0]).toMatchObject({
    identifier: "p-a.4",
    stateLabel: "blocked",
    priority: 1,
    issueType: "bug",
    score: null,
    url: "",
  });
  expect(result.capabilities.heat).toBe(false);
  const noSave = await runNode(
    ["src/bin.ts", "open", "beads:other", "--input", input, "--no-save"],
    { env },
  );
  expect(noSave.code).toBe(0);
  expect(readdirSync(join(home, "dashboard"))).toHaveLength(1);
  const bad = await runNode(["src/bin.ts", "open", "beads:p", "--input", input, "--budget", "0"], {
    env,
  });
  expect(bad.code).toBe(2);
  for (const scope of ["p/a", "p_a"]) {
    const saved = await runNode(["src/bin.ts", "open", `beads:${scope}`, "--input", input], {
      env,
    });
    expect(saved.code).toBe(0);
  }
  const runs = await runNode(["src/bin.ts", "runs", "list", "--format", "json"], { env });
  expect(
    JSON.parse(runs.stdout)
      .map((r: { repo: string }) => r.repo)
      .sort(),
  ).toEqual(["beads:p", "beads:p/a", "beads:p_a"]);
  const removed = await runNode(["src/bin.ts", "runs", "rm", "beads:p/a"], { env });
  expect(removed.code, removed.stderr).toBe(0);
  const survivor = await runNode(["src/bin.ts", "query", "beads:p_a", "--json", "--no-open"], {
    env,
  });
  expect(survivor.code, survivor.stderr).toBe(0);
  expect(JSON.parse(survivor.stdout).scope).toBe("p_a");
});

test("CLI builds read-only Jira requests with scoped pagination and does not leak credentials", async () => {
  const output: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation((value) => {
    output.push(String(value));
    return true;
  });
  const env = {
    JIRA_URL: "https://example.atlassian.net",
    JIRA_EMAIL: "fixture@example.test",
    JIRA_API_TOKEN: "private-token",
  };
  let page = 0;
  const fetch: typeof globalThis.fetch = async (url, init) => {
    expect(url).toBe("https://example.atlassian.net/rest/api/3/search/jql");
    expect(init?.redirect).toBe("error");
    expect(init?.method).toBe("POST");
    const body = JSON.parse(String(init?.body));
    if (body.jql !== 'project = "ENG" AND statusCategory != Done ORDER BY key ASC')
      return new Response("Bad scope", { status: 400 });
    if (page++ === 0) {
      expect(body.nextPageToken).toBeUndefined();
      return Response.json({ issues: [], isLast: false, nextPageToken: "next" });
    }
    expect(body.nextPageToken).toBe("next");
    return Response.json({
      issues: [
        {
          key: "ENG-1",
          fields: {
            summary: "Task",
            status: { name: "In progress", statusCategory: { key: "indeterminate" } },
            issuelinks: [],
          },
        },
      ],
      isLast: true,
    });
  };
  await runProviderOpen(["jira:ENG", "--no-save"], env, fetch);
  const model = JSON.parse(output.join(""));
  expect(Object.keys(model.nodes)).toEqual(["jira:example.atlassian.net:ENG-1"]);
  expect(output.join("")).not.toContain("private-token");
  expect(output.join("")).not.toContain("fixture@example.test");
});

test("provider help needs no credentials; unsupported options fail before network access", async () => {
  const help = await runNode(["src/bin.ts", "open", "notion:any", "--help"]);
  expect(help.code).toBe(0);
  expect(help.stdout).toContain("NOTION_API_TOKEN");
  await expect(
    runProviderOpen(["linear:12345678-1234-1234-1234-123456789abc", "--input", "x"], {}),
  ).rejects.toThrow("only supported for Beads");
});
