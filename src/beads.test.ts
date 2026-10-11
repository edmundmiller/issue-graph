import { describe, expect, test } from "vitest";
import { beadsModel } from "./beads.js";
import { dashboardQuery } from "./dashboard-query.js";
import { parseModel } from "./model-validation.js";

const issue = (id: string, status: string, dependencies: unknown[] = []) => ({
  id,
  title: `Task ${id}`,
  status,
  priority: 2,
  issue_type: "task",
  dependencies,
});
const dep = (issue_id: string, depends_on_id: string, type = "blocks") => ({
  issue_id,
  depends_on_id,
  type,
  created_by: "user",
  created_at: "2026-09-12T13:59:39Z",
});
const jsonl = (...issues: unknown[]) => issues.map((i) => JSON.stringify(i)).join("\n");

describe("format-first Beads JSONL snapshots", () => {
  test("accepts bd's documented flat issue wrapper, omitted optional fields, native statuses and memory records", () => {
    // Schema-derived fixture: steveyegge/beads at 7477ec1352d9380b692773bc3c2e66ae2e60ae37,
    // internal/types/types.go (Issue/Dependency) and cmd/bd/export.go (flat exportRecord).
    const model = parseModel(
      beadsModel(
        jsonl(
          {
            _type: "issue",
            id: "bd-aaa",
            title: "Implement change",
            status: "hooked",
            priority: 0,
            issue_type: "task",
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
            dependencies: [
              {
                issue_id: "bd-aaa",
                depends_on_id: "bd-bbb",
                type: "blocks",
                created_at: "2026-01-01T00:00:00Z",
              },
            ],
            dependency_count: 1,
            dependent_count: 0,
            comment_count: 0,
          },
          {
            _type: "issue",
            id: "bd-bbb",
            title: "Prepare prerequisite",
            status: "pinned",
            priority: 1,
            issue_type: "task",
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
            dependency_count: 0,
            dependent_count: 1,
            comment_count: 0,
          },
          { _type: "memory", key: "note", value: "not an issue" },
        ),
        { scope: "bd", state: "all" },
      ),
    );
    expect(Object.keys(model.nodes)).toEqual(["beads:bd:bd-aaa", "beads:bd:bd-bbb"]);
    expect(model.nodes["beads:bd:bd-aaa"]).toMatchObject({
      state: "OPEN",
      stateLabel: "hooked",
      priority: 0,
    });
    expect(model.nodes["beads:bd:bd-bbb"]).toMatchObject({ state: "OPEN", stateLabel: "pinned" });
    expect(model.nodes["beads:bd:bd-aaa"].out[0]).toMatchObject({
      to: "beads:bd:bd-bbb",
      via: "blocks",
    });
    expect(model.coverage?.complete).toBe(true);
    expect(model.coverage?.messages.join(" ")).toContain("1 memory records");
    expect(model.coverage?.messages.join(" ")).toContain("may lag database-backed changes");
  });

  test("preserves string IDs and directed typed dependencies, native statuses and priority, not readiness", () => {
    const model = parseModel(
      beadsModel(
        jsonl(
          issue("project-ak8z.4", "blocked", [
            dep("project-ak8z.4", "project-ak8z.2"),
            dep("project-ak8z.4", "project-ak8z", "parent-child"),
          ]),
          issue("project-ak8z.2", "deferred"),
          issue("project-ak8z", "in_progress"),
          issue("project-done", "closed"),
          issue("project-deleted", "tombstone"),
        ),
        { scope: "project", state: "all" },
      ),
    );
    const child = model.nodes["beads:project:project-ak8z.4"];
    expect(child).toMatchObject({
      identifier: "project-ak8z.4",
      state: "OPEN",
      stateLabel: "blocked",
      stateType: "blocked",
      priority: 2,
      issueType: "task",
      url: "",
    });
    expect(child.num).toBeUndefined();
    expect(child.heat).toBeUndefined();
    expect(child.out.every((e) => e.undirected === false)).toBe(true);
    expect(child.out.map((e) => [e.to, e.via, e.evidence?.kind])).toEqual([
      ["beads:project:project-ak8z.2", "blocks", "relation"],
      ["beads:project:project-ak8z", "parent-child", "hierarchy"],
    ]);
    expect(model.nodes["beads:project:project-ak8z.2"].in[0].from).toBe(child.key);
    expect(model.nodes["beads:project:project-ak8z.2"].out).toEqual([]);
    expect(model.nodes["beads:project:project-deleted"].archived).toBe(true);
    expect(model.coverage?.complete).toBe(true);
    expect(model.coverage?.messages.join(" ")).toContain("does not mean ready");
    expect(dashboardQuery.normalize(model)).toMatchObject({ view: "explore", metric: "links" });
    expect(() => dashboardQuery.normalize(model, { view: "rank" })).toThrow("unavailable");
  });

  test("unknown statuses, omitted endpoints, and caps are explicit; closed exclusions are not ready filtering", () => {
    const model = beadsModel(
      jsonl(
        issue("p-a", "open", [dep("p-a", "p-closed")]),
        issue("p-closed", "closed"),
        issue("p-b", "future"),
        issue("p-c", "blocked"),
      ),
      { scope: "p", budget: 2 },
    );
    expect(Object.keys(model.nodes)).toEqual(["beads:p:p-a", "beads:p:p-b"]);
    expect(model.nodes["beads:p:p-b"].state).toBe("UNKNOWN");
    expect(model.coverage?.complete).toBe(false);
    expect(model.coverage?.warnings?.join(" ")).toContain("Dependency endpoint not captured");
    expect(model.coverage?.warnings?.join(" ")).toContain("Snapshot limited");
    const open = beadsModel(
      jsonl(issue("p-a", "blocked"), issue("p-b", "deferred"), issue("p-c", "closed")),
      { scope: "p" },
    );
    expect(Object.values(open.nodes).map((n) => n.stateLabel)).toEqual(["blocked", "deferred"]);
  });

  test("rejects corrupt exports, duplicate IDs, and dependencies assigned to a different bead", () => {
    expect(() => beadsModel("{bad}", { scope: "p" })).toThrow("line 1");
    expect(() =>
      beadsModel(jsonl(issue("p-a", "open"), issue("p-a", "closed")), { scope: "p" }),
    ).toThrow("Duplicate bead ID");
    expect(() =>
      beadsModel(jsonl(issue("p-a", "open", [dep("p-b", "p-c")])), { scope: "p" }),
    ).toThrow("Invalid dependency");
  });
});
